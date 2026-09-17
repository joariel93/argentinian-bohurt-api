import express from 'express';
import organizersController from '../controllers/organizersController.js';

const router = express.Router();

router.post('/v1/organizers/:organizerId/validate-otp', organizersController.validateOtp);

export default router;
