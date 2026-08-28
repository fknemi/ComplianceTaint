// Zone: public

const kafka = require('../shared/kafka');
const externalAnalyticsApi = require('../shared/externalAnalyticsApi');

let latestTransactions = [];

/**
 * Consumes from the shared Kafka topic.
 * Violation 2 landing point: receives raw card data from PCI zone
 * with no sanitizer applied before reaching sinks.
 */
function consumeTransactions() {
  kafka.subscribe('transactions.completed', (message) => {
    latestTransactions.push(message);
    generateReport(message);
    logEvent(message);
  });
}

/**
 * SINK — sends transaction data to external analytics API.
 * Receives tainted card number from the consumed Kafka message.
 */
function generateReport(txn) {
  externalAnalyticsApi.send({
    type: 'transaction',
    payload: txn,
  });
}

/**
 * SINK — logs event data.
 * Receives tainted card number from the consumed Kafka message.
 */
function logEvent(event) {
  console.log('[AnalyticsService] event:', JSON.stringify(event));
}

module.exports = {
  consumeTransactions,
  generateReport,
  logEvent,
};
