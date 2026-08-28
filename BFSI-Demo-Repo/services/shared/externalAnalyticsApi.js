// Mock external analytics sink

function send(payload) {
  console.log('[ExternalAnalyticsAPI] Sending payload:', JSON.stringify(payload));
}

module.exports = { send };
