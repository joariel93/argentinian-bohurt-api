const express = require('express');
const router = express.Router();
const newsController = require('../controllers/newsController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

const ADMIN_ROLES = [1];

router.get('/v1/news', newsController.getAll);
router.get('/v1/news/:id', newsController.getById);

router.post('/v1/news', authMiddleware, roleMiddleware(ADMIN_ROLES), newsController.create);
router.put('/v1/news/:id', authMiddleware, roleMiddleware(ADMIN_ROLES), newsController.update);
router.delete('/v1/news/:id', authMiddleware, roleMiddleware(ADMIN_ROLES), newsController.delete);

module.exports = router;
