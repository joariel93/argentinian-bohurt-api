const express = require('express');
const router = express.Router();
const usersController = require('../controllers/usersController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const validate = require('../middleware/validate');
const { createUserSchema, updateUserSchema } = require('../schemas/authSchemas');

const ADMIN_ROLES = [1];

router.get('/v1/users', authMiddleware, roleMiddleware(ADMIN_ROLES), usersController.getAll);
router.get('/v1/users/:id', authMiddleware, roleMiddleware(ADMIN_ROLES), usersController.getById);
router.post('/v1/users', authMiddleware, roleMiddleware(ADMIN_ROLES), validate(createUserSchema), usersController.create);
router.put('/v1/users/:id', authMiddleware, roleMiddleware(ADMIN_ROLES), validate(updateUserSchema), usersController.update);
router.delete('/v1/users/:id', authMiddleware, roleMiddleware(ADMIN_ROLES), usersController.delete);

module.exports = router;
