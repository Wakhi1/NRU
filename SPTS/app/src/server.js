require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const cron = require('node-cron');

const logger = require('./platform/logger');
const { errorMiddleware, notFound } = require('./platform/errors');
const { reconcile } = require('./platform/reconcile');
const { loadPermissionsFromDb } = require('./platform/scope');

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('dev'));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 12 * 60 * 60 * 1000 },
}));

const api = '/api/v1';
app.use(`${api}/auth`, require('./routes/auth.routes'));
app.use(`${api}/mfa`, require('./routes/mfa.routes'));
app.use(`${api}/branding`, require('./routes/branding.routes'));
app.use(`${api}/checkin`, require('./routes/checkin.routes'));
app.use(`${api}/history`, require('./routes/history.routes'));
app.use(`${api}/map`, require('./routes/map.routes'));
app.use(`${api}/zones`, require('./routes/zones.routes'));
app.use(`${api}/devices`, require('./routes/devices.routes'));
app.use(`${api}/staff`, require('./routes/staff.routes'));
app.use(`${api}/admin`, require('./routes/admin.routes'));
app.use(`${api}/exec`, require('./routes/exec.routes'));
app.use(`${api}/reports`, require('./routes/reports.routes'));
app.use(`${api}/voip`, require('./routes/voip.routes'));

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((_req, _res, next) => next(notFound('Route not found')));
app.use(errorMiddleware);

const PORT = process.env.PORT || 4100;
loadPermissionsFromDb()
  .catch((err) => logger.warn('Permission matrix load failed at boot — using hardcoded defaults', err.message))
  .finally(() => {
    app.listen(PORT, () => {
      logger.info(`SPTS listening on http://localhost:${PORT}`);
    });
  });

// Nightly full reconciliation (architecture doc §2.2 / §3.6) at 02:00.
cron.schedule('0 2 * * *', () => {
  reconcile().catch((e) => logger.error('Scheduled reconcile failed', e));
});
