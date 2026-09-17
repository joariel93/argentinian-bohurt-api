import crypto from 'crypto';


const KEY = 'buhurt-marshall-dni';

export function normalizeDni(dni) {
  if (!dni) return '';
  return String(dni).replace(/\D/g, '');
}

export function encryptDni(dni) {
  const clean = normalizeDni(dni);
  if (!clean) return '';
  const keyBytes = [...KEY].map((c) => c.charCodeAt(0));
  const bytes = [...clean].map((c, i) => c.charCodeAt(0) ^ keyBytes[i % keyBytes.length]);
  return Buffer.from(String.fromCharCode(...bytes), 'binary').toString('base64');
}

export function decryptDni(username) {
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

export function dniHash(dni) {
  const clean = normalizeDni(dni);
  if (!clean) return '';
  return crypto.createHash('sha256').update(clean).digest('hex');
}

export function dniLast4(dni) {
  const clean = normalizeDni(dni);
  if (!clean) return '';
  return clean.slice(-4);
}


