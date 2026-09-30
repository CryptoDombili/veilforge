# Vercel Preview feedback CSP boundary

The optional `/_next-live/feedback/feedback.js` resource is Vercel Preview toolbar/feedback tooling. It is not loaded, imported, bundled, or required by the VeilForge runtime or the local V4 scanner.

VeilForge keeps production scripts same-origin. The only additional script capability is the standard `'wasm-unsafe-eval'` keyword required by the pinned local solc WebAssembly compiler; this does not permit JavaScript `eval()` or `new Function()`. A Preview-only CSP warning for an optional platform resource is non-fatal and must not be resolved by adding an unsafe source, nonce bypass, wildcard, or third-party script permission. Configure/Scan/Review/Verify and the isolated scanner worker remain functional without the feedback script.
