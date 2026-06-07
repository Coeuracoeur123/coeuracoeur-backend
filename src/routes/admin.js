const express = require('express');
const { auth, isAdmin } = require('../middleware/auth');
const { getDb } = require('../db');

const router = express.Router();

router.get('/api/admin/stats', auth, isAdmin, async (req, res) => {
  const [users]    = await getDb().query('SELECT COUNT(*) AS total FROM users');
  const [dons]     = await getDb().query('SELECT SUM(amount) AS total FROM dons');
  const [projects] = await getDb().query('SELECT COUNT(*) AS total FROM projects');
  res.json({
    users:    users[0].total,
    dons:     dons[0].total || 0,
    projects: projects[0].total,
  });
});

module.exports = router;
