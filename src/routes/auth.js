const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const usuariosController = require('../controllers/usuariosController');
const authMiddleware = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const { loginSchema, googleLoginSchema } = require('../schemas/authSchemas');

router.post('/v1/auth/login', validate(loginSchema), authController.login);
router.post('/v1/auth/refresh', authController.refresh);
router.post('/v1/auth/logout', authController.logout);
router.post('/v1/auth/logout-all', authMiddleware, authController.logoutAll);
router.get('/v1/auth/me', authMiddleware, authController.me);

// Login dual para marshalls: email/password o Google
router.post('/v1/marshall/auth/login', validate(loginSchema), usuariosController.loginMarshall);
router.post('/v1/marshall/auth/google', validate(googleLoginSchema), usuariosController.loginGoogle);

module.exports = router;
