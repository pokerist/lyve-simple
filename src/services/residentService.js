const sqlite3 = require('sqlite3').verbose();
const hikCentralService = require('./hikCentralService');
const DateUtils = require('../utils/dateUtils');
const loggingService = require('../logs/loggingService');
const configService = require('../config/configService');

class ResidentService {
  constructor() {
    this.db = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;

    this.db = new sqlite3.Database('./hikcentral_middleware.db', (err) => {
      if (err) {
        console.error('Error opening database:', err);
        throw err;
      }
      console.log('Connected to SQLite database for resident service');
    });

    this.isInitialized = true;
  }

  async createResident(residentData) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const {
      name,
      email,
      phone,
      community,
      from,
      to,
      type,
      unitId
    } = residentData;

    // Validate required fields
    if (!name || !email || !unitId) {
      throw new Error('Name, email, and unitId are required');
    }

    // Validate and adjust dates
    let adjustedDates;
    try {
      adjustedDates = DateUtils.validateAndAdjustDates(from, to);
    } catch (error) {
      throw new Error(`Date validation failed: ${error.message}`);
    }

    // Generate auto-increment person code
    const personCode = await this.generatePersonCode();

    // Create resident in HikCentral
    const hikCentralData = {
      personCode: personCode,
      personFamilyName: name.split(' ').pop() || name,
      personGivenName: name.split(' ').slice(0, -1).join(' ') || name,
      gender: 0, // unknown
      orgIndexCode: await configService.get('HIKCENTRAL_ORG_INDEX_CODE'),
      phoneNo: phone,
      email: email,
      beginTime: adjustedDates.from,
      endTime: adjustedDates.to
    };

    loggingService.info('Creating resident in HikCentral', {
      personCode,
      name,
      email,
      community,
      unitId
    });

    const hikCentralResponse = await hikCentralService.makeRequest(
      '/artemis/api/resource/v1/person/single/add',
      hikCentralData
    );

    if (!hikCentralResponse.success) {
      loggingService.error('Failed to create resident in HikCentral', null, {
        personCode,
        error: hikCentralResponse.error,
        code: hikCentralResponse.code
      });
      
      throw new Error(`Failed to create resident in HikCentral: ${hikCentralResponse.error}`);
    }

    // Store in local database
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
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
        type || 'resident',
        adjustedDates.from,
        adjustedDates.to,
        unitId
      ], function(err) {
        if (err) {
          console.error('Database error:', err);
          reject(err);
        } else {
          const response = {
            ownerId: personCode,
            phone: phone,
            name: name,
            email: email,
            community: community,
            type: type || 'resident',
            from: adjustedDates.from,
            to: adjustedDates.to,
            unitId: unitId,
            hikCentralPersonId: hikCentralResponse.data
          };

          if (adjustedDates.adjusted) {
            response.dateAdjustment = {
              originalFrom: adjustedDates.originalFrom,
              originalTo: adjustedDates.originalTo,
              adjustedFrom: adjustedDates.from,
              adjustedTo: adjustedDates.to,
              reason: adjustedDates.adjustmentReason
            };
          }

          loggingService.info('Resident created successfully', response);
          resolve(response);
        }
      });
    });
  }

  async getResident(email, community, ownerId) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      let query, params;
      
      if (ownerId) {
        // Get specific resident by ownerId
        query = `
          SELECT * FROM residents 
          WHERE person_code = ? AND status != 'deleted'
          ${community ? 'AND community = ?' : ''}
        `;
        params = community ? [ownerId, community] : [ownerId];
      } else if (email) {
        // Get specific resident by email
        query = `
          SELECT * FROM residents 
          WHERE email = ? AND status != 'deleted'
          ${community ? 'AND community = ?' : ''}
        `;
        params = community ? [email, community] : [email];
      } else {
        // Get all residents
        query = `
          SELECT * FROM residents 
          WHERE status != 'deleted'
          ${community ? 'AND community = ?' : ''}
          ORDER BY created_at DESC
        `;
        params = community ? [community] : [];
      }
      
      this.db.all(query, params, (err, rows) => {
        if (err) {
          console.error('Database error:', err);
          reject(err);
        } else {
          if (Array.isArray(rows)) {
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
            resolve(residents);
          } else {
            resolve(rows);
          }
        }
      });
    });
  }

  async deleteResident(ownerId) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      // Get resident from database
      this.db.get('SELECT * FROM residents WHERE person_code = ? AND status != "deleted"', [ownerId], async (err, row) => {
        if (err) {
          console.error('Database error:', err);
          reject(err);
        } else if (!row) {
          reject(new Error('Resident not found'));
        } else {
          // Delete from HikCentral
          const deleteData = {
            personId: row.person_id
          };

          const hikCentralResponse = await hikCentralService.makeRequest(
            '/artemis/api/resource/v1/person/single/delete',
            deleteData
          );

          // Update local status to deleted (soft delete)
          this.db.run('UPDATE residents SET status = "deleted", updated_at = CURRENT_TIMESTAMP WHERE person_code = ?', [ownerId], function(err) {
            if (err) {
              console.error('Database error:', err);
              reject(err);
            } else {
              loggingService.info('Resident soft deleted', {
                ownerId,
                hikCentralResponse: hikCentralResponse
              });
              resolve({ success: true });
            }
          });
        }
      });
    });
  }

  async generateIdentity(unitId, ownerId) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM residents WHERE person_code = ? AND status != "deleted"', [ownerId], async (err, row) => {
        if (err) {
          console.error('Database error:', err);
          reject(err);
        } else if (!row) {
          reject(new Error('Resident not found'));
        } else if (!row.person_id || row.person_id.trim() === '') {
          reject(new Error('Resident not synced with HikCentral'));
        } else {
          // Get dynamic QR code from HikCentral
          const qrData = {
            data: {
              employeeID: row.person_code, // Use personCode (employeeID) not personId
              validity: 60, // 1 hour
              openLockTimes: 1,
              qrType: 0
            }
          };

          const hikCentralResponse = await hikCentralService.makeRequest(
            '/artemis/api/resource/v1/person/dynamicqrcode/get',
            qrData
          );

          if (!hikCentralResponse.success) {
            reject(new Error(`Failed to get QR code from HikCentral: ${hikCentralResponse.error}`));
          }

          const response = {
            id: row.id.toString(),
            ownerId: row.person_code,
            ownerType: row.type,
            unitId: row.unit_id,
            qrCode: hikCentralResponse.data.qrcode
          };

          loggingService.info('Identity generated', response);
          resolve(response);
        }
      });
    });
  }

  async generateVisitorQR(unitId, ownerId, visitorName, visitDate) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM residents WHERE person_code = ? AND status != "deleted"', [ownerId], async (err, row) => {
        if (err) {
          console.error('Database error:', err);
          reject(err);
        } else if (!row) {
          reject(new Error('Resident not found'));
        } else {
          // Calculate visit times
          const now = new Date();
          const visitStartTime = new Date(now.getTime() + 60000); // Now + 1 minute
          const visitEndTime = new Date(visitStartTime.getTime() + 24 * 60 * 60 * 1000); // Start + 1 day

          // Format dates for HikCentral
          const visitStartTimeFormatted = DateUtils.formatDateForHikCentral(visitStartTime);
          const visitEndTimeFormatted = DateUtils.formatDateForHikCentral(visitEndTime);

          // Create visitor in HikCentral
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

          const hikCentralResponse = await hikCentralService.makeRequest(
            '/artemis/api/visitor/v1/registerment',
            visitorData
          );

          if (!hikCentralResponse.success) {
            reject(new Error(`Failed to create visitor in HikCentral: ${hikCentralResponse.error}`));
          }

          // Extract QR code text from the base64 image
          let qrCodeText = '';
          if (hikCentralResponse.data && hikCentralResponse.data.qrCodeImage) {
            try {
              qrCodeText = await this.extractQRCodeText(hikCentralResponse.data.qrCodeImage);
            } catch (qrError) {
              console.error('Error extracting QR code text:', qrError);
              qrCodeText = `VISITOR_${hikCentralResponse.data.appointRecordId}`;
            }
          } else {
            qrCodeText = `VISITOR_${hikCentralResponse.data.appointRecordId}`;
          }

          const response = {
            visitId: hikCentralResponse.data.appointRecordId,
            unitId: unitId,
            ownerId: ownerId,
            ownerType: row.type,
            visitorName: visitorName,
            visitDate: visitDate,
            qrCode: qrCodeText
          };

          loggingService.info('Visitor QR generated', response);
          resolve(response);
        }
      });
    });
  }

  async generatePersonCode() {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT MAX(CAST(person_code AS INTEGER)) as max_code FROM residents', (err, row) => {
        if (err) {
          reject(err);
        } else {
          const nextCode = (row.max_code || 0) + 1;
          resolve(nextCode.toString());
        }
      });
    });
  }

  async extractQRCodeText(base64Image) {
    // This is a placeholder - in a real implementation, you would use a QR code
    // decoding library to extract text from the image
    // For now, we'll return a fallback identifier
    return `QR_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }
}

// Create singleton instance
const residentService = new ResidentService();

module.exports = residentService;
