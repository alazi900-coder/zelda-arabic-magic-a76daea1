# LodePNG WebAssembly Module

This directory contains the WebAssembly build of [LodePNG](https://lodev.org/lodepng/) (compiled via Clang/Emscripten), providing high-speed, lossless PNG encoding and decoding for `unityfs-js`.

## Files
- `lodepng.wasm`: The compiled WebAssembly binary.
- `lodepng-wasm.js`: Direct WASM wrapper for `encode` and `decode`.
- `lodepng-any.js`: Facade with automatic fallback to `UPNG.js`.

## License
LodePNG is licensed under the **zlib License** (Copyright (c) 2005-2024 Lode Vandevenne).
