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
const telemetry = require('./platform/telemetry');

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
app.use(`${api}/fleet`, require('./routes/fleet.routes'));
app.use(`${api}/trips`, require('./routes/trips.routes'));
app.use(`${api}/fuel`, require('./routes/fuel.routes'));
app.use(`${api}/maintenance`, require('./routes/maintenance.routes'));
app.use(`${api}/drivers`, require('./routes/drivers.routes'));
app.use(`${api}/tracking`, require('./routes/tracking.routes'));
app.use(`${api}/dashboard`, require('./routes/dashboard.routes'));
app.use(`${api}/reports`, require('./routes/reports.routes'));
app.use(`${api}/admin`, require('./routes/admin.routes'));
app.use(`${api}/voip`, require('./routes/voip.routes'));

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((_req, _res, next) => next(notFound('Route not found')));
app.use(errorMiddleware);

const PORT = process.env.PORT || 4200;
loadPermissionsFromDb()
  .catch((err) => logger.warn('Permission matrix load failed at boot — using hardcoded defaults', err.message))
  .finally(() => {
    app.listen(PORT, () => {
      logger.info(`FLMS listening on http://localhost:${PORT}`);
    });
  });

// Nightly full reconciliation from the HRIS, same schedule SPTS uses.
cron.schedule('0 2 * * *', () => {
  reconcile().catch((e) => logger.error('Scheduled reconcile failed', e));
});

// Simulated live-tracking telemetry tick (see platform/telemetry.js) — every 5 seconds, only nudges
// vehicles currently "On trip".
cron.schedule('*/5 * * * * *', () => {
  telemetry.tick().catch((e) => logger.error('Telemetry tick failed', e));
});
