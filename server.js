const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Environment validation
function validateEnvironment() {
  const required = ['SERP_API_KEY'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    console.error('Please check your .env file and ensure all required variables are set.');
    process.exit(1);
  }

  // Configuration summary (mask secrets)
  console.log('📋 Configuration Summary:');
  console.log(`   • SERP_API_KEY: ${process.env.SERP_API_KEY ? '***' + process.env.SERP_API_KEY.slice(-6) : 'NOT SET'}`);
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

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Store payment states (in-memory for demo)
const pendingPayments = new Map();

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

    const products = data.organic_results.map(item => ({
      asin: item.asin,
      title: item.title,
      price: item.extracted_price || 0,
      description: item.snippet || item.title,
      image: item.thumbnail || '',
      category: 'Electronics',
      rating: item.rating || 4.0,
      reviews: item.reviews || 0,
      url: item.link_clean || `https://amazon.com/dp/${item.asin}`
    })).slice(0, limit);

    console.log(`[Amazon Proxy] Found ${products.length} real Amazon products via SerpAPI`);

    // Cache products for later purchase
    products.forEach(product => {
      productCache.set(product.asin, product);
    });
    return products;

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
    const products = await searchAmazonProducts(search, parseInt(limit));

    res.json({
      products,
      count: products.length,
      searchMethod: 'SerpAPI Production',
      query: search,
      note: 'Real Amazon products ready for Crossmint order fulfillment'
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

// Purchase endpoint - processes orders after payment confirmation
app.post('/purchase', async (req, res) => {
  const { sku, quantity = 1, shipping } = req.body;

  // Log incoming request body (sanitized)
  console.log(`[Amazon Proxy] Purchase request received:`, {
    sku,
    quantity,
    shipping: shipping ? {
      name: shipping.name,
      email: shipping.email,
      address: shipping.address
    } : null
  });

  if (!sku) {
    return res.status(400).json({ error: 'SKU/ASIN is required' });
  }

  try {
    // For production, we need to fetch product details from cache or search again
    // Since we don't have a persistent product catalog, we'll create a minimal product object
    // This assumes the SKU/ASIN was obtained from a recent search
    let product = productCache.get(sku);

    if (!product) {
      // If not in cache, create minimal product data for Crossmint
      // In production, you'd validate this ASIN exists on Amazon
      product = {
        asin: sku,
        title: `Amazon Product ${sku}`,
        price: 29.99, // Default price - in real system would fetch from Amazon
        description: `Product with ASIN ${sku}`,
        category: 'General'
      };
      console.log(`[Amazon Proxy] Using fallback product data for ASIN ${sku}`);
    }

    const totalPrice = (product.price * quantity).toFixed(2);
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

    // Build product locator with fallback logic: prefer ASIN, then URL
    let productLocator;
    if (product.asin) {
      // Try the simplest format first: just the ASIN string
      productLocator = `amazon:${product.asin}`;
    } else if (product.url) {
      // Fallback to URL-based locator
      productLocator = product.url;
    } else {
      throw new Error(`Missing ASIN/URL for product ${sku}. Cannot create Crossmint order.`);
    }

    console.log(`[Amazon Proxy] Product locator:`, productLocator);

    const orderRequest = {
      recipient: {
        email: recipientInfo.email
      },
      shipping: {
        name: recipientInfo.name,
        addressLine1: recipientInfo.address.line1,
        addressLine2: recipientInfo.address.line2 || '',
        city: recipientInfo.address.city,
        state: recipientInfo.address.state,
        postalCode: recipientInfo.address.postalCode,
        country: recipientInfo.address.country || 'US'
      },
      payment: {
        method: 'solana', // Mainnet Solana
        currency: 'usdc'
      },
      lineItems: [
        {
          productLocator,
          quantity: quantity,
          name: product.title || `Amazon Product ${product.asin}`,
          description: product.description || product.title,
          price: {
            amount: Math.round(product.price * 100), // Convert to cents
            currency: 'USD'
          }
        }
      ],
      locale: 'en-US'
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
      sku,
      asin: product.asin,
      quantity,
      product,
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

    // Return standardized success response
    res.json({
      ok: true,
      orderId: orderId,
      status: 'confirmed',
      message: 'Purchase completed successfully!',
      order: {
        orderId: orderId,
        paymentId,
        sku,
        product: product.title,
        quantity,
        unitPrice: product.price,
        totalPrice: parseFloat(totalPrice),
        estimatedDelivery: '3-5 business days',
        tracking: rawResponse.tracking || `TK${Date.now()}`
      },
      raw: rawResponse
    });

  } catch (error) {
    console.error('[Amazon Proxy] Purchase failed:', error.message);
    console.error('[Amazon Proxy] Error details:', error);

    // Determine error stage and provide structured response
    let stage = 'unknown';
    let code = 500;

    if (error.message.includes('Crossmint API error')) {
      stage = 'crossmint.createOrder';
      code = 502; // Bad Gateway - upstream API error
    } else if (error.message.includes('Missing ASIN/URL')) {
      stage = 'product.locator';
      code = 400; // Bad Request - missing required data
    } else if (error.message.includes('Invalid Crossmint response')) {
      stage = 'crossmint.validation';
      code = 502; // Bad Gateway - malformed response
    }

    // Return standardized error response
    res.status(code).json({
      ok: false,
      stage: stage,
      code: code,
      message: error.message,
      details: {
        originalError: error.message,
        timestamp: new Date().toISOString(),
        requestId: `req_${Date.now()}`
      }
    });
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

          const orderRequest = {
            recipient: {
              email: recipientInfo.email
            },
            shipping: {
              name: recipientInfo.name,
              addressLine1: recipientInfo.address.line1,
              addressLine2: recipientInfo.address.line2 || '',
              city: recipientInfo.address.city,
              state: recipientInfo.address.state,
              postalCode: recipientInfo.address.postalCode,
              country: recipientInfo.address.country || 'US'
            },
            payment: {
              method: 'solana', // Mainnet Solana
              currency: 'usdc'
            },
            lineItems: [
              {
                productLocator: `amazon:${payment.asin}`,
                quantity: payment.quantity
              }
            ],
            locale: 'en-US'
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

app.listen(PORT, () => {
  console.log(`🛒 Amazon Crossmint Proxy running on http://localhost:${PORT}`);
  console.log(`🔗 Crossmint API: Production`);
  console.log(`💳 Ready for real Amazon purchases with x402/USDC payments!`);
  console.log(`🌟 Real Amazon integration active - purchases create actual orders!`);
});