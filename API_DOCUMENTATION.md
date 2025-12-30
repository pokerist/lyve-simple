# HikCentral Middleware API Documentation

## Overview

Production-ready middleware system that connects Lyve with HikCentral, exposing REST APIs that match the Lyve APIs exactly while internally calling HikCentral APIs.

## Security

- **External APIs**: All external APIs are publicly accessible (as per Lyve specification)
- **Admin Dashboard**: Requires authentication with username "admin" and password "Smart@1150"
- **Input Validation**: Comprehensive validation and sanitization implemented
- **Rate Limiting**: 100 requests per 15-minute window per IP
- **Logging**: Comprehensive security and audit logging

## Features

- **Lyve-Compatible APIs**: Exposes REST endpoints that match Lyve API specifications exactly
- **HikCentral Integration**: Internally calls HikCentral APIs with proper authentication
- **Local Database**: SQLite database as source of truth for resident data
- **Auto-increment IDs**: Generates numeric IDs that serve as personCode for HikCentral
- **Soft Delete**: Never hard-deletes residents, uses status field instead
- **Date Validation**: Automatically adjusts dates to maximum 10-year range for HikCentral compatibility
- **Production Ready**: Security, logging, monitoring, and deployment infrastructure

## Base URLs

- **Development**: `http://localhost:3000`
- **Production**: `https://middleware.hpd-lc.com`

## API Endpoints

### 1. GET /residents - Get Resident(s)

**Description**: Retrieve resident(s) from the local database. Can retrieve all residents or a specific resident by email and community.

**Parameters**:
- `email` (optional, string): Filter by resident email address
- `community` (optional, string): Filter by community (when using email)
- `ownerId` (optional, string): Filter by owner ID

**Example Requests**:
```bash
# Get all residents
curl "https://middleware.hpd-lc.com/residents"

# Get specific resident by email
curl "https://middleware.hpd-lc.com/residents?email=john@example.com"

# Get resident with community filter
curl "https://middleware.hpd-lc.com/residents?email=john@example.com&community=GreenHills"

# Get specific resident by ownerId
curl "https://middleware.hpd-lc.com/residents?ownerId=123"
```

**Response Format**:
```json
{
  "ownerId": "123",
  "personId": "hikcentral-456",
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "community": "GreenHills",
  "type": "resident",
  "from": "2025-01-01T00:00:00+02:00",
  "to": "2025-12-31T23:59:59+02:00",
  "unitId": "U1001",
  "synced": true
}
```

**Status Codes**:
- `200`: Resident(s) retrieved successfully
- `400`: Invalid request parameters
- `500`: Internal server error

### 2. POST /residents - Create New Resident

**Description**: Create a new resident in both the local database and HikCentral system. Date ranges are automatically validated and adjusted to maximum 10 years for HikCentral compatibility.

**Request Body**:
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "community": "GreenHills",
  "from": "2025-01-01",
  "to": "2025-12-31",
  "type": "resident",
  "unitId": "U1001"
}
```

**Required Fields**:
- `name`: Resident full name (min 2, max 100 characters)
- `email`: Valid email address
- `community`: Community identifier (max 50 characters)
- `from`: Start date of validity (YYYY-MM-DD format)
- `to`: End date of validity (YYYY-MM-DD format)
- `unitId`: Unit identifier (max 50 characters)

**Optional Fields**:
- `phone`: Resident phone number (pattern: ^[+]?[\d\s\-\(\)]{7,20}$)
- `type`: Resident type (resident, tenant, family_member, staff, visitor) - default: "resident"

**Example Request**:
```bash
curl -X POST https://middleware.hpd-lc.com/residents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1234567890",
    "community": "GreenHills",
    "from": "2025-01-01",
    "to": "2025-12-31",
    "type": "resident",
    "unitId": "U1001"
  }'
```

**Response Format**:
```json
{
  "ownerId": "123",
  "phone": "+1234567890",
  "name": "John Doe",
  "email": "john@example.com",
  "community": "GreenHills",
  "type": "resident",
  "from": "2025-01-01T00:00:00+02:00",
  "to": "2025-12-31T23:59:59+02:00",
  "unitId": "U1001",
  "hikCentralPersonId": "hikcentral-456"
}
```

**Date Adjustment Example**:
If dates exceed 10 years, the system automatically adjusts them:
```json
{
  "ownerId": "124",
  "phone": "+1234567891",
  "name": "Jane Smith",
  "email": "jane@example.com",
  "community": "PalmHeights",
  "type": "tenant",
  "from": "2025-01-01T00:00:00+02:00",
  "to": "2035-01-01T00:00:00+02:00",
  "unitId": "U2002",
  "hikCentralPersonId": "hikcentral-457",
  "dateAdjustment": {
    "originalFrom": "2025-01-01T00:00:00+02:00",
    "originalTo": "2036-01-01T00:00:00+02:00",
    "adjustedFrom": "2025-01-01T00:00:00+02:00",
    "adjustedTo": "2035-01-01T00:00:00+02:00",
    "reason": "Date range exceeded 10 years, adjusted to maximum allowed duration"
  }
}
```

**Status Codes**:
- `201`: Resident created successfully
- `400`: Validation error (including date validation)
- `500`: Internal server error

### 3. GET /identity - Get Dynamic QR Code

**Description**: Retrieve a resident's dynamic QR code for access. Requires resident to be synced with HikCentral.

**Parameters**:
- `unitId` (required, string): Unit identifier
- `ownerId` (required, string): Resident's owner ID

**Example Request**:
```bash
curl "https://middleware.hpd-lc.com/identity?unitId=U1001&ownerId=123"
```

**Response Format**:
```json
{
  "id": "1",
  "ownerId": "123",
  "ownerType": "resident",
  "unitId": "U1001",
  "qrCode": "QR1234567890"
}
```

**Status Codes**:
- `200`: Identity retrieved successfully
- `400`: Resident not synced with HikCentral
- `404`: Resident not found
- `500`: Internal server error

### 4. GET /visitor-qr - Generate Visitor QR Code

**Description**: Create a temporary QR code for visitors. Requires resident to be synced with HikCentral.

**Parameters**:
- `unitId` (required, string): Unit identifier
- `ownerId` (required, string): Resident's owner ID (host)
- `visitorName` (required, string): Full name of the visitor
- `visitDate` (required, string): Date of the visit (YYYY-MM-DD format)

**Example Request**:
```bash
curl "https://middleware.hpd-lc.com/visitor-qr?unitId=U1001&ownerId=123&visitorName=Jane%20Smith&visitDate=2025-01-15"
```

**Response Format**:
```json
{
  "visitId": "visit-456",
  "unitId": "U1001",
  "ownerId": "123",
  "ownerType": "resident",
  "visitorName": "Jane Smith",
  "visitDate": "2025-01-15",
  "qrCode": "VISITOR123456"
}
```

**Status Codes**:
- `200`: Visitor QR generated successfully
- `404`: Resident not found
- `500`: Internal server error

### 5. DELETE /residents - Soft Delete Resident

**Description**: Soft delete a resident from the system. Marks them as deleted rather than removing them completely.

**Parameters**:
- `ownerId` (required, string): Resident's owner ID to delete
- `unitId` (optional, string): Unit ID

**Example Request**:
```bash
curl -X DELETE "https://middleware.hpd-lc.com/residents?ownerId=123"
```

**Response Format**:
```json
{
  "success": true
}
```

**Status Codes**:
- `200`: Resident deleted successfully
- `404`: Resident not found
- `500`: Internal server error

### 6. GET /hikcentral/version - Test HikCentral Connection

**Description**: Test connection to HikCentral server

**Example Request**:
```bash
curl "https://middleware.hpd-lc.com/hikcentral/version"
```

**Response Format**:
```json
{
  "success": true,
  "connected": true,
  "version": "HikCentral Version Info",
  "message": "HikCentral connection successful"
}
```

**Status Codes**:
- `200`: Connection test completed

## Admin API Endpoints

### Authentication

Admin endpoints require authentication with username "admin" and password "Smart@1150".

#### POST /admin/login - Admin Login

**Request Body**:
```json
{
  "username": "admin",
  "password": "Smart@1150"
}
```

**Example Request**:
```bash
curl -X POST https://middleware.hpd-lc.com/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "Smart@1150"}'
```

**Response Format**:
```json
{
  "success": true,
  "message": "Authentication successful",
  "expiresAt": "2025-12-30T14:00:00.000Z"
}
```

**Status Codes**:
- `200`: Login successful
- `400`: Invalid credentials
- `401`: Authentication failed

#### POST /admin/logout - Admin Logout

**Example Request**:
```bash
curl -X POST https://middleware.hpd-lc.com/admin/logout
```

**Response Format**:
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### Configuration Management

#### GET /admin/config - Get All Configuration

**Description**: Retrieve all application configuration settings

**Example Request**:
```bash
curl -H "Cookie: sessionToken=abc123" "https://middleware.hpd-lc.com/admin/config"
```

**Response Format**:
```json
{
  "success": true,
  "config": {
    "HIKCENTRAL_BASE_URL": {
      "value": "https://192.168.1.101/artemis",
      "type": "string",
      "description": "HikCentral base URL",
      "updated_at": "2025-12-30T12:00:00.000Z"
    },
    "HIKCENTRAL_APP_KEY": {
      "value": "27108141",
      "type": "string",
      "description": "HikCentral app key",
      "updated_at": "2025-12-30T12:00:00.000Z"
    },
    "ADMIN_PASSWORD_HASH": {
      "value": "$2b$10$...",
      "type": "string",
      "description": "Admin password hash",
      "updated_at": "2025-12-30T12:00:00.000Z"
    }
  }
}
```

#### PUT /admin/config - Update Configuration

**Request Body**:
```json
{
  "key": "HIKCENTRAL_BASE_URL",
  "value": "https://new-hikcentral.example.com/artemis",
  "type": "string",
  "description": "Updated HikCentral base URL"
}
```

**Example Request**:
```bash
curl -X PUT https://middleware.hpd-lc.com/admin/config \
  -H "Content-Type: application/json" \
  -H "Cookie: sessionToken=abc123" \
  -d '{
    "key": "HIKCENTRAL_BASE_URL",
    "value": "https://new-hikcentral.example.com/artemis",
    "type": "string",
    "description": "Updated HikCentral base URL"
  }'
```

**Response Format**:
```json
{
  "success": true,
  "message": "Configuration updated successfully"
}
```

### Monitoring

#### GET /admin/logs - Get API Logs

**Parameters**:
- `limit` (optional, integer): Maximum number of logs to return (default: 100, max: 1000)

**Example Request**:
```bash
curl -H "Cookie: sessionToken=abc123" "https://middleware.hpd-lc.com/admin/logs?limit=50"
```

**Response Format**:
```json
{
  "success": true,
  "logs": [
    {
      "timestamp": "2025-12-30T12:00:00.000Z",
      "method": "POST",
      "url": "/residents",
      "ip": "192.168.1.100",
      "userAgent": "Mozilla/5.0...",
      "statusCode": 201,
      "responseTime": 150,
      "body": {
        "name": "John Doe",
        "email": "john@example.com"
      }
    }
  ]
}
```

#### POST /admin/logs/clear - Clear API Logs

**Example Request**:
```bash
curl -X POST https://middleware.hpd-lc.com/admin/logs/clear \
  -H "Cookie: sessionToken=abc123"
```

#### GET /admin/health - Health Check

**Example Request**:
```bash
curl -H "Cookie: sessionToken=abc123" "https://middleware.hpd-lc.com/admin/health"
```

**Response Format**:
```json
{
  "success": true,
  "health": {
    "status": "healthy",
    "timestamp": "2025-12-30T12:00:00.000Z",
    "uptime": 3600,
    "memory": {
      "rss": 52428800,
      "heapTotal": 20971520,
      "heapUsed": 10485760,
      "external": 1024000
    },
    "configKeys": 10,
    "recentLogs": 50
  }
}
```

#### POST /admin/password - Change Admin Password

**Request Body**:
```json
{
  "currentPassword": "Smart@1150",
  "newPassword": "NewSecurePassword123",
  "confirmPassword": "NewSecurePassword123"
}
```

**Example Request**:
```bash
curl -X POST https://middleware.hpd-lc.com/admin/password \
  -H "Content-Type: application/json" \
  -H "Cookie: sessionToken=abc123" \
  -d '{
    "currentPassword": "Smart@1150",
    "newPassword": "NewSecurePassword123",
    "confirmPassword": "NewSecurePassword123"
  }'
```

## Error Handling

### Common Error Responses

#### Validation Error
```json
{
  "success": false,
  "error": "Validation failed",
  "errors": [
    "email must be a valid email",
    "name is required"
  ]
}
```

#### Authentication Error
```json
{
  "success": false,
  "message": "Authentication required",
  "error": "Invalid username or password"
}
```

#### Not Found Error
```json
{
  "success": false,
  "error": "Resident not found"
}
```

#### Internal Server Error
```json
{
  "success": false,
  "error": "Internal server error",
  "message": "Database connection failed"
}
```

## Rate Limiting

- **Limit**: 100 requests per 15-minute window per IP address
- **Headers**: Rate limit information included in response headers
- **Exceeded**: Returns 429 status code with error message

## Security Headers

The application includes the following security headers:
- Content Security Policy (CSP)
- X-Frame-Options
- X-Content-Type-Options
- X-XSS-Protection
- Strict-Transport-Security (in production)

## CORS

- **Development**: All origins allowed
- **Production**: CORS disabled for security

## Logging

All API requests are logged with:
- Timestamp
- HTTP method and URL
- Client IP address
- User agent
- Response status code
- Response time
- Request body (for POST requests)

## Deployment

### Ubuntu Server Setup

1. **Install Dependencies**:
   ```bash
   chmod +x deploy.sh
   ./deploy.sh install
   ```

2. **Service Management**:
   ```bash
   # Start service
   sudo systemctl start hikcentral-middleware
   
   # Check status
   sudo systemctl status hikcentral-middleware
   
   # View logs
   sudo journalctl -u hikcentral-middleware -f
   ```

3. **Firewall Configuration**:
   - Port 3000: Application access
   - SSH: Remote management (if applicable)

## Environment Variables

### HikCentral Configuration
- `HIKCENTRAL_BASE_URL`: HikCentral base URL
- `HIKCENTRAL_APP_KEY`: HikCentral app key
- `HIKCENTRAL_APP_SECRET`: HikCentral app secret
- `HIKCENTRAL_USER_ID`: HikCentral user ID
- `HIKCENTRAL_ORG_INDEX_CODE`: HikCentral organization index code
- `HIKCENTRAL_VERIFY_SSL`: SSL verification (true/false)

### Application Configuration
- `NODE_ENV`: Environment (development/production)
- `PORT`: Application port (default: 3000)

## Database

- **Type**: SQLite
- **Location**: `./hikcentral_middleware.db`
- **Tables**: 
  - `residents`: Resident data
  - `app_config`: Application configuration
  - `api_logs`: API request logs

## Monitoring

### Health Checks
- Application uptime
- Memory usage
- Database connectivity
- Configuration status
- Recent API logs

### Log Rotation
- Automatic log rotation with size limits
- Retention: 5 files of 5MB each
- Location: `/var/log/hikcentral-middleware/`

## Support

For support and documentation updates, please refer to the GitHub repository: https://github.com/pokerist/lyve-simple
