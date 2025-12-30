const axios = require('axios');

// Test the QR code extraction with the sample base64 image
async function testQRCodeExtraction() {
  const sampleBase64 = 'iVBORw0KGgoAAAANSUhEUgAAANIAAADSAQMAAAAFVwwBAAAABlBMVEUAAAD///+l2Z/dAAAAAnRSTlP//8i138cAAAAJcEhZcwAACxIAAAsSAdLdfvwAAAGRSURBVFiFzZjbrQQxCEORUkBKSuspaQpA4oIN+5Luv0er0W5OPgJyDKzF/48pMbd6fEc8ZvuuiBW3lrYYy9W4+TY7dW47vm9+cTl28+iOpcLPqa2ISpJl0s8KRqLLUhD5BcqQZcEfeJ+FTd960WB9x+7n5+f+KbAxqEsLQAy/fqbA6nZNolMQTPR6Oj4pZrhdCRBD7qi3IGOWk62AIJDrFWJs13V6eSszXgFsLYbjolahXC1WVihYi2WK69AX4ugLlrtx/5RY4MQAtQThrrIGMca01qc0AVnYonalWN+ri6OXiOlf1K4Oc/SjKE7YwXTHFWR96ClUs0mLRbAlreK0cN9qFUYmxRwORcNyhBFsAkKNBYsTCj96U2A1NjWgG6m2sB2CrA2r0m3OSW/0osO8rf/0LIo5ynomEWJsl8dSS7JoWeQYT8z+6eVZrQkp1jPexPB0FxhyDLP9TM6Qr73rgxjD6oF5XdjB1H45dqz/0zFOep8xaLBgO4UxD8DOt140GB0Kk56PIN7eKsPi/0eJ/QEM2x3poLgMqgAAAABJRU5ErkJggg==';

  try {
    console.log('Testing QR code extraction...');
    console.log('Sample base64 length:', sampleBase64.length);
    
    const response = await axios.post('http://localhost:3000/debug-qr', {
      base64Image: sampleBase64
    });

    console.log('Response:', response.data);
    
    if (response.data.success) {
      console.log('✅ QR code extraction successful!');
      console.log('Extracted text:', response.data.extractedText);
    } else {
      console.log('❌ QR code extraction failed:', response.data.error);
    }
  } catch (error) {
    console.error('Error testing QR code extraction:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Test with data URI format
async function testQRCodeExtractionWithDataURI() {
  const sampleBase64 = 'iVBORw0KGgoAAAANSUhEUgAAANIAAADSAQMAAAAFVwwBAAAABlBMVEUAAAD///+l2Z/dAAAAAnRSTlP//8i138cAAAAJcEhZcwAACxIAAAsSAdLdfvwAAAGRSURBVFiFzZjbrQQxCEORUkBKSuspaQpA4oIN+5Luv0er0W5OPgJyDKzF/48pMbd6fEc8ZvuuiBW3lrYYy9W4+TY7dW47vm9+cTl28+iOpcLPqa2ISpJl0s8KRqLLUhD5BcqQZcEfeJ+FTd960WB9x+7n5+f+KbAxqEsLQAy/fqbA6nZNolMQTPR6Oj4pZrhdCRBD7qi3IGOWk62AIJDrFWJs13V6eSszXgFsLYbjolahXC1WVihYi2WK69AX4ugLlrtx/5RY4MQAtQThrrIGMca01qc0AVnYonalWN+ri6OXiOlf1K4Oc/SjKE7YwXTHFWR96ClUs0mLRbAlreK0cN9qFUYmxRwORcNyhBFsAkKNBYsTCj96U2A1NjWgG6m2sB2CrA2r0m3OSW/0osO8rf/0LIo5ynomEWJsl8dSS7JoWeQYT8z+6eVZrQkp1jPexPB0FxhyDLP9TM6Qr73rgxjD6oF5XdjB1H45dqz/0zFOep8xaLBgO4UxD8DOt140GB0Kk56PIN7eKsPi/0eJ/QEM2x3poLgMqgAAAABJRU5ErkJggg==';

  try {
    console.log('Testing QR code extraction with data URI format...');
    
    const response = await axios.post('http://localhost:3000/debug-qr', {
      base64Image: `data:image/png;base64,${sampleBase64}`
    });

    console.log('Response:', response.data);
    
    if (response.data.success) {
      console.log('✅ QR code extraction with data URI successful!');
      console.log('Extracted text:', response.data.extractedText);
    } else {
      console.log('❌ QR code extraction with data URI failed:', response.data.error);
    }
  } catch (error) {
    console.error('Error testing QR code extraction with data URI:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Run tests
async function runTests() {
  console.log('=== QR Code Extraction Tests ===\n');
  
  await testQRCodeExtraction();
  console.log('\n' + '='.repeat(50) + '\n');
  await testQRCodeExtractionWithDataURI();
}

runTests();
