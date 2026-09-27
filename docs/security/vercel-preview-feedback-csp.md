# Vercel Preview feedback CSP boundary

The optional `/_next-live/feedback/feedback.js` resource is Vercel Preview toolbar/feedback tooling. It is not loaded, imported, bundled, or required by the VeilForge runtime or the local V4 scanner.

VeilForge intentionally keeps the production `script-src 'self'` policy unchanged. A Preview-only CSP warning for this optional platform resource is therefore non-fatal and must not be resolved by adding an unsafe source, nonce bypass, wildcard, or third-party script permission. Configure/Scan/Review/Verify and the isolated scanner worker remain functional without the feedback script.
