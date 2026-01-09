/**
 * Global Error Handler Middleware
 *
 * Catches unhandled errors and returns consistent error responses
 */

const { ERROR_CODES } = require('../config/constants');

/**
 * Global error handler
 * Must be the last middleware added to Express app
 */
function errorHandler(err, req, res, next) {
  console.error('Unhandled error:', err);

  // Determine status code
  let statusCode = err.statusCode || 500;
  let errorCode = err.code || ERROR_CODES.INTERNAL_ERROR;
  let message = err.message || 'Internal server error';

  // Map error codes to HTTP status codes
  if (errorCode === ERROR_CODES.UNAUTHORIZED) {
    statusCode = 401;
  } else if (errorCode === ERROR_CODES.FORBIDDEN) {
    statusCode = 403;
  } else if (errorCode === ERROR_CODES.MARKET_NOT_FOUND) {
    statusCode = 404;
  } else if (
    errorCode === ERROR_CODES.VALIDATION_ERROR ||
    errorCode === ERROR_CODES.INVALID_AMOUNT ||
    errorCode === ERROR_CODES.POOL_NOT_INITIALIZED ||
    errorCode === ERROR_CODES.MARKET_NOT_ACTIVE ||
    errorCode === ERROR_CODES.INSUFFICIENT_BALANCE ||
    errorCode === ERROR_CODES.POOL_EXHAUSTED
  ) {
    statusCode = 400;
  }

  // Send error response
  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message: message,
      ...(process.env.NODE_ENV === 'development' && {
        stack: err.stack
      })
    }
  });
}

/**
 * 404 handler for undefined routes
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`
    }
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};
