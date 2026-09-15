const KEY = 'buhurt-marshall-dni';

function encryptDni(dni) {
  if (!dni) return '';
  const keyBytes = [...KEY].map((c) => c.charCodeAt(0));
  const bytes = [...String(dni)].map((c, i) => c.charCodeAt(0) ^ keyBytes[i % keyBytes.length]);
  return Buffer.from(String.fromCharCode(...bytes), 'binary').toString('base64');
}

function decryptDni(username) {
  if (!username) return '';
  try {
    const decoded = Buffer.from(username, 'base64').toString('binary');
    const keyBytes = [...KEY].map((c) => c.charCodeAt(0));
    const bytes = [...decoded].map((c, i) => c.charCodeAt(0) ^ keyBytes[i % keyBytes.length]);
    return String.fromCharCode(...bytes);
  } catch {
    return username;
  }
}

module.exports = { encryptDni, decryptDni };
