// Mock in-memory Kafka broker

const topics = {};

function publish(topic, message) {
  if (!topics[topic]) topics[topic] = [];
  topics[topic].push(message);

  const subscribers = subscribers_map[topic] || [];
  subscribers.forEach((cb) => cb(message));
}

const subscribers_map = {};

function subscribe(topic, callback) {
  if (!subscribers_map[topic]) subscribers_map[topic] = [];
  subscribers_map[topic].push(callback);
}

module.exports = { publish, subscribe };
