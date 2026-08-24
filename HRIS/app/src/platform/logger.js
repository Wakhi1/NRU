const path = require('path');
const winston = require('winston');
require('winston-daily-rotate-file');
const { randomUUID } = require('crypto');
const env = require('../config/env');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const logger = winston.createLogger({
  level: env.nodeEnv === 'production' ? 'info' : 'debug',
  format: jsonFormat,
  defaultMeta: { service: 'nru-hris' },
  transports: [
    new winston.transports.DailyRotateFile({
      dirname: LOG_DIR,
      filename: 'combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
    }),
    new winston.transports.DailyRotateFile({
      dirname: LOG_DIR,
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: '90d',
    }),
  ],
});

if (env.nodeEnv !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, requestId, ...meta }) => {
          const rid = requestId ? ` [${requestId}]` : '';
          const extra = Object.keys(meta).filter((k) => k !== 'service').length
            ? ' ' + JSON.stringify(Object.fromEntries(Object.entries(meta).filter(([k]) => k !== 'service')))
            : '';
          return `${timestamp} ${level}${rid}: ${message}${extra}`;
        })
      ),
    })
  );
}

// Attaches req.id + req.log (child logger) and logs one line per completed request.
function requestLogger(req, res, next) {
  req.id = req.headers['x-request-id'] || randomUUID();
  res.setHeader('X-Request-Id', req.id);
  req.log = logger.child({ requestId: req.id });

  const start = Date.now();
  res.on('finish', () => {
    req.log.info('http_request', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - start,
      user: req.session && req.session.user ? req.session.user.employeeNo : null,
    });
  });
  next();
}

module.exports = { logger, requestLogger };
