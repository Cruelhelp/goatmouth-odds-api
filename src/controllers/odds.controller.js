/**
 * Odds Controller
 *
 * Handles HTTP requests for odds-related endpoints
 */

const bettingService = require('../services/betting.service');
const { ERROR_CODES } = require('../config/constants');

class OddsController {
  /**
   * GET /api/markets/:id/odds
   * Get current odds for a market
   */
  async getMarketOdds(req, res) {
    try {
      const { id } = req.params;

      const result = await bettingService.getMarketOdds(id);

      res.json(result);
    } catch (error) {
      console.error('Error getting market odds:', error);

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
          message: 'Failed to fetch market odds'
        }
      });
    }
  }

  /**
   * POST /api/markets/:id/quote
   * Get a quote for a bet without executing
   */
  async getBetQuote(req, res) {
    try {
      const { id } = req.params;
      const { outcome, amount } = req.body;

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

      const result = await bettingService.getBetQuote({
        marketId: id,
        outcome,
        amount: parseFloat(amount)
      });

      res.json(result);
    } catch (error) {
      console.error('Error getting bet quote:', error);

      if (error.code === ERROR_CODES.MARKET_NOT_FOUND) {
        return res.status(404).json({
          success: false,
          error: {
            code: ERROR_CODES.MARKET_NOT_FOUND,
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

      res.status(500).json({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Failed to generate quote'
        }
      });
    }
  }
}

module.exports = new OddsController();
