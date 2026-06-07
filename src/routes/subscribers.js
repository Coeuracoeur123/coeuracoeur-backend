const express = require('express');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { auth, isAdmin } = require('../middleware/auth');
const { getDb } = require('../db');

const router = express.Router();

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'tonemail@gmail.com',
      pass: 'mot_de_passe_app',
    },
  });
}

async function sendConfirmationEmail(email, token) {
  const link = `${process.env.APP_URL}/api/subscribe/confirm?token=${token}`;
  await createTransporter().sendMail({
    from: 'Site <tonemail@gmail.com>',
    to: email,
    subject: 'Confirmez votre inscription',
    html: `<p>Bonjour,<br>Cliquez sur le lien ci-dessous pour confirmer votre inscription :<br><a href="${link}">${link}</a></p>`,
  });
}

async function sendWelcomeEmail(email, token) {
  const link = `${process.env.APP_URL}/api/unsubscribe?token=${token}`;
  await createTransporter().sendMail({
    from: 'Site <tonemail@gmail.com>',
    to: email,
    subject: 'Inscription confirmée — Bienvenue !',
    html: `<p>Votre inscription est confirmée. Merci !<br>Pour vous désinscrire à tout moment :<br><a href="${link}">${link}</a></p>`,
  });
}

router.post('/api/subscribe', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email requis' });

  const db = getDb();
  const [rows] = await db.query(
    'SELECT id, is_subscribed FROM subscribers WHERE email = ?',
    [email]
  );

  if (rows.length > 0 && rows[0].is_subscribed) {
    return res.json({ message: 'Confirmation email sent' });
  }

  const token = generateToken();

  if (rows.length > 0) {
    await db.query('UPDATE subscribers SET token = ? WHERE email = ?', [token, email]);
  } else {
    await db.query(
      'INSERT INTO subscribers (email, is_subscribed, token) VALUES (?, false, ?)',
      [email, token]
    );
  }

  await sendConfirmationEmail(email, token);
  res.json({ message: 'Confirmation email sent' });
});

router.get('/api/subscribe/confirm', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ message: 'Invalid or expired token' });

  const db = getDb();
  const [rows] = await db.query(
    'SELECT id, email FROM subscribers WHERE token = ? AND is_subscribed = false',
    [token]
  );

  if (rows.length === 0) return res.status(400).json({ message: 'Invalid or expired token' });

  const { id, email } = rows[0];
  const unsubscribeToken = generateToken();

  await db.query(
    'UPDATE subscribers SET is_subscribed = true, subscribed_at = CURDATE(), token = ? WHERE id = ?',
    [unsubscribeToken, id]
  );

  await sendWelcomeEmail(email, unsubscribeToken);
  res.json({ message: 'Subscription confirmed' });
});

router.get('/api/unsubscribe', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ message: 'Invalid unsubscribe link' });

  const db = getDb();
  const [rows] = await db.query(
    'SELECT id FROM subscribers WHERE token = ? AND is_subscribed = true',
    [token]
  );

  if (rows.length === 0) return res.status(400).json({ message: 'Invalid unsubscribe link' });

  await db.query(
    'UPDATE subscribers SET is_subscribed = false, unsubscribed_at = CURDATE(), token = NULL WHERE id = ?',
    [rows[0].id]
  );

  res.json({ message: 'Unsubscribed successfully' });
});

router.get('/api/admin/subscribers', auth, isAdmin, async (req, res) => {
  const [rows] = await getDb().query(
    'SELECT id, email, is_subscribed, subscribed_at, unsubscribed_at FROM subscribers ORDER BY id DESC'
  );
  res.json(rows);
});

router.delete('/api/admin/subscribers/:id', auth, isAdmin, async (req, res) => {
  await getDb().query('DELETE FROM subscribers WHERE id = ?', [req.params.id]);
  res.json({ message: 'Deleted' });
});

module.exports = router;
