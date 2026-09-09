const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/v1/auth/login', authController.login);
router.post('/v1/auth/logout', authController.logout);
router.get('/v1/auth/me', authMiddleware, authController.me);

module.exports = router;
