const { logger } = require('./logger');
const env = require('../config/env');

class AppError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

const badRequest = (message, details) => new AppError(400, message, details);
const unauthorized = (message = 'Authentication required') => new AppError(401, message);
const forbidden = (message = 'Out of scope') => new AppError(403, message);
const notFound = (message = 'Not found') => new AppError(404, message);
const conflict = (message) => new AppError(409, message);

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Not found', requestId: req.id });
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const statusCode = err.statusCode || 500;
  const log = req.log || logger;

  if (statusCode >= 500) {
    log.error(err.message, { stack: err.stack, path: req.originalUrl });
  } else {
    log.warn(err.message, { path: req.originalUrl, statusCode });
  }

  const body = { error: err.message || 'Internal server error', requestId: req.id };
  if (err.details) body.details = err.details;
  if (statusCode >= 500 && env.nodeEnv !== 'production') body.stack = err.stack;

  res.status(statusCode).json(body);
}

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict, asyncHandler, notFoundHandler, errorHandler };
