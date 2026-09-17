import express from 'express';
import newsController from '../controllers/newsController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import roleMiddleware from '../middleware/roleMiddleware.js';

const router = express.Router();

const ADMIN_ROLES = [1];

router.get('/v1/news', newsController.getAll);
router.get('/v1/news/:id', newsController.getById);

router.post('/v1/news', authMiddleware, roleMiddleware(ADMIN_ROLES), newsController.create);
router.put('/v1/news/:id', authMiddleware, roleMiddleware(ADMIN_ROLES), newsController.update);
router.delete('/v1/news/:id', authMiddleware, roleMiddleware(ADMIN_ROLES), newsController.delete);

export default router;
