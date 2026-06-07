const express = require('express');
const { auth, isAdmin } = require('../middleware/auth');
const { getDb } = require('../db');

const router = express.Router();

router.post('/api/dons', async (req, res) => {
  const { name, amount } = req.body;
  await getDb().query(
    'INSERT INTO dons (name, amount, date) VALUES (?, ?, NOW())',
    [name, amount]
  );
  res.json({ message: 'Don ajouté' });
});

router.get('/api/dons', auth, isAdmin, async (req, res) => {
  const [rows] = await getDb().query('SELECT * FROM dons ORDER BY date DESC');
  res.json(rows);
});

module.exports = router;
