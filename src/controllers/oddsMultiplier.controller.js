/**
 * Odds Multiplier Controller
 *
 * Handles odds-based betting requests (sports betting style)
 */

const bettingService = require('../services/betting.service');
const { ERROR_CODES } = require('../config/constants');

class OddsMultiplierController {
  /**
   * GET /api/markets/:id/odds-multiplier
   * Get current odds as multipliers (1.85x, 10.5x, etc.)
   */
  async getMarketOddsMultiplier(req, res) {
    try {
      const { id } = req.params;

      const result = await bettingService.getMarketOddsMultiplier(id);

      res.json(result);
    } catch (error) {
      console.error('Error getting odds multiplier:', error);

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

      res.status(500).json({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Failed to fetch odds multiplier'
        }
      });
    }
  }

  /**
   * POST /api/markets/:id/quote-odds
   * Get bet quote with odds multiplier
   */
  async getBetQuoteWithOdds(req, res) {
    try {
      const { id } = req.params;
      const { outcome, amount } = req.body;

      if (!outcome || !amount) {
        return res.status(400).json({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Outcome and amount are required'
          }
        });
      }

      const result = await bettingService.getBetQuoteWithOdds({
        marketId: id,
        outcome,
        amount: parseFloat(amount)
      });

      res.json(result);
    } catch (error) {
      console.error('Error getting odds quote:', error);

      if (error.code) {
        const statusCode = error.code === ERROR_CODES.MARKET_NOT_FOUND ? 404 : 400;
        return res.status(statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message
          }
        });
      }

      res.status(500).json({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Failed to generate odds quote'
        }
      });
    }
  }

  /**
   * POST /api/markets/:id/bet-odds
   * Place bet with odds multiplier
   * Requires authentication
   */
  async placeBetWithOdds(req, res) {
    try {
      const { id } = req.params;
      const { outcome, amount } = req.body;
      const userId = req.user.id;

      if (!outcome || !amount) {
        return res.status(400).json({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Outcome and amount are required'
          }
        });
      }

      const result = await bettingService.placeBetWithOdds({
        marketId: id,
        userId,
        outcome,
        betAmount: parseFloat(amount)
      });

      res.json(result);
    } catch (error) {
      console.error('Error placing odds bet:', error);

      // Handle specific error codes
      const errorMap = {
        [ERROR_CODES.MARKET_NOT_FOUND]: 404,
        [ERROR_CODES.POOL_NOT_INITIALIZED]: 400,
        [ERROR_CODES.MARKET_NOT_ACTIVE]: 400,
        [ERROR_CODES.INSUFFICIENT_BALANCE]: 400,
        [ERROR_CODES.VALIDATION_ERROR]: 400,
        [ERROR_CODES.INVALID_AMOUNT]: 400
      };

      if (error.code && errorMap[error.code]) {
        return res.status(errorMap[error.code]).json({
          success: false,
          error: {
            code: error.code,
            message: error.message
          }
        });
      }

      res.status(500).json({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Failed to place odds bet: ' + error.message
        }
      });
    }
  }
}

module.exports = new OddsMultiplierController();
