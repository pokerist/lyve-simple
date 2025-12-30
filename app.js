const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const configService = require('./src/config/configService');
const loggingService = require('./src/logs/loggingService');
const { securityHeaders, createRateLimit, corsOptions, requestLogger, errorHandler, notFoundHandler } = require('./src/middleware/security');

// Initialize services
async function initializeServices() {
  try {
    await configService.initialize();
    loggingService.info('Application starting up');
  } catch (error) {
    loggingService.error('Failed to initialize services', error);
    process.exit(1);
  }
}

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware setup
app.use(securityHeaders);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); // Serve static files
app.use(require('cors')(corsOptions));
app.use(createRateLimit());
app.use(requestLogger);

// Routes
const apiRoutes = require('./src/routes/api');
const adminRoutes = require('./src/routes/admin');

// API routes (no authentication required for external APIs)
app.use('/api', apiRoutes);

// Admin routes (with authentication)
app.use('/admin', adminRoutes);

// Legacy routes for backward compatibility
app.use('/', apiRoutes);

// Serve admin UI
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Error handling
app.use(errorHandler);
app.use(notFoundHandler);

// Start server
async function startServer() {
  await initializeServices();
  
  const server = app.listen(PORT, () => {
    loggingService.info(`Server running on port ${PORT}`, {
      port: PORT,
      environment: process.env.NODE_ENV || 'development'
    });
    console.log(`Server running on port ${PORT}`);
    console.log('Admin UI available at http://localhost:' + PORT);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    loggingService.info('SIGTERM received, shutting down gracefully');
    server.close(() => {
      loggingService.info('Process terminated');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    loggingService.info('SIGINT received, shutting down gracefully');
    server.close(() => {
      loggingService.info('Process terminated');
      process.exit(0);
    });
  });
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  loggingService.error('Uncaught Exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  loggingService.error('Unhandled Rejection at Promise', reason);
});

// Start the server
startServer().catch((error) => {
  loggingService.error('Failed to start server', error);
  process.exit(1);
});
