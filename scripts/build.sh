#!/bin/bash
set -e # If any command fails, script exits immediately

echo "==========================================================="
echo "BUILDING ALL WASM MODULES"
echo "==========================================================="

THIS_SCRIPTS_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$THIS_SCRIPTS_DIR/.."

# Clean previous build
if [ -d "pkg" ]; then
    rm -rf "pkg"
fi

# Build all WASM modules using the helper script
echo "Building wasm-astar..."
./scripts/build-wasm.sh wasm-astar pkg/wasm_astar

echo "Building wasm-preprocess..."
./scripts/build-wasm.sh wasm-preprocess pkg/wasm_preprocess

echo "==========================================================="
echo "ALL WASM MODULES BUILT SUCCESSFULLY"
echo "==========================================================="
