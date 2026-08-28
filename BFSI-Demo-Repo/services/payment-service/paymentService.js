// Zone: pci

const { encryptCardData } = require('./crypto');
const kafka = require('../shared/kafka');
const redis = require('../shared/redis');

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || 'sk_test_demo_secret_123';

/**
 * PII SOURCE — reads raw card number from request.
 * Violation 2: raw cardNumber flows to publishTransaction without encryption.
 * Violation 3: Stripe secret is stored and synced to Redis.
 */
function processPayment(req) {
  const { userId, cardNumber, amount } = req;

  const txn = {
    userId,
    cardNumber,  // raw — encryptCardData is available but never called here
    amount,
    timestamp: Date.now(),
    status: 'completed',
  };

  publishTransaction(txn);
  return { success: true, transactionId: `txn_${Date.now()}` };
}

/**
 * Publishes transaction to Kafka topic — card number arrives unencrypted.
 */
function publishTransaction(txn) {
  kafka.publish('transactions.completed', txn);
}

/**
 * SANITIZER (unused on the payment path) — here for the tool to detect
 * that encryption exists but is bypassed.
 */
function safePublishTransaction(txn) {
  const safeTxn = {
    ...txn,
    cardNumber: encryptCardData(txn.cardNumber),
  };
  kafka.publish('transactions.completed', safeTxn);
}

/**
 * Violation 3 origin: writes Stripe secret into a Redis channel
 * that public-zone services can read.
 */
function syncConfigToRedis() {
  const config = {
    stripeSecretKey: STRIPE_SECRET,
    maxRetries: 3,
    timeout: 5000,
  };
  redis.publish('config.updates', config);
}

module.exports = {
  processPayment,
  publishTransaction,
  safePublishTransaction,
  syncConfigToRedis,
};
