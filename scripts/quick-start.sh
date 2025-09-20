#!/bin/bash

# Quick Start Script for Amazon Demo Proxy
# Sets up and validates the entire development environment

set -e

echo "🚀 Amazon Demo Proxy - Quick Start"
echo "=================================="
echo

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "📍 Project root: $ROOT_DIR"
echo

# Step 1: Environment check
echo "🔍 Step 1: Checking environment..."
if [ -f "$ROOT_DIR/.env.local" ]; then
    echo -e "  ✅ ${GREEN}.env.local found${NC}"
else
    echo -e "  ⚠️  ${YELLOW}.env.local missing - some features may not work${NC}"
fi

# Step 2: Check if ports are available
echo "🔌 Step 2: Checking ports..."
if lsof -ti :8787 > /dev/null 2>&1; then
    echo -e "  ⚠️  ${YELLOW}Port 8787 in use - will use existing Amazon proxy${NC}"
else
    echo -e "  ✅ ${GREEN}Port 8787 available${NC}"
fi

if lsof -ti :8402 > /dev/null 2>&1; then
    echo -e "  ⚠️  ${YELLOW}Port 8402 in use - will use existing payment proxy${NC}"
else
    echo -e "  ✅ ${GREEN}Port 8402 available${NC}"
fi

# Step 3: Start services if needed
echo "🚀 Step 3: Starting services..."

# Amazon proxy
if ! curl -s "http://localhost:8787" > /dev/null; then
    echo "  Starting Amazon proxy..."
    cd "$ROOT_DIR"
    node server.js > /tmp/amazon-proxy.log 2>&1 &
    sleep 2
    if curl -s "http://localhost:8787" > /dev/null; then
        echo -e "  ✅ ${GREEN}Amazon proxy started${NC}"
    else
        echo -e "  ❌ ${RED}Failed to start Amazon proxy${NC}"
    fi
else
    echo -e "  ✅ ${GREEN}Amazon proxy already running${NC}"
fi

# Payment proxy
if ! curl -s "http://localhost:8402" > /dev/null; then
    echo "  Starting payment proxy..."
    cd "$ROOT_DIR/../corbits-demos/packages/mcp-solana"
    npx tsx src/payment-proxy.ts > /tmp/payment-proxy.log 2>&1 &
    sleep 3
    if curl -s "http://localhost:8402" > /dev/null; then
        echo -e "  ✅ ${GREEN}Payment proxy started${NC}"
    else
        echo -e "  ❌ ${RED}Failed to start payment proxy${NC}"
    fi
else
    echo -e "  ✅ ${GREEN}Payment proxy already running${NC}"
fi

# Step 4: Quick validation
echo "🧪 Step 4: Quick validation..."

# Test Amazon proxy
if curl -s "http://localhost:8787/diagnostics" | jq '.serpConfigured' > /dev/null 2>&1; then
    echo -e "  ✅ ${GREEN}Amazon proxy responding${NC}"
else
    echo -e "  ❌ ${RED}Amazon proxy not responding properly${NC}"
fi

# Test payment proxy
if curl -s "http://localhost:8402/purchase" -H "Content-Type: application/json" -d '{"asin":"test"}' | grep -q "402"; then
    echo -e "  ✅ ${GREEN}Payment proxy responding with x402${NC}"
else
    echo -e "  ⚠️  ${YELLOW}Payment proxy response unexpected${NC}"
fi

echo
echo "🎉 Quick start complete!"
echo
echo "Next steps:"
echo "  • Run full tests: ./scripts/dev-suite.sh test"
echo "  • Quick demo: ./scripts/dev-suite.sh demo"
echo "  • Check ports: ./scripts/dev-suite.sh ports"
echo "  • View logs: ./scripts/dev-suite.sh logs"
echo
echo "Key URLs:"
echo "  • Amazon Proxy: http://localhost:8787"
echo "  • Payment Proxy: http://localhost:8402"
echo "  • Search: http://localhost:8787/products?search=airpods"
echo "  • Diagnostics: http://localhost:8787/diagnostics"
echo