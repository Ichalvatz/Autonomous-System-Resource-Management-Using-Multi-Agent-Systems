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

# --- Header ---
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  myWorld Travel - Frontend Setup${NC}"
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

# Check Project Root
if [ ! -f package.json ]; then
  echo -e "${RED}✗ package.json not found. Run this script from the project root.${NC}"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="${SCRIPT_DIR}"
cd "$SCRIPT_DIR"
if [ ! -f "$PROJECT_ROOT/package.json" ]; then
  echo -e "${RED}✗ package.json not found in project root (${PROJECT_ROOT}).${NC}"
  exit 1
fi
cd "$PROJECT_ROOT"

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
    # Fallback: Create default .env avoiding port 3000 conflict
    echo -e "${YELLOW}⚠ .env.example not found, creating default .env...${NC}"
    cat > .env <<EOF
REACT_APP_API_URL=http://localhost:3001
PORT=3000
EOF
    echo -e "${GREEN}✓ Default .env file created${NC}"
  fi
fi

# Load PORT variable for display purposes (safe source)
PORT=3000
if [ -f .env ]; then
  # Extract PORT from .env if it exists, suppressing errors
  ENV_PORT=$(grep "^PORT=" .env | cut -d '=' -f2 || true)
  if [ -n "$ENV_PORT" ]; then PORT=$ENV_PORT; fi
fi

# --- 5. Start Server ---
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Starting Development Server${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "${GRAY}Frontend: ${YELLOW}http://localhost:${PORT}${NC}"
echo ""
echo -e "${GREEN}Starting React...${NC}"
echo -e "${GRAY}Press Ctrl+C to stop${NC}"
echo ""

# Use exec to replace shell with node process (Cleaner signal handling than trap)
exec "$PKG_MANAGER" start "$@"