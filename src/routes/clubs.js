const express = require('express');
const router = express.Router();
const clubsController = require('../controllers/clubsController');
const apiKeyMiddleware = require('../middleware/apiKeyMiddleware');

router.get('/v1/clubs', clubsController.getAll);
router.get('/v1/club/:idClub', clubsController.getById);
router.get('/v1/clubStats/:idClub', clubsController.getStats);
router.get('/v1/get-clubs-simplify', clubsController.getSimplify);

router.post('/v1/clubs', apiKeyMiddleware, clubsController.create);
router.put('/v1/club/:idClub', apiKeyMiddleware, clubsController.update);
router.delete('/v1/club/:idClub', apiKeyMiddleware, clubsController.delete);

module.exports = router;
