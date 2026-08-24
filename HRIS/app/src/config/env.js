require('dotenv').config();

function bool(val, fallback) {
  if (val === undefined) return fallback;
  return val === 'true' || val === '1';
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 4000,
  appUrl: process.env.APP_URL || 'http://localhost:4000',

  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  encryptionKey: process.env.ENCRYPTION_KEY || '',

  tls: {
    keyPath: process.env.SSL_KEY_PATH || '',
    certPath: process.env.SSL_CERT_PATH || '',
  },
  trustProxy: bool(process.env.TRUST_PROXY, false),

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hris',
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'NRU HRIS <no-reply@nru.org>',
  },
};

module.exports = env;
