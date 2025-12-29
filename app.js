const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database setup
const db = new sqlite3.Database('./hikcentral_middleware.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

function initializeDatabase() {
  // Create residents table
  db.run(`
    CREATE TABLE IF NOT EXISTS residents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person_code TEXT UNIQUE NOT NULL,
      person_id TEXT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      community TEXT,
      type TEXT,
      from_date TEXT,
      to_date TEXT,
      unit_id TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create API logs table
  db.run(`
    CREATE TABLE IF NOT EXISTS api_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT NOT NULL,
      method TEXT NOT NULL,
      request_body TEXT,
      response_body TEXT,
      status_code INTEGER,
      hikcentral_response TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('Database tables initialized');
}

// HikCentral Configuration
const HIKCENTRAL_CONFIG = {
  baseUrl: process.env.HIKCENTRAL_BASE_URL || 'https://192.168.1.101/artemis',
  appKey: process.env.HIKCENTRAL_APP_KEY || '27108141',
  appSecret: process.env.HIKCENTRAL_APP_SECRET || 'c3U7KikkPGo2Yka6GMZ5',
  userId: process.env.HIKCENTRAL_USER_ID || 'admin',
  orgIndexCode: process.env.HIKCENTRAL_ORG_INDEX_CODE || '1',
  verifySSL: process.env.HIKCENTRAL_VERIFY_SSL === 'true' || false
};

// HikCentral Client
class HikCentralClient {
  constructor() {
    this.appKey = HIKCENTRAL_CONFIG.appKey;
    this.appSecret = HIKCENTRAL_CONFIG.appSecret;
    this.baseUrl = this._cleanBaseUrl(HIKCENTRAL_CONFIG.baseUrl);
  }

  _cleanBaseUrl(url) {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.hostname}${urlObj.port ? ':' + urlObj.port : ''}`;
  }

  _getContentMd5(body) {
    if (!body) return '';
    const md5Hash = crypto.createHash('md5').update(JSON.stringify(body)).digest();
    return Buffer.from(md5Hash).toString('base64');
  }

  _generateSignature(method, uri, headers, body) {
    const timestamp = headers['X-Ca-Timestamp'];
    const nonce = headers['X-Ca-Nonce'];
    const contentMd5 = headers['Content-MD5'] || '';
    
    // Build string to sign
    const parts = [
      method,
      headers.Accept || '*/*',
      contentMd5,
      headers['Content-Type'] || 'application/json',
      headers.Date || new Date().toUTCString(),
      `x-ca-key:${headers['X-Ca-Key']}`,
      `x-ca-nonce:${nonce}`,
      `x-ca-timestamp:${timestamp}`,
      uri
    ];

    const stringToSign = parts.join('\n');
    
    // Calculate HMAC-SHA256 and base64 encode
    const signature = crypto.createHmac('sha256', this.appSecret)
      .update(stringToSign)
      .digest();
    
    return Buffer.from(signature).toString('base64');
  }

  _buildHeaders(body) {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();
    
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json;charset=UTF-8',
      'X-Ca-Key': this.appKey,
      'X-Ca-Nonce': nonce,
      'X-Ca-Timestamp': timestamp,
      'X-Ca-Signature-Headers': 'x-ca-key,x-ca-nonce,x-ca-timestamp',
      'userId': HIKCENTRAL_CONFIG.userId
    };

    if (body) {
      headers['Content-MD5'] = this._getContentMd5(body);
    }

    return headers;
  }

  async makeRequest(endpoint, body = null) {
    const fullUrl = `${this.baseUrl}${endpoint}`;
    const bodyStr = body ? JSON.stringify(body) : '';
    
    const headers = this._buildHeaders(body ? body : null);
    const signature = this._generateSignature('POST', endpoint, headers, body);
    headers['X-Ca-Signature'] = signature;

    console.log(`Requesting: ${fullUrl}`);
    console.log('Headers:', JSON.stringify(headers, null, 2));

    try {
      const response = await axios.post(fullUrl, body, {
        headers,
        httpsAgent: HIKCENTRAL_CONFIG.verifySSL ? undefined : new require('https').Agent({ rejectUnauthorized: false }),
        timeout: 10000
      });

      if (response.data.code === '0') {
        return response.data;
      } else {
        console.error(`HikCentral Error: ${response.data.msg} (Code: ${response.data.code})`);
        return null;
      }
    } catch (error) {
      console.error('Connection Failed:', error.message);
      if (error.response) {
        console.error('Response:', error.response.data);
      }
      return null;
    }
  }
}

const hikCentralClient = new HikCentralClient();

// API Routes

// GET /residents - Get resident
app.get('/residents', async (req, res) => {
  const { email, community } = req.query;
  
  if (!email) {
    return res.status(400).json({ error: 'Email parameter is required' });
  }

  try {
    const query = `
      SELECT * FROM residents 
      WHERE email = ? AND status != 'deleted'
      ${community ? 'AND community = ?' : ''}
    `;
    
    const params = community ? [email, community] : [email];
    
    db.get(query, params, (err, row) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!row) {
        return res.status(404).json({ error: 'Resident not found' });
      }

      const response = {
        ownerId: row.person_code,
        phone: row.phone,
        name: row.name,
        email: row.email,
        community: row.community,
        type: row.type,
        from: row.from_date,
        to: row.to_date,
        unitId: row.unit_id
      };

      res.json(response);
    });
  } catch (error) {
    console.error('Error getting resident:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /residents - Create resident
app.post('/residents', async (req, res) => {
  const { name, phone, email, community, from, to, ownerType, unitId } = req.body;

  if (!name || !email || !unitId) {
    return res.status(400).json({ error: 'Name, email, and unitId are required' });
  }

  try {
    // Generate auto-increment person code
    const personCode = await generatePersonCode();
    
    // Create resident in HikCentral
    const hikCentralData = {
      personCode: personCode,
      personFamilyName: name.split(' ').pop() || name,
      personGivenName: name.split(' ').slice(0, -1).join(' ') || name,
      gender: 0, // unknown
      orgIndexCode: HIKCENTRAL_CONFIG.orgIndexCode,
      phoneNo: phone,
      email: email,
      beginTime: from ? new Date(from).toISOString() : null,
      endTime: to ? new Date(to).toISOString() : null
    };

    const hikCentralResponse = await hikCentralClient.makeRequest(
      '/artemis/api/resource/v1/person/single/add',
      hikCentralData
    );

    if (!hikCentralResponse) {
      return res.status(500).json({ 
        error: 'Failed to create resident in HikCentral',
        details: 'Local data not created due to HikCentral failure'
      });
    }

    // Store in local database
    const stmt = db.prepare(`
      INSERT INTO residents (person_code, person_id, name, email, phone, community, type, from_date, to_date, unit_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run([
      personCode,
      hikCentralResponse.data, // personId from HikCentral
      name,
      email,
      phone,
      community,
      ownerType || 'resident',
      from,
      to,
      unitId
    ], function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to save resident locally' });
      }

      const response = {
        ownerId: personCode,
        phone: phone,
        name: name,
        email: email,
        community: community,
        type: ownerType || 'resident',
        from: from,
        to: to,
        unitId: unitId
      };

      res.status(201).json(response);
    });
  } catch (error) {
    console.error('Error creating resident:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /identity - Get identity (dynamic QR code)
app.get('/identity', async (req, res) => {
  const { unitId, ownerId } = req.query;

  if (!unitId || !ownerId) {
    return res.status(400).json({ error: 'unitId and ownerId parameters are required' });
  }

  try {
    // Get resident from database
    db.get('SELECT * FROM residents WHERE person_code = ? AND status != "deleted"', [ownerId], async (err, row) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!row || !row.person_id) {
        return res.status(404).json({ error: 'Resident not found or not synced with HikCentral' });
      }

      // Get dynamic QR code from HikCentral
      const qrData = {
        data: {
          employeeId: row.person_id,
          validity: 60, // 1 hour
          openLockTimes: 1,
          qrType: 0
        }
      };

      const hikCentralResponse = await hikCentralClient.makeRequest(
        '/artemis/api/resource/v1/person/dynamicqrcode/get',
        qrData
      );

      if (!hikCentralResponse) {
        return res.status(500).json({ error: 'Failed to get QR code from HikCentral' });
      }

      const response = {
        id: row.id.toString(),
        ownerId: row.person_code,
        ownerType: row.type,
        unitId: row.unit_id,
        qrCode: hikCentralResponse.data.qrcode
      };

      res.json(response);
    });
  } catch (error) {
    console.error('Error getting identity:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /visitor-qr - Get visitor QR code
app.get('/visitor-qr', async (req, res) => {
  const { unitId, ownerId, visitorName, visitDate } = req.query;

  if (!unitId || !ownerId || !visitorName || !visitDate) {
    return res.status(400).json({ 
      error: 'unitId, ownerId, visitorName, and visitDate parameters are required' 
    });
  }

  try {
    // Get resident from database
    db.get('SELECT * FROM residents WHERE person_code = ? AND status != "deleted"', [ownerId], async (err, row) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!row) {
        return res.status(404).json({ error: 'Resident not found' });
      }

      // Create visitor in HikCentral
      const visitStartTime = new Date(visitDate).toISOString();
      const visitEndTime = new Date(new Date(visitDate).getTime() + 2 * 60 * 60 * 1000).toISOString(); // 2 hours later

      const visitorData = {
        receptionistId: row.person_id,
        visitStartTime: visitStartTime,
        visitEndTime: visitEndTime,
        visitPurposeType: 4, // others
        visitPurpose: 'Visitor access',
        visitorInfoList: [{
          visitorFamilyName: visitorName.split(' ').pop() || visitorName,
          visitorGivenName: visitorName.split(' ').slice(0, -1).join(' ') || visitorName,
          visitorGroupName: 'Visitors',
          phoneNo: '',
          plateNo: '',
          companyName: '',
          certificateType: 111,
          certificateNo: '',
          remark: 'Generated by middleware'
        }],
        watchListinfo: [{
          enableRegister: 1,
          ID: "0",
          Type: "1"
        }],
        faces: [],
        fingerPrint: [],
        cards: []
      };

      const hikCentralResponse = await hikCentralClient.makeRequest(
        '/artemis/api/visitor/v1/registerment',
        visitorData
      );

      if (!hikCentralResponse) {
        return res.status(500).json({ error: 'Failed to create visitor in HikCentral' });
      }

      const response = {
        visitId: hikCentralResponse.data.appointRecordId,
        unitId: unitId,
        ownerId: ownerId,
        ownerType: row.type,
        visitorName: visitorName,
        visitDate: visitDate,
        qrCode: hikCentralResponse.data.grCodelmage
      };

      res.json(response);
    });
  } catch (error) {
    console.error('Error getting visitor QR:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /residents - Delete resident
app.delete('/residents', async (req, res) => {
  const { ownerId, unitId } = req.query;

  if (!ownerId) {
    return res.status(400).json({ error: 'ownerId parameter is required' });
  }

  try {
    // Get resident from database
    db.get('SELECT * FROM residents WHERE person_code = ? AND status != "deleted"', [ownerId], async (err, row) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!row) {
        return res.status(404).json({ error: 'Resident not found' });
      }

      // Delete from HikCentral
      const deleteData = {
        personId: row.person_id
      };

      const hikCentralResponse = await hikCentralClient.makeRequest(
        '/artemis/api/resource/v1/person/single/delete',
        deleteData
      );

      // Update local status to deleted (soft delete)
      db.run('UPDATE residents SET status = "deleted", updated_at = CURRENT_TIMESTAMP WHERE person_code = ?', [ownerId], function(err) {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Failed to update resident status' });
        }

        res.json({ success: true });
      });
    });
  } catch (error) {
    console.error('Error deleting resident:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to generate auto-increment person code
function generatePersonCode() {
  return new Promise((resolve, reject) => {
    db.get('SELECT MAX(CAST(person_code AS INTEGER)) as max_code FROM residents', (err, row) => {
      if (err) {
        reject(err);
      } else {
        const nextCode = (row.max_code || 0) + 1;
        resolve(nextCode.toString());
      }
    });
  });
}

// Logging function
function logApiCall(endpoint, method, requestBody, responseBody, statusCode, hikCentralResponse = null) {
  const stmt = db.prepare(`
    INSERT INTO api_logs (endpoint, method, request_body, response_body, status_code, hikcentral_response)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run([
    endpoint,
    method,
    JSON.stringify(requestBody),
    JSON.stringify(responseBody),
    statusCode,
    hikCentralResponse ? JSON.stringify(hikCentralResponse) : null
  ], function(err) {
    if (err) {
      console.error('Error logging API call:', err);
    }
  });
}

// GET /logs - Get API logs
app.get('/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  
  db.all(`
    SELECT * FROM api_logs 
    ORDER BY created_at DESC 
    LIMIT ?
  `, [limit], (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    res.json(rows);
  });
});

// Admin UI route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Admin UI available at http://localhost:3000');
});
