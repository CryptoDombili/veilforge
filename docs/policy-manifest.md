# Arc Policy Manifest

The Arc Policy Manifest is an exportable, forward-looking selector recommendation document.

```json
{
  "schemaVersion": "1.0",
  "generatedBy": "VeilForge v1.8.0",
  "sourceHash": "0x...",
  "reportHash": "0x...",
  "readinessScore": 72,
  "triageStatus": "review-required",
  "selectors": [
    {
      "contractName": "Payroll",
      "file": "Payroll.sol",
      "signature": "getSalary(address)",
      "policy": "restricted",
      "confidence": "high",
      "reason": "..."
    }
  ]
}
```

## Policies

- `open`: broad access may be intentional
- `restricted`: an explicit grant or authorization boundary is recommended
- `locked`: the selector should be unavailable by default

The manifest is guidance, not an executable APS configuration. Arc's official documentation currently describes APS as roadmap functionality that is not yet available, and its interfaces may evolve.

Schema: `schemas/policy-manifest.schema.json`.
