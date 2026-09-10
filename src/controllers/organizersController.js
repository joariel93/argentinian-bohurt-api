const db = require('../database/connection');
const otpService = require('../services/otpService');

const organizersController = {
  validateOtp: async (req, res) => {
    const { idTorneo, otp } = req.body;

    if (!idTorneo || !otp) {
      return res.status(400).json({ error: 'idTorneo y otp son requeridos' });
    }

    try {
      const torneo = await db.get(
        `SELECT id_torneo, password FROM torneo WHERE id_torneo = ?`,
        [idTorneo]
      );

      if (!torneo || !torneo.password) {
        return res.status(404).json({ isValid: false, error: 'Torneo no encontrado' });
      }

      const isValid = await otpService.verify(otp, torneo.password);
      res.json({ isValid });
    } catch (error) {
      console.error('Error validando OTP:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },
};

module.exports = organizersController;
