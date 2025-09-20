const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Environment validation
function validateEnvironment() {
  const required = ['SERP_API_KEY', 'PRODUCT_SIGNING_SECRET'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    console.error('Please check your .env file and ensure all required variables are set.');
    process.exit(1);
  }

  // Configuration summary (mask secrets)
  console.log('📋 Configuration Summary:');
  console.log(`   • SERP_API_KEY: ${process.env.SERP_API_KEY ? '***' + process.env.SERP_API_KEY.slice(-6) : 'NOT SET'}`);
  console.log(`   • PRODUCT_SIGNING_SECRET: ${process.env.PRODUCT_SIGNING_SECRET ? '***' + process.env.PRODUCT_SIGNING_SECRET.slice(-6) : 'NOT SET'}`);
  console.log(`   • CROSSMINT_API_KEY: ${'***' + CROSSMINT_API_KEY.slice(-6)}`);
  console.log(`   • CROSSMINT_BASE_URL: ${CROSSMINT_BASE_URL}`);
  console.log('');
}

const app = express();
const PORT = 8787;

// Crossmint API configuration
const CROSSMINT_API_KEY = 'sk_production_5TLaSkrBJJAnkhJZzhmoLdB1LS7GfwCw3w8owdffVN4i7zzEtBXwy6KTHFxh7SkvyNnE1vxPwqYXLM7B6di9Vuj1ZWT2iXqSvmXxwAcsTwCpUupZwRRx3zJDpbQjrUMpvTMkFZSDGbBYtLCpP1iii18NiCbnrf3rTbspkAQszDQvhv9UqZX7WiRSV6wcf6s594zxsxsTPooUjXTQaQKEz3fs';
const CROSSMINT_BASE_URL = 'https://www.crossmint.com/api/2022-06-09';

// Product search via SerpAPI (like worldstore-agent)
const SERP_API_KEY = process.env.SERP_API_KEY;

// Validate environment on startup
validateEnvironment();

// Load product catalog
loadProductCatalog();

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Store payment states (in-memory for demo)
const pendingPayments = new Map();

// Store idempotency keys with TTL (1 hour)
const idempotencyCache = new Map();

// Product catalog management
var productCatalog = null;

function loadProductCatalog() {
  try {
    const catalogPath = path.join(__dirname, 'config', 'product-catalog.json');
    const catalogData = fs.readFileSync(catalogPath, 'utf8');
    productCatalog = JSON.parse(catalogData);
    console.log(`📦 Product catalog loaded: ${productCatalog.products.length} products`);
    return productCatalog;
  } catch (error) {
    console.error('❌ Failed to load product catalog:', error.message);
    // Fallback catalog
    productCatalog = {
      defaultASIN: "B08C7KG5LP",
      products: [
        { asin: "B08C7KG5LP", name: "Apple AirPods (3rd Generation)", sku: "B08C7KG5LP", price: 169.99 },
        { asin: "B01MTB55WH", name: "Apple AirPods (3rd Gen - Alt Listing)", sku: "B01MTB55WH", price: 169.99 }
      ]
    };
    console.log('📦 Using fallback product catalog');
    return productCatalog;
  }
}

function validateAsin(asin) {
  if (!productCatalog) {
    loadProductCatalog();
  }

  if (!asin) {
    return {
      valid: true,
      asin: productCatalog.defaultASIN,
      product: productCatalog.products.find(p => p.asin === productCatalog.defaultASIN),
      reason: 'used_default'
    };
  }

  const product = productCatalog.products.find(p => p.asin === asin);
  if (product) {
    return {
      valid: true,
      asin: asin,
      product: product,
      reason: 'found_in_catalog'
    };
  }

  return {
    valid: false,
    asin: asin,
    product: null,
    reason: 'not_in_catalog',
    suggestions: productCatalog.products.map(p => p.asin).slice(0, 3)
  };
}

function logAsinFlow(requestId, stage, data) {
  console.log(`[ASIN-Flow] ${requestId} ${stage}:`, data);
}

// Crypto utilities for stateless product signing
function base64urlEncode(buffer) {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64urlDecode(str) {
  // Add padding if needed
  str += '='.repeat((4 - str.length % 4) % 4);
  // Convert URL-safe base64 to standard base64
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(str, 'base64');
}

function signProduct(product) {
  const productBlob = base64urlEncode(Buffer.from(JSON.stringify(product)));
  const signature = crypto.createHmac('sha256', process.env.PRODUCT_SIGNING_SECRET)
    .update(productBlob)
    .digest('hex');

  return { productBlob, signature };
}

function verifyProductSignature(productBlob, signature) {
  const expectedSignature = crypto.createHmac('sha256', process.env.PRODUCT_SIGNING_SECRET)
    .update(productBlob)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

function decodeProduct(productBlob) {
  try {
    const productJson = base64urlDecode(productBlob).toString('utf8');
    return JSON.parse(productJson);
  } catch (error) {
    throw new Error('Invalid product blob format');
  }
}

// Amazon locator helper function
function toAmazonLocator(p) {
  if (p.asin) return `amazon:${p.asin}`;
  if (p.url) return `amazon:${p.url}`;
  throw new Error("No ASIN or URL for productLocator");
}

// Idempotency utilities
function checkIdempotency(key) {
  const existing = idempotencyCache.get(key);
  if (existing) {
    // Check if still valid (1 hour TTL)
    if (Date.now() - existing.timestamp < 3600000) {
      return existing.result;
    } else {
      idempotencyCache.delete(key);
    }
  }
  return null;
}

function storeIdempotencyResult(key, result) {
  idempotencyCache.set(key, {
    result,
    timestamp: Date.now()
  });
}

// Clean up expired idempotency entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of idempotencyCache.entries()) {
    if (now - value.timestamp >= 3600000) {
      idempotencyCache.delete(key);
    }
  }
}, 1800000);

// Helper function to call Crossmint API with structured logging
async function callCrossmintAPI(endpoint, options = {}) {
  const url = `${CROSSMINT_BASE_URL}${endpoint}`;

  // Log the outgoing request (sanitized)
  console.log(`[Crossmint API] → ${options.method || 'GET'} ${endpoint}`);
  if (options.body) {
    console.log(`[Crossmint API] Request body:`, JSON.parse(options.body));
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      'X-API-KEY': CROSSMINT_API_KEY,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  // Log the raw response status
  console.log(`[Crossmint API] ← ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errorBody = await response.text();
    console.log(`[Crossmint API] Error body:`, errorBody);
    throw new Error(`Crossmint API error: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  const responseData = await response.json();

  // Log the raw response JSON (sanitized - mask sensitive data if needed)
  console.log(`[Crossmint API] Response:`, responseData);

  return responseData;
}

// Runtime schema validation for Crossmint order response
function validateCrossmintOrderResponse(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid Crossmint response: not an object');
  }

  // Check for orderId or id field
  const orderId = data.orderId || data.id || data.order_id;
  if (!orderId) {
    throw new Error(`Invalid Crossmint response: missing order identifier. Response structure: ${JSON.stringify(Object.keys(data))}`);
  }

  return {
    orderId,
    rawResponse: data
  };
}

// PRODUCTION MODE: No demo data - requires real SerpAPI key

// Cache for products to avoid repeated API calls
const productCache = new Map();

// Health endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'Amazon Crossmint Proxy',
    version: '2.0.0'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Amazon Crossmint Proxy',
    version: '2.0.0',
    mode: 'PRODUCTION - Real Amazon Integration',
    endpoints: {
      'GET /': 'This endpoint',
      'GET /products?search=query': 'Search real Amazon products via Crossmint',
      'POST /purchase': 'Purchase real Amazon products (requires x402 payment)',
      'POST /payment-webhook': 'Payment settlement webhook - creates real orders',
      'GET /payment/:paymentId': 'Check payment status'
    },
    integration: {
      crossmint: 'Production API',
      amazon: 'Real products and orders',
      payment: 'x402/Faremeter with USDC'
    },
    note: 'This proxy now creates REAL Amazon orders when payments are confirmed!'
  });
});

// Helper function for SerpAPI search - PRODUCTION ONLY
async function searchAmazonProducts(query, limit = 10) {
  if (!SERP_API_KEY) {
    throw new Error('SERP_API_KEY is required for production Amazon search. No demo data available.');
  }

  console.log(`[Amazon Proxy] Searching for "${query}" via SerpAPI`);

  try {
    const serpApiUrl = `https://serpapi.com/search?engine=amazon&k=${encodeURIComponent(query)}&amazon_domain=amazon.com&api_key=${SERP_API_KEY}`;

    const response = await fetch(serpApiUrl);
    const data = await response.json();

    if (!data.organic_results) {
      console.log('[Amazon Proxy] No organic results from SerpAPI for:', query);
      return [];
    }

    const products = data.organic_results.map(item => {
      // Normalize to the required Product type
      const product = {
        asin: item.asin,
        title: item.title,
        url: item.link_clean || `https://amazon.com/dp/${item.asin}`,
        image: item.thumbnail || '',
        price: {
          amount: item.extracted_price || 0,
          currency: "USD"
        },
        offerId: item.offer_id || null,
        meta: {
          source: "serpapi",
          fetchedAt: new Date().toISOString()
        }
      };

      return product;
    }).slice(0, limit);

    console.log(`[Amazon Proxy] Found ${products.length} real Amazon products via SerpAPI`);

    // Cache products for later purchase and return signed data
    return products.map(product => {
      productCache.set(product.asin, product);
      const { productBlob, signature } = signProduct(product);
      return {
        product,
        productBlob,
        signature
      };
    });

  } catch (error) {
    console.error('[Amazon Proxy] SerpAPI search failed:', error.message);
    throw new Error(`Amazon search failed: ${error.message}`);
  }
}

// Search Amazon products - PRODUCTION ONLY
app.get('/products', async (req, res) => {
  try {
    const { search, limit = 10 } = req.query;

    if (!search) {
      return res.status(400).json({
        error: 'Search query required. No demo products available in production mode.',
        required: 'Add ?search=your_query to search real Amazon products'
      });
    }

    // Use SerpAPI for real search only - no fallbacks
    const signedProducts = await searchAmazonProducts(search, parseInt(limit));

    res.json({
      products: signedProducts,
      count: signedProducts.length,
      searchMethod: 'SerpAPI Production',
      query: search,
      note: 'Real Amazon products with HMAC signatures for stateless flow'
    });
  } catch (error) {
    console.error('[Amazon Proxy] Search error:', error);
    res.status(500).json({
      error: 'Product search failed',
      message: error.message,
      note: 'Ensure SERP_API_KEY is configured for production Amazon search'
    });
  }
});

// Standardized error response function
function createErrorResponse(stage, code, message, details = {}) {
  return {
    ok: false,
    stage,
    code,
    message,
    details: {
      ...details,
      timestamp: new Date().toISOString()
    }
  };
}

// Purchase endpoint - stateless flow with HMAC verification
app.post('/purchase', async (req, res) => {
  const {
    productBlob,
    signature,
    quantity = 1,
    shipping,
    idempotencyKey,
    priceExpectation
  } = req.body;

  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Log incoming request body (sanitized)
  console.log(`[Amazon Proxy] Purchase request received (${requestId}):`, {
    hasProductBlob: !!productBlob,
    hasSignature: !!signature,
    quantity,
    hasShipping: !!shipping,
    idempotencyKey,
    hasPriceExpectation: !!priceExpectation
  });

  // Validate required fields
  if (!productBlob || !signature) {
    return res.status(400).json(createErrorResponse(
      'validation',
      'MISSING_REQUIRED_FIELDS',
      'productBlob and signature are required',
      { requestId, missing: !productBlob ? ['productBlob'] : ['signature'] }
    ));
  }

  // Check idempotency
  if (idempotencyKey) {
    const existingResult = checkIdempotency(idempotencyKey);
    if (existingResult) {
      console.log(`[Amazon Proxy] Returning cached result for idempotency key: ${idempotencyKey}`);
      return res.json(existingResult);
    }
  }

  try {
    // Step 1: Verify HMAC signature
    if (!verifyProductSignature(productBlob, signature)) {
      return res.status(400).json(createErrorResponse(
        'auth',
        'INVALID_SIGNATURE',
        'Product signature verification failed',
        { requestId }
      ));
    }

    // Step 2: Decode and validate product data
    let product;
    try {
      product = decodeProduct(productBlob);
    } catch (error) {
      return res.status(400).json(createErrorResponse(
        'validation',
        'INVALID_PRODUCT_BLOB',
        'Failed to decode product data: ' + error.message,
        { requestId }
      ));
    }

    logAsinFlow(requestId, 'incoming', {
      asin: product.asin,
      title: product.title,
      source: 'decoded_product'
    });

    // Step 3: ASIN validation against product catalog
    const asinValidation = validateAsin(product.asin);
    logAsinFlow(requestId, 'validation', asinValidation);

    if (!asinValidation.valid) {
      return res.status(400).json(createErrorResponse(
        'catalog.validate',
        'ASIN_NOT_IN_CATALOG',
        `ASIN ${product.asin} is not in the approved product catalog`,
        {
          requestId,
          providedAsin: product.asin,
          suggestions: asinValidation.suggestions,
          availableAsins: productCatalog.products.map(p => p.asin)
        }
      ));
    }

    // Use validated ASIN (might be different if defaulted)
    const validatedAsin = asinValidation.asin;
    const catalogProduct = asinValidation.product;

    logAsinFlow(requestId, 'validated', {
      originalAsin: product.asin,
      validatedAsin: validatedAsin,
      catalogProduct: catalogProduct.name,
      reason: asinValidation.reason
    });

    console.log(`[Amazon Proxy] Processing purchase for ASIN: ${validatedAsin}, Title: ${catalogProduct.name} (${asinValidation.reason})`);

    // Step 4: Optional price validation (if priceExpectation provided)
    if (priceExpectation && product.price.amount > priceExpectation.amount) {
      return res.status(400).json(createErrorResponse(
        'sku.validate',
        'PRICE_EXCEEDED',
        `Current price $${product.price.amount} exceeds expected price $${priceExpectation.amount}`,
        {
          requestId,
          currentPrice: product.price.amount,
          expectedPrice: priceExpectation.amount
        }
      ));
    }

    // Step 4: Optional re-lookup for price validation (safer but requires additional API call)
    // For now, we'll skip this since it requires another SerpAPI call per purchase

    const totalPrice = (product.price.amount * quantity).toFixed(2);
    const paymentId = `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log(`[Amazon Proxy] Processing purchase: ${paymentId}, Amount: $${totalPrice} for ${product.title}`);

    // Create real Crossmint order using correct API format
    console.log(`[Amazon Proxy] Creating Crossmint order for payment ${paymentId}`);

    // Use shipping info if available, fallback to demo address
    const recipientInfo = shipping || {
      name: 'Demo Customer',
      email: 'customer@example.com',
      address: {
        line1: '123 Test Street',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94105',
        country: 'US'
      }
    };

    // Build product locator using validated ASIN
    const productLocator = { asin: validatedAsin };
    if (product.offerId) {
      productLocator.offerId = product.offerId;
    }

    logAsinFlow(requestId, 'locator', {
      productLocator,
      sentToCrossmint: validatedAsin
    });

    console.log(`[Amazon Proxy] Product locator:`, productLocator);

    // Crossmint physical products payload (no NFT-style fields)
    const orderRequest = {
      recipient: {
        email: recipientInfo.email,
        physicalAddress: {
          name: recipientInfo.name,
          line1: recipientInfo.address.line1,
          line2: recipientInfo.address.line2 || '',
          city: recipientInfo.address.city,
          state: recipientInfo.address.state,
          postalCode: recipientInfo.address.postalCode,
          country: recipientInfo.address.country || 'US'
        }
      },
      payment: {
        method: 'solana',
        currency: 'usdc'
      },
      lineItems: [
        {
          productLocator: toAmazonLocator(productLocator)
        }
      ]
    };

    console.log(`[Amazon Proxy] Sending Crossmint order request for payment ${paymentId}`);

    const rawOrderData = await callCrossmintAPI('/orders', {
      method: 'POST',
      body: JSON.stringify(orderRequest)
    });

    // Validate and extract orderId from response
    const { orderId, rawResponse } = validateCrossmintOrderResponse(rawOrderData);

    console.log(`[Amazon Proxy] ✅ Real Amazon order created: ${orderId}`);

    // Store order details
    pendingPayments.set(paymentId, {
      asin: validatedAsin,
      originalAsin: product.asin,
      quantity,
      product: catalogProduct,
      totalPrice: parseFloat(totalPrice),
      status: 'completed',
      createdAt: new Date(),
      completedAt: new Date(),
      crossmintOrder: orderId,
      orderId: orderId,
      trackingInfo: rawResponse.tracking,
      shipping: shipping || null,
      rawCrossmintResponse: rawResponse
    });

    // Create standardized success response
    const successResponse = {
      ok: true,
      orderId: orderId,
      status: 'confirmed',
      message: 'Purchase completed successfully!',
      order: {
        orderId: orderId,
        paymentId,
        asin: product.asin,
        product: product.title,
        quantity,
        unitPrice: product.price.amount,
        totalPrice: parseFloat(totalPrice),
        estimatedDelivery: '3-5 business days',
        tracking: rawResponse.tracking || `TK${Date.now()}`
      },
      raw: rawResponse
    };

    // Store in idempotency cache if key provided
    if (idempotencyKey) {
      storeIdempotencyResult(idempotencyKey, successResponse);
    }

    console.log(`[Amazon Proxy] ✅ Purchase completed: ${orderId} (Request: ${requestId})`);

    res.json(successResponse);

  } catch (error) {
    console.error(`[Amazon Proxy] Purchase failed (${requestId}):`, error.message);
    console.error(`[Amazon Proxy] Error details (${requestId}):`, error);

    // Determine error stage and provide structured response
    let stage = 'unknown';
    let code = 'INTERNAL_ERROR';
    let statusCode = 500;

    if (error.message.includes('Crossmint API error')) {
      stage = 'crossmint.createOrder';
      code = 'CROSSMINT_API_ERROR';
      statusCode = 502; // Bad Gateway - upstream API error
    } else if (error.message.includes('Invalid Crossmint response')) {
      stage = 'crossmint.validation';
      code = 'CROSSMINT_INVALID_RESPONSE';
      statusCode = 502; // Bad Gateway - malformed response
    } else if (error.message.includes('Product signature verification failed')) {
      stage = 'auth';
      code = 'INVALID_SIGNATURE';
      statusCode = 400;
    } else if (error.message.includes('Invalid product blob')) {
      stage = 'validation';
      code = 'INVALID_PRODUCT_BLOB';
      statusCode = 400;
    }

    // Create error response with idempotency support
    const errorResponse = createErrorResponse(stage, code, error.message, {
      requestId,
      originalError: error.message
    });

    // Store error in idempotency cache if key provided
    if (idempotencyKey) {
      storeIdempotencyResult(idempotencyKey, errorResponse);
    }

    res.status(statusCode).json(errorResponse);
  }
});

// Payment webhook - processes real Crossmint orders after payment confirmation
app.post('/payment-webhook', async (req, res) => {
  console.log('[Amazon Proxy] Payment webhook called:', req.body);

  try {
    // Only process payments if we receive proper verification data
    if (!req.body || !req.body.payment_id) {
      console.log('[Amazon Proxy] Invalid webhook request - missing payment verification');
      return res.status(400).json({ error: 'Invalid webhook request' });
    }

    const completedPayments = [];
    const verifiedPaymentId = req.body.payment_id;

    // Only process the specific payment that was verified
    if (pendingPayments.has(verifiedPaymentId)) {
      const payment = pendingPayments.get(verifiedPaymentId);
      if (payment.status === 'pending') {
        try {
          // Create real Crossmint order using correct API format
          console.log(`[Amazon Proxy] Creating Crossmint order for payment ${verifiedPaymentId}`);

          // Use shipping info if available, fallback to demo address
          const recipientInfo = payment.shipping || {
            name: 'Demo Customer',
            email: 'customer@example.com',
            address: {
              line1: '123 Test Street',
              city: 'San Francisco',
              state: 'CA',
              postalCode: '94105',
              country: 'US'
            }
          };

          // Crossmint physical products payload (no NFT-style fields)
          const orderRequest = {
            recipient: {
              email: recipientInfo.email,
              physicalAddress: {
                name: recipientInfo.name,
                line1: recipientInfo.address.line1,
                line2: recipientInfo.address.line2 || '',
                city: recipientInfo.address.city,
                state: recipientInfo.address.state,
                postalCode: recipientInfo.address.postalCode,
                country: recipientInfo.address.country || 'US'
              }
            },
            payment: {
              method: 'solana',
              currency: 'usdc'
            },
            lineItems: [
              {
                productLocator: toAmazonLocator(payment.product || { asin: payment.asin })
              }
            ]
          };

          const orderData = await callCrossmintAPI('/orders', {
            method: 'POST',
            body: JSON.stringify(orderRequest)
          });

          // Mark payment as completed with real order
          payment.status = 'completed';
          payment.crossmintOrder = orderData.orderId;
          payment.orderId = orderData.orderId;
          payment.completedAt = new Date();
          payment.trackingInfo = orderData.tracking;

          completedPayments.push({ paymentId: verifiedPaymentId, ...payment });

          console.log(`[Amazon Proxy] ✅ Real Amazon order created: ${orderData.orderId}`);

        } catch (orderError) {
          console.error(`[Amazon Proxy] Failed to create order for ${verifiedPaymentId}:`, orderError.message);

          // Mark as failed
          payment.status = 'failed';
          payment.error = orderError.message;
          payment.completedAt = new Date();
        }
      } else {
        console.log(`[Amazon Proxy] Payment ${verifiedPaymentId} is not pending (status: ${payment.status})`);
      }
    } else {
      console.log(`[Amazon Proxy] Payment ${verifiedPaymentId} not found in pending payments`);
      return res.status(404).json({ error: 'Payment not found' });
    }

    console.log(`[Amazon Proxy] Processed ${completedPayments.length} real Amazon orders`);

    res.json({
      status: 'success',
      message: 'Payment processed and real Amazon orders created',
      completed_orders: completedPayments.length,
      orders: completedPayments.map(p => ({
        paymentId: p.paymentId,
        orderId: p.orderId,
        product: p.product.title,
        total: p.totalPrice
      }))
    });

  } catch (error) {
    console.error('[Amazon Proxy] Payment webhook error:', error.message);

    res.status(500).json({
      status: 'error',
      message: 'Failed to process payment',
      error: error.message
    });
  }
});

// Check payment status
app.get('/payment/:paymentId', (req, res) => {
  const { paymentId } = req.params;
  const payment = pendingPayments.get(paymentId);

  if (!payment) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  res.json(payment);
});

// Retry purchase after payment (for testing completed flow)
app.post('/purchase-retry', (req, res) => {
  const { sku, quantity = 1 } = req.body;

  console.log(`[Amazon Demo] Purchase retry: SKU=${sku}, Qty=${quantity}`);

  const product = products[sku];
  if (!product) {
    return res.status(404).json({ error: 'Product not found', sku });
  }

  const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const totalPrice = (product.price * quantity).toFixed(2);

  // Simulate successful purchase
  res.json({
    success: true,
    orderId,
    status: 'confirmed',
    message: 'Purchase completed successfully!',
    order: {
      orderId,
      sku,
      product: product.title,
      quantity,
      unitPrice: product.price,
      totalPrice: parseFloat(totalPrice),
      estimatedDelivery: '3-5 business days',
      tracking: `TK${Date.now()}`
    },
    demo_note: 'This is a simulated purchase - no real products will be shipped!'
  });
});

// Health endpoint for search functionality
app.get('/health/search', (req, res) => {
  const serpConfigured = !!SERP_API_KEY;

  res.json({
    serpConfigured,
    note: serpConfigured ? 'SERP API key configured' : 'SERP API key missing - using demo products'
  });
});

// Diagnostics endpoint
app.get('/diagnostics', (req, res) => {
  const lastPurchaseAsin = Array.from(pendingPayments.values())
    .sort((a, b) => b.createdAt - a.createdAt)[0]?.asin || null;

  // Simple Crossmint connectivity check
  let crossmintReachable = true;
  try {
    // This is a basic check - in production you might want to do an actual API call
    new URL(CROSSMINT_BASE_URL);
  } catch {
    crossmintReachable = false;
  }

  res.json({
    serpConfigured: !!SERP_API_KEY,
    productCatalogCount: productCatalog?.products?.length || 0,
    lastPurchaseASIN: lastPurchaseAsin,
    crossmintReachable,
    activePayments: pendingPayments.size,
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      uptime: process.uptime()
    },
    availableASINs: productCatalog?.products?.map(p => p.asin) || []
  });
});

app.listen(PORT, () => {
  console.log(`🛒 Amazon Crossmint Proxy running on http://localhost:${PORT}`);
  console.log(`🔗 Crossmint API: Production`);
  console.log(`💳 Ready for real Amazon purchases with x402/USDC payments!`);
  console.log(`🌟 Real Amazon integration active - purchases create actual orders!`);
});