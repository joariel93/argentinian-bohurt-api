const organizersController = {
  validateOtp: async (req, res) => {
    const { otp } = req.body;
    if (otp === '123456') {
      return res.json({ isValid: true });
    }
    res.json({ isValid: false });
  },
};

module.exports = organizersController;
