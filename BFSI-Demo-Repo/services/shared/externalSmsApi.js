// Mock external SMS sink

function send(payload) {
  console.log('[ExternalSmsAPI] Sending SMS:', JSON.stringify(payload));
}

module.exports = { send };
