const configService = require('../config/configService');
const bcrypt = require('bcrypt');

class AuthService {
  constructor() {
    this.sessions = new Map();
    this.sessionTimeout = 30 * 60 * 1000; // 30 minutes
  }

  async authenticate(username, password) {
    // Check if username is correct
    if (username !== 'admin') {
      return { success: false, message: 'Invalid username or password' };
    }

    // Verify password
    const isValidPassword = await configService.verifyPassword(password);
    
    if (!isValidPassword) {
      return { success: false, message: 'Invalid username or password' };
    }

    // Generate session token
    const sessionToken = this.generateSessionToken();
    const expiresAt = Date.now() + this.sessionTimeout;

    this.sessions.set(sessionToken, {
      username,
      expiresAt,
      createdAt: Date.now()
    });

    return {
      success: true,
      sessionToken,
      expiresAt,
      message: 'Authentication successful'
    };
  }

  validateSession(sessionToken) {
    if (!sessionToken) {
      return { valid: false, message: 'No session token provided' };
    }

    const session = this.sessions.get(sessionToken);
    
    if (!session) {
      return { valid: false, message: 'Invalid session token' };
    }

    const now = Date.now();
    
    if (now > session.expiresAt) {
      this.sessions.delete(sessionToken);
      return { valid: false, message: 'Session expired' };
    }

    // Refresh session
    session.expiresAt = now + this.sessionTimeout;

    return {
      valid: true,
      username: session.username,
      expiresAt: session.expiresAt
    };
  }

  invalidateSession(sessionToken) {
    this.sessions.delete(sessionToken);
    return true;
  }

  generateSessionToken() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `${timestamp}_${random}`;
  }

  async changePassword(newPassword) {
    if (!newPassword || newPassword.length < 8) {
      return { success: false, message: 'Password must be at least 8 characters long' };
    }

    try {
      const passwordHash = await configService.hashPassword(newPassword);
      await configService.set('ADMIN_PASSWORD_HASH', passwordHash, 'string', 'Admin password hash');
      return { success: true, message: 'Password changed successfully' };
    } catch (error) {
      console.error('Error changing password:', error);
      return { success: false, message: 'Failed to change password' };
    }
  }
}

module.exports = new AuthService();
