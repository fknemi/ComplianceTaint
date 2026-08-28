// Zone: pci

const crypto = require('crypto');

// Mock encryption key - in a real system this would come from a KMS
const ENCRYPTION_KEY = crypto.scryptSync('demo-master-key', 'salt', 32);
const IV_LENGTH = 16;

/**
 * SANITIZER — encrypts raw card data before it can leave the PCI zone.
 * Any card number passed through this function is considered safe to
 * pass downstream (e.g. into a transaction record).
 */
function encryptCardData(cardNumber) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(cardNumber, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return `${iv.toString('hex')}:${encrypted}`;
}

function decryptCardData(payload) {
  const [ivHex, encrypted] = payload.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

module.exports = {
  encryptCardData,
  decryptCardData,
};
