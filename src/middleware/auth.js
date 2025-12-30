const authService = require('../auth/authService');
const loggingService = require('../logs/loggingService');

// Authentication middleware
const authenticate = (req, res, next) => {
  // Skip authentication for login endpoint
  if (req.path === '/admin/login' && req.method === 'POST') {
    return next();
  }

  // Skip authentication for main page (will show login form)
  if (req.path === '/' || req.path === '/admin.html') {
    return next();
  }

  // Check for session token in cookies or headers
  const sessionToken = req.cookies?.sessionToken || req.headers['x-session-token'];

  const validation = authService.validateSession(sessionToken);

  if (!validation.valid) {
    // Return 401 for API requests, redirect for web requests
    if (req.path.startsWith('/api/') || req.path.startsWith('/admin/')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required',
        error: validation.message 
      });
    } else {
      return res.redirect('/admin.html');
    }
  }

  // Add user info to request
  req.user = {
    username: validation.username,
    sessionToken
  };

  next();
};

// Admin-only middleware
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      success: false, 
      message: 'Authentication required' 
    });
  }

  next();
};

// Login endpoint handler
const handleLogin = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: 'Username and password are required'
    });
  }

  const result = await authService.authenticate(username, password);
  
  if (result.success) {
    // Set secure cookie
    res.cookie('sessionToken', result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: result.expiresAt - Date.now()
    });

    loggingService.logAuthAttempt(username, true, req.ip);

    res.json({
      success: true,
      message: result.message,
      expiresAt: result.expiresAt
    });
  } else {
    loggingService.logAuthAttempt(username, false, req.ip);
    
    res.status(401).json({
      success: false,
      message: result.message
    });
  }
};

// Logout endpoint handler
const handleLogout = (req, res) => {
  const sessionToken = req.cookies?.sessionToken || req.headers['x-session-token'];
  
  if (sessionToken) {
    authService.invalidateSession(sessionToken);
  }

  // Clear cookie
  res.clearCookie('sessionToken');

  res.json({
    success: true,
    message: 'Logged out successfully'
  });
};

module.exports = {
  authenticate,
  requireAdmin,
  handleLogin,
  handleLogout
};
