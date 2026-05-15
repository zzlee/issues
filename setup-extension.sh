#!/bin/bash

# Set colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

OLD_DIR="issues-manager-extension"
NEW_DIR=".pi/extensions/issues-manager-extension"
EXTENSION_DIR="$NEW_DIR"
PACKAGE_JSON="$EXTENSION_DIR/package.json"

echo -e "${BLUE}Starting setup for extension...${NC}"

# 1. Move the extension to the new location if it's still in the old one
if [ -d "$OLD_DIR" ]; then
    echo -e "${BLUE}Moving $OLD_DIR to $NEW_DIR...${NC}"
    mkdir -p ".pi/extensions"
    
    # If there's a symlink or existing entry at the destination, remove it first to avoid conflicts
    if [ -L "$NEW_DIR" ] || [ -e "$NEW_DIR" ]; then
        echo "Cleaning up existing entry at $NEW_DIR..."
        rm -rf "$NEW_DIR"
    fi

    mv "$OLD_DIR" "$NEW_DIR"
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Successfully moved extension.${NC}"
    else
        echo -e "${RED}Failed to move extension!${NC}"
        exit 1
    fi
elif [ -d "$NEW_DIR" ]; then
    echo -e "${BLUE}Extension is already in the correct location ($NEW_DIR).${NC}"
else
    echo -e "${RED}Error: Extension directory not found in $OLD_DIR or $NEW_DIR!${NC}"
    exit 1
fi

# 2. Update package.json with pi field using jq
if [ -f "$PACKAGE_JSON" ]; then
    echo "Checking $PACKAGE_JSON for pi configuration..."
    
    # Check if 'pi' field already exists
    HAS_PI=$(jq 'has("pi")' "$PACKAGE_JSON")

    if [ "$HAS_PI" = "true" ]; then
        echo "Pi field already exists in $PACKAGE_JSON. Skipping update."
    else
        echo "Adding pi field to $PACKAGE_JSON..."
        # Add the pi field to the JSON object
        jq '. + {"pi": {"extensions": ["./src/index.ts"]}}' "$PACKAGE_JSON" > "$PACKAGE_JSON.tmp" && mv "$PACKAGE_JSON.tmp" "$PACKAGE_JSON"
        echo -e "${GREEN}Successfully updated $PACKAGE_JSON.${NC}"
    fi
else
    echo -e "${RED}Error: $PACKAGE_JSON not found!${NC}"
    exit 1
fi

# 3. Run npm install in the extension directory
if command -v npm >/dev/null 2>&1; then
    echo -e "${BLUE}Running 'npm install' in $EXTENSION_DIR... This may take a moment.${NC}"
    (cd "$EXTENSION_DIR" && npm install)
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}npm install completed successfully.${NC}"
    else
        echo -e "${RED}npm install failed! Please check the errors above.${NC}"
        exit 1
    fi
else
    echo -e "${RED}Error: 'npm' is not installed. Please install Node.js and npm first.${NC}"
    exit 1
fi

echo -e "${GREEN}Setup complete! Your extension is now located in $NEW_DIR and will load automatically when running 'pi' in this directory.${NC}"
echo -e "${BLUE}Note: Since the extension is now inside .pi/, it may be ignored by Git if .pi/ is in your .gitignore.${NC}"
