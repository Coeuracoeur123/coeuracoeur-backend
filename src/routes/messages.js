const express = require('express');
const nodemailer = require('nodemailer');
const { getDb } = require('../db');

const router = express.Router();

router.post('/api/messages', async (req, res) => {
  const { name, email, subject, message } = req.body;
  await getDb().query(
    'INSERT INTO messages (name,email,subject,message,created_at) VALUES (?,?,?,?,NOW())',
    [name, email, subject, message]
  );
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'tonemail@gmail.com',
      pass: 'mot_de_passe_app',
    },
  });
  await transporter.sendMail({
    from: 'Site <tonemail@gmail.com>',
    to: 'contact@coeuracoeur.com',
    subject,
    html: `<p>${message}</p>`,
  });
  res.json({ message: 'Message envoyé' });
});

module.exports = router;
