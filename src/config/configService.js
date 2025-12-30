const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

class ConfigService {
  constructor() {
    this.db = null;
    this.configCache = new Map();
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;

    this.db = new sqlite3.Database('./hikcentral_middleware.db', (err) => {
      if (err) {
        console.error('Error opening database:', err);
        throw err;
      }
      console.log('Connected to SQLite database for config service');
      this.initializeConfigTable();
    });

    this.isInitialized = true;
  }

  async initializeConfigTable() {
    return new Promise((resolve, reject) => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS app_config (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE NOT NULL,
          value TEXT NOT NULL,
          type TEXT DEFAULT 'string',
          description TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          console.error('Error creating config table:', err);
          reject(err);
        } else {
          console.log('Config table initialized');
          this.seedDefaultConfig();
          resolve();
        }
      });
    });
  }

  async seedDefaultConfig() {
    const defaultConfig = [
      { key: 'HIKCENTRAL_BASE_URL', value: process.env.HIKCENTRAL_BASE_URL || 'https://192.168.1.101/artemis', type: 'string', description: 'HikCentral base URL' },
      { key: 'HIKCENTRAL_APP_KEY', value: process.env.HIKCENTRAL_APP_KEY || '27108141', type: 'string', description: 'HikCentral app key' },
      { key: 'HIKCENTRAL_APP_SECRET', value: process.env.HIKCENTRAL_APP_SECRET || 'c3U7KikkPGo2Yka6GMZ5', type: 'string', description: 'HikCentral app secret' },
      { key: 'HIKCENTRAL_USER_ID', value: process.env.HIKCENTRAL_USER_ID || 'admin', type: 'string', description: 'HikCentral user ID' },
      { key: 'HIKCENTRAL_ORG_INDEX_CODE', value: process.env.HIKCENTRAL_ORG_INDEX_CODE || '1', type: 'string', description: 'HikCentral organization index code' },
      { key: 'HIKCENTRAL_VERIFY_SSL', value: process.env.HIKCENTRAL_VERIFY_SSL || 'false', type: 'boolean', description: 'HikCentral SSL verification' },
      { key: 'ADMIN_PASSWORD_HASH', value: await this.hashPassword('Smart@1150'), type: 'string', description: 'Admin password hash' },
      { key: 'MAX_RESIDENT_DURATION_YEARS', value: '10', type: 'number', description: 'Maximum resident duration in years' },
      { key: 'API_RATE_LIMIT_WINDOW_MS', value: '900000', type: 'number', description: 'API rate limit window in milliseconds (15 minutes)' },
      { key: 'API_RATE_LIMIT_MAX_REQUESTS', value: '100', type: 'number', description: 'API rate limit max requests per window' }
    ];

    for (const config of defaultConfig) {
      await this.set(config.key, config.value, config.type, config.description);
    }
  }

  async hashPassword(password) {
    return bcrypt.hash(password, 10);
  }

  async verifyPassword(password) {
    const hash = await this.get('ADMIN_PASSWORD_HASH');
    if (!hash) return false;
    return bcrypt.compare(password, hash);
  }

  async get(key, defaultValue = null) {
    // Check cache first
    if (this.configCache.has(key)) {
      return this.configCache.get(key);
    }

    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT value, type FROM app_config WHERE key = ?',
        [key],
        (err, row) => {
          if (err) {
            console.error('Error getting config:', err);
            reject(err);
          } else if (row) {
            const value = this.parseValue(row.value, row.type);
            this.configCache.set(key, value);
            resolve(value);
          } else {
            // Fall back to environment variable
            const envValue = process.env[key];
            if (envValue !== undefined) {
              const parsedValue = this.parseValue(envValue, 'string');
              this.configCache.set(key, parsedValue);
              resolve(parsedValue);
            } else {
              resolve(defaultValue);
            }
          }
        }
      );
    });
  }

  async set(key, value, type = 'string', description = '') {
    const stringValue = this.stringifyValue(value, type);
    
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR REPLACE INTO app_config (key, value, type, description, updated_at) 
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [key, stringValue, type, description],
        (err) => {
          if (err) {
            console.error('Error setting config:', err);
            reject(err);
          } else {
            // Update cache
            this.configCache.set(key, value);
            resolve(value);
          }
        }
      );
    });
  }

  async getAll() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT key, value, type, description, updated_at FROM app_config ORDER BY key', (err, rows) => {
        if (err) {
          console.error('Error getting all config:', err);
          reject(err);
        } else {
          const config = {};
          rows.forEach(row => {
            config[row.key] = {
              value: this.parseValue(row.value, row.type),
              type: row.type,
              description: row.description,
              updated_at: row.updated_at
            };
          });
          resolve(config);
        }
      });
    });
  }

  async update(key, value, type = 'string', description = '') {
    const result = await this.set(key, value, type, description);
    return result;
  }

  parseValue(value, type) {
    if (value === null || value === undefined) return value;
    
    switch (type) {
      case 'boolean':
        return value === 'true' || value === true;
      case 'number':
        return parseInt(value, 10);
      case 'string':
      default:
        return String(value);
    }
  }

  stringifyValue(value, type) {
    if (value === null || value === undefined) return null;
    
    switch (type) {
      case 'boolean':
        return value ? 'true' : 'false';
      case 'number':
        return String(value);
      case 'string':
      default:
        return String(value);
    }
  }

  clearCache() {
    this.configCache.clear();
  }

  async reload() {
    this.clearCache();
    // Force reload from database
    await this.getAll();
  }
}

// Create singleton instance
const configService = new ConfigService();

module.exports = configService;
