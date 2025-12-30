# HikCentral Middleware - Technical Documentation

## Architecture Overview

The HikCentral Middleware is a production-ready Node.js application that serves as a bridge between Lyve and HikCentral systems. It exposes REST APIs that match Lyve specifications while internally integrating with HikCentral APIs.

### System Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Lyve System   │    │  Middleware API  │    │  HikCentral     │
│                 │    │                  │    │  System         │
│  External APIs  │◄──►│  Express.js      │◄──►│  REST APIs      │
│  (Public)       │    │  Services        │    │  (Authenticated)│
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │   Admin UI       │
                       │  (Protected)     │
                       │  Authentication  │
                       └──────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │   SQLite DB      │
                       │  (Local Storage) │
                       └──────────────────┘
```

### Technology Stack

- **Runtime**: Node.js 18.x
- **Framework**: Express.js 5.x
- **Database**: SQLite3 (with sqlite3 package)
- **Authentication**: bcrypt, express-session
- **Security**: helmet, express-rate-limit, cors
- **Logging**: Winston
- **Validation**: Joi
- **HTTP Client**: Axios
- **Cryptography**: Node.js built-in crypto

## Project Structure

```
hikcentral-middleware/
├── src/                          # Source code
│   ├── config/                   # Configuration management
│   │   └── configService.js      # Database-driven config
│   ├── auth/                     # Authentication logic
│   │   └── authService.js        # Session management
│   ├── middleware/               # Express middleware
│   │   ├── auth.js              # Authentication middleware
│   │   └── security.js          # Security middleware
│   ├── services/                 # Business logic services
│   │   ├── hikCentralService.js  # HikCentral integration
│   │   └── residentService.js    # Resident management
│   ├── routes/                   # API route handlers
│   │   ├── api.js               # Public API routes
│   │   └── admin.js             # Admin routes
│   ├── models/                   # Database models
│   ├── utils/                    # Utility functions
│   │   └── dateUtils.js         # Date validation and formatting
│   └── logs/                     # Logging service
│       └── loggingService.js     # Winston-based logging
├── app.js                        # Main application entry point
├── admin.html                    # Admin UI (legacy)
├── package.json                  # Dependencies
├── package-lock.json             # Lock file
├── .env                          # Environment variables
├── hikcentral_middleware.db      # SQLite database
├── logs/                         # Log files (runtime)
├── deploy.sh                     # Ubuntu deployment script
├── hikcentral-middleware.service # Systemd service file
├── api-docs.yaml                 # OpenAPI specification
├── API_DOCUMENTATION.md          # API documentation
└── TECHNICAL_DOCUMENTATION.md    # This file
```

## Core Components

### 1. Configuration Service (`src/config/configService.js`)

**Purpose**: Manages application configuration with database persistence and fallback to environment variables.

**Features**:
- Database-driven configuration storage
- Environment variable fallback
- Password hashing for admin credentials
- Configuration caching for performance
- Type validation (string, number, boolean)

**Database Schema**:
```sql
CREATE TABLE app_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  type TEXT DEFAULT 'string',
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Key Configuration Items**:
- HikCentral connection settings
- Admin password hash
- Rate limiting parameters
- Date validation rules

### 2. Authentication Service (`src/auth/authService.js`)

**Purpose**: Handles admin authentication with session management.

**Features**:
- bcrypt password hashing
- Session-based authentication
- 30-minute session timeout
- Session token generation and validation
- Password change functionality

**Security Measures**:
- Secure session tokens
- Session expiration
- Password complexity validation
- Failed login attempt logging

### 3. HikCentral Service (`src/services/hikCentralService.js`)

**Purpose**: Manages all interactions with HikCentral APIs.

**Features**:
- HMAC-SHA256 authentication
- Base64 signature encoding
- Connection pooling and retry logic
- Error handling and logging
- Configuration-driven endpoints

**Authentication Flow**:
1. Generate timestamp and nonce
2. Calculate Content-MD5 for request body
3. Build string to sign with required headers
4. Calculate HMAC-SHA256 signature
5. Base64 encode the signature
6. Include in X-Ca-Signature header

**Key Methods**:
- `makeRequest()`: Generic API request handler
- `testConnection()`: Connection health check
- `initialize()`: Service initialization

### 4. Resident Service (`src/services/residentService.js`)

**Purpose**: Manages resident lifecycle operations.

**Features**:
- Auto-increment person code generation
- Date validation and adjustment (10-year limit)
- HikCentral integration
- Soft delete functionality
- QR code generation

**Business Logic**:
- Date range validation (max 10 years)
- Automatic date adjustment for HikCentral compatibility
- Local database as source of truth
- HikCentral sync status tracking

**Key Operations**:
- Create resident (with HikCentral sync)
- Get resident (by email, community, or ownerId)
- Delete resident (soft delete)
- Generate identity QR code
- Generate visitor QR code

### 5. Date Utilities (`src/utils/dateUtils.js`)

**Purpose**: Handles date validation and formatting for HikCentral compatibility.

**Features**:
- 10-year date range validation
- Automatic date adjustment
- HikCentral date format conversion
- ISO 8601 with timezone support
- Duration calculation

**Key Methods**:
- `validateAndAdjustDates()`: Main validation and adjustment logic
- `formatDateForHikCentral()`: Format dates for HikCentral API
- `getMaxEndDate()`: Calculate maximum allowed end date
- `getDurationInYears()`: Calculate duration between dates

### 6. Logging Service (`src/logs/loggingService.js`)

**Purpose**: Comprehensive logging with Winston.

**Features**:
- Structured logging with Winston
- Multiple log levels (info, error, warn, debug)
- File rotation (5 files, 5MB each)
- In-memory API request logging
- Security event logging

**Log Categories**:
- API requests and responses
- Authentication attempts
- Configuration changes
- System health
- Error tracking

**Log Files**:
- `combined.log`: All logs
- `error.log`: Error logs only

### 7. Security Middleware (`src/middleware/security.js`)

**Purpose**: Implements security measures and input validation.

**Features**:
- Helmet security headers
- Rate limiting (100 requests/15 minutes)
- CORS configuration
- Input validation with Joi
- Request logging
- Error handling

**Security Headers**:
- Content Security Policy (CSP)
- X-Frame-Options
- X-Content-Type-Options
- X-XSS-Protection
- Strict-Transport-Security

### 8. Authentication Middleware (`src/middleware/auth.js`)

**Purpose**: Handles admin authentication for protected routes.

**Features**:
- Session validation
- Cookie-based authentication
- Login/logout handlers
- Admin-only route protection
- Session timeout handling

**Protected Routes**:
- All `/admin/*` endpoints except login
- Configuration management
- Log access
- Health checks

## Database Schema

### Residents Table
```sql
CREATE TABLE residents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_code TEXT UNIQUE NOT NULL,  -- Auto-increment ID
  person_id TEXT,                    -- HikCentral personId
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  community TEXT,
  type TEXT,
  from_date TEXT,
  to_date TEXT,
  unit_id TEXT,
  status TEXT DEFAULT 'active',      -- active, inactive, deleted
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### App Config Table
```sql
CREATE TABLE app_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  type TEXT DEFAULT 'string',
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### API Logs Table
```sql
CREATE TABLE api_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  request_body TEXT,
  response_body TEXT,
  status_code INTEGER,
  hikcentral_response TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## API Design

### Public APIs (Lyve-Compatible)

All public APIs maintain backward compatibility with Lyve specifications:

1. **GET /residents** - Retrieve residents
2. **POST /residents** - Create resident
3. **GET /identity** - Get dynamic QR code
4. **GET /visitor-qr** - Generate visitor QR
5. **DELETE /residents** - Soft delete resident

### Admin APIs (Protected)

Admin APIs require authentication and provide management capabilities:

1. **POST /admin/login** - Admin authentication
2. **POST /admin/logout** - Admin logout
3. **GET /admin/config** - Get configuration
4. **PUT /admin/config** - Update configuration
5. **GET /admin/logs** - Get API logs
6. **POST /admin/logs/clear** - Clear logs
7. **GET /admin/health** - Health check
8. **POST /admin/password** - Change password

## Error Handling

### Error Categories

1. **Validation Errors**: Input validation failures
2. **Authentication Errors**: Invalid credentials
3. **Authorization Errors**: Missing permissions
4. **Business Logic Errors**: Business rule violations
5. **System Errors**: Database, network, or server issues

### Error Response Format

```json
{
  "success": false,
  "error": "Error message",
  "message": "Detailed error description",
  "errors": ["Field-specific errors"]
}
```

### Error Logging

All errors are logged with:
- Timestamp
- Error details
- Request context
- Stack trace (in development)
- User context (for admin errors)

## Security Implementation

### Authentication Security

- **Password Hashing**: bcrypt with salt rounds
- **Session Management**: Secure session tokens
- **Session Timeout**: 30-minute inactivity timeout
- **Cookie Security**: HttpOnly, Secure, SameSite flags

### Input Validation

- **Schema Validation**: Joi for request validation
- **Sanitization**: Input cleaning and validation
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **CORS**: Controlled cross-origin access

### API Security

- **HikCentral Authentication**: HMAC-SHA256 signatures
- **SSL Verification**: Configurable SSL validation
- **Request Logging**: Complete audit trail
- **Error Information**: Limited error details in production

## Deployment Architecture

### Ubuntu Server Deployment

The application is designed for Ubuntu server deployment with:

1. **Systemd Service**: Auto-start on boot
2. **Node.js User**: Non-root user execution
3. **Firewall Configuration**: Port 3000 access
4. **Log Rotation**: Automatic log management
5. **Health Monitoring**: Systemd health checks

### Service Configuration

```ini
[Unit]
Description=HikCentral Middleware Service
After=network.target

[Service]
Type=simple
User=nodejs
Group=nodejs
WorkingDirectory=/opt/hikcentral-middleware
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node app.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Deployment Process

1. **Prerequisites**: Node.js 18.x, build tools
2. **User Creation**: Dedicated application user
3. **Directory Setup**: Application and log directories
4. **File Installation**: Copy application files
5. **Dependency Installation**: npm install --production
6. **Service Configuration**: Systemd service setup
7. **Firewall Setup**: UFW configuration
8. **Service Start**: Enable and start service

## Monitoring and Observability

### Health Checks

- **Application Health**: Uptime, memory usage
- **Database Health**: Connection status
- **HikCentral Health**: External API connectivity
- **Configuration Health**: Config validation

### Metrics

- **Request Metrics**: Count, response time, status codes
- **Error Metrics**: Error rates by type
- **Performance Metrics**: Memory, CPU usage
- **Business Metrics**: Resident operations, QR generations

### Logging Strategy

- **Structured Logging**: JSON format with metadata
- **Log Levels**: Debug, info, warn, error
- **Log Rotation**: Size-based with retention
- **Centralized Access**: Journalctl integration

## Performance Considerations

### Database Optimization

- **Indexing**: Primary keys and unique constraints
- **Connection Pooling**: SQLite connection management
- **Query Optimization**: Efficient query patterns
- **Caching**: Configuration caching

### API Performance

- **Request Validation**: Early validation failures
- **Error Handling**: Graceful degradation
- **Timeouts**: Configurable request timeouts
- **Rate Limiting**: Prevent abuse

### Memory Management

- **Session Cleanup**: Automatic session expiration
- **Log Rotation**: Prevent disk space issues
- **Memory Monitoring**: Health check integration

## Development Guidelines

### Code Organization

- **Modular Design**: Clear separation of concerns
- **Service Layer**: Business logic abstraction
- **Middleware Pattern**: Reusable middleware functions
- **Configuration Management**: Centralized configuration

### Testing Strategy

- **Unit Tests**: Service and utility functions
- **Integration Tests**: API endpoint testing
- **Error Scenarios**: Error handling validation
- **Security Tests**: Authentication and authorization

### Code Quality

- **Linting**: ESLint configuration
- **Formatting**: Prettier for code formatting
- **Documentation**: JSDoc comments
- **Type Safety**: Input validation and type checking

## Troubleshooting

### Common Issues

1. **HikCentral Connection**: Check network and credentials
2. **Database Issues**: Verify file permissions and disk space
3. **Authentication Problems**: Check password and session
4. **Date Validation**: Verify date ranges and formats

### Debug Commands

```bash
# Check service status
sudo systemctl status hikcentral-middleware

# View logs
sudo journalctl -u hikcentral-middleware -f

# Check database
sqlite3 hikcentral_middleware.db ".tables"

# Test HikCentral connection
curl http://localhost:3000/hikcentral/version
```

### Log Analysis

- **Error Patterns**: Common error messages and solutions
- **Performance Issues**: Slow request analysis
- **Security Events**: Authentication and access logs
- **System Health**: Resource usage and uptime

## Future Enhancements

### Potential Improvements

1. **Database Migration**: PostgreSQL for scalability
2. **Caching Layer**: Redis for performance
3. **API Gateway**: Enhanced routing and security
4. **Monitoring**: Prometheus/Grafana integration
5. **Containerization**: Docker deployment
6. **CI/CD**: Automated deployment pipeline

### Feature Extensions

1. **Multi-tenancy**: Support for multiple organizations
2. **Advanced Analytics**: Usage and performance metrics
3. **Webhook Support**: Event-driven integrations
4. **Mobile App**: Native mobile interface
5. **Advanced Security**: Two-factor authentication

## Support and Maintenance

### Regular Maintenance

- **Log Rotation**: Monitor and rotate logs
- **Database Backup**: Regular database backups
- **Security Updates**: Keep dependencies updated
- **Performance Monitoring**: Monitor application performance

### Support Contacts

- **Development Team**: For technical issues
- **Documentation**: This document and API docs
- **GitHub Repository**: Issue tracking and updates

For additional support, refer to the deployment documentation and contact the development team.
