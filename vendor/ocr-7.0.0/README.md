# Vendored local OCR

These assets are served from the app's own origin, lazily downloaded on explicit
recognition, and stored in a separate versioned Cache Storage cache. No CDN is
used by the app's OCR configuration.

- `tesseract.js` **7.0.0**: `dist/tesseract.min.js`, `dist/worker.min.js` and their
  bundled license notices, copied unchanged from the installed npm package.
  Upstream: https://github.com/naptha/tesseract.js/tree/v7.0.0
- `tesseract.js-core` **7.0.0**: the three LSTM-only embedded WASM builds, copied
  unchanged from the installed npm package. The embedded `.wasm.js` files contain
  the WebAssembly bytes; no separate `.wasm` download is required. Tesseract
  selects baseline, SIMD or relaxed SIMD according to device capabilities.
  Legacy recognition is disabled and its builds are not included.
  Upstream: https://github.com/naptha/tesseract.js-core
- German language data: `tesseract-ocr/tessdata_fast`, tag **4.1.0**,
  https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/4.1.0/deu.traineddata
  compressed with gzip, timestamp zero. No model training or modifications.

The included Apache 2.0 licenses cover Tesseract, its core and the language data.
Additional bundled dependency notices are in `*.LICENSE.txt`.
`checksums.json` records SHA-256 digests for the supplied assets and licenses.

The six runtime files total approximately **12.14 MiB** before HTTP compression.
On an asset update, change the directory, `ocr-assets.js` version and checksums,
and bump the app-shell version. Old OCR caches are deliberately not purged by
app-shell updates: an already open older version may still need them.
