{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://veilforge.dev/schemas/arc-policy-manifest.schema.json",
  "title": "VeilForge Arc Policy Manifest",
  "description": "Selector-level policy recommendations derived from a canonical VeilForge report.",
  "type": "object",
  "additionalProperties": false,
  "required": ["schemaVersion", "generator", "sourceHash", "reportHash", "projectStatus", "policies"],
  "properties": {
    "schemaVersion": { "type": "string", "const": "1.0" },
    "generator": { "type": "string", "const": "VeilForge 1.8.0" },
    "sourceHash": { "$ref": "#/$defs/hash" },
    "reportHash": { "$ref": "#/$defs/hash" },
    "projectStatus": { "$ref": "#/$defs/status" },
    "policies": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["contract", "selector", "signature", "policy", "reason", "confidence", "source"],
        "properties": {
          "contract": { "type": "string", "minLength": 1 },
          "selector": { "type": "string", "pattern": "^0x[0-9a-f]{8}$" },
          "signature": { "type": "string", "minLength": 1 },
          "policy": { "type": "string", "enum": ["Open", "Restricted", "Locked"] },
          "reason": { "type": "string", "minLength": 1 },
          "confidence": { "type": "string", "enum": ["high", "medium", "low"] },
          "source": {
            "type": "object",
            "additionalProperties": false,
            "required": ["file", "startLine", "endLine"],
            "properties": {
              "file": { "type": "string", "minLength": 1 },
              "startLine": { "type": "integer", "minimum": 1 },
              "endLine": { "type": "integer", "minimum": 1 }
            }
          }
        }
      }
    }
  },
  "$defs": {
    "hash": { "type": "string", "pattern": "^0x[0-9a-f]{64}$" },
    "status": { "type": "string", "enum": ["Ready", "Review Required", "High Risk", "Deployment Blocked"] }
  }
}
