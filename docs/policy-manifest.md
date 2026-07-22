# Arc Policy Manifest

VeilForge generates selector-level privacy recommendations using the same parsed functions used by the report.

## Policies

- **Open:** no sensitive semantics or privileged boundary detected; permissionless intent must still be confirmed
- **Restricted:** sensitive, administrative, or already guarded selector
- **Locked:** debug, deprecated, destructive, backdoor-like, or unusually dangerous selector

## Output

```json
{
  "schemaVersion": "1.0",
  "generator": "VeilForge 1.8.0",
  "sourceHash": "0x...",
  "reportHash": "0x...",
  "projectStatus": "Review Required",
  "policies": [
    {
      "contract": "Payroll",
      "selector": "0x12345678",
      "signature": "viewMySalary()",
      "policy": "Restricted",
      "reason": "...",
      "confidence": "high",
      "source": {
        "file": "Payroll.sol",
        "startLine": 20,
        "endLine": 23
      }
    }
  ]
}
```

The manifest schema is `schemas/arc-policy-manifest.schema.json`.

## Important boundary

The manifest is a recommendation artifact, not a deployed APS configuration. Review all selectors and current Arc privacy documentation before using it in a deployment workflow.
