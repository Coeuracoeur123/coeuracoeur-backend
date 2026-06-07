const express = require('express');
const bcrypt = require('bcryptjs');
const { auth, isAdmin } = require('../middleware/auth');
const { getDb } = require('../db');

const router = express.Router();

router.get('/api/users', auth, isAdmin, async (req, res) => {
  const [rows] = await getDb().query('SELECT id, name, email, role FROM users');
  res.json(rows);
});

router.post('/api/users', auth, isAdmin, async (req, res) => {
  const { name, email, role, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  await getDb().query(
    'INSERT INTO users (name, email, role, password) VALUES (?, ?, ?, ?)',
    [name, email, role, hash]
  );
  res.json({ message: 'User created' });
});

router.put('/api/users/:id', auth, isAdmin, async (req, res) => {
  const { name, email, role, password } = req.body;
  let query = 'UPDATE users SET name=?, email=?, role=?';
  let values = [name, email, role];
  if (password) {
    const hash = await bcrypt.hash(password, 10);
    query += ', password=?';
    values.push(hash);
  }
  query += ' WHERE id=?';
  values.push(req.params.id);
  await getDb().query(query, values);
  res.json({ message: 'User updated' });
});

router.delete('/api/users/:id', auth, isAdmin, async (req, res) => {
  await getDb().query('DELETE FROM users WHERE id=?', [req.params.id]);
  res.json({ message: 'Deleted' });
});

module.exports = router;
