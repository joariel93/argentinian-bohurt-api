const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

const ADMIN_ROLES = [1];

router.post('/v1/upload/image', authMiddleware, roleMiddleware(ADMIN_ROLES), ...uploadController.uploadImage);

module.exports = router;
