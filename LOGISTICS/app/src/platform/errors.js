class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const badRequest = (msg, details) => new HttpError(400, msg, details);
const unauthorized = (msg) => new HttpError(401, msg || 'Not authenticated');
const forbidden = (msg) => new HttpError(403, msg || 'Not permitted');
const notFound = (msg) => new HttpError(404, msg || 'Not found');
const conflict = (msg) => new HttpError(409, msg || 'Conflict');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function errorMiddleware(err, req, res, _next) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Internal error', details: err.details });
}

module.exports = { HttpError, badRequest, unauthorized, forbidden, notFound, conflict, asyncHandler, errorMiddleware };
