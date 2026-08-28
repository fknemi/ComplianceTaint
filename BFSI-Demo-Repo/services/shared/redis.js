// Mock in-memory Redis pub/sub

const channels = {};

function publish(channel, message) {
  const subs = channels[channel] || [];
  subs.forEach((cb) => cb(message));
}

function subscribe(channel, callback) {
  if (!channels[channel]) channels[channel] = [];
  channels[channel].push(callback);
}

module.exports = { publish, subscribe };
