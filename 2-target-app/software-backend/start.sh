#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# --- Configuration & Colors ---
# Only use colors if connected to a terminal (fixes CI/CD logs)
if [ -t 1 ]; then
  CYAN='\033[0;36m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  RED='\033[0;31m'
  GRAY='\033[0;90m'
  NC='\033[0m' # No Color
else
  CYAN='' GREEN='' YELLOW='' RED='' GRAY='' NC=''
fi

# Determine script directory and project root (script is now in root where package.json lives)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

# Move to project root so all relative checks work as expected
cd "$PROJECT_ROOT" || { echo -e "${RED}✗ Failed to cd to project root: $PROJECT_ROOT${NC}"; exit 1; }

# --- Header ---
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  myWorld Travel - Backend Setup${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# --- 1. Safety Checks ---

# Check Node.js
if ! command -v node >/dev/null 2>&1; then
  echo -e "${RED}✗ Node.js is not installed!${NC}"
  exit 1
fi
echo -e "${GRAY}✓ Node.js $(node --version) detected${NC}"

# Check .nvmrc (Advisory)
if [ -f .nvmrc ]; then
  desired="$(cat .nvmrc)"
  echo -e "${GRAY}ℹ .nvmrc specifies Node ${desired}${NC}"
fi

# Check Project Root: package.json must exist in resolved project root
if [ ! -f package.json ]; then
  echo -e "${RED}✗ package.json not found in project root (${PROJECT_ROOT}). Run this script from the scripts folder or ensure package.json exists up the tree.${NC}"
  exit 1
fi

# --- 2. Detect Package Manager ---
PKG_MANAGER="npm"
if command -v pnpm >/dev/null 2>&1; then
  PKG_MANAGER="pnpm"
elif command -v yarn >/dev/null 2>&1; then
  PKG_MANAGER="yarn"
fi
echo -e "${GRAY}✓ Using package manager: $PKG_MANAGER${NC}"
echo ""

# --- 3. Install Dependencies (Smart) ---
if [ ! -d "node_modules" ]; then
  echo -e "${YELLOW}Dependencies not found. Installing...${NC}"
  
  if [ "$PKG_MANAGER" = "npm" ] && [ -f package-lock.json ]; then
     # 'npm ci' is faster and safer for consistency
     echo -e "${GRAY}  Running npm ci...${NC}"
     npm ci
  else
     "$PKG_MANAGER" install
  fi
  
  echo -e "${GREEN}✓ Dependencies installed successfully!${NC}"
else
  echo -e "${GREEN}✓ Dependencies found. Skipping install.${NC}"
fi
echo ""

# --- 4. Environment Configuration ---
echo -e "${CYAN}--- Configuration ---${NC}"

if [ -f .env ]; then
  echo -e "${GREEN}✓ .env file exists${NC}"
else
  if [ -f .env.example ]; then
    echo -e "${YELLOW}Creating .env file from .env.example...${NC}"
    cp .env.example .env
    echo -e "${GREEN}✓ .env file created${NC}"
  else
    # Fallback: Create default .env for backend API
    echo -e "${YELLOW}⚠ .env.example not found in project root, creating default .env...${NC}"
    cat > .env <<EOF
PORT=3001
NODE_ENV=production
JWT_SECRET=change-this-secret-in-production
MONGODB_URI=mongodb://localhost:27017/myworld
EOF
    echo -e "${GREEN}✓ Default .env file created${NC}"
  fi
fi

# Load environment variables from .env for display and mode detection
PORT=3001
NODE_ENV_FROM_FILE=""
if [ -f .env ]; then
  # Extract PORT from .env if it exists, suppressing errors
  ENV_PORT=$(grep "^PORT=" .env | cut -d '=' -f2 | tr -d '[:space:]' || true)
  if [ -n "$ENV_PORT" ]; then PORT=$ENV_PORT; fi
  
  # Extract NODE_ENV from .env if it exists
  NODE_ENV_FROM_FILE=$(grep "^NODE_ENV=" .env | cut -d '=' -f2 | tr -d '[:space:]' || true)
fi

# Determine effective NODE_ENV (environment variable takes precedence over .env file)
EFFECTIVE_NODE_ENV="${NODE_ENV:-$NODE_ENV_FROM_FILE}"

# --- 5. Start Server ---
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Starting Development Server${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "${GRAY}Backend API: ${YELLOW}http://localhost:${PORT}${NC}"
echo -e "${GRAY}Environment: ${YELLOW}${EFFECTIVE_NODE_ENV:-production}${NC}"
echo ""

# Use exec to replace shell with the appropriate process.
# If NODE_ENV=development (from environment or .env), run dev mode with nodemon (non-daemon, auto-reload).
if [ "$EFFECTIVE_NODE_ENV" = "development" ] || [ "${DEV:-}" = "true" ]; then
  echo -e "${GREEN}Starting in DEVELOPMENT mode (nodemon with auto-reload)...${NC}"
  echo -e "${GRAY}Press Ctrl+C to stop${NC}"
  echo ""
  if [ "$PKG_MANAGER" = "yarn" ]; then
    exec "$PKG_MANAGER" dev "$@"
  else
    exec "$PKG_MANAGER" run dev "$@"
  fi
else
  echo -e "${GREEN}Starting in PRODUCTION mode...${NC}"
  echo -e "${GRAY}Press Ctrl+C to stop${NC}"
  echo ""
  exec "$PKG_MANAGER" start "$@"
fi
