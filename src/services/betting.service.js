/**
 * Betting Service
 *
 * Core service that orchestrates the entire bet placement flow.
 * Handles:
 * - Market state validation
 * - User balance checking
 * - House margin application
 * - CPMM odds calculation
 * - Pool updates
 * - Bet recording
 * - Position management
 * - Transaction logging
 * - Price history tracking
 */

const { supabase } = require('../config/database');
const oddsCalculation = require('./oddsCalculation.service');
const houseMargin = require('./houseMargin.service');
const liquidityPool = require('./liquidityPool.service');
const oddsConverter = require('./oddsConverter.service');
const { ERROR_CODES, MARKET_STATUS, BET_STATUS, OUTCOMES } = require('../config/constants');

class BettingService {
  /**
   * Place a bet and update market odds
   * This is the main entry point for bet placement
   *
   * @param {object} params - Bet parameters
   * @param {string} params.marketId - Market UUID
   * @param {string} params.userId - User UUID
   * @param {string} params.outcome - 'yes' or 'no'
   * @param {number} params.betAmount - Gross bet amount
   * @returns {Promise<object>} Bet result with updated prices
   */
  async placeBet({ marketId, userId, outcome, betAmount }) {
    // Validate inputs
    this.validateBetInputs(marketId, userId, outcome, betAmount);

    // 1. Get current market state
    const market = await this.getMarket(marketId);
    this.validateMarketState(market);

    // 2. Get user profile and validate balance
    const profile = await this.getUserProfile(userId);
    this.validateUserBalance(profile, betAmount);

    // 3. Apply house margin (2% fee)
    const { netAmount, houseFee } = houseMargin.applyMargin(betAmount);

    // 4. Get current pools and calculate prices before bet
    const yesPoolBefore = parseFloat(market.yes_pool);
    const noPoolBefore = parseFloat(market.no_pool);
    const k = parseFloat(market.liquidity_constant);

    // Validate pool state
    liquidityPool.validatePoolState(yesPoolBefore, noPoolBefore, k);

    const priceBeforeBet = outcome === OUTCOMES.YES
      ? oddsCalculation.calculateYesPrice(yesPoolBefore, noPoolBefore)
      : oddsCalculation.calculateNoPrice(yesPoolBefore, noPoolBefore);

    // 5. Calculate tokens received using CPMM
    let tokensReceived, yesPoolAfter, noPoolAfter;

    if (outcome === OUTCOMES.YES) {
      // Buying YES: add to NO pool, receive from YES pool
      tokensReceived = oddsCalculation.calculateTokensReceived(
        netAmount,
        noPoolBefore,
        yesPoolBefore,
        k
      );
      yesPoolAfter = yesPoolBefore - tokensReceived;
      noPoolAfter = noPoolBefore + netAmount;
    } else {
      // Buying NO: add to YES pool, receive from NO pool
      tokensReceived = oddsCalculation.calculateTokensReceived(
        netAmount,
        yesPoolBefore,
        noPoolBefore,
        k
      );
      noPoolAfter = noPoolBefore - tokensReceived;
      yesPoolAfter = yesPoolBefore + netAmount;
    }

    // 6. Calculate effective price and slippage
    const effectivePrice = oddsCalculation.calculateEffectivePrice(netAmount, tokensReceived);
    const slippage = oddsCalculation.calculateSlippage(priceBeforeBet, effectivePrice);

    // 7. Calculate new prices
    const newYesPrice = oddsCalculation.calculateYesPrice(yesPoolAfter, noPoolAfter);
    const newNoPrice = oddsCalculation.calculateNoPrice(yesPoolAfter, noPoolAfter);

    // 8. Verify constant product is maintained
    const newK = yesPoolAfter * noPoolAfter;
    if (Math.abs(newK - k) > 0.01) {
      throw new Error('Liquidity constant violated - calculation error');
    }

    // 9. Execute database transaction
    try {
      const result = await this.executeTransaction({
        marketId,
        userId,
        outcome,
        betAmount,
        netAmount,
        houseFee,
        tokensReceived,
        effectivePrice,
        slippage,
        priceBeforeBet,
        yesPoolBefore,
        noPoolBefore,
        yesPoolAfter,
        noPoolAfter,
        newYesPrice,
        newNoPrice,
        market,
        profile
      });

      return result;
    } catch (error) {
      console.error('Bet placement failed:', error);
      throw new Error(`Bet processing failed: ${error.message}`);
    }
  }

  /**
   * Execute the database transaction for bet placement
   * Updates: market, bet, user balance, position, transaction, price_history
   *
   * @private
   */
  async executeTransaction(params) {
    const {
      marketId, userId, outcome, betAmount, netAmount, houseFee,
      tokensReceived, effectivePrice, slippage, priceBeforeBet,
      yesPoolBefore, noPoolBefore, yesPoolAfter, noPoolAfter,
      newYesPrice, newNoPrice, market, profile
    } = params;

    // Update market pools and prices
    const { error: updateError } = await supabase
      .from('markets')
      .update({
        yes_pool: yesPoolAfter,
        no_pool: noPoolAfter,
        yes_price: newYesPrice,
        no_price: newNoPrice,
        total_volume: parseFloat(market.total_volume || 0) + betAmount,
        last_price_update: new Date().toISOString()
      })
      .eq('id', marketId);

    if (updateError) {
      throw updateError;
    }

    // Create bet record
    const { data: bet, error: betError } = await supabase
      .from('bets')
      .insert({
        market_id: marketId,
        user_id: userId,
        outcome,
        amount: betAmount,
        price: priceBeforeBet,
        potential_return: tokensReceived,
        status: BET_STATUS.MATCHED,
        yes_pool_before: yesPoolBefore,
        no_pool_before: noPoolBefore,
        yes_pool_after: yesPoolAfter,
        no_pool_after: noPoolAfter,
        effective_price: effectivePrice,
        slippage,
        house_fee: houseFee
      })
      .select()
      .single();

    if (betError) {
      throw betError;
    }

    // Update user balance
    const newBalance = parseFloat(profile.balance) - betAmount;
    const { error: balanceError } = await supabase
      .from('profiles')
      .update({ balance: newBalance })
      .eq('id', userId);

    if (balanceError) {
      throw balanceError;
    }

    // Update or create position
    await this.updatePosition(
      userId,
      marketId,
      outcome,
      netAmount,
      tokensReceived,
      effectivePrice
    );

    // Log transaction
    await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        type: 'bet',
        amount: betAmount,
        balance_after: newBalance,
        reference_id: bet.id
      });

    // Record price history
    await supabase
      .from('price_history')
      .insert({
        market_id: marketId,
        yes_price: newYesPrice,
        no_price: newNoPrice,
        yes_pool: yesPoolAfter,
        no_pool: noPoolAfter,
        total_volume: parseFloat(market.total_volume || 0) + betAmount,
        bet_id: bet.id
      });

    // Return complete result
    return {
      success: true,
      data: {
        betId: bet.id,
        marketId,
        outcome,
        grossAmount: betAmount,
        netAmount,
        houseFee,
        tokensReceived,
        effectivePrice,
        slippage,
        priceBeforeBet,
        newPrices: {
          yesPrice: newYesPrice,
          noPrice: newNoPrice
        },
        newPools: {
          yesPool: yesPoolAfter,
          noPool: noPoolAfter
        },
        potentialPayout: tokensReceived,
        potentialProfit: tokensReceived - betAmount,
        createdAt: bet.created_at
      }
    };
  }

  /**
   * Update user position for a market
   * Creates new position or updates existing one
   *
   * @private
   */
  async updatePosition(userId, marketId, outcome, amount, shares, avgPrice) {
    const { data: existing } = await supabase
      .from('positions')
      .select('*')
      .eq('user_id', userId)
      .eq('market_id', marketId)
      .eq('outcome', outcome)
      .single();

    if (existing) {
      // Update existing position
      const newShares = parseFloat(existing.shares) + shares;
      const newTotalInvested = parseFloat(existing.total_invested) + amount;
      const newAvgPrice = newTotalInvested / newShares;

      await supabase
        .from('positions')
        .update({
          shares: newShares,
          total_invested: newTotalInvested,
          avg_price: newAvgPrice,
          current_value: newShares * avgPrice
        })
        .eq('id', existing.id);
    } else {
      // Create new position
      await supabase
        .from('positions')
        .insert({
          user_id: userId,
          market_id: marketId,
          outcome,
          shares,
          avg_price: avgPrice,
          total_invested: amount,
          current_value: amount
        });
    }
  }

  /**
   * Get current odds for a market
   *
   * @param {string} marketId - Market UUID
   * @returns {Promise<object>} Current odds with margin applied
   */
  async getMarketOdds(marketId) {
    const market = await this.getMarket(marketId);

    if (!market.pool_initialized) {
      throw new Error(ERROR_CODES.POOL_NOT_INITIALIZED);
    }

    const yesPool = parseFloat(market.yes_pool);
    const noPool = parseFloat(market.no_pool);
    const k = parseFloat(market.liquidity_constant);

    // Get base prices from CPMM
    const baseOdds = oddsCalculation.getMarketOdds(yesPool, noPool, k);

    // Apply house margin to prices
    const yesPrices = houseMargin.applyMarginToPrices(baseOdds.yesPrice);
    const noPrices = houseMargin.applyMarginToPrices(baseOdds.noPrice);

    return {
      success: true,
      data: {
        marketId,
        yesPrice: baseOdds.yesPrice,
        noPrice: baseOdds.noPrice,
        yesPool,
        noPool,
        liquidityConstant: k,
        totalLiquidity: baseOdds.totalLiquidity,
        pricesWithMargin: {
          yes: yesPrices,
          no: noPrices
        },
        lastUpdate: market.last_price_update
      }
    };
  }

  /**
   * Get a quote for a bet without executing it
   *
   * @param {object} params - Quote parameters
   * @param {string} params.marketId - Market UUID
   * @param {string} params.outcome - 'yes' or 'no'
   * @param {number} params.amount - Bet amount
   * @returns {Promise<object>} Estimated bet results
   */
  async getBetQuote({ marketId, outcome, amount }) {
    const market = await this.getMarket(marketId);
    this.validateMarketState(market);

    // Apply house margin
    const { netAmount, houseFee } = houseMargin.applyMargin(amount);

    // Get current pools
    const yesPool = parseFloat(market.yes_pool);
    const noPool = parseFloat(market.no_pool);
    const k = parseFloat(market.liquidity_constant);

    // Simulate the bet
    const simulation = oddsCalculation.simulateBet({
      outcome,
      betAmount: netAmount,
      yesPool,
      noPool,
      k
    });

    // Determine warning level based on slippage
    let warning = null;
    if (simulation.slippage > 0.10) {
      warning = 'Critical slippage detected. Consider reducing bet size significantly.';
    } else if (simulation.slippage > 0.05) {
      warning = 'High slippage detected. Consider reducing bet size.';
    }

    return {
      success: true,
      data: {
        outcome,
        grossAmount: amount,
        netAmount,
        houseFee,
        estimatedTokens: simulation.tokensReceived,
        estimatedEffectivePrice: simulation.effectivePrice,
        estimatedSlippage: simulation.slippage,
        currentPrice: simulation.priceBeforeBet,
        priceImpact: simulation.priceImpact,
        newEstimatedPrice: outcome === OUTCOMES.YES ? simulation.newYesPrice : simulation.newNoPrice,
        warning
      }
    };
  }

  /**
   * Get market by ID
   * @private
   */
  async getMarket(marketId) {
    const { data: market, error } = await supabase
      .from('markets')
      .select('*')
      .eq('id', marketId)
      .single();

    if (error || !market) {
      const err = new Error('Market not found');
      err.code = ERROR_CODES.MARKET_NOT_FOUND;
      throw err;
    }

    return market;
  }

  /**
   * Get user profile by ID
   * @private
   */
  async getUserProfile(userId) {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      throw new Error('User profile not found');
    }

    return profile;
  }

  /**
   * Validate bet inputs
   * @private
   */
  validateBetInputs(marketId, userId, outcome, betAmount) {
    if (!marketId || !userId) {
      const err = new Error('Market ID and User ID are required');
      err.code = ERROR_CODES.VALIDATION_ERROR;
      throw err;
    }

    if (![OUTCOMES.YES, OUTCOMES.NO].includes(outcome)) {
      const err = new Error('Outcome must be "yes" or "no"');
      err.code = ERROR_CODES.VALIDATION_ERROR;
      throw err;
    }

    if (!betAmount || betAmount <= 0) {
      const err = new Error('Bet amount must be positive');
      err.code = ERROR_CODES.INVALID_AMOUNT;
      throw err;
    }
  }

  /**
   * Validate market state
   * @private
   */
  validateMarketState(market) {
    if (!market.pool_initialized) {
      const err = new Error('Market pool not initialized');
      err.code = ERROR_CODES.POOL_NOT_INITIALIZED;
      throw err;
    }

    if (market.status !== MARKET_STATUS.ACTIVE) {
      const err = new Error('Market is not active');
      err.code = ERROR_CODES.MARKET_NOT_ACTIVE;
      throw err;
    }
  }

  /**
   * Validate user balance
   * @private
   */
  validateUserBalance(profile, betAmount) {
    if (parseFloat(profile.balance) < betAmount) {
      const err = new Error(
        `Insufficient balance: ${profile.balance} < ${betAmount}`
      );
      err.code = ERROR_CODES.INSUFFICIENT_BALANCE;
      throw err;
    }
  }

  /**
   * =================================================================
   * ODDS-BASED BETTING (Sports Betting Style)
   * =================================================================
   *
   * Place bet with traditional sports betting odds multipliers
   * Instead of shares/tokens, users see familiar odds like 1.85x, 10.5x
   * Always shows profit instead of confusing negative returns
   */

  /**
   * Get current odds for a market (sports betting style)
   *
   * @param {string} marketId - Market UUID
   * @returns {Promise<object>} Current odds as multipliers
   */
  async getMarketOddsMultiplier(marketId) {
    const market = await this.getMarket(marketId);

    if (!market.pool_initialized) {
      throw new Error(ERROR_CODES.POOL_NOT_INITIALIZED);
    }

    const yesPool = parseFloat(market.yes_pool);
    const noPool = parseFloat(market.no_pool);

    // Get probabilities from CPMM
    const yesProbability = oddsCalculation.calculateYesPrice(yesPool, noPool);
    const noProbability = oddsCalculation.calculateNoPrice(yesPool, noPool);

    // Convert to odds multipliers
    const yesOdds = oddsConverter.probabilityToOdds(yesProbability);
    const noOdds = oddsConverter.probabilityToOdds(noProbability);

    // Apply house margin (makes odds slightly less favorable)
    const yesOddsWithMargin = oddsConverter.applyMarginToOdds(yesOdds, houseMargin.HOUSE_MARGIN);
    const noOddsWithMargin = oddsConverter.applyMarginToOdds(noOdds, houseMargin.HOUSE_MARGIN);

    return {
      success: true,
      data: {
        marketId,
        yesOdds: yesOddsWithMargin,
        noOdds: noOddsWithMargin,
        yesOddsFormatted: oddsConverter.formatOdds(yesOddsWithMargin),
        noOddsFormatted: oddsConverter.formatOdds(noOddsWithMargin),
        yesProbability,
        noProbability,
        yesCategory: oddsConverter.getOddsCategory(yesOddsWithMargin),
        noCategory: oddsConverter.getOddsCategory(noOddsWithMargin),
        pools: {
          yesPool,
          noPool
        },
        lastUpdate: market.last_price_update
      }
    };
  }

  /**
   * Get bet quote with odds multiplier (sports betting style)
   *
   * @param {object} params
   * @param {string} params.marketId - Market UUID
   * @param {string} params.outcome - 'yes' or 'no'
   * @param {number} params.amount - Bet amount
   * @returns {Promise<object>} Quote with odds and payout
   */
  async getBetQuoteWithOdds({ marketId, outcome, amount }) {
    const market = await this.getMarket(marketId);
    this.validateMarketState(market);

    // Get current pools
    const yesPool = parseFloat(market.yes_pool);
    const noPool = parseFloat(market.no_pool);
    const k = parseFloat(market.liquidity_constant);

    // Get current probability (before bet)
    const currentProbability = outcome === OUTCOMES.YES
      ? oddsCalculation.calculateYesPrice(yesPool, noPool)
      : oddsCalculation.calculateNoPrice(yesPool, noPool);

    // Convert to odds
    let currentOdds = oddsConverter.probabilityToOdds(currentProbability);

    // Apply house margin
    const { netAmount, houseFee } = houseMargin.applyMargin(amount);
    currentOdds = oddsConverter.applyMarginToOdds(currentOdds, houseMargin.HOUSE_MARGIN);

    // Calculate payout
    const payout = oddsConverter.calculatePayout(netAmount, currentOdds);

    // Simulate bet to see new odds
    const simulation = oddsCalculation.simulateBet({
      outcome,
      betAmount: netAmount,
      yesPool,
      noPool,
      k
    });

    const newProbability = outcome === OUTCOMES.YES ? simulation.newYesPrice : simulation.newNoPrice;
    let newOdds = oddsConverter.probabilityToOdds(newProbability);
    newOdds = oddsConverter.applyMarginToOdds(newOdds, houseMargin.HOUSE_MARGIN);

    // Determine warning level
    const oddsChange = ((currentOdds - newOdds) / currentOdds) * 100;
    let warning = null;

    if (oddsChange > 20) {
      warning = `Critical odds movement: Odds will drop ${oddsChange.toFixed(1)}% after your bet. Consider reducing bet size.`;
    } else if (oddsChange > 10) {
      warning = `High odds movement: Odds will drop ${oddsChange.toFixed(1)}% after your bet.`;
    }

    return {
      success: true,
      data: {
        outcome,
        stake: amount,
        stakeAfterFee: netAmount,
        houseFee,
        currentOdds,
        currentOddsFormatted: oddsConverter.formatOdds(currentOdds),
        potentialPayout: payout.payout,
        potentialProfit: payout.profit,
        roi: payout.roi,
        oddsAfterBet: newOdds,
        oddsChange: oddsChange.toFixed(2) + '%',
        category: oddsConverter.getOddsCategory(currentOdds),
        warning
      }
    };
  }

  /**
   * Place bet with odds multiplier (sports betting style)
   *
   * This uses the same CPMM backend but presents results as traditional betting
   *
   * @param {object} params
   * @param {string} params.marketId - Market UUID
   * @param {string} params.userId - User UUID
   * @param {string} params.outcome - 'yes' or 'no'
   * @param {number} params.betAmount - Amount to bet
   * @returns {Promise<object>} Bet result with odds and payout
   */
  async placeBetWithOdds({ marketId, userId, outcome, betAmount }) {
    // Validate inputs
    this.validateBetInputs(marketId, userId, outcome, betAmount);

    // 1. Get market and validate
    const market = await this.getMarket(marketId);
    this.validateMarketState(market);

    // 2. Get user profile and validate balance
    const profile = await this.getUserProfile(userId);
    this.validateUserBalance(profile, betAmount);

    // 3. Get current pools
    const yesPoolBefore = parseFloat(market.yes_pool);
    const noPoolBefore = parseFloat(market.no_pool);
    const k = parseFloat(market.liquidity_constant);

    // 4. Calculate current probability and odds
    const currentProbability = outcome === OUTCOMES.YES
      ? oddsCalculation.calculateYesPrice(yesPoolBefore, noPoolBefore)
      : oddsCalculation.calculateNoPrice(yesPoolBefore, noPoolBefore);

    let oddsAtBet = oddsConverter.probabilityToOdds(currentProbability);

    // 5. Apply house margin
    const { netAmount, houseFee } = houseMargin.applyMargin(betAmount);
    oddsAtBet = oddsConverter.applyMarginToOdds(oddsAtBet, houseMargin.HOUSE_MARGIN);

    // 6. Calculate payout
    const { payout, profit } = oddsConverter.calculatePayout(netAmount, oddsAtBet);

    // 7. Use CPMM to update pools (for dynamic odds)
    let tokensReceived, yesPoolAfter, noPoolAfter;

    if (outcome === OUTCOMES.YES) {
      tokensReceived = oddsCalculation.calculateTokensReceived(netAmount, noPoolBefore, yesPoolBefore, k);
      yesPoolAfter = yesPoolBefore - tokensReceived;
      noPoolAfter = noPoolBefore + netAmount;
    } else {
      tokensReceived = oddsCalculation.calculateTokensReceived(netAmount, yesPoolBefore, noPoolBefore, k);
      noPoolAfter = noPoolBefore - tokensReceived;
      yesPoolAfter = yesPoolBefore + netAmount;
    }

    // 8. Calculate new prices/odds
    const newYesPrice = oddsCalculation.calculateYesPrice(yesPoolAfter, noPoolAfter);
    const newNoPrice = oddsCalculation.calculateNoPrice(yesPoolAfter, noPoolAfter);

    const newYesOdds = oddsConverter.probabilityToOdds(newYesPrice);
    const newNoOdds = oddsConverter.probabilityToOdds(newNoPrice);

    // 9. Execute database transaction
    try {
      // Update market
      await supabase
        .from('markets')
        .update({
          yes_pool: yesPoolAfter,
          no_pool: noPoolAfter,
          yes_price: newYesPrice,
          no_price: newNoPrice,
          total_volume: parseFloat(market.total_volume || 0) + betAmount,
          last_price_update: new Date().toISOString()
        })
        .eq('id', marketId);

      // Create bet record
      const { data: bet } = await supabase
        .from('bets')
        .insert({
          market_id: marketId,
          user_id: userId,
          outcome,
          amount: betAmount,
          price: currentProbability,
          potential_return: payout, // Store payout instead of tokens
          status: BET_STATUS.MATCHED,
          yes_pool_before: yesPoolBefore,
          no_pool_before: noPoolBefore,
          yes_pool_after: yesPoolAfter,
          no_pool_after: noPoolAfter,
          effective_price: oddsAtBet, // Store odds multiplier
          slippage: 0, // Not applicable for odds-based
          house_fee: houseFee
        })
        .select()
        .single();

      // Update user balance
      const newBalance = parseFloat(profile.balance) - betAmount;
      await supabase
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', userId);

      // Update position (using payout as "shares")
      await this.updatePosition(userId, marketId, outcome, netAmount, payout, oddsAtBet);

      // Log transaction
      await supabase
        .from('transactions')
        .insert({
          user_id: userId,
          type: 'bet',
          amount: betAmount,
          balance_after: newBalance,
          reference_id: bet.id
        });

      // Record price history
      await supabase
        .from('price_history')
        .insert({
          market_id: marketId,
          yes_price: newYesPrice,
          no_price: newNoPrice,
          yes_pool: yesPoolAfter,
          no_pool: noPoolAfter,
          total_volume: parseFloat(market.total_volume || 0) + betAmount,
          bet_id: bet.id
        });

      // Return odds-based result
      return {
        success: true,
        data: {
          betId: bet.id,
          marketId,
          outcome,
          stake: betAmount,
          stakeAfterFee: netAmount,
          houseFee,
          oddsAtBet,
          oddsFormatted: oddsConverter.formatOdds(oddsAtBet),
          potentialPayout: payout,
          potentialProfit: profit,
          newOdds: {
            yesOdds: newYesOdds,
            noOdds: newNoOdds,
            yesOddsFormatted: oddsConverter.formatOdds(newYesOdds),
            noOddsFormatted: oddsConverter.formatOdds(newNoOdds)
          },
          category: oddsConverter.getOddsCategory(oddsAtBet),
          createdAt: bet.created_at
        }
      };
    } catch (error) {
      console.error('Odds-based bet placement failed:', error);
      throw new Error(`Bet processing failed: ${error.message}`);
    }
  }
}

// Export singleton instance
module.exports = new BettingService();
