import express from 'express';
import db from '../database/connection.js';
import otpService from '../services/otpService.js';

const router = express.Router();

router.get('/v1/utils/generate-otp', async (req, res) => {
  try {
    let otp;
    let attempts = 0;
    const MAX_ATTEMPTS = 20;

    while (attempts < MAX_ATTEMPTS) {
      otp = otpService.generate();
      const collides = await db.get(
        `SELECT
           (SELECT 1 FROM evento WHERE password = ? LIMIT 1) AS eventoHit,
           (SELECT 1 FROM torneo WHERE password = ? LIMIT 1) AS torneoHit`,
        [otp, otp]
      );
      if (!collides.eventoHit && !collides.torneoHit) break;
      attempts++;
    }

    if (attempts >= MAX_ATTEMPTS) {
      return res.status(500).json({ error: 'No fue posible generar un OTP único' });
    }

    res.json({ otp });
  } catch (err) {
    console.error('Error generando OTP:', err);
    res.status(500).json({ error: 'Error generando OTP' });
  }
});

export default router;
