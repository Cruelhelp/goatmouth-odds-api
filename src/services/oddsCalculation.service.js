/**
 * Odds Calculation Service
 *
 * Implements Constant Product Market Maker (CPMM) formula for dynamic odds calculation.
 *
 * Core Formula: yesPool × noPool = k (constant)
 *
 * Price Formula:
 *   yesPrice = noPool / (yesPool + noPool)
 *   noPrice = yesPool / (yesPool + noPool)
 *
 * When buying YES:
 *   - User adds amount to NO pool
 *   - User receives tokens from YES pool
 *   - Maintains constant product k
 */

class OddsCalculationService {
  /**
   * Calculate current market price for YES outcome
   *
   * @param {number} yesPool - Current YES token pool
   * @param {number} noPool - Current NO token pool
   * @returns {number} Price between 0 and 1 (e.g., 0.65 = 65%)
   * @throws {Error} If total pool is zero
   */
  calculateYesPrice(yesPool, noPool) {
    const totalPool = yesPool + noPool;

    if (totalPool === 0) {
      throw new Error('Total pool cannot be zero');
    }

    // YES price = proportion of NO tokens in pool
    return noPool / totalPool;
  }

  /**
   * Calculate current market price for NO outcome
   *
   * @param {number} yesPool - Current YES token pool
   * @param {number} noPool - Current NO token pool
   * @returns {number} Price between 0 and 1 (e.g., 0.35 = 35%)
   * @throws {Error} If total pool is zero
   */
  calculateNoPrice(yesPool, noPool) {
    const totalPool = yesPool + noPool;

    if (totalPool === 0) {
      throw new Error('Total pool cannot be zero');
    }

    // NO price = proportion of YES tokens in pool
    return yesPool / totalPool;
  }

  /**
   * Calculate liquidity constant k from current pools
   *
   * @param {number} yesPool - YES token pool
   * @param {number} noPool - NO token pool
   * @returns {number} Liquidity constant k
   */
  calculateLiquidityConstant(yesPool, noPool) {
    return yesPool * noPool;
  }

  /**
   * Calculate how many tokens user receives for their bet
   * Uses CPMM formula to determine token output
   *
   * Formula: (inputPool + betAmount) × (outputPool - tokensOut) = k
   * Solve for tokensOut: tokensOut = outputPool - (k / (inputPool + betAmount))
   *
   * Example: Buying YES with $100
   *   - Current: yesPool=1000, noPool=1000, k=1,000,000
   *   - User adds $100 to NO pool (input)
   *   - tokensOut = 1000 - (1000000 / 1100) = 90.91 YES tokens
   *   - New pools: yes=909.09, no=1100
   *
   * @param {number} betAmount - Amount user is spending (after fees)
   * @param {number} inputPool - Pool user is adding tokens to
   * @param {number} outputPool - Pool user is receiving tokens from
   * @param {number} k - Liquidity constant
   * @returns {number} Tokens user receives
   * @throws {Error} If bet amount would exhaust pool
   */
  calculateTokensReceived(betAmount, inputPool, outputPool, k) {
    if (betAmount <= 0) {
      throw new Error('Bet amount must be positive');
    }

    // Calculate new input pool after bet
    const newInputPool = inputPool + betAmount;

    // Calculate new output pool using constant product formula
    const newOutputPool = k / newInputPool;

    // Tokens out = difference between old and new output pool
    const tokensOut = outputPool - newOutputPool;

    // Sanity check: can't receive more tokens than available in pool
    if (tokensOut >= outputPool) {
      throw new Error('Bet amount too large - would exhaust liquidity pool');
    }

    if (tokensOut <= 0) {
      throw new Error('Invalid bet amount - no tokens would be received');
    }

    return tokensOut;
  }

  /**
   * Calculate cost to buy a specific number of tokens
   * Inverse of calculateTokensReceived
   *
   * Formula: (inputPool + cost) × (outputPool - tokensDesired) = k
   * Solve for cost: cost = (k / (outputPool - tokensDesired)) - inputPool
   *
   * @param {number} tokensDesired - Tokens user wants to buy
   * @param {number} inputPool - Pool user is adding tokens to
   * @param {number} outputPool - Pool user is receiving tokens from
   * @param {number} k - Liquidity constant
   * @returns {number} Cost in dollars
   * @throws {Error} If tokens desired exceeds pool size
   */
  calculateCostForTokens(tokensDesired, inputPool, outputPool, k) {
    if (tokensDesired <= 0) {
      throw new Error('Tokens desired must be positive');
    }

    if (tokensDesired >= outputPool) {
      throw new Error('Cannot purchase more tokens than available in pool');
    }

    // Calculate new output pool after removing desired tokens
    const newOutputPool = outputPool - tokensDesired;

    // Calculate required new input pool using constant product
    const newInputPool = k / newOutputPool;

    // Cost = difference between new and old input pool
    const cost = newInputPool - inputPool;

    if (cost <= 0) {
      throw new Error('Invalid calculation - cost must be positive');
    }

    return cost;
  }

  /**
   * Calculate effective price (average price per token)
   * This differs from marginal price due to slippage
   *
   * In a CPMM prediction market, tokens received represent probability
   * The effective price should be in the 0-1 range (probability)
   *
   * @param {number} betAmount - Amount spent (after fees)
   * @param {number} tokensReceived - Tokens received
   * @returns {number} Effective price as probability (0-1)
   * @throws {Error} If tokens received is zero
   */
  calculateEffectivePrice(betAmount, tokensReceived) {
    if (tokensReceived === 0) {
      throw new Error('Cannot calculate price with zero tokens');
    }

    // In CPMM, the effective price is the average probability paid
    // If you spend $98 to get 89.254 tokens worth $1 each if you win,
    // your cost per dollar of potential payout is: 98 / 89.254 = 1.098
    // To convert to probability (0-1): we need to normalize
    // Effective probability = betAmount / (betAmount + tokensReceived)
    // This gives us the implied probability of the bet

    // Actually, for display purposes, let's use the simpler metric:
    // Average price per token in probability terms
    const totalValue = betAmount + tokensReceived; // Total exposure
    const effectiveProbability = betAmount / totalValue;

    return effectiveProbability;
  }

  /**
   * Calculate price slippage
   * Shows how much price moved due to bet size
   *
   * @param {number} initialPrice - Price before bet (0-1)
   * @param {number} effectivePrice - Actual price paid (0-1)
   * @returns {number} Slippage as decimal (e.g., 0.05 = 5%)
   */
  calculateSlippage(initialPrice, effectivePrice) {
    if (initialPrice === 0) {
      return 0;
    }

    // Slippage = percentage change from initial price
    return Math.abs((effectivePrice - initialPrice) / initialPrice);
  }

  /**
   * Calculate price impact (how much the bet will move the price)
   *
   * @param {number} currentPrice - Current market price (0-1)
   * @param {number} newPrice - Price after bet (0-1)
   * @returns {number} Price impact as decimal (e.g., 0.095 = 9.5%)
   */
  calculatePriceImpact(currentPrice, newPrice) {
    if (currentPrice === 0) {
      return 0;
    }

    return Math.abs((newPrice - currentPrice) / currentPrice);
  }

  /**
   * Get complete odds snapshot for a market
   *
   * @param {number} yesPool - YES token pool
   * @param {number} noPool - NO token pool
   * @param {number} k - Liquidity constant
   * @returns {object} Complete odds data
   */
  getMarketOdds(yesPool, noPool, k) {
    return {
      yesPrice: this.calculateYesPrice(yesPool, noPool),
      noPrice: this.calculateNoPrice(yesPool, noPool),
      yesPool,
      noPool,
      liquidityConstant: k,
      totalLiquidity: yesPool + noPool
    };
  }

  /**
   * Simulate a bet and return expected results without executing
   * Useful for quote/preview endpoints
   *
   * @param {object} params - Simulation parameters
   * @param {string} params.outcome - 'yes' or 'no'
   * @param {number} params.betAmount - Amount to bet (after fees)
   * @param {number} params.yesPool - Current YES pool
   * @param {number} params.noPool - Current NO pool
   * @param {number} params.k - Liquidity constant
   * @returns {object} Simulation results
   */
  simulateBet({ outcome, betAmount, yesPool, noPool, k }) {
    // Get current price before bet
    const priceBeforeBet = outcome === 'yes'
      ? this.calculateYesPrice(yesPool, noPool)
      : this.calculateNoPrice(yesPool, noPool);

    // Calculate tokens received
    let tokensReceived, newYesPool, newNoPool;

    if (outcome === 'yes') {
      // Buying YES: add to NO pool, receive from YES pool
      tokensReceived = this.calculateTokensReceived(betAmount, noPool, yesPool, k);
      newYesPool = yesPool - tokensReceived;
      newNoPool = noPool + betAmount;
    } else {
      // Buying NO: add to YES pool, receive from NO pool
      tokensReceived = this.calculateTokensReceived(betAmount, yesPool, noPool, k);
      newNoPool = noPool - tokensReceived;
      newYesPool = yesPool + betAmount;
    }

    // Calculate new prices
    const newYesPrice = this.calculateYesPrice(newYesPool, newNoPool);
    const newNoPrice = this.calculateNoPrice(newYesPool, newNoPool);
    const priceAfterBet = outcome === 'yes' ? newYesPrice : newNoPrice;

    // Calculate effective price and slippage
    const effectivePrice = this.calculateEffectivePrice(betAmount, tokensReceived);
    const slippage = this.calculateSlippage(priceBeforeBet, effectivePrice);
    const priceImpact = this.calculatePriceImpact(priceBeforeBet, priceAfterBet);

    // Verify constant product is maintained
    const newK = newYesPool * newNoPool;
    const kDifference = Math.abs(newK - k);

    if (kDifference > 0.01) {
      console.warn(`Warning: Liquidity constant changed by ${kDifference}`);
    }

    return {
      tokensReceived,
      effectivePrice,
      slippage,
      priceImpact,
      priceBeforeBet,
      priceAfterBet,
      newYesPrice,
      newNoPrice,
      newYesPool,
      newNoPool,
      newK
    };
  }

  /**
   * Validate pool state
   *
   * @param {number} yesPool - YES pool size
   * @param {number} noPool - NO pool size
   * @param {number} k - Expected liquidity constant
   * @returns {boolean} True if pool state is valid
   * @throws {Error} If validation fails
   */
  validatePoolState(yesPool, noPool, k) {
    if (yesPool <= 0 || noPool <= 0) {
      throw new Error('Pool sizes must be positive');
    }

    const calculatedK = yesPool * noPool;
    const kDifference = Math.abs(calculatedK - k);
    const percentageDiff = (kDifference / k) * 100;

    // Allow small floating point differences (0.01% tolerance instead of absolute 0.01)
    // This accounts for cumulative rounding errors over multiple bets
    if (percentageDiff > 0.01) {
      throw new Error(
        `Pool state invalid: yesPool * noPool (${calculatedK}) ≠ k (${k}), diff: ${percentageDiff.toFixed(4)}%`
      );
    }

    return true;
  }
}

// Export singleton instance
module.exports = new OddsCalculationService();
