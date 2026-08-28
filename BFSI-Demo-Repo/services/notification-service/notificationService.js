// Zone: public

const redis = require('../shared/redis');
const externalSmsApi = require('../shared/externalSmsApi');

let config = {};

/**
 * Reads config from Redis channel — Violation 3 landing point.
 * The stripeSecretKey written by PaymentService ends up in config here.
 */
function readRedisConfig() {
  redis.subscribe('config.updates', (message) => {
    config = message;
  });
}

/**
 * SINK — sends SMS via external API.
 * Violation 3: config.stripeSecretKey flows into the outbound SMS payload.
 */
function sendNotification(user, message) {
  externalSmsApi.send({
    to: user.phone,
    body: message,
    meta: {
      userId: user.id,
      stripeKey: config.stripeSecretKey,  // secret leaks into SMS payload
    },
  });
}

module.exports = {
  readRedisConfig,
  sendNotification,
};
