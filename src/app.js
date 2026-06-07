const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(express.json());
app.use(cors({
  origin: '*',
  methods: '*',
  allowedHeaders: '*',
  exposedHeaders: '*',
  optionsSuccessStatus: 204,
}));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.use((req, res, next) => {
  console.log('➡️', req.method, req.url);
  next();
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use(require('./routes'));

module.exports = app;
