# Amazon Demo Proxy

A comprehensive demonstration system showcasing **x402 payment challenges** with **Solana/USDC** payments integrated with Amazon product search and purchasing. This system demonstrates how modern web applications can implement seamless cryptocurrency payments using the HTTP 402 Payment Required status code and blockchain technology.

## 🎯 System Overview

The Amazon Demo Proxy is a multi-service architecture that enables:

1. **Product Search**: Real Amazon product search via SERP API
2. **x402 Payment Challenges**: HTTP 402-based payment requests with Solana/USDC instructions
3. **Blockchain Payments**: Actual Solana blockchain transactions via Crossmint
4. **Purchase Flow**: End-to-end Amazon product purchasing with crypto payments

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Mallory App   │    │  Amazon Proxy   │    │ Payment Proxy   │
│   (Frontend)    │────│   (Port 8787)   │────│  (Port 8402)    │
│   Port 3001     │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │                        │
                              │                        │
                       ┌──────▼──────┐        ┌───────▼────────┐
                       │  SERP API   │        │   Faremeter    │
                       │  (Amazon    │        │ + Crossmint    │
                       │   Search)   │        │   (Payments)   │
                       └─────────────┘        └────────────────┘
```

### Service Breakdown

- **Amazon Proxy (8787)**: Handles product search, catalog validation, and purchase requests
- **Payment Proxy (8402)**: Manages x402 payment challenges and Solana/USDC transactions
- **Mallory App (3001)**: Frontend UI for product browsing and purchasing

## 🚀 Quick Start

### One-Command Setup

```bash
./scripts/quick-start.sh
```

This script will:
- Check environment configuration
- Verify port availability
- Start all required services
- Validate system functionality

### Manual Setup

1. **Environment Configuration**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your API keys
   ```

2. **Start Services**
   ```bash
   # Amazon Proxy
   node server.js

   # Payment Proxy (in separate terminal)
   cd ../corbits-demos/packages/mcp-solana
   npx tsx src/payment-proxy.ts

   # Mallory App (in separate terminal)
   cd ../malloryapp
   npm run dev
   ```

3. **Verify Setup**
   ```bash
   ./scripts/dev-suite.sh test
   ```

## 🔧 Configuration

### Required Environment Variables

Create `.env.local` with:

```bash
# Amazon Search (via SERP API)
SERP_API_KEY=your_serp_api_key_here

# Crossmint (for blockchain payments)
CROSSMINT_API_KEY=your_crossmint_api_key_here

# Faremeter (for x402 payment challenges)
FAREMETER_FACILITATOR_URL=https://facilitator.faremeter.xyz
FAREMETER_NETWORK=solana-devnet

# Solana Configuration
ASSET_ADDRESS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v  # USDC mint
PAYTO_ADDRESS=HWfT4ivxtYVPeEUkdx5q7VTKy6E8p1nvCiba3Ez21obk   # Payment recipient
PAYER_KEYPAIR_PATH=~/.config/solana/devnet.json                # Solana wallet
```

### Service Ports

- **8787**: Amazon Proxy (product search and purchases)
- **8402**: Payment Proxy (x402 challenges and payments)
- **3001**: Mallory App (frontend UI)

## 🧪 Testing & Development

### Developer Suite

```bash
# Full test suite
./scripts/dev-suite.sh test

# Test x402 payment flow specifically
./scripts/dev-suite.sh x402

# Check environment configuration
./scripts/dev-suite.sh env

# View port status
./scripts/dev-suite.sh ports

# Restart all services
./scripts/dev-suite.sh restart

# Show service logs
./scripts/dev-suite.sh logs

# Quick demo flow
./scripts/dev-suite.sh demo
```

### Manual Testing

#### 1. Test Product Search
```bash
curl "http://localhost:8787/products?search=airpods&limit=3" | jq
```

#### 2. Test x402 Payment Challenge
```bash
curl -X POST "http://localhost:8402/purchase" \
  -H "Content-Type: application/json" \
  -d '{"asin":"B08C7KG5LP","quantity":1}' | jq
```

Expected response:
```json
{
  "x402Version": 1,
  "accepts": [
    {
      "method": "solana:usdc:transfer",
      "network": "solana:devnet",
      "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "payTo": "HWfT4ivxtYVPeEUkdx5q7VTKy6E8p1nvCiba3Ez21obk",
      "amount": "169.99",
      "currency": "USDC"
    }
  ]
}
```

#### 3. Test System Health
```bash
curl "http://localhost:8787/diagnostics" | jq
curl "http://localhost:8787/health/search" | jq
```

## 📊 Key Features

### ✅ x402 Payment Protocol (Recently Fixed!)
- **HTTP 402 Payment Required** responses with structured payment instructions
- **Proper header implementation**: Fixed critical headers (`Accept: exact`)
- **USDC payment flow**: Resolved payment bypass issues that prevented USDC debiting
- **Payment-first architecture**: Purchase requests now return 402 first, complete order after payment
- **Fallback mechanism** ensures non-empty `accepts` arrays
- **Enhanced debugging** with request ID tracking and comprehensive logging

**🔧 Recent Fix**: The system now properly implements the x402 protocol by returning 402 Payment Required instead of immediately creating orders. This ensures USDC payments are properly processed through the Faremeter facilitator before order completion.

### ✅ Solana/USDC Integration
- **Real blockchain transactions** via Crossmint API
- **USDC token transfers** on Solana devnet/mainnet
- **Wallet integration** with automatic transaction signing

### ✅ Amazon Product Integration
- **Real-time search** via SERP API with live Amazon data
- **Product catalog validation** ensuring purchasable items
- **ASIN passthrough** maintaining product integrity across services

### ✅ Comprehensive Diagnostics
- **Health check endpoints** for all services
- **Environment validation** with startup assertions
- **Port conflict detection** and management
- **Detailed logging** with request tracing

## 🔍 API Endpoints

### Amazon Proxy (Port 8787)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/products` | GET | Search Amazon products (`?search=query&limit=N`) |
| `/purchase` | POST | Initiate purchase flow with x402 challenge |
| `/diagnostics` | GET | System health and configuration status |
| `/health/search` | GET | SERP API connectivity check |

### Payment Proxy (Port 8402)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/purchase` | POST | Generate x402 payment challenge |
| `/complete` | POST | Complete payment with blockchain transaction |

## 🏃‍♂️ Usage Examples

### Frontend Integration (Mallory App)

1. **Browse Products**: Visit http://localhost:3001
2. **Search**: Use the search interface to find Amazon products
3. **Purchase**: Click "Buy Now" to trigger x402 payment flow
4. **Pay**: Complete Solana/USDC payment via wallet integration

### API Integration

```javascript
// Search for products
const products = await fetch('http://localhost:8787/products?search=airpods&limit=5')
  .then(r => r.json());

// Initiate purchase (triggers x402)
const payment = await fetch('http://localhost:8402/purchase', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ asin: 'B08C7KG5LP', quantity: 1 })
});

if (payment.status === 402) {
  const challenge = await payment.json();
  // Process payment instructions in challenge.accepts
}
```

## 🐛 Troubleshooting

### Common Issues

1. **USDC not debited after purchase attempt** ⚠️ RESOLVED
   ```bash
   # This issue was caused by incorrect x402 protocol implementation
   # The system was bypassing payment flow by creating orders immediately
   #
   # SOLUTION: Updated server.js to return 402 first, complete order after payment
   # If you still see this issue, verify you have the latest commit:
   git log --oneline -1  # Should show recent x402 fix commit
   ```

2. **Empty x402 accepts array**
   ```bash
   # Check payment proxy logs
   ./scripts/dev-suite.sh logs

   # Test x402 specifically
   ./scripts/dev-suite.sh x402
   ```

2. **SERP API errors**
   ```bash
   # Verify API key configuration
   ./scripts/dev-suite.sh env

   # Test search health
   curl "http://localhost:8787/health/search"
   ```

3. **Port conflicts**
   ```bash
   # Check port status
   ./scripts/dev-suite.sh ports

   # Restart services
   ./scripts/dev-suite.sh restart
   ```

4. **ASIN mismatch errors**
   ```bash
   # Check product catalog
   cat config/product-catalog.json

   # Test with valid ASIN
   curl -X POST "http://localhost:8402/purchase" \
     -H "Content-Type: application/json" \
     -d '{"asin":"B08C7KG5LP","quantity":1}'
   ```

### Debug Mode

Enable enhanced debugging:

```bash
# Payment proxy with debug logging
cd ../corbits-demos/packages/mcp-solana
DEBUG_X402=1 npx tsx src/payment-proxy.ts
```

## 📁 Project Structure

```
amazon-demo-proxy/
├── server.js                 # Amazon proxy server
├── config/
│   └── product-catalog.json  # Validated product ASINs
├── scripts/
│   ├── quick-start.sh        # One-command setup
│   ├── dev-suite.sh          # Developer utilities
│   └── ports-guard.ts        # Port management
└── .env.local               # Environment configuration
```

## 🔗 Related Repositories

- **Payment Proxy**: `../corbits-demos/packages/mcp-solana/`
- **Mallory App**: `../malloryapp/`

## 🎉 Success Indicators

When everything is working correctly, you should see:

- ✅ All services running on expected ports
- ✅ Search returning real Amazon products
- ✅ x402 challenges with non-empty accepts arrays
- ✅ USDC payment instructions with valid Solana addresses
- ✅ Full purchase flow completing without errors

Run `./scripts/dev-suite.sh demo` for a comprehensive validation of all functionality.