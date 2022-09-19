TARGET=wasm32-unknown-unknown
PROFILE=release

# Building WASM
AR=/usr/local/opt/llvm/bin/llvm-ar CC=/usr/local/opt/llvm/bin/clang cargo build --target=$TARGET --$PROFILE
# EMCC_CFLAGS="-s ERROR_ON_UNDEFINED_SYMBOLS=0 --no-entry" cargo build --target=wasm32-unknown-emscripten --release
# Generating bindings
AR=/usr/local/opt/llvm/bin/llvm-ar CC=/usr/local/opt/llvm/bin/clang wasm-bindgen --out-dir=wasm --target=web --omit-default-module-path ../../target/$TARGET/$PROFILE/wasm_dpp.wasm
# EMCC_CFLAGS="-s ERROR_ON_UNDEFINED_SYMBOLS=0 --no-entry" wasm-bindgen --out-dir=wasm --target=web --omit-default-module-path ../../target/wasm32-unknown-emscripten/release/wasm_dpp.wasm

echo "Optimizing wasm using Binaryen"
wasm-opt -Os wasm/wasm_dpp_bg.wasm -o wasm/wasm_dpp_bg_optimized.wasm

# Converting wasm into bease64 so it can be bundled
WASM_BUILD_BASE_64=$(base64 wasm/wasm_dpp_bg_optimized.wasm)
echo 'module.exports = "'${WASM_BUILD_BASE_64}'"' > wasm/wasm_dpp_bg.js

# The module is in typescript so it's easier to generate typings
# Building a distributable library with Webpack
yarn workspace @dashevo/wasm-dpp webpack
