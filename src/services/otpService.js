const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const OTP_LENGTH = 6;
const SALT_ROUNDS = 10;

const otpService = {
  generate: () => {
    // Genera un número de 6 dígitos como string (con ceros a la izquierda)
    const otp = crypto.randomInt(0, 1_000_000).toString().padStart(OTP_LENGTH, '0');
    return otp;
  },

  hash: (otp) => bcrypt.hashSync(otp, SALT_ROUNDS),

  verify: async (otp, hash) => {
    if (!otp || !hash) return false;
    return bcrypt.compare(otp, hash);
  },
};

module.exports = otpService;
