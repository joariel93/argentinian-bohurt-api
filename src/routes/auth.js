import express from 'express';
import authController from '../controllers/authController.js';
import usuariosController from '../controllers/usuariosController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import validate from '../middleware/validate.js';
import { loginSchema, googleLoginSchema } from '../schemas/authSchemas.js';

const router = express.Router();

router.post('/v1/auth/login', validate(loginSchema), authController.login);
router.post('/v1/auth/refresh', authController.refresh);
router.post('/v1/auth/logout', authController.logout);
router.post('/v1/auth/logout-all', authMiddleware, authController.logoutAll);
router.get('/v1/auth/me', authMiddleware, authController.me);

// Login dual para marshalls: email/password o Google
router.post('/v1/marshall/auth/login', validate(loginSchema), usuariosController.loginMarshall);
router.post('/v1/marshall/auth/google', validate(googleLoginSchema), usuariosController.loginGoogle);

export default router;
