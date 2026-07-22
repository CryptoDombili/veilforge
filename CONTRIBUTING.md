{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://veilforge.dev/schemas/veilforge-report.schema.json",
  "title": "VeilForge Deterministic Privacy Readiness Report",
  "description": "Canonical project-level output produced by VeilForge v1.8.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion", "scannerVersion", "engine", "projectId", "score", "grade", "status",
    "summary", "exposure", "contracts", "findings", "policies", "exposureChains",
    "treatmentPlan", "files", "sourceHash", "disclaimer", "reportHash"
  ],
  "properties": {
    "schemaVersion": { "type": "string", "const": "1.8" },
    "scannerVersion": { "type": "string", "const": "1.8.0" },
    "engine": {
      "type": "object",
      "additionalProperties": false,
      "required": ["mode", "aiApi", "canonicalHash", "ruleCount"],
      "properties": {
        "mode": { "type": "string", "const": "local-deterministic" },
        "aiApi": { "type": "boolean", "const": false },
        "canonicalHash": { "type": "string", "const": "keccak-256" },
        "ruleCount": { "type": "integer", "minimum": 0 }
      }
    },
    "projectId": { "$ref": "#/$defs/hash" },
    "score": { "type": "integer", "minimum": 0, "maximum": 100 },
    "grade": { "$ref": "#/$defs/grade" },
    "status": { "$ref": "#/$defs/status" },
    "summary": { "$ref": "#/$defs/severitySummary" },
    "exposure": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "sourceFiles", "contracts", "publicStateVariables", "publicMappings",
        "externallyCallableFunctions", "sensitiveSelectors", "sensitiveEvents",
        "crossContractFindings", "restrictedSelectors", "lockedSelectors", "exposureChains"
      ],
      "properties": {
        "sourceFiles": { "type": "integer", "minimum": 0 },
        "contracts": { "type": "integer", "minimum": 0 },
        "publicStateVariables": { "type": "integer", "minimum": 0 },
        "publicMappings": { "type": "integer", "minimum": 0 },
        "externallyCallableFunctions": { "type": "integer", "minimum": 0 },
        "sensitiveSelectors": { "type": "integer", "minimum": 0 },
        "sensitiveEvents": { "type": "integer", "minimum": 0 },
        "crossContractFindings": { "type": "integer", "minimum": 0 },
        "restrictedSelectors": { "type": "integer", "minimum": 0 },
        "lockedSelectors": { "type": "integer", "minimum": 0 },
        "exposureChains": { "type": "integer", "minimum": 0 }
      }
    },
    "contracts": { "type": "array", "items": { "$ref": "#/$defs/contract" } },
    "findings": { "type": "array", "items": { "$ref": "#/$defs/finding" } },
    "policies": { "type": "array", "items": { "$ref": "#/$defs/policy" } },
    "exposureChains": { "type": "array", "items": { "$ref": "#/$defs/exposureChain" } },
    "treatmentPlan": { "type": "array", "items": { "$ref": "#/$defs/treatment" } },
    "files": { "type": "array", "items": { "$ref": "#/$defs/sourceFile" } },
    "sourceHash": { "$ref": "#/$defs/hash" },
    "disclaimer": { "type": "string", "minLength": 1 },
    "reportHash": { "$ref": "#/$defs/hash" }
  },
  "$defs": {
    "hash": { "type": "string", "pattern": "^0x[0-9a-f]{64}$" },
    "status": { "type": "string", "enum": ["Ready", "Review Required", "High Risk", "Deployment Blocked"] },
    "grade": { "type": "string", "enum": ["A", "B", "C", "D", "F"] },
    "severity": { "type": "string", "enum": ["critical", "high", "medium", "low"] },
    "confidence": { "type": "string", "enum": ["high", "medium", "low"] },
    "policyName": { "type": "string", "enum": ["Open", "Restricted", "Locked"] },
    "severitySummary": {
      "type": "object",
      "additionalProperties": false,
      "required": ["critical", "high", "medium", "low", "total"],
      "properties": {
        "critical": { "type": "integer", "minimum": 0 },
        "high": { "type": "integer", "minimum": 0 },
        "medium": { "type": "integer", "minimum": 0 },
        "low": { "type": "integer", "minimum": 0 },
        "total": { "type": "integer", "minimum": 0 }
      }
    },
    "contract": {
      "type": "object",
      "additionalProperties": false,
      "required": ["name", "kind", "file", "score", "grade", "status", "summary", "selectorCount", "policyCounts"],
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "kind": { "type": "string", "minLength": 1 },
        "file": { "type": "string", "minLength": 1 },
        "score": { "type": "integer", "minimum": 0, "maximum": 100 },
        "grade": { "$ref": "#/$defs/grade" },
        "status": { "$ref": "#/$defs/status" },
        "summary": { "$ref": "#/$defs/severitySummary" },
        "selectorCount": { "type": "integer", "minimum": 0 },
        "policyCounts": {
          "type": "object",
          "additionalProperties": false,
          "required": ["Open", "Restricted", "Locked"],
          "properties": {
            "Open": { "type": "integer", "minimum": 0 },
            "Restricted": { "type": "integer", "minimum": 0 },
            "Locked": { "type": "integer", "minimum": 0 }
          }
        }
      }
    },
    "finding": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "ruleId", "title", "description", "severity", "priority", "file", "contractName",
        "functionName", "startLine", "endLine", "evidence", "remediation", "confidence",
        "category", "impact", "suggestedPolicy", "saferPattern", "fingerprint", "customRule"
      ],
      "properties": {
        "ruleId": { "type": "string", "minLength": 1 },
        "title": { "type": "string", "minLength": 1 },
        "description": { "type": "string" },
        "severity": { "$ref": "#/$defs/severity" },
        "priority": { "type": "string", "enum": ["P0", "P1", "P2", "P3"] },
        "file": { "type": "string", "minLength": 1 },
        "contractName": { "type": "string", "minLength": 1 },
        "functionName": { "type": ["string", "null"] },
        "startLine": { "type": "integer", "minimum": 1 },
        "endLine": { "type": "integer", "minimum": 1 },
        "evidence": { "type": "string" },
        "remediation": { "type": "string" },
        "confidence": { "$ref": "#/$defs/confidence" },
        "category": { "type": "string", "minLength": 1 },
        "impact": { "type": "string" },
        "suggestedPolicy": { "$ref": "#/$defs/policyName" },
        "saferPattern": { "type": ["string", "null"] },
        "fingerprint": { "$ref": "#/$defs/hash" },
        "customRule": { "type": "boolean" }
      }
    },
    "policy": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "file", "contractName", "functionName", "signature", "selector", "currentVisibility",
        "recommendation", "reason", "confidence", "startLine", "endLine"
      ],
      "properties": {
        "file": { "type": "string", "minLength": 1 },
        "contractName": { "type": "string", "minLength": 1 },
        "functionName": { "type": "string", "minLength": 1 },
        "signature": { "type": "string", "minLength": 1 },
        "selector": { "type": "string", "pattern": "^0x[0-9a-f]{8}$" },
        "currentVisibility": { "type": "string", "enum": ["public", "external"] },
        "recommendation": { "$ref": "#/$defs/policyName" },
        "reason": { "type": "string", "minLength": 1 },
        "confidence": { "$ref": "#/$defs/confidence" },
        "startLine": { "type": "integer", "minimum": 1 },
        "endLine": { "type": "integer", "minimum": 1 }
      }
    },
    "exposureNode": {
      "type": "object",
      "additionalProperties": false,
      "required": ["type", "label", "detail", "detected"],
      "properties": {
        "type": { "type": "string", "enum": ["Storage", "Function", "Event", "Selector", "Policy"] },
        "label": { "type": "string" },
        "detail": { "type": "string" },
        "detected": { "type": "boolean" }
      }
    },
    "exposureChain": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "findingFingerprint", "ruleId", "severity", "contractName", "file", "startLine", "nodes"],
      "properties": {
        "id": { "$ref": "#/$defs/hash" },
        "findingFingerprint": { "$ref": "#/$defs/hash" },
        "ruleId": { "type": "string", "minLength": 1 },
        "severity": { "$ref": "#/$defs/severity" },
        "contractName": { "type": "string", "minLength": 1 },
        "file": { "type": "string", "minLength": 1 },
        "startLine": { "type": "integer", "minimum": 1 },
        "nodes": { "type": "array", "items": { "$ref": "#/$defs/exposureNode" } }
      }
    },
    "treatment": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id", "priority", "ruleId", "title", "contractName", "file", "startLine", "severity",
        "requiredBeforeDeploy", "action", "rationale", "suggestedPolicy", "saferPattern", "status"
      ],
      "properties": {
        "id": { "$ref": "#/$defs/hash" },
        "priority": { "type": "string", "enum": ["P0", "P1", "P2", "P3"] },
        "ruleId": { "type": "string", "minLength": 1 },
        "title": { "type": "string", "minLength": 1 },
        "contractName": { "type": "string", "minLength": 1 },
        "file": { "type": "string", "minLength": 1 },
        "startLine": { "type": "integer", "minimum": 1 },
        "severity": { "$ref": "#/$defs/severity" },
        "requiredBeforeDeploy": { "type": "boolean" },
        "action": { "type": "string" },
        "rationale": { "type": "string" },
        "suggestedPolicy": { "$ref": "#/$defs/policyName" },
        "saferPattern": { "type": ["string", "null"] },
        "status": { "type": "string", "enum": ["Open"] }
      }
    },
    "sourceFile": {
      "type": "object",
      "additionalProperties": false,
      "required": ["path", "lines"],
      "properties": {
        "path": { "type": "string", "minLength": 1 },
        "lines": { "type": "integer", "minimum": 1 }
      }
    }
  }
}
