/**
 * Exact payment scheme builder for x402 protocol (Amazon Demo Proxy)
 *
 * This module provides the "source of truth" for constructing exact payment
 * accepts arrays that guarantee scheme: "exact" only, removing any fallback
 * to legacy schemes like x-solana-settlement.
 */

/**
 * Payment configuration loaded from environment (server-side only)
 */
function getExactPaymentConfig() {
  const exactConfig = {
    scheme: 'exact',
    asset: process.env.EXACT_ASSET || 'USDC',
    chain: process.env.EXACT_CHAIN || 'solana',
    recipient: process.env.EXACT_RECIPIENT,
    facilitatorUrl: process.env.FACILITATOR_URL
  }

  // Fail fast if critical config is missing
  if (!exactConfig.recipient) {
    throw new Error('EXACT_RECIPIENT environment variable is required for exact payment scheme')
  }

  if (!exactConfig.facilitatorUrl) {
    throw new Error('FACILITATOR_URL environment variable is required for exact payment scheme')
  }

  return exactConfig
}

/**
 * Build exact accepts array with scheme: "exact" only
 *
 * @param {Object} inputConfig - Payment configuration
 * @param {string|number} inputConfig.amount - Payment amount (required)
 * @param {string} [inputConfig.asset] - Payment asset (defaults to USDC)
 * @param {string} [inputConfig.chain] - Payment chain (defaults to solana)
 * @param {string} [inputConfig.recipient] - Payment recipient (defaults to config)
 * @param {string} [inputConfig.reference] - Optional payment reference/memo
 * @param {string} [inputConfig.paymentId] - Optional payment ID
 * @param {Object} [input] - Additional input parameters
 * @param {string} [input.paymentId] - Payment ID
 * @param {string} [input.message] - Payment message
 * @returns {Object} Structured accepts response with exact scheme only
 */
function buildExactAccepts(inputConfig, input = {}) {
  const paymentConfig = getExactPaymentConfig()

  // Validate required fields
  if (!inputConfig.amount) {
    throw new Error('Amount is required for exact payment accepts')
  }

  // Normalize amount to string with proper decimal formatting
  const amount = typeof inputConfig.amount === 'number'
    ? inputConfig.amount.toFixed(2)
    : String(inputConfig.amount)

  // Validate amount is a valid number
  const numericAmount = parseFloat(amount)
  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new Error(`Invalid amount for exact payment: ${amount}`)
  }

  // Build exact accepts entry
  const exactEntry = {
    scheme: 'exact',
    amount,
    asset: inputConfig.asset || paymentConfig.asset,
    chain: inputConfig.chain || paymentConfig.chain,
    recipient: inputConfig.recipient || paymentConfig.recipient
  }

  // Add optional reference if provided
  if (inputConfig.reference) {
    exactEntry.reference = inputConfig.reference
  }

  const response = {
    x402Version: 1,
    accepts: [exactEntry]
  }

  // Add optional fields to response
  if (input.paymentId || inputConfig.paymentId) {
    response.paymentId = input.paymentId || inputConfig.paymentId
  }

  if (input.message) {
    response.message = input.message
  }

  return response
}

/**
 * Validate that an accepts array contains only exact scheme entries
 *
 * @param {Array} accepts - Accepts array to validate
 * @throws {Error} If any non-exact schemes are found
 */
function validateExactAccepts(accepts) {
  if (!Array.isArray(accepts) || accepts.length === 0) {
    throw new Error('Accepts array must be non-empty for exact scheme validation')
  }

  for (const entry of accepts) {
    if (!entry || typeof entry !== 'object') {
      throw new Error('Invalid accepts entry: must be an object')
    }

    if (entry.scheme !== 'exact') {
      throw new Error(`Invalid scheme in accepts: expected "exact", got "${entry.scheme}"`)
    }

    // Validate required fields for exact scheme
    const requiredFields = ['amount', 'asset', 'chain', 'recipient']
    for (const field of requiredFields) {
      if (!entry[field]) {
        throw new Error(`Missing required field "${field}" in exact accepts entry`)
      }
    }
  }
}

/**
 * Create exact payment response for 402 challenges
 * Replaces the legacy paymentRequiredResponse pattern
 *
 * @param {Object} config - Payment configuration
 * @param {string|number} config.amount - Payment amount
 * @param {string} config.paymentId - Payment ID
 * @param {Object} [config.product] - Product information
 * @param {string} [config.reference] - Payment reference/memo
 * @returns {Object} Complete 402 response with exact accepts
 */
function createExactPaymentResponse(config) {
  const { amount, paymentId, product, reference } = config

  // Build exact accepts
  const exactResponse = buildExactAccepts(
    {
      amount,
      reference: reference || paymentId
    },
    {
      paymentId,
      message: product
        ? `Payment of $${amount} USDC required for ${product.title}`
        : `Payment of $${amount} USDC required`
    }
  )

  // Add legacy fields for compatibility
  const response = {
    ...exactResponse,
    error: 'Payment Required',
    amount: parseFloat(amount),
    currency: 'USDC'
  }

  // Add product information if provided
  if (product) {
    response.product = product
  }

  return response
}

/**
 * Get exact scheme headers for x402 responses
 * Replaces legacy x-solana-settlement headers
 *
 * @param {Object} config - Payment configuration
 * @param {string|number} config.amount - Payment amount
 * @param {string} config.paymentId - Payment ID
 * @returns {Object} Headers object with exact scheme
 */
function getExactHeaders(config) {
  const { amount, paymentId } = config

  return {
    'Accept': 'exact',
    'X-Payment-Amount': String(amount),
    'X-Payment-Currency': 'USDC',
    'X-Payment-Id': paymentId,
    'X-Payment-Schemes': 'exact'
  }
}

/**
 * Runtime assertion to verify exact scheme configuration
 * Logs active scheme and throws on anything other than "exact"
 */
function assertExactSchemeOnly() {
  const config = getExactPaymentConfig()

  console.log('[EXACT_SCHEME] Runtime validation: Active payment scheme is "exact"')
  console.log(`[EXACT_SCHEME] Configuration: ${config.asset} on ${config.chain} to ${config.recipient.substring(0, 8)}...`)

  if (config.scheme !== 'exact') {
    throw new Error(`Invalid payment scheme configuration: expected "exact", got "${config.scheme}"`)
  }
}

module.exports = {
  buildExactAccepts,
  validateExactAccepts,
  createExactPaymentResponse,
  getExactHeaders,
  assertExactSchemeOnly
}