#!/bin/bash
set -e

# Colors for better output
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Setting up Teleprompter development environment...${NC}"

# Check if local SDK is available
if [ -d "/app/node_modules/@mentra/sdk" ] && [ -f "/app/node_modules/@mentra/sdk/package.json" ]; then
  echo -e "${YELLOW}Local SDK found. Using local version...${NC}"
  # Local SDK will be mounted via volume
else
  echo -e "${YELLOW}Local SDK not found. Using published version...${NC}"
fi

# Check and update submodules if needed
if [ -f "/.dockerenv" ] || [ ! -d ".git" ]; then
  echo -e "${YELLOW}Running in Docker or .git not found, skipping submodule initialization${NC}"
else
  echo -e "${YELLOW}Initializing and updating git submodules...${NC}"
  git submodule init
  git submodule update
fi

# Install dependencies
echo "Installing dependencies..."
bun install

echo -e "${GREEN}✅ Setup complete!${NC}"
echo -e "${YELLOW}To start development:${NC}"
echo "  bun run dev        # Local development"
echo "  bun run docker:dev # Docker development"