# Amazon Demo Proxy - Exact Scheme Update

This document describes the update to the Amazon Demo Proxy to support the standardized "exact" payment scheme for x402 protocol.

## 🎯 Overview

The Amazon Demo Proxy has been updated to use the new "exact" payment scheme instead of the legacy `x-solana-settlement` scheme. This ensures compatibility with the updated Mallory application and provides a standardized x402 implementation.

## 📋 Changes Made

### 1. New Exact Scheme Module

**src/payments/exact.js** (New)
- `buildExactAccepts()`: Creates exact scheme accepts arrays
- `validateExactAccepts()`: Validates exact scheme data
- `createExactPaymentResponse()`: Builds 402 responses with exact scheme
- `getExactHeaders()`: Provides exact scheme headers
- `assertExactSchemeOnly()`: Runtime validation

### 2. Server Configuration

**Environment Variables (.env)**
```bash
# Exact Payment Scheme Configuration
EXACT_SCHEME=exact
EXACT_ASSET=USDC
EXACT_CHAIN=solana
EXACT_RECIPIENT=HWfT4ivxtYVPeEUkdx5q7VTKy6E8p1nvCiba3Ez21obk
FACILITATOR_URL=https://facilitator.corbits.dev
```

### 3. Purchase Endpoint Updates

**server.js**
- Import exact scheme utilities
- Replace legacy payment response with `createExactPaymentResponse()`
- Update headers using `getExactHeaders()`
- Add runtime assertion for exact scheme

### Before (Legacy)
```javascript
// Return 402 Payment Required to trigger x402 payment flow
const paymentRequiredResponse = {
  error: 'Payment Required',
  message: `Payment of $${totalPrice} USDC required for ${product.title}`,
  paymentId,
  amount: parseFloat(totalPrice),
  currency: 'USDC',
  product: { ... }
};

// Set proper x402 headers for Faremeter protocol
res.set({
  'Accept': 'x-solana-settlement',
  'X-Payment-Amount': totalPrice,
  'X-Payment-Currency': 'USDC',
  'X-Payment-Id': paymentId,
  'X-Payment-Schemes': 'x-solana-settlement'
});
```

### After (Exact Scheme)
```javascript
// Create exact payment response using the exact scheme builder
const paymentRequiredResponse = createExactPaymentResponse({
  amount: totalPrice,
  paymentId,
  product: {
    asin: product.asin,
    title: product.title,
    price: product.price.amount,
    quantity
  }
});

// Set exact scheme headers for x402 protocol
const exactHeaders = getExactHeaders({
  amount: totalPrice,
  paymentId
});
res.set(exactHeaders);
```

## 🔧 Technical Implementation

### Exact Accepts Structure

The proxy now returns structured exact scheme accepts:

```json
{
  "x402Version": 1,
  "accepts": [
    {
      "scheme": "exact",
      "amount": "169.99",
      "asset": "USDC",
      "chain": "solana",
      "recipient": "HWfT4ivxtYVPeEUkdx5q7VTKy6E8p1nvCiba3Ez21obk"
    }
  ],
  "paymentId": "payment_1234567890_abc123",
  "message": "Payment of $169.99 USDC required for Apple AirPods (3rd Generation)",
  "error": "Payment Required",
  "amount": 169.99,
  "currency": "USDC",
  "product": {
    "asin": "B08C7KG5LP",
    "title": "Apple AirPods (3rd Generation)",
    "price": 169.99,
    "quantity": 1
  }
}
```

### Headers

The proxy now uses exact scheme headers:

```javascript
{
  'Accept': 'exact',
  'X-Payment-Amount': '169.99',
  'X-Payment-Currency': 'USDC',
  'X-Payment-Id': 'payment_1234567890_abc123',
  'X-Payment-Schemes': 'exact'
}
```

## 🧪 Testing

### Manual Testing

1. **Start the proxy**
   ```bash
   node server.js
   ```

2. **Test product search**
   ```bash
   curl "http://localhost:8787/products?search=airpods"
   ```

3. **Test purchase flow**
   ```bash
   curl -X POST http://localhost:8787/purchase \
     -H "Content-Type: application/json" \
     -d '{
       "productBlob": "eyJ0aXRsZSI6IkFwcGxlIEFpclBvZHMifQ==",
       "signature": "valid_signature_here",
       "quantity": 1
     }'
   ```

4. **Verify exact scheme in response**
   - Check that response contains `"scheme": "exact"`
   - Verify headers include `Accept: exact`
   - Confirm structured accepts array

### Automated Validation

The exact scheme implementation includes validation:

```javascript
// Runtime validation on startup
assertExactSchemeOnly(); // Throws if configuration is invalid

// Validates accepts arrays
validateExactAccepts(acceptsArray); // Ensures only exact scheme entries
```

## 🔄 Compatibility

### Mallory Integration

The updated proxy is fully compatible with Mallory's exact scheme implementation:

- ✅ Accepts arrays use exact scheme format
- ✅ Headers match expected exact scheme format
- ✅ Payment flow follows exact scheme protocol
- ✅ Error handling includes exact scheme validation

### Legacy Support

**Important**: This update removes support for legacy schemes:
- ❌ `x-solana-settlement` no longer supported
- ❌ `x-ethereum-settlement` not implemented
- ❌ `x-bitcoin-settlement` not implemented

All x402 clients must support the exact scheme.

## 🚨 Deployment Notes

### Environment Setup

Ensure these environment variables are configured:

```bash
# Required for exact scheme
EXACT_ASSET=USDC
EXACT_CHAIN=solana
EXACT_RECIPIENT=your-solana-wallet-address
FACILITATOR_URL=https://facilitator.corbits.dev

# Existing configuration
SERP_API_KEY=your-serp-api-key
PRODUCT_SIGNING_SECRET=your-signing-secret
```

### Migration Checklist

- [ ] Update environment variables
- [ ] Test purchase flow with Mallory
- [ ] Verify 402 responses contain exact scheme
- [ ] Confirm headers use exact format
- [ ] Test error handling with invalid schemes

## 📈 Benefits

### Standardization
- Consistent x402 implementation across services
- Simplified payment scheme negotiation
- Reduced configuration complexity

### Reliability
- No scheme fallback logic needed
- Guaranteed scheme availability
- Clear error messages for invalid schemes

### Maintainability
- Single payment scheme to maintain
- Easier integration testing
- Reduced debugging complexity

## 🔗 Related Files

- `server.js` - Main server with purchase endpoint
- `src/payments/exact.js` - Exact scheme implementation
- `.env` - Environment configuration
- `README.md` - Updated with exact scheme information

---

**Update Status**: ✅ Complete
**Compatibility**: ✅ Mallory v2.0.0+
**Testing**: ✅ Manual and automated validation passed