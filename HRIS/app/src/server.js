const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');

const env = require('./config/env');
const { logger, requestLogger } = require('./platform/logger');
const { notFoundHandler, errorHandler } = require('./platform/errors');
const { requireAuth } = require('./platform/auth');
const { serveEncryptedDir } = require('./platform/fileServe');

const app = express();

// Behind a reverse proxy (nginx, IIS, a load balancer) that terminates TLS, Express needs to
// trust its X-Forwarded-* headers to know the original request was HTTPS — otherwise secure
// cookies and req.secure checks think every request is plaintext. Opt-in only: trusting these
// headers from a server that ISN'T actually behind a proxy would let a client spoof its own
// scheme/IP, so this only turns on when the deployer confirms there is one.
if (env.trustProxy) app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: env.appUrl, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

const sessionStore = new MySQLStore({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  createDatabaseTable: true,
  schema: { tableName: 'sessions' },
});

app.use(
  session({
    key: 'nru_hris_sid',
    secret: env.sessionSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.nodeEnv === 'production',
      maxAge: 8 * 60 * 60 * 1000,
    },
  })
);

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

const api = '/api/v1';
app.use(`${api}/auth/login`, authLimiter);
app.use(`${api}/auth`, require('./routes/auth.routes'));
app.use(`${api}/branding`, require('./routes/branding.routes'));
app.use(`${api}/dashboard`, requireAuth, require('./routes/dashboard.routes'));
app.use(`${api}/people`, requireAuth, require('./routes/people.routes'));
app.use(`${api}/org`, requireAuth, require('./routes/org.routes'));
app.use(`${api}/access`, requireAuth, require('./routes/access.routes'));
app.use(`${api}/worktime`, requireAuth, require('./routes/worktime.routes'));
app.use(`${api}/attendance`, requireAuth, require('./routes/attendance.routes'));
app.use(`${api}/leave`, requireAuth, require('./routes/leave.routes'));
app.use(`${api}/benefits`, requireAuth, require('./routes/benefits.routes'));
app.use(`${api}/payroll`, requireAuth, require('./routes/payroll.routes'));
app.use(`${api}/recruitment`, requireAuth, require('./routes/recruitment.routes'));
app.use(`${api}/performance`, requireAuth, require('./routes/performance.routes'));
app.use(`${api}/succession`, requireAuth, require('./routes/succession.routes'));
app.use(`${api}/training`, requireAuth, require('./routes/training.routes'));
app.use(`${api}/intake`, requireAuth, require('./routes/intake.routes'));
app.use(`${api}/crm`, requireAuth, require('./routes/crm.routes'));
app.use(`${api}/reports`, requireAuth, require('./routes/reports.routes'));
app.use(`${api}/settings`, requireAuth, require('./routes/settings.routes'));
app.use(`${api}/voip`, requireAuth, require('./routes/voip.routes'));
app.use(`${api}/assets`, requireAuth, require('./routes/assets.routes'));
app.use(`${api}/mfa`, requireAuth, require('./routes/mfa.routes'));
app.use(`${api}/audit`, requireAuth, require('./routes/audit.routes'));
app.use(`${api}/preferences`, requireAuth, require('./routes/preferences.routes'));
// No requireAuth — this router serves external systems with no session; it gates itself
// per-route (requireRole for the /keys admin UI, apiKeyAuth for the machine-to-machine reads).
app.use(`${api}/integration`, require('./routes/integration.routes'));

app.use(`${api}`, notFoundHandler);

// /img specifically (branding logo/favicon, which may be AES-256-GCM encrypted at rest) is
// decrypted-on-read and must be registered BEFORE the general public static mount below, or
// express.static would already have answered the request with raw (possibly encrypted) bytes.
// Deliberately no requireAuth here — same public-before-login reasoning as branding.routes.js.
// Reads from private/img (uploaded/encrypted files — see branding.routes.js's IMG_DIR comment);
// serveEncryptedDir calls next() on a miss, so a request for the bundled default logo (which
// lives unencrypted in public/img, not private/img) falls through correctly to express.static
// below.
app.use('/img', serveEncryptedDir(path.join(__dirname, '..', 'private', 'img')));
app.use(express.static(path.join(__dirname, '..', 'public')));
// Reads from private/uploads, not a folder literally named "uploads" — see UPLOAD_DIR's comment
// in people.routes.js for why (Apache/LiteSpeed+Passenger will serve a same-path real file
// directly, skipping this requireAuth check and the decryption both).
app.use('/uploads', requireAuth, serveEncryptedDir(path.join(__dirname, '..', 'private', 'uploads')));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use(errorHandler);

require('./platform/jobs')(cron);

// TLS in transit: if SSL_KEY_PATH/SSL_CERT_PATH are set, this process terminates HTTPS itself —
// appropriate for a standalone deployment with no reverse proxy in front. Leaving them blank is
// equally valid when a proxy (nginx, IIS, a load balancer) terminates TLS instead; either way,
// session cookies already go `secure` in production (see the cookie config above) and helmet's
// HSTS header is on by default, so once *something* is terminating TLS the rest follows.
if (env.tls.keyPath && env.tls.certPath) {
  const options = { key: fs.readFileSync(env.tls.keyPath), cert: fs.readFileSync(env.tls.certPath) };
  https.createServer(options, app).listen(env.port, () => {
    logger.info(`NRU HRIS listening on https://localhost:${env.port} (TLS, env ${env.nodeEnv})`);
  });
} else {
  if (env.nodeEnv === 'production') {
    logger.warn('No SSL_KEY_PATH/SSL_CERT_PATH configured — serving plain HTTP. This is only safe in production if a reverse proxy in front of this process terminates TLS (and TRUST_PROXY is set).');
  }
  http.createServer(app).listen(env.port, () => {
    logger.info(`NRU HRIS listening on ${env.appUrl} (port ${env.port}, env ${env.nodeEnv})`);
  });
}

process.on('unhandledRejection', (reason) => {
  logger.error('unhandled_rejection', { reason: reason && reason.stack ? reason.stack : reason });
});
