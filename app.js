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
    
    // Build string to sign - exact format from Python example
    // For POST with no body (like version endpoint), use simplified format
    let parts;
    if (method === 'POST' && !body) {
      // Simplified format for POST with no body (version endpoint)
      parts = [
        method,
        '*/*', // Accept header
        `x-ca-key:${headers['X-Ca-Key']}`,
        uri
      ];
    } else {
      // Standard format for other requests
      parts = [
        method,
        headers.Accept || '*/*',
        body ? contentMd5 : '', // Only include Content-MD5 if body exists
        body ? (headers['Content-Type'] || 'application/json') : '', // Only include Content-Type if body exists
        headers.Date || new Date().toUTCString(),
        `x-ca-key:${headers['X-Ca-Key']}`,
        `x-ca-nonce:${nonce}`,
        `x-ca-timestamp:${timestamp}`,
        uri
      ];
    }

    const stringToSign = parts.join('\n');
    
    console.log('DEBUG: String to sign:', stringToSign);
    console.log('DEBUG: Method:', method);
    console.log('DEBUG: Body exists:', !!body);
    console.log('DEBUG: Content-MD5:', contentMd5);
    console.log('DEBUG: Content-Type:', headers['Content-Type']);
    console.log('DEBUG: String to sign (raw):', JSON.stringify(stringToSign));
    console.log('DEBUG: String to sign (escaped):', stringToSign.replace(/\n/g, '\\n'));
    
    // Calculate HMAC-SHA256 and base64 encode - exact format from Python
    const signature = crypto.createHmac('sha256', this.appSecret)
      .update(stringToSign)
      .digest('base64');
    
    console.log('DEBUG: Generated signature:', signature);
    console.log('DEBUG: App secret used:', this.appSecret);
    
    return signature;
  }

  _buildHeaders(body) {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();
    const date = new Date().toUTCString();
    
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json;charset=UTF-8',
      'X-Ca-Key': this.appKey,
      'X-Ca-Nonce': nonce,
      'X-Ca-Timestamp': timestamp,
      'X-Ca-Signature-Headers': 'x-ca-key,x-ca-nonce,x-ca-timestamp',
      'userId': HIKCENTRAL_CONFIG.userId,
      'Date': date
    };

    if (body) {
      headers['Content-MD5'] = this._getContentMd5(body);
    }

    return headers;
  }

  async makeRequest(endpoint, body = null, method = null) {
    const fullUrl = `${this.baseUrl}${endpoint}`;
    const bodyStr = body ? JSON.stringify(body) : '';
    const requestMethod = method || (body ? 'POST' : 'GET');
    
    const headers = this._buildHeaders(body ? body : null);
    const signature = this._generateSignature(requestMethod, endpoint, headers, body);
    headers['X-Ca-Signature'] = signature;

    console.log(`Requesting: ${fullUrl}`);
    console.log('Headers:', JSON.stringify(headers, null, 2));

    try {
      let response;
      if (requestMethod === 'POST') {
        response = await axios.post(fullUrl, body, {
          headers,
          httpsAgent: HIKCENTRAL_CONFIG.verifySSL ? undefined : new require('https').Agent({ rejectUnauthorized: false }),
          timeout: 10000
        });
      } else {
        response = await axios.get(fullUrl, {
          headers,
          httpsAgent: HIKCENTRAL_CONFIG.verifySSL ? undefined : new require('https').Agent({ rejectUnauthorized: false }),
          timeout: 10000
        });
      }

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

// GET /residents - Get resident(s)
app.get('/residents', async (req, res) => {
  const { email, community, ownerId } = req.query;
  
  try {
    let query, params;
    
    if (ownerId) {
      // Get specific resident by ownerId (NEW: Support ownerId parameter)
      query = `
        SELECT * FROM residents 
        WHERE person_code = ? AND status != 'deleted'
        ${community ? 'AND community = ?' : ''}
      `;
      params = community ? [ownerId, community] : [ownerId];
      
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
          personId: row.person_id,
          phone: row.phone,
          name: row.name,
          email: row.email,
          community: row.community,
          type: row.type,
          from: row.from_date,
          to: row.to_date,
          unitId: row.unit_id,
          synced: !!row.person_id
        };

        res.json(response);
      });
    } else if (email) {
      // Get specific resident by email
      query = `
        SELECT * FROM residents 
        WHERE email = ? AND status != 'deleted'
        ${community ? 'AND community = ?' : ''}
      `;
      params = community ? [email, community] : [email];
      
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
          personId: row.person_id,
          phone: row.phone,
          name: row.name,
          email: row.email,
          community: row.community,
          type: row.type,
          from: row.from_date,
          to: row.to_date,
          unitId: row.unit_id,
          synced: !!row.person_id
        };

        res.json(response);
      });
    } else {
      // Get all residents
      query = `
        SELECT * FROM residents 
        WHERE status != 'deleted'
        ${community ? 'AND community = ?' : ''}
        ORDER BY created_at DESC
      `;
      params = community ? [community] : [];
      
      db.all(query, params, (err, rows) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Database error' });
        }

        const residents = rows.map(row => ({
          ownerId: row.person_code,
          personId: row.person_id,
          phone: row.phone,
          name: row.name,
          email: row.email,
          community: row.community,
          type: row.type,
          from: row.from_date,
          to: row.to_date,
          unitId: row.unit_id,
          synced: !!row.person_id
        }));

        res.json(residents);
      });
    }
  } catch (error) {
    console.error('Error getting residents:', error);
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
      beginTime: from ? formatDateForHikCentral(from) : null,
      endTime: to ? formatDateForHikCentral(to) : null
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

      if (!row) {
        return res.status(404).json({ error: 'Resident not found' });
      }

      if (!row.person_id || row.person_id.trim() === '') {
        return res.status(400).json({ 
          error: 'Resident not synced with HikCentral',
          message: 'Cannot generate QR code for resident without HikCentral personId. Please recreate the resident.'
        });
      }

      // Get dynamic QR code from HikCentral
      const qrData = {
        data: {
          employeeID: row.person_code, // Use personCode (employeeID) not personId
          validity: 60, // 1 hour
          openLockTimes: 1,
          qrType: 0
        }
      };

      console.log('DEBUG: QR Code Request Data:', JSON.stringify(qrData, null, 2));
      console.log('DEBUG: Resident person_id:', row.person_id);
      console.log('DEBUG: Resident person_code:', row.person_code);

      const hikCentralResponse = await hikCentralClient.makeRequest(
        '/artemis/api/resource/v1/person/dynamicqrcode/get',
        qrData
      );

      console.log('DEBUG: HikCentral QR Response:', hikCentralResponse);

      if (!hikCentralResponse) {
        return res.status(500).json({ 
          error: 'Failed to get QR code from HikCentral',
          details: 'Check HikCentral logs for more information'
        });
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

      // Calculate visit times
      const now = new Date();
      const visitStartTime = new Date(now.getTime() + 60000); // Now + 1 minute
      const visitEndTime = new Date(visitStartTime.getTime() + 24 * 60 * 60 * 1000); // Start + 1 day

      // Format dates for HikCentral (ISO 8601 with timezone)
      const visitStartTimeFormatted = formatDateForHikCentralISO(visitStartTime);
      const visitEndTimeFormatted = formatDateForHikCentralISO(visitEndTime);

      // Create visitor in HikCentral with correct format
      const visitorData = {
        receptionistId: row.person_id, // Use personId (HikCentral personId), not personCode
        visitStartTime: visitStartTimeFormatted,
        visitEndTime: visitEndTimeFormatted,
        visitPurposeType: 0, // business
        visitorInfoList: [{
          VisitorInfo: {
            visitorFamilyName: visitorName.split(' ').pop() || visitorName,
            visitorGivenName: visitorName.split(' ').slice(0, -1).join(' ') || visitorName,
            visitorGroupName: 'Visitors',
            gender: 0 // unknown
          }
        }]
      };

      console.log('DEBUG: Visitor Request Data:', JSON.stringify(visitorData, null, 2));
      console.log('DEBUG: Resident person_id (receptionistId):', row.person_id);
      console.log('DEBUG: Visit Start Time:', visitStartTimeFormatted);
      console.log('DEBUG: Visit End Time:', visitEndTimeFormatted);

      const hikCentralResponse = await hikCentralClient.makeRequest(
        '/artemis/api/visitor/v1/registerment',
        visitorData
      );

      console.log('DEBUG: HikCentral Visitor Response:', hikCentralResponse);

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

// Helper function to format dates for HikCentral API
function formatDateForHikCentral(dateString) {
  try {
    // Parse the input date (assuming YYYY-MM-DD format from frontend)
    const date = new Date(dateString);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date format');
    }
    
    // Format as ISO 8601 with timezone offset (e.g., "2025-01-01T00:00:00+02:00")
    // Use the local timezone offset
    const offset = date.getTimezoneOffset();
    const offsetHours = Math.abs(Math.floor(offset / 60));
    const offsetMinutes = Math.abs(offset % 60);
    const offsetSign = offset >= 0 ? '-' : '+';
    const offsetStr = `${offsetSign}${offsetHours.toString().padStart(2, '0')}:${offsetMinutes.toString().padStart(2, '0')}`;
    
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = '00'; // Start of day
    const minutes = '00';
    const seconds = '00';
    
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetStr}`;
  } catch (error) {
    console.error('Error formatting date:', error);
    return null;
  }
}

// Helper function to format Date objects for HikCentral API (ISO 8601 with timezone)
function formatDateForHikCentralISO(date) {
  try {
    // Format as ISO 8601 with timezone offset (e.g., "2025-01-01T00:00:00+02:00")
    // Use the local timezone offset
    const offset = date.getTimezoneOffset();
    const offsetHours = Math.abs(Math.floor(offset / 60));
    const offsetMinutes = Math.abs(offset % 60);
    const offsetSign = offset >= 0 ? '-' : '+';
    const offsetStr = `${offsetSign}${offsetHours.toString().padStart(2, '0')}:${offsetMinutes.toString().padStart(2, '0')}`;
    
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetStr}`;
  } catch (error) {
    console.error('Error formatting date:', error);
    return null;
  }
}


// GET /hikcentral/version - Test HikCentral connection
app.get('/hikcentral/version', async (req, res) => {
  try {
    // Use POST method for version endpoint (even with no body)
    const response = await hikCentralClient.makeRequest('/artemis/api/common/v1/version', null, 'POST');
    
    if (response) {
      res.json({
        success: true,
        connected: true,
        version: response.data,
        message: 'HikCentral connection successful'
      });
    } else {
      res.json({
        success: false,
        connected: false,
        message: 'Failed to connect to HikCentral'
      });
    }
  } catch (error) {
    console.error('Error testing HikCentral connection:', error);
    res.status(500).json({
      success: false,
      connected: false,
      message: 'Connection test failed',
      error: error.message
    });
  }
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
