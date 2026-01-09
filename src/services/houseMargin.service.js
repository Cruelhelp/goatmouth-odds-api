/**
 * House Margin Service
 *
 * Handles application of house margin (fee) to betting transactions.
 * Default margin is 2% which provides platform revenue while staying competitive.
 *
 * The 2% fee is deducted from the bet amount before calculating tokens received,
 * ensuring the house always collects its margin regardless of bet outcome.
 */

class HouseMarginService {
  constructor() {
    // Load house margin from environment variable, default to 2%
    this.HOUSE_MARGIN = parseFloat(process.env.HOUSE_MARGIN) || 0.02;

    // Minimum margin (0.1%) and maximum margin (10%) for safety
    this.MIN_MARGIN = 0.001;
    this.MAX_MARGIN = 0.10;

    // Validate margin is within acceptable range
    if (this.HOUSE_MARGIN < this.MIN_MARGIN || this.HOUSE_MARGIN > this.MAX_MARGIN) {
      console.warn(
        `HOUSE_MARGIN ${this.HOUSE_MARGIN} out of range [${this.MIN_MARGIN}, ${this.MAX_MARGIN}]. ` +
        `Using default 0.02 (2%)`
      );
      this.HOUSE_MARGIN = 0.02;
    }

    console.log(`House margin initialized at ${(this.HOUSE_MARGIN * 100).toFixed(2)}%`);
  }

  /**
   * Apply house margin to bet amount
   * Deducts the fee and returns net amount for trading
   *
   * Example with 2% margin and $100 bet:
   *   grossAmount: $100
   *   houseFee: $2 (2%)
   *   netAmount: $98 (used for calculating tokens)
   *
   * @param {number} betAmount - Gross bet amount
   * @returns {object} { grossAmount, netAmount, houseFee, feePercentage }
   * @throws {Error} If bet amount is invalid
   */
  applyMargin(betAmount) {
    if (betAmount <= 0) {
      throw new Error('Bet amount must be positive');
    }

    // Calculate fee amount
    const houseFee = betAmount * this.HOUSE_MARGIN;

    // Net amount after fee deduction
    const netAmount = betAmount - houseFee;

    return {
      grossAmount: betAmount,
      netAmount,
      houseFee,
      feePercentage: this.HOUSE_MARGIN
    };
  }

  /**
   * Calculate display prices with margin included
   * Splits the margin between buy and sell prices to create a spread
   *
   * Example with 2% margin and base price 0.50:
   *   basePrice: 0.50 (50%)
   *   buyPrice: 0.505 (50.5%) - 1% higher
   *   sellPrice: 0.495 (49.5%) - 1% lower
   *   spread: 0.01 (1%)
   *
   * @param {number} basePrice - Pure CPMM price (0-1)
   * @returns {object} { basePrice, buyPrice, sellPrice, spread }
   * @throws {Error} If base price is out of range
   */
  applyMarginToPrices(basePrice) {
    if (basePrice < 0 || basePrice > 1) {
      throw new Error('Base price must be between 0 and 1');
    }

    // Split the margin evenly between buy and sell
    const halfMargin = this.HOUSE_MARGIN / 2;

    // Buy price is slightly higher (user pays more)
    const buyPrice = Math.min(1, basePrice * (1 + halfMargin));

    // Sell price is slightly lower (user receives less)
    const sellPrice = Math.max(0, basePrice * (1 - halfMargin));

    // Total spread is the full margin
    const spread = basePrice * this.HOUSE_MARGIN;

    return {
      basePrice,
      buyPrice,
      sellPrice,
      spread,
      spreadPercentage: this.HOUSE_MARGIN
    };
  }

  /**
   * Calculate house revenue for a given volume
   * Useful for analytics and reporting
   *
   * @param {number} totalVolume - Total bet volume
   * @returns {number} Expected house revenue
   */
  calculateHouseRevenue(totalVolume) {
    if (totalVolume < 0) {
      throw new Error('Total volume cannot be negative');
    }

    return totalVolume * this.HOUSE_MARGIN;
  }

  /**
   * Calculate required volume to reach revenue target
   *
   * @param {number} targetRevenue - Desired revenue amount
   * @returns {number} Required betting volume
   */
  calculateRequiredVolume(targetRevenue) {
    if (targetRevenue < 0) {
      throw new Error('Target revenue cannot be negative');
    }

    return targetRevenue / this.HOUSE_MARGIN;
  }

  /**
   * Get current margin settings
   *
   * @returns {object} Margin configuration
   */
  getMarginSettings() {
    return {
      marginPercentage: this.HOUSE_MARGIN,
      marginBasisPoints: Math.round(this.HOUSE_MARGIN * 10000),
      displayPercentage: `${(this.HOUSE_MARGIN * 100).toFixed(2)}%`,
      minMargin: this.MIN_MARGIN,
      maxMargin: this.MAX_MARGIN
    };
  }

  /**
   * Calculate effective margin for a specific bet
   * Accounts for slippage which can increase effective cost
   *
   * @param {number} betAmount - Amount bet
   * @param {number} tokensReceived - Tokens received
   * @param {number} basePrice - Market price before bet
   * @returns {object} Effective margin analysis
   */
  calculateEffectiveMargin(betAmount, tokensReceived, basePrice) {
    // House fee (explicit margin)
    const houseFee = betAmount * this.HOUSE_MARGIN;

    // Effective price paid per token
    const effectivePrice = betAmount / tokensReceived;

    // Slippage (price movement due to bet size)
    const slippage = effectivePrice - basePrice;

    // Total cost to user (fee + slippage)
    const totalCost = houseFee + (slippage * tokensReceived);

    // Effective margin including slippage
    const effectiveMargin = totalCost / betAmount;

    return {
      explicitFee: houseFee,
      explicitMargin: this.HOUSE_MARGIN,
      slippageCost: slippage * tokensReceived,
      totalCost,
      effectiveMargin,
      effectiveMarginPercentage: `${(effectiveMargin * 100).toFixed(2)}%`
    };
  }

  /**
   * Calculate break-even price for a bet
   * The price at which user neither profits nor loses
   *
   * @param {number} betAmount - Amount bet
   * @param {number} tokensReceived - Tokens received
   * @returns {number} Break-even price (0-1)
   */
  calculateBreakEvenPrice(betAmount, tokensReceived) {
    if (tokensReceived === 0) {
      throw new Error('Cannot calculate break-even with zero tokens');
    }

    // User needs to receive back their original bet amount
    // Break-even price = amount invested / shares received
    return betAmount / tokensReceived;
  }

  /**
   * Validate margin calculation
   * Ensures fee amounts are reasonable
   *
   * @param {number} betAmount - Bet amount
   * @param {number} houseFee - Calculated fee
   * @returns {boolean} True if valid
   * @throws {Error} If validation fails
   */
  validateMargin(betAmount, houseFee) {
    const expectedFee = betAmount * this.HOUSE_MARGIN;
    const difference = Math.abs(houseFee - expectedFee);

    // Allow tiny floating point differences (0.01 tolerance)
    if (difference > 0.01) {
      throw new Error(
        `Invalid house fee: expected ${expectedFee.toFixed(2)}, got ${houseFee.toFixed(2)}`
      );
    }

    // Fee should never be negative or exceed bet amount
    if (houseFee < 0 || houseFee >= betAmount) {
      throw new Error('House fee out of acceptable range');
    }

    return true;
  }
}

// Export singleton instance
module.exports = new HouseMarginService();
