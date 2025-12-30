const express = require('express');
const Joi = require('joi');
const residentService = require('../services/residentService');
const hikCentralService = require('../services/hikCentralService');
const configService = require('../config/configService');
const loggingService = require('../logs/loggingService');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { validateInput } = require('../middleware/security');

const router = express.Router();

// Input validation schemas
const createResidentSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().pattern(/^[+]?[\d\s\-\(\)]{7,20}$/).allow(''),
  community: Joi.string().max(50).required(),
  from: Joi.date().iso().required(),
  to: Joi.date().iso().min(Joi.ref('from')).required(),
  type: Joi.string().valid('resident', 'tenant', 'family_member', 'staff', 'visitor').default('resident'),
  unitId: Joi.string().max(50).required()
});

const getResidentSchema = Joi.object({
  email: Joi.string().email(),
  community: Joi.string().max(50),
  ownerId: Joi.string().max(50)
});

const getIdentitySchema = Joi.object({
  unitId: Joi.string().max(50).required(),
  ownerId: Joi.string().max(50).required()
});

const getVisitorQrSchema = Joi.object({
  unitId: Joi.string().max(50).required(),
  ownerId: Joi.string().max(50).required(),
  visitorName: Joi.string().min(2).max(100).required(),
  visitDate: Joi.date().iso().required()
});

const deleteResidentSchema = Joi.object({
  ownerId: Joi.string().max(50).required(),
  unitId: Joi.string().max(50)
});

// GET /residents - Get resident(s)
router.get('/residents', validateInput(getResidentSchema), async (req, res) => {
  try {
    const { email, community, ownerId } = req.query;
    
    const residents = await residentService.getResident(email, community, ownerId);
    
    res.json(residents);
  } catch (error) {
    loggingService.error('Error getting residents', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// POST /residents - Create resident
router.post('/residents', validateInput(createResidentSchema), async (req, res) => {
  try {
    const result = await residentService.createResident(req.body);
    
    res.status(201).json(result);
  } catch (error) {
    loggingService.error('Error creating resident', error, {
      email: req.body.email,
      name: req.body.name
    });
    
    if (error.message.includes('Date validation failed')) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    } else if (error.message.includes('Failed to create resident in HikCentral')) {
      res.status(500).json({
        success: false,
        error: error.message,
        details: 'Local data not created due to HikCentral failure'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }
});

// GET /identity - Get identity (dynamic QR code)
router.get('/identity', validateInput(getIdentitySchema), async (req, res) => {
  try {
    const { unitId, ownerId } = req.query;
    
    const result = await residentService.generateIdentity(unitId, ownerId);
    
    res.json(result);
  } catch (error) {
    loggingService.error('Error getting identity', error, {
      unitId,
      ownerId
    });
    
    if (error.message.includes('Resident not found')) {
      res.status(404).json({
        success: false,
        error: error.message
      });
    } else if (error.message.includes('Resident not synced with HikCentral')) {
      res.status(400).json({
        success: false,
        error: error.message,
        message: 'Cannot generate QR code for resident without HikCentral personId. Please recreate the resident.'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }
});

// GET /visitor-qr - Get visitor QR code
router.get('/visitor-qr', validateInput(getVisitorQrSchema), async (req, res) => {
  try {
    const { unitId, ownerId, visitorName, visitDate } = req.query;
    
    const result = await residentService.generateVisitorQR(unitId, ownerId, visitorName, visitDate);
    
    res.json(result);
  } catch (error) {
    loggingService.error('Error getting visitor QR', error, {
      unitId,
      ownerId,
      visitorName
    });
    
    if (error.message.includes('Resident not found')) {
      res.status(404).json({
        success: false,
        error: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }
});

// DELETE /residents - Delete resident
router.delete('/residents', validateInput(deleteResidentSchema), async (req, res) => {
  try {
    const { ownerId, unitId } = req.query;
    
    const result = await residentService.deleteResident(ownerId);
    
    res.json(result);
  } catch (error) {
    loggingService.error('Error deleting resident', error, {
      ownerId
    });
    
    if (error.message.includes('Resident not found')) {
      res.status(404).json({
        success: false,
        error: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }
});

// GET /hikcentral/version - Test HikCentral connection
router.get('/hikcentral/version', async (req, res) => {
  try {
    const result = await hikCentralService.testConnection();
    
    if (result.success) {
      res.json({
        success: true,
        connected: true,
        version: result.data,
        message: 'HikCentral connection successful'
      });
    } else {
      res.json({
        success: false,
        connected: false,
        message: 'Failed to connect to HikCentral',
        error: result.error
      });
    }
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
