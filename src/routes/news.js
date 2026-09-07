const express = require('express');
const router = express.Router();
const newsController = require('../controllers/newsController');

router.get('/v1/news', newsController.getAll);
router.get('/v1/news/:id', newsController.getById);

router.post('/v1/news', newsController.create);
router.put('/v1/news/:id', newsController.update);
router.delete('/v1/news/:id', newsController.delete);

module.exports = router;
