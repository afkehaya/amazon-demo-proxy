#!/bin/bash

# Amazon Demo Proxy - Developer Suite
# Comprehensive development utilities

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Color codes for pretty output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

print_header() {
    echo -e "\n${BLUE}🚀 Amazon Demo Proxy - Developer Suite${NC}"
    echo -e "${BLUE}=====================================${NC}\n"
}

print_section() {
    echo -e "\n${PURPLE}📋 $1${NC}"
    echo -e "${PURPLE}$(printf '=%.0s' $(seq 1 ${#1}))${NC}"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Test all endpoints
test_endpoints() {
    print_section "Testing API Endpoints"

    echo "🧪 Testing Amazon Proxy (8787)..."

    # Basic health check
    if curl -s "http://localhost:8787" > /dev/null; then
        echo -e "  ✅ ${GREEN}Server is running${NC}"
    else
        echo -e "  ❌ ${RED}Server is not responding${NC}"
        return 1
    fi

    # Test diagnostics
    echo "🔍 Testing diagnostics..."
    curl -s "http://localhost:8787/diagnostics" | jq '.' || echo "  ⚠️  Diagnostics endpoint issue"

    # Test search health
    echo "🔍 Testing search health..."
    curl -s "http://localhost:8787/health/search" | jq '.' || echo "  ⚠️  Search health endpoint issue"

    # Test SERP search
    echo "🔍 Testing SERP search..."
    if curl -s "http://localhost:8787/products?search=test&limit=1" | jq '.products[0].product.asin' > /dev/null; then
        echo -e "  ✅ ${GREEN}SERP search working${NC}"
    else
        echo -e "  ⚠️  ${YELLOW}SERP search may have issues${NC}"
    fi
}

# Check x402 payment flow
test_x402() {
    print_section "Testing x402 Payment Flow"

    if ! command_exists curl; then
        echo -e "  ❌ ${RED}curl is required for x402 testing${NC}"
        return 1
    fi

    echo "🧪 Testing payment proxy (8402)..."

    # Check if payment proxy is running
    if ! curl -s "http://localhost:8402" > /dev/null; then
        echo -e "  ❌ ${RED}Payment proxy not running on port 8402${NC}"
        echo -e "  💡 Start with: cd ../mcp-solana && npx tsx src/payment-proxy.ts"
        return 1
    fi

    echo "🔒 Testing x402 challenge..."
    RESPONSE=$(curl -s -w "HTTP_%{http_code}" "http://localhost:8402/purchase" \
        -H "Content-Type: application/json" \
        -d '{"asin":"B0D9FLMR6N","quantity":1}')

    HTTP_CODE=$(echo "$RESPONSE" | grep -o "HTTP_[0-9]*" | cut -d'_' -f2)
    BODY=$(echo "$RESPONSE" | sed 's/HTTP_[0-9]*$//')

    if [ "$HTTP_CODE" = "402" ]; then
        ACCEPTS_LENGTH=$(echo "$BODY" | jq '.accepts | length' 2>/dev/null || echo "0")
        if [ "$ACCEPTS_LENGTH" -gt 0 ]; then
            echo -e "  ✅ ${GREEN}x402 challenge with non-empty accepts (length: $ACCEPTS_LENGTH)${NC}"
        else
            echo -e "  ❌ ${RED}x402 challenge but empty accepts array${NC}"
        fi
    else
        echo -e "  ❌ ${RED}Expected HTTP 402, got $HTTP_CODE${NC}"
    fi
}

# Environment validation
check_environment() {
    print_section "Environment Validation"

    # Check for .env file
    if [ -f "$ROOT_DIR/.env.local" ]; then
        echo -e "  ✅ ${GREEN}.env.local found${NC}"

        # Check critical env vars
        source "$ROOT_DIR/.env.local" 2>/dev/null || true

        if [ -n "$SERP_API_KEY" ]; then
            echo -e "  ✅ ${GREEN}SERP_API_KEY configured${NC}"
        else
            echo -e "  ⚠️  ${YELLOW}SERP_API_KEY missing - search will not work${NC}"
        fi

        if [ -n "$CROSSMINT_API_KEY" ]; then
            echo -e "  ✅ ${GREEN}CROSSMINT_API_KEY configured${NC}"
        else
            echo -e "  ⚠️  ${YELLOW}CROSSMINT_API_KEY missing - purchases will not work${NC}"
        fi

    else
        echo -e "  ❌ ${RED}.env.local not found${NC}"
        echo -e "  💡 Copy .env.local from parent project or create one"
    fi

    # Check Node.js version
    if command_exists node; then
        NODE_VERSION=$(node --version)
        echo -e "  ✅ ${GREEN}Node.js $NODE_VERSION${NC}"
    else
        echo -e "  ❌ ${RED}Node.js not found${NC}"
    fi

    # Check for jq (useful for JSON parsing)
    if command_exists jq; then
        echo -e "  ✅ ${GREEN}jq available for JSON parsing${NC}"
    else
        echo -e "  ⚠️  ${YELLOW}jq not available (install with: brew install jq)${NC}"
    fi
}

# Port management
check_ports() {
    print_section "Port Status"

    if [ -f "$SCRIPT_DIR/ports-guard.ts" ]; then
        npx tsx "$SCRIPT_DIR/ports-guard.ts"
    else
        echo -e "  ⚠️  ${YELLOW}ports-guard.ts not found, checking manually...${NC}"

        # Manual port check
        for port in 8787 8402 3001 3000; do
            if lsof -ti ":$port" > /dev/null 2>&1; then
                PID=$(lsof -ti ":$port")
                echo -e "  🔴 Port $port: IN USE (PID: $PID)"
            else
                echo -e "  🟢 Port $port: FREE"
            fi
        done
    fi
}

# Clean up and restart
restart_services() {
    print_section "Restarting Services"

    echo "🧹 Killing existing processes..."

    # Kill processes on key ports
    for port in 8787 8402; do
        PID=$(lsof -ti ":$port" 2>/dev/null || echo "")
        if [ -n "$PID" ]; then
            echo "  Killing process on port $port (PID: $PID)"
            kill "$PID" 2>/dev/null || true
            sleep 1
        fi
    done

    echo "🚀 Starting services..."

    # Start Amazon proxy
    echo "  Starting Amazon proxy on port 8787..."
    cd "$ROOT_DIR"
    node server.js > /tmp/amazon-proxy.log 2>&1 &
    echo "  Amazon proxy started (logs: /tmp/amazon-proxy.log)"

    # Start payment proxy
    echo "  Starting payment proxy on port 8402..."
    cd "$ROOT_DIR/../corbits-demos/packages/mcp-solana"
    npx tsx src/payment-proxy.ts > /tmp/payment-proxy.log 2>&1 &
    echo "  Payment proxy started (logs: /tmp/payment-proxy.log)"

    echo "⏳ Waiting for services to start..."
    sleep 3

    echo -e "  ✅ ${GREEN}Services restarted${NC}"
}

# Show logs
show_logs() {
    print_section "Recent Logs"

    if [ -f "/tmp/amazon-proxy.log" ]; then
        echo "📄 Amazon proxy logs (last 10 lines):"
        tail -10 /tmp/amazon-proxy.log || echo "  No logs yet"
    fi

    if [ -f "/tmp/payment-proxy.log" ]; then
        echo "📄 Payment proxy logs (last 10 lines):"
        tail -10 /tmp/payment-proxy.log || echo "  No logs yet"
    fi
}

# Quick demo
run_demo() {
    print_section "Quick Demo"

    echo "🎯 Running quick demo flow..."

    # Search for products
    echo "1. Searching for AirPods..."
    curl -s "http://localhost:8787/products?search=airpods&limit=2" | jq '.count' > /dev/null && echo "  ✅ Search successful"

    # Test x402 flow
    echo "2. Testing payment flow..."
    test_x402

    # Check diagnostics
    echo "3. Checking system health..."
    curl -s "http://localhost:8787/diagnostics" | jq '.serpConfigured' > /dev/null && echo "  ✅ Diagnostics accessible"

    echo -e "\n🎉 ${GREEN}Demo completed!${NC}"
}

# Help text
show_help() {
    print_header
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  test       - Test all endpoints and functionality"
    echo "  x402       - Test x402 payment flow specifically"
    echo "  env        - Check environment configuration"
    echo "  ports      - Check port availability"
    echo "  restart    - Restart all services"
    echo "  logs       - Show recent logs"
    echo "  demo       - Run quick demo flow"
    echo "  help       - Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 test              # Full test suite"
    echo "  $0 restart && $0 test # Restart and test"
    echo "  $0 demo              # Quick demo"
    echo ""
}

# Main command dispatcher
case "${1:-help}" in
    "test")
        print_header
        check_environment
        check_ports
        test_endpoints
        test_x402
        ;;
    "x402")
        print_header
        test_x402
        ;;
    "env")
        print_header
        check_environment
        ;;
    "ports")
        print_header
        check_ports
        ;;
    "restart")
        print_header
        restart_services
        ;;
    "logs")
        print_header
        show_logs
        ;;
    "demo")
        print_header
        run_demo
        ;;
    "help"|*)
        show_help
        ;;
esac