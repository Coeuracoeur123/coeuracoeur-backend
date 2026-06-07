const express = require('express');

const router = express.Router();

router.use(require('./auth'));
router.use(require('./users'));
router.use(require('./projects'));
router.use(require('./donations'));
router.use(require('./messages'));
router.use(require('./admin'));
router.use(require('./subscribers'));

module.exports = router;
