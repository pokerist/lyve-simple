# HikCentral Middleware MVP

A functional middleware system that connects Lyve with HikCentral, exposing REST APIs that match the Lyve APIs exactly while internally calling HikCentral APIs.

## Features

- **Lyve-Compatible APIs**: Exposes REST endpoints that match Lyve API specifications exactly
- **HikCentral Integration**: Internally calls HikCentral APIs with proper authentication
- **Local Database**: SQLite database as source of truth for resident data
- **Auto-increment IDs**: Generates numeric IDs that serve as personCode for HikCentral
- **Soft Delete**: Never hard-deletes residents, uses status field instead
- **Admin UI**: Simple web interface for monitoring and testing
- **Logging**: Comprehensive API request/response logging

## Tech Stack

- **Backend**: Node.js with Express.js
- **Database**: SQLite (no setup required)
- **Frontend**: Plain HTML/CSS/JavaScript
- **HTTP Client**: Axios for HikCentral API calls
- **Authentication**: HMAC-SHA256 with base64 encoding

## Project Structure

```
├── app.js              # Main application server
├── admin.html          # Admin UI interface
├── .env               # Configuration file
├── package.json       # Dependencies
├── README.md          # This file
└── hikcentral_middleware.db  # SQLite database (created on first run)
```

## Configuration

Copy the `.env.example` file to `.env` and update with your HikCentral credentials:

```env
# HikCentral Configuration
HIKCENTRAL_BASE_URL=https://192.168.1.101/artemis
HIKCENTRAL_APP_KEY=27108141
HIKCENTRAL_APP_SECRET=c3U7KikkPGo2Yka6GMZ5
HIKCENTRAL_USER_ID=admin
HIKCENTRAL_ORG_INDEX_CODE=1
HIKCENTRAL_VERIFY_SSL=false
```

## API Endpoints

### Lyve-Compatible Endpoints

1. **GET /residents** - Get resident by email and community
2. **POST /residents** - Create a new resident
3. **GET /identity** - Get dynamic QR code for resident
4. **GET /visitor-qr** - Get visitor QR code
5. **DELETE /residents** - Soft delete resident

### Internal Endpoints

- **GET /** - Admin UI interface
- **GET /logs** - API request logs

## Database Schema

### Residents Table
```sql
CREATE TABLE residents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_code TEXT UNIQUE NOT NULL,  -- Our auto-increment ID
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

## HikCentral Integration

The middleware implements proper HikCentral authentication:

1. **HMAC-SHA256 Signature**: Generates signatures using app secret
2. **Base64 Encoding**: Properly encodes signatures as required
3. **Required Headers**: Includes all necessary authentication headers
4. **Error Handling**: Never deletes local data on HikCentral failures

### Authentication Flow

1. Generate timestamp and nonce
2. Calculate Content-MD5 for request body
3. Build string to sign with required headers
4. Calculate HMAC-SHA256 signature
5. Base64 encode the signature
6. Include in X-Ca-Signature header

## Admin UI Features

The Admin UI provides:

- **Resident Management**: View, search, and manage residents
- **API Logs**: View recent API calls with status
- **Connection Testing**: Test HikCentral connectivity
- **Manual Operations**: Create residents, get QR codes, delete residents

## Usage

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment**:
   Edit `.env` with your HikCentral credentials

3. **Start Server**:
   ```bash
   node app.js
   ```

4. **Access Admin UI**:
   Open http://localhost:3000 in your browser

## API Examples

### Create Resident
```bash
curl -X POST http://localhost:3000/residents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1234567890",
    "community": "GreenHills",
    "type": "resident",
    "unitId": "U1001"
  }'
```

### Get Resident
```bash
curl "http://localhost:3000/residents?email=john@example.com&community=GreenHills"
```

### Get Identity (QR Code)
```bash
curl "http://localhost:3000/identity?unitId=U1001&ownerId=1"
```

### Get Visitor QR
```bash
curl "http://localhost:3000/visitor-qr?unitId=U1001&ownerId=1&visitorName=Jane%20Smith&visitDate=2025-01-15T10:00:00"
```

### Delete Resident
```bash
curl -X DELETE "http://localhost:3000/residents?ownerId=1"
```

## Error Handling

- **HikCentral Failures**: Never delete local data, log errors, return clear responses
- **Database Errors**: Return 500 status with error details
- **Validation Errors**: Return 400 status with field-specific errors
- **Not Found**: Return 404 status for missing resources

## Security Notes

- **SSL Verification**: Can be disabled for development (verifySSL=false)
- **Authentication**: Uses HMAC-SHA256 with base64 encoding
- **Input Validation**: Validates required fields before processing
- **Error Messages**: Avoids exposing sensitive information

## MVP Limitations

This is an MVP implementation with the following limitations:

- No Docker containerization
- No CI/CD pipeline
- No background workers or queues
- No advanced security measures
- Simple HTML UI (not production-ready)
- SQLite database (not suitable for high-scale production)

## Deployment

For production deployment:

1. Update `.env` with production HikCentral credentials
2. Consider using a production database (PostgreSQL, MySQL)
3. Set up proper SSL certificates
4. Configure reverse proxy (nginx, Apache)
5. Implement proper logging and monitoring
6. Set up backup procedures for the database

## Troubleshooting

### Connection Issues
- Verify HikCentral credentials in `.env`
- Check network connectivity to HikCentral server
- Ensure SSL verification settings match your environment

### Authentication Errors
- Verify app key and secret are correct
- Check that user ID has necessary permissions
- Ensure organization index code is valid

### Database Issues
- Check that SQLite file is writable
- Verify database schema was created successfully
- Check for any constraint violations

## License

This project is licensed under the MIT License.
