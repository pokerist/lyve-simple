const express = require('express');
const configService = require('../config/configService');
const loggingService = require('../logs/loggingService');
const { authenticate, requireAdmin, handleLogin, handleLogout } = require('../middleware/auth');
const { validateInput } = require('../middleware/security');
const Joi = require('joi');

const router = express.Router();

// Input validation schemas
const updateConfigSchema = Joi.object({
  key: Joi.string().required(),
  value: Joi.string().required(),
  type: Joi.string().valid('string', 'number', 'boolean').default('string'),
  description: Joi.string().allow('')
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).required(),
  confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required()
});

// Admin authentication middleware for all admin routes except login
router.use('/login', (req, res, next) => next());
router.use('/logout', (req, res, next) => next());
router.use('/test', (req, res, next) => next());
router.use(authenticate);

// GET /admin - Admin dashboard
router.get('/', (req, res) => {
  res.sendFile('admin.html', { root: __dirname + '/../../' });
});

// POST /admin/login - Login endpoint
router.post('/login', handleLogin);

// POST /admin/logout - Logout endpoint
router.post('/logout', handleLogout);

// GET /admin/config - Get all configuration
router.get('/config', requireAdmin, async (req, res) => {
  try {
    const config = await configService.getAll();
    res.json({
      success: true,
      config: config
    });
  } catch (error) {
    loggingService.error('Error getting config', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get configuration'
    });
  }
});

// PUT /admin/config - Update configuration
router.put('/config', requireAdmin, validateInput(updateConfigSchema), async (req, res) => {
  try {
    const { key, value, type, description } = req.body;
    
    // Get old value for logging
    const oldValue = await configService.get(key);
    
    // Update configuration
    await configService.update(key, value, type, description);
    
    // Log the change
    loggingService.logConfigChange(key, oldValue, value, req.user.username);
    
    res.json({
      success: true,
      message: 'Configuration updated successfully'
    });
  } catch (error) {
    loggingService.error('Error updating config', error, {
      key: req.body.key,
      username: req.user.username
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to update configuration'
    });
  }
});

// GET /admin/logs - Get API logs
router.get('/logs', requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const logs = loggingService.getApiLogs(limit);
    
    res.json({
      success: true,
      logs: logs
    });
  } catch (error) {
    loggingService.error('Error getting logs', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get logs'
    });
  }
});

// POST /admin/logs/clear - Clear API logs
router.post('/logs/clear', requireAdmin, async (req, res) => {
  try {
    loggingService.clearApiLogs();
    
    res.json({
      success: true,
      message: 'Logs cleared successfully'
    });
  } catch (error) {
    loggingService.error('Error clearing logs', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear logs'
    });
  }
});

// POST /admin/password - Change admin password
router.post('/password', requireAdmin, validateInput(changePasswordSchema), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Verify current password
    const isValidPassword = await configService.verifyPassword(currentPassword);
    
    if (!isValidPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }
    
    // Change password
    const result = await configService.changePassword(newPassword);
    
    if (result.success) {
      loggingService.info('Password changed successfully', {
        username: req.user.username
      });
      
      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.message
      });
    }
  } catch (error) {
    loggingService.error('Error changing password', error, {
      username: req.user.username
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to change password'
    });
  }
});

// GET /admin/health - Health check endpoint
router.get('/health', requireAdmin, async (req, res) => {
  try {
    const config = await configService.getAll();
    const logs = loggingService.getApiLogs(10);
    
    res.json({
      success: true,
      health: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        configKeys: Object.keys(config).length,
        recentLogs: logs.length
      }
    });
  } catch (error) {
    loggingService.error('Error checking health', error);
    res.status(500).json({
      success: false,
      health: {
        status: 'unhealthy',
        error: error.message
      }
    });
  }
});

// GET /admin/test - Test HikCentral connection
router.get('/test', async (req, res) => {
  try {
    const hikCentralService = require('../services/hikCentralService');
    const result = await hikCentralService.testConnection();
    
    res.json({
      success: result.success,
      connected: result.success,
      message: result.success ? 'HikCentral connection successful' : 'Failed to connect to HikCentral',
      error: result.error
    });
  } catch (error) {
    loggingService.error('Error testing HikCentral connection', error);
    res.status(500).json({
      success: false,
      connected: false,
      message: 'Connection test failed',
      error: error.message
    });
  }
});

module.exports = router;
