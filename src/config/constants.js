/**
 * Application Constants
 */

require('dotenv').config();

module.exports = {
  // Server configuration
  PORT: process.env.PORT || 3001,
  NODE_ENV: process.env.NODE_ENV || 'development',

  // CORS configuration
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:8000',

  // AMM configuration
  HOUSE_MARGIN: parseFloat(process.env.HOUSE_MARGIN) || 0.02,
  DEFAULT_POOL_SIZE: parseFloat(process.env.DEFAULT_POOL_SIZE) || 1000,

  // Slippage warning thresholds
  SLIPPAGE_WARNING_THRESHOLD: 0.05, // 5%
  SLIPPAGE_CRITICAL_THRESHOLD: 0.10, // 10%

  // Pool utilization limits
  MAX_POOL_UTILIZATION: 0.95, // 95%

  // Bet amount limits
  MIN_BET_AMOUNT: 1.00,
  MAX_BET_AMOUNT: 10000.00,

  // Error codes
  ERROR_CODES: {
    MARKET_NOT_FOUND: 'MARKET_NOT_FOUND',
    POOL_NOT_INITIALIZED: 'POOL_NOT_INITIALIZED',
    MARKET_NOT_ACTIVE: 'MARKET_NOT_ACTIVE',
    INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
    INVALID_AMOUNT: 'INVALID_AMOUNT',
    POOL_EXHAUSTED: 'POOL_EXHAUSTED',
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    INTERNAL_ERROR: 'INTERNAL_ERROR'
  },

  // Market statuses
  MARKET_STATUS: {
    ACTIVE: 'active',
    CLOSED: 'closed',
    RESOLVED: 'resolved',
    CANCELLED: 'cancelled'
  },

  // Bet statuses
  BET_STATUS: {
    PENDING: 'pending',
    MATCHED: 'matched',
    CANCELLED: 'cancelled',
    SETTLED: 'settled'
  },

  // Outcomes
  OUTCOMES: {
    YES: 'yes',
    NO: 'no'
  }
};
