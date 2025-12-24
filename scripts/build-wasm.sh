#!/bin/bash
set -e

# Build a single WASM crate
# Usage: ./build-wasm.sh <crate-name> <output-dir>
# Example: ./build-wasm.sh wasm-astar pkg/wasm_astar

if [ $# -lt 2 ]; then
    echo "Usage: $0 <crate-name> <output-dir>"
    echo "Example: $0 wasm-astar pkg/wasm_astar"
    exit 1
fi

CRATE_NAME=$1
OUTPUT_DIR=$2
THIS_SCRIPTS_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$THIS_SCRIPTS_DIR/.."

echo "==========================================================="
echo "BUILDING $CRATE_NAME TO WASM"
echo "==========================================================="

# Check for required tools
if ! command -v cargo &> /dev/null; then
    echo "Error: cargo not found. Please install Rust: https://rustup.rs/"
    exit 1
fi

if ! command -v wasm-bindgen &> /dev/null; then
    echo "Error: wasm-bindgen not found. Install with: cargo install wasm-bindgen-cli"
    exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Add wasm32 target if not already added
rustup target add wasm32-unknown-unknown 2>/dev/null || true

# Compile to wasm
echo "Compiling $CRATE_NAME to WASM..."
cargo build --target wasm32-unknown-unknown --release --package "$CRATE_NAME"

# Run wasm-bindgen
# Cargo converts hyphens to underscores in output filenames
# Use sed instead of tr for better Alpine Linux compatibility
WASM_FILENAME=$(echo "$CRATE_NAME" | sed 's/-/_/g')
echo "Running wasm-bindgen..."
wasm-bindgen --target web \
    --out-dir "$OUTPUT_DIR" \
    "target/wasm32-unknown-unknown/release/${WASM_FILENAME}.wasm"

# Optimize wasm output with wasm-opt
# Use the converted filename for the output file
if command -v wasm-opt &> /dev/null; then
    echo "Optimizing WASM with wasm-opt..."
    wasm-opt -Os "$OUTPUT_DIR/${WASM_FILENAME}_bg.wasm" -o "$OUTPUT_DIR/${WASM_FILENAME}_bg.wasm"
    echo "WASM optimized with wasm-opt"
else
    echo "Warning: wasm-opt not found. WASM will not be optimized."
    echo "  Install with: npm install -g wasm-opt"
    echo "  Or on Alpine/Debian: apk add binaryen / apt-get install binaryen"
fi

echo "Build complete! Output in $OUTPUT_DIR/"

