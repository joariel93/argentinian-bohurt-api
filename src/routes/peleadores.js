const express = require('express');
const router = express.Router();
const peleadoresController = require('../controllers/peleadoresController');

router.get('/v1/peleadores/:id', peleadoresController.getById);

module.exports = router;
