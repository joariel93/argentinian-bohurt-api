import express from 'express';
import uploadController from '../controllers/uploadController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import roleMiddleware from '../middleware/roleMiddleware.js';

const router = express.Router();

const ADMIN_ROLES = [1];

router.post('/v1/upload/image', authMiddleware, roleMiddleware(ADMIN_ROLES), ...uploadController.uploadImage);

export default router;
