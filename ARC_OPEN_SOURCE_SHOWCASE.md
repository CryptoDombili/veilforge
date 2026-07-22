import { stableFingerprint } from './canonical.js';

function findFunction(parsedFiles, finding) {
  const parsed = parsedFiles.find((item) => item.source.path === finding.file);
  if (!parsed) return null;
  if (finding.functionName) {
    const byName = parsed.functions.find((fn) => fn.contractName === finding.contractName && fn.functionName === finding.functionName);
    if (byName) return byName;
  }
  return parsed.functions.find((fn) => finding.startLine >= fn.startLine && finding.startLine <= fn.endLine) ?? null;
}

function findStorage(parsedFiles, finding) {
  const parsed = parsedFiles.find((item) => item.source.path === finding.file);
  if (!parsed) return null;
  const direct = parsed.stateVariables.find((variable) => finding.startLine >= variable.startLine && finding.startLine <= variable.endLine);
  if (direct) return direct;
  return parsed.stateVariables.find((variable) =>
    variable.contractName === finding.contractName &&
    finding.evidence.toLowerCase().includes(variable.name.toLowerCase())) ?? null;
}

function findEvent(parsedFiles, finding) {
  const parsed = parsedFiles.find((item) => item.source.path === finding.file);
  if (!parsed) return null;
  const declaration = parsed.events.find((event) => finding.startLine >= event.startLine && finding.startLine <= event.endLine);
  if (declaration) return declaration;
  const emitName = finding.evidence.match(/\bemit\s+([A-Za-z_$][A-Za-z0-9_$]*)/)?.[1];
  return emitName ? parsed.events.find((event) => event.name === emitName && event.contractName === finding.contractName) ?? null : null;
}

export function buildExposureChains(parsedFiles, findings, policies) {
  return findings.map((finding) => {
    const fn = findFunction(parsedFiles, finding);
    const storage = findStorage(parsedFiles, finding);
    const event = findEvent(parsedFiles, finding);
    const policy = fn
      ? policies.find((item) => item.file === fn.file && item.contractName === fn.contractName && item.signature === fn.signature)
      : policies.find((item) => item.contractName === finding.contractName && item.recommendation === finding.suggestedPolicy);

    const nodes = [
      {
        type: 'Storage',
        label: storage ? storage.name : 'No direct storage node',
        detail: storage ? `${storage.visibility} ${storage.typeName}` : 'The rule matched a flow, API, or control boundary rather than one declaration.',
        detected: Boolean(storage),
      },
      {
        type: 'Function',
        label: fn ? fn.functionName : finding.functionName ?? 'No enclosing function',
        detail: fn ? fn.signature : `${finding.file}:${finding.startLine}`,
        detected: Boolean(fn),
      },
      {
        type: 'Event',
        label: event ? event.name : 'No event node',
        detail: event ? event.parameters.join(', ') : 'No event declaration or emission was associated with this finding.',
        detected: Boolean(event),
      },
      {
        type: 'Selector',
        label: fn?.selector ?? 'No selector',
        detail: fn?.signature ?? 'Not an externally callable selector finding.',
        detected: Boolean(fn?.selector),
      },
      {
        type: 'Policy',
        label: policy?.recommendation ?? finding.suggestedPolicy,
        detail: policy?.reason ?? 'Policy inherited from the deterministic remediation playbook.',
        detected: true,
      },
    ];

    return {
      id: stableFingerprint(['chain', finding.fingerprint]),
      findingFingerprint: finding.fingerprint,
      ruleId: finding.ruleId,
      severity: finding.severity,
      contractName: finding.contractName,
      file: finding.file,
      startLine: finding.startLine,
      nodes,
    };
  });
}
