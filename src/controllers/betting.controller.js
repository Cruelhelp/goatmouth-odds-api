/**
 * Betting Controller
 *
 * Handles HTTP requests for betting operations
 */

const bettingService = require('../services/betting.service');
const { ERROR_CODES } = require('../config/constants');

class BettingController {
  /**
   * POST /api/markets/:id/bet
   * Place a bet on a market
   * Requires authentication
   */
  async placeBet(req, res) {
    try {
      const { id } = req.params;
      const { outcome, amount } = req.body;
      const userId = req.user.id; // Set by auth middleware

      // Validate input
      if (!outcome || !amount) {
        return res.status(400).json({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Outcome and amount are required'
          }
        });
      }

      const result = await bettingService.placeBet({
        marketId: id,
        userId,
        outcome,
        betAmount: parseFloat(amount)
      });

      res.json(result);
    } catch (error) {
      console.error('Error placing bet:', error);

      // Handle specific error codes
      if (error.code === ERROR_CODES.MARKET_NOT_FOUND) {
        return res.status(404).json({
          success: false,
          error: {
            code: ERROR_CODES.MARKET_NOT_FOUND,
            message: error.message
          }
        });
      }

      if (error.code === ERROR_CODES.POOL_NOT_INITIALIZED) {
        return res.status(400).json({
          success: false,
          error: {
            code: ERROR_CODES.POOL_NOT_INITIALIZED,
            message: error.message
          }
        });
      }

      if (error.code === ERROR_CODES.MARKET_NOT_ACTIVE) {
        return res.status(400).json({
          success: false,
          error: {
            code: ERROR_CODES.MARKET_NOT_ACTIVE,
            message: error.message
          }
        });
      }

      if (error.code === ERROR_CODES.INSUFFICIENT_BALANCE) {
        return res.status(400).json({
          success: false,
          error: {
            code: ERROR_CODES.INSUFFICIENT_BALANCE,
            message: error.message
          }
        });
      }

      if (error.code === ERROR_CODES.VALIDATION_ERROR) {
        return res.status(400).json({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: error.message
          }
        });
      }

      if (error.code === ERROR_CODES.INVALID_AMOUNT) {
        return res.status(400).json({
          success: false,
          error: {
            code: ERROR_CODES.INVALID_AMOUNT,
            message: error.message
          }
        });
      }

      // Generic error
      res.status(500).json({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Failed to place bet: ' + error.message
        }
      });
    }
  }
}

module.exports = new BettingController();
