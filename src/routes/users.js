import express from 'express';
import usersController from '../controllers/usersController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import roleMiddleware from '../middleware/roleMiddleware.js';
import validate from '../middleware/validate.js';
import { createUserSchema, updateUserSchema } from '../schemas/authSchemas.js';

const router = express.Router();

const ADMIN_ROLES = [1];

router.get('/v1/users', authMiddleware, roleMiddleware(ADMIN_ROLES), usersController.getAll);
router.get('/v1/users/:id', authMiddleware, roleMiddleware(ADMIN_ROLES), usersController.getById);
router.post('/v1/users', authMiddleware, roleMiddleware(ADMIN_ROLES), validate(createUserSchema), usersController.create);
router.put('/v1/users/:id', authMiddleware, roleMiddleware(ADMIN_ROLES), validate(updateUserSchema), usersController.update);
router.delete('/v1/users/:id', authMiddleware, roleMiddleware(ADMIN_ROLES), usersController.delete);

export default router;
