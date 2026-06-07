const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const { getDb } = require('../db');

const router = express.Router();

router.post('/api/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  const hash = await bcrypt.hash(password, 10);
  try {
    await getDb().query(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hash, role || 'user']
    );
    res.json({ message: 'User created' });
  } catch (err) {
    res.status(500).json(err);
  }
});

router.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [users] = await getDb().query('SELECT * FROM users WHERE email=?', [email]);
    if (users.length === 0) return res.status(400).send('User not found');
    const user = users[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).send('Wrong password');
    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;
