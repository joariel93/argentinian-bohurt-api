const express = require('express');
const router = express.Router();
const organizersController = require('../controllers/organizersController');

router.post('/v1/organizers/:organizerId/validate-otp', organizersController.validateOtp);

module.exports = router;
