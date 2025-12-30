const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const configService = require('../config/configService');
const loggingService = require('../logs/loggingService');

// Security headers middleware
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false
});

// Rate limiting middleware
const createRateLimit = () => {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
      success: false,
      message: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    handler: (req, res) => {
      loggingService.warn('Rate limit exceeded', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path
      });
      
      res.status(429).json({
        success: false,
        message: 'Too many requests from this IP, please try again later.'
      });
    }
  });
};

// Input validation middleware
const validateInput = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    
    if (error) {
      const errorMessages = error.details.map(detail => detail.message);
      loggingService.warn('Input validation failed', {
        ip: req.ip,
        path: req.path,
        errors: errorMessages
      });
      
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errorMessages
      });
    }
    
    next();
  };
};

// CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' ? false : true, // Allow all origins in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token']
};

// Request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const responseTime = Date.now() - start;
    loggingService.logApiRequest(req, res, responseTime);
  });
  
  next();
};

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  loggingService.error('Unhandled error', err, {
    ip: req.ip,
    path: req.path,
    method: req.method,
    userAgent: req.get('User-Agent')
  });

  // Don't send error details in production
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(isDevelopment && { stack: err.stack })
  });
};

// Not found handler
const notFoundHandler = (req, res) => {
  loggingService.warn('Route not found', {
    ip: req.ip,
    path: req.path,
    method: req.method
  });

  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
};

module.exports = {
  securityHeaders,
  createRateLimit,
  validateInput,
  corsOptions,
  requestLogger,
  errorHandler,
  notFoundHandler
};
