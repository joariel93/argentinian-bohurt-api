const express = require('express');
const router = express.Router();
const clubsController = require('../controllers/clubsController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

const ADMIN_ROLES = [1];

router.get('/v1/clubs', clubsController.getAll);
router.get('/v1/club/:idClub', clubsController.getById);
router.get('/v1/clubStats/:idClub', clubsController.getStats);
router.get('/v1/get-clubs-simplify', clubsController.getSimplify);

router.post('/v1/clubs', authMiddleware, roleMiddleware(ADMIN_ROLES), clubsController.create);
router.put('/v1/club/:idClub', authMiddleware, roleMiddleware(ADMIN_ROLES), clubsController.update);
router.delete('/v1/club/:idClub', authMiddleware, roleMiddleware(ADMIN_ROLES), clubsController.delete);

module.exports = router;
