const winston = require('winston');
const path = require('path');

// Configure Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'hikcentral-middleware' },
  transports: [
    // Error log file
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Combined log file
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Console output
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

class LoggingService {
  constructor() {
    this.apiLogs = [];
    this.maxApiLogs = 1000;
  }

  info(message, meta = {}) {
    logger.info(message, meta);
  }

  error(message, error = null, meta = {}) {
    logger.error(message, { ...meta, error: error?.stack || error });
  }

  warn(message, meta = {}) {
    logger.warn(message, meta);
  }

  debug(message, meta = {}) {
    logger.debug(message, meta);
  }

  // API logging
  logApiRequest(req, res, responseTime) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      statusCode: res.statusCode,
      responseTime: responseTime,
      body: req.method === 'POST' ? req.body : undefined,
      query: req.query,
      params: req.params
    };

    // Store in memory for admin UI
    this.apiLogs.push(logEntry);
    if (this.apiLogs.length > this.maxApiLogs) {
      this.apiLogs.shift();
    }

    // Log to file
    logger.info('API Request', logEntry);
  }

  logAuthAttempt(username, success, ip) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'auth',
      username,
      success,
      ip
    };

    logger.info('Authentication Attempt', logEntry);
  }

  logConfigChange(key, oldValue, newValue, username) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'config',
      key,
      oldValue,
      newValue,
      username
    };

    logger.info('Configuration Change', logEntry);
  }

  getApiLogs(limit = 100) {
    return this.apiLogs.slice(-limit).reverse();
  }

  clearApiLogs() {
    this.apiLogs = [];
    logger.info('API logs cleared');
  }
}

module.exports = new LoggingService();
