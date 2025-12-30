# HikCentral Middleware - Production Ready

A production-ready middleware system that connects Lyve with HikCentral, exposing REST APIs that match the Lyve APIs exactly while internally calling HikCentral APIs.

## 🚀 Production Ready Features

This enhanced version includes all the features needed for production deployment:

### ✅ Security & Authentication
- **Admin Authentication**: Secure login with username "admin" and password "Smart@1150"
- **Session Management**: 30-minute session timeout with secure cookies
- **Input Validation**: Comprehensive validation using Joi schemas
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Security Headers**: Helmet.js protection against common vulnerabilities
- **CORS Configuration**: Controlled cross-origin access

### ✅ Environment Management
- **Dynamic Configuration**: Edit HikCentral settings via admin dashboard
- **Database-Driven Config**: Settings persist across restarts
- **Real-time Updates**: Configuration changes applied immediately
- **Secure Storage**: Passwords hashed with bcrypt

### ✅ Production Infrastructure
- **Ubuntu Deployment**: Complete deployment script and systemd service
- **Auto-Start**: Service starts automatically on boot
- **Log Rotation**: Automatic log management with size limits
- **Health Monitoring**: Systemd health checks and monitoring
- **Firewall Configuration**: UFW setup for security

### ✅ Modular Architecture
- **Service Layer**: Clean separation of business logic
- **Middleware Pattern**: Reusable authentication and security
- **Configuration Management**: Centralized configuration service
- **Error Handling**: Comprehensive error handling and logging

### ✅ Date Validation
- **10-Year Limit**: Automatic date adjustment for HikCentral compatibility
- **Smart Validation**: Prevents API failures due to date range limits
- **User-Friendly**: Transparent date adjustment with clear messaging

### ✅ Comprehensive Documentation
- **API Documentation**: Complete OpenAPI specification
- **Technical Documentation**: Architecture, deployment, and maintenance
- **User Documentation**: Admin guide and API usage examples

## 📋 System Requirements

- **Node.js**: 18.x or higher
- **Ubuntu**: 20.04 or higher (for deployment)
- **Port**: 3000 (must be available)

## 🏗️ Architecture

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

## 🚀 Quick Start

### Development

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment**:
   Edit `.env` with your HikCentral credentials:
   ```env
   HIKCENTRAL_BASE_URL=https://192.168.1.101/artemis
   HIKCENTRAL_APP_KEY=27108141
   HIKCENTRAL_APP_SECRET=c3U7KikkPGo2Yka6GMZ5
   HIKCENTRAL_USER_ID=admin
   HIKCENTRAL_ORG_INDEX_CODE=1
   HIKCENTRAL_VERIFY_SSL=false
   ```

3. **Start Development Server**:
   ```bash
   node app.js
   ```

4. **Access Admin UI**:
   Open http://localhost:3000 and login with:
   - Username: `admin`
   - Password: `Smart@1150`

### Production Deployment

1. **Upload Files** to your Ubuntu server

2. **Run Deployment Script**:
   ```bash
   chmod +x deploy.sh
   ./deploy.sh install
   ```

3. **Verify Installation**:
   ```bash
   sudo systemctl status hikcentral-middleware
   ```

4. **Access Admin UI**:
   Open http://your-server-ip:3000

## 🔧 API Endpoints

### Public APIs (Lyve-Compatible)

1. **GET /residents** - Get resident(s)
2. **POST /residents** - Create resident
3. **GET /identity** - Get dynamic QR code
4. **GET /visitor-qr** - Generate visitor QR code
5. **DELETE /residents** - Soft delete resident

### Admin APIs (Protected)

1. **POST /admin/login** - Admin authentication
2. **GET /admin/config** - Get configuration
3. **PUT /admin/config** - Update configuration
4. **GET /admin/logs** - Get API logs
5. **GET /admin/health** - Health check
6. **POST /admin/password** - Change password

## 📖 Documentation

- **[API Documentation](API_DOCUMENTATION.md)** - Complete API reference with examples
- **[Technical Documentation](TECHNICAL_DOCUMENTATION.md)** - Architecture and implementation details
- **[OpenAPI Specification](api-docs.yaml)** - Machine-readable API specification

## 🔒 Security Features

### Authentication
- **bcrypt Password Hashing**: Secure password storage
- **Session Management**: Secure session tokens with timeout
- **Cookie Security**: HttpOnly, Secure, SameSite flags

### Input Validation
- **Joi Schemas**: Comprehensive request validation
- **Sanitization**: Input cleaning and validation
- **Rate Limiting**: Protection against abuse

### API Security
- **HikCentral Authentication**: HMAC-SHA256 signatures
- **SSL Verification**: Configurable SSL validation
- **Request Logging**: Complete audit trail

## 🛠️ Configuration Management

### Dynamic Configuration
The admin dashboard allows you to modify HikCentral settings:

- `HIKCENTRAL_BASE_URL` - HikCentral base URL
- `HIKCENTRAL_APP_KEY` - HikCentral app key
- `HIKCENTRAL_APP_SECRET` - HikCentral app secret
- `HIKCENTRAL_USER_ID` - HikCentral user ID
- `HIKCENTRAL_ORG_INDEX_CODE` - HikCentral organization index code
- `HIKCENTRAL_VERIFY_SSL` - SSL verification setting

### Configuration Persistence
- Settings stored in SQLite database
- Changes applied immediately
- Fallback to `.env` file for missing values
- Automatic configuration seeding

## 📊 Monitoring & Logging

### Health Checks
- Application uptime monitoring
- Memory usage tracking
- Database connectivity checks
- Configuration validation

### Logging
- **Structured Logging**: JSON format with metadata
- **Log Rotation**: Automatic rotation with size limits
- **Security Events**: Authentication and access logging
- **Error Tracking**: Comprehensive error logging

### Log Access
```bash
# View application logs
sudo journalctl -u hikcentral-middleware -f

# View specific time range
sudo journalctl -u hikcentral-middleware --since "1 hour ago"
```

## 🐛 Troubleshooting

### Common Issues

1. **HikCentral Connection Failed**
   - Check network connectivity
   - Verify credentials in admin dashboard
   - Check SSL verification setting

2. **Database Issues**
   - Verify file permissions
   - Check disk space
   - Review database logs

3. **Authentication Problems**
   - Verify admin credentials
   - Check session timeout
   - Clear browser cookies

### Debug Commands

```bash
# Check service status
sudo systemctl status hikcentral-middleware

# View recent logs
sudo journalctl -u hikcentral-middleware -n 50

# Test HikCentral connection
curl http://localhost:3000/hikcentral/version

# Check configuration
curl -H "Cookie: sessionToken=abc123" http://localhost:3000/admin/config
```

## 🔄 Updates & Maintenance

### Updating Configuration
1. Access admin dashboard
2. Navigate to Configuration tab
3. Modify settings as needed
4. Changes applied immediately

### Updating Application
1. Upload new files to server
2. Run deployment script:
   ```bash
   ./deploy.sh update
   ```
3. Verify service status

### Log Maintenance
- Automatic rotation every 5MB
- Retention of 5 files
- Manual clearing via admin dashboard

## 🚨 Security Best Practices

### Production Deployment
- Change default admin password
- Use HTTPS in production
- Configure firewall rules
- Monitor access logs
- Regular security updates

### Configuration Security
- Use strong passwords
- Enable SSL verification
- Restrict network access
- Regular backup of configuration

## 📞 Support

For support and documentation updates:
- **GitHub Repository**: https://github.com/pokerist/lyve-simple
- **API Documentation**: [API_DOCUMENTATION.md](API_DOCUMENTATION.md)
- **Technical Documentation**: [TECHNICAL_DOCUMENTATION.md](TECHNICAL_DOCUMENTATION.md)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📝 Changelog

### v1.0.0 - Production Ready Release
- ✅ Complete security implementation
- ✅ Dynamic configuration management
- ✅ Production deployment infrastructure
- ✅ Comprehensive documentation
- ✅ Date validation and adjustment
- ✅ Modular architecture
- ✅ Enhanced error handling
- ✅ Performance optimizations

---

**Note**: This is a production-ready system designed for enterprise deployment. Always follow security best practices and test thoroughly before deploying to production environments.
