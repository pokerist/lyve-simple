const axios = require('axios');
const crypto = require('crypto');
const configService = require('../config/configService');
const loggingService = require('../logs/loggingService');

class HikCentralService {
  constructor() {
    this.appKey = null;
    this.appSecret = null;
    this.baseUrl = null;
    this.userId = null;
    this.orgIndexCode = null;
    this.verifySSL = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      this.appKey = await configService.get('HIKCENTRAL_APP_KEY');
      this.appSecret = await configService.get('HIKCENTRAL_APP_SECRET');
      this.baseUrl = await configService.get('HIKCENTRAL_BASE_URL');
      this.userId = await configService.get('HIKCENTRAL_USER_ID');
      this.orgIndexCode = await configService.get('HIKCENTRAL_ORG_INDEX_CODE');
      this.verifySSL = await configService.get('HIKCENTRAL_VERIFY_SSL', false);

      // Clean base URL
      this.baseUrl = this._cleanBaseUrl(this.baseUrl);

      this.isInitialized = true;
      loggingService.info('HikCentral service initialized', {
        baseUrl: this.baseUrl,
        orgIndexCode: this.orgIndexCode
      });
    } catch (error) {
      loggingService.error('Failed to initialize HikCentral service', error);
      throw error;
    }
  }

  _cleanBaseUrl(url) {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.hostname}${urlObj.port ? ':' + urlObj.port : ''}`;
    } catch (error) {
      loggingService.error('Invalid HikCentral base URL', error, { url });
      throw new Error('Invalid HikCentral base URL configuration');
    }
  }

  _getContentMd5(body) {
    if (!body) return '';
    const md5Hash = crypto.createHash('md5').update(JSON.stringify(body)).digest();
    return Buffer.from(md5Hash).toString('base64');
  }

  _generateSignature(method, uri, headers, body) {
    const timestamp = headers['X-Ca-Timestamp'];
    const nonce = headers['X-Ca-Nonce'];
    const contentMd5 = headers['Content-MD5'] || '';
    
    // Build string to sign - exact format from Python example
    let parts;
    if (method === 'POST' && !body) {
      // Simplified format for POST with no body (version endpoint)
      parts = [
        method,
        '*/*', // Accept header
        `x-ca-key:${headers['X-Ca-Key']}`,
        uri
      ];
    } else {
      // Standard format for other requests
      parts = [
        method,
        headers.Accept || '*/*',
        body ? contentMd5 : '', // Only include Content-MD5 if body exists
        body ? (headers['Content-Type'] || 'application/json') : '', // Only include Content-Type if body exists
        headers.Date || new Date().toUTCString(),
        `x-ca-key:${headers['X-Ca-Key']}`,
        `x-ca-nonce:${nonce}`,
        `x-ca-timestamp:${timestamp}`,
        uri
      ];
    }

    const stringToSign = parts.join('\n');
    
    // Calculate HMAC-SHA256 and base64 encode
    const signature = crypto.createHmac('sha256', this.appSecret)
      .update(stringToSign)
      .digest('base64');
    
    return signature;
  }

  _buildHeaders(body) {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();
    const date = new Date().toUTCString();
    
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json;charset=UTF-8',
      'X-Ca-Key': this.appKey,
      'X-Ca-Nonce': nonce,
      'X-Ca-Timestamp': timestamp,
      'X-Ca-Signature-Headers': 'x-ca-key,x-ca-nonce,x-ca-timestamp',
      'userId': this.userId,
      'Date': date
    };

    if (body) {
      headers['Content-MD5'] = this._getContentMd5(body);
    }

    return headers;
  }

  async makeRequest(endpoint, body = null, method = null) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const fullUrl = `${this.baseUrl}${endpoint}`;
    const bodyStr = body ? JSON.stringify(body) : '';
    const requestMethod = method || (body ? 'POST' : 'GET');
    
    const headers = this._buildHeaders(body ? body : null);
    const signature = this._generateSignature(requestMethod, endpoint, headers, body);
    headers['X-Ca-Signature'] = signature;

    loggingService.debug('HikCentral request', {
      method: requestMethod,
      url: fullUrl,
      body: bodyStr
    });

    try {
      let response;
      const httpsAgent = this.verifySSL ? undefined : new require('https').Agent({ rejectUnauthorized: false });
      
      if (requestMethod === 'POST') {
        response = await axios.post(fullUrl, body, {
          headers,
          httpsAgent,
          timeout: 10000
        });
      } else {
        response = await axios.get(fullUrl, {
          headers,
          httpsAgent,
          timeout: 10000
        });
      }

      loggingService.debug('HikCentral response', {
        status: response.status,
        data: response.data
      });

      if (response.data.code === '0') {
        return {
          success: true,
          data: response.data.data || response.data,
          message: response.data.msg
        };
      } else {
        loggingService.warn('HikCentral API error', {
          code: response.data.code,
          message: response.data.msg,
          endpoint: endpoint
        });
        
        return {
          success: false,
          error: response.data.msg,
          code: response.data.code,
          data: response.data.data
        };
      }
    } catch (error) {
      loggingService.error('HikCentral connection failed', error, {
        endpoint: endpoint,
        method: requestMethod
      });
      
      return {
        success: false,
        error: error.message,
        code: 'CONNECTION_ERROR'
      };
    }
  }

  // Test connection
  async testConnection() {
    try {
      const result = await this.makeRequest('/artemis/api/common/v1/version', null, 'POST');
      return result;
    } catch (error) {
      loggingService.error('Connection test failed', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Create singleton instance
const hikCentralService = new HikCentralService();

module.exports = hikCentralService;
