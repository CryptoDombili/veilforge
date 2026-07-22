# Deterministic exposure chains

Exposure chains connect source elements that VeilForge can observe directly.

Typical path:

```text
Sensitive storage
      ↓
Externally callable function
      ↓
Event emission
      ↓
Function selector
      ↓
Recommended policy
```

## Construction rules

A function chain is generated when at least one of these is true:

- the function source references a semantically sensitive state variable
- the function emits an event declared in the same contract
- a finding overlaps the function or linked source declaration
- the function has a non-open policy recommendation

Public sensitive state can also produce an automatic-getter chain.

## What chains do not claim

Exposure chains are not bytecode taint analysis. They do not prove that a specific runtime value reaches every node. They visualize observed lexical and AST-backed relationships so a reviewer can navigate the source and policy boundary quickly.

Every node links back to a file and source line in the web interface.
