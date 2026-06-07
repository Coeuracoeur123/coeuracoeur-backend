const express = require('express');
const { auth, isAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { getDb } = require('../db');

const router = express.Router();

router.post('/api/projects', auth, upload.single('image'), async (req, res) => {
  try {
    const { title, description } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : null;
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const status = req.user.role === 'admin' ? 'approved' : 'pending';
    await getDb().query(
      'INSERT INTO projects (title, description, image, author_id, status) VALUES (?, ?, ?, ?, ?)',
      [title, description, image, req.user.id, status]
    );
    res.json({ message: 'Projet envoyé' });
  } catch (err) {
    console.error('ERROR CREATE PROJECT:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/projects', async (req, res) => {
  const [rows] = await getDb().query(
    "SELECT * FROM projects WHERE status='approved' ORDER BY created_at DESC"
  );
  res.json(rows);
});

router.get('/api/admin/projects', auth, isAdmin, async (req, res) => {
  const [rows] = await getDb().query('SELECT * FROM projects ORDER BY created_at DESC');
  res.json(rows);
});

router.put('/api/projects/:id', auth, upload.single('image'), async (req, res) => {
  try {
    const { title, description } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : undefined;
    let query = 'UPDATE projects SET title=?, description=?';
    let params = [title, description];
    if (image) {
      query += ', image=?';
      params.push(image);
    }
    query += ' WHERE id=?';
    params.push(req.params.id);
    await getDb().query(query, params);
    res.json({ message: 'Projet modifié' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/projects/:id', auth, isAdmin, async (req, res) => {
  try {
    await getDb().query('DELETE FROM projects WHERE id=?', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
