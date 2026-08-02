import { stableFingerprint } from './canonical.js';
import { containsSensitiveTerm, matchingSensitiveTerms, hasAccessControl } from './rules.js';

const BASE_ACTORS = Object.freeze([
  { id: 'public-observer', label: 'Public observer', class: 'external', description: 'Reads public storage, calldata, logs and transaction metadata.' },
  { id: 'record-owner', label: 'Record owner', class: 'trusted', description: 'The subject that owns the protected record.' },
  { id: 'operator', label: 'Authorized operator', class: 'privileged', description: 'A scoped application or settlement operator.' },
  { id: 'admin', label: 'Protocol admin', class: 'privileged', description: 'An owner, administrator, guardian or governance role.' },
  { id: 'external-contract', label: 'External contract', class: 'external', description: 'Another contract or integration calling the project.' },
]);

function identifierWords(value) {
  return String(value ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_$-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function title(value) {
  const words = identifierWords(value);
  return words ? words.replace(/\b\w/g, (char) => char.toUpperCase()) : 'Sensitive asset';
}

function parameterName(parameter, index) {
  const cleaned = String(parameter ?? '').replace(/\b(indexed|memory|calldata|storage|payable)\b/g, ' ').trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const candidate = tokens.at(-1);
  return candidate && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(candidate) ? candidate : `parameter${index + 1}`;
}

function sensitivityFor({ visibility = '', kind = '', terms = [] }) {
  if (visibility === 'public' || kind === 'event' || terms.some((term) => ['salary', 'identity', 'medical', 'passport', 'kyc', 'tax', 'bank', 'iban'].includes(term))) return 'Confidential';
  return 'Restricted';
}

function exposureStatus(asset, actorId, findings) {
  const related = findings.filter((finding) => finding.file === asset.file && finding.contractName === asset.contractName);
  const publicLeak = asset.visibility === 'public' || asset.kind === 'event' || related.some((finding) => ['VF001', 'VF002', 'VF008', 'VF011', 'VF012'].includes(finding.ruleId));
  const unguarded = related.some((finding) => ['VF004', 'VF005', 'VF009', 'VF010'].includes(finding.ruleId));

  if (actorId === 'public-observer') return publicLeak ? 'Exposed' : 'Denied';
  if (actorId === 'external-contract') return publicLeak || unguarded ? 'Exposed' : 'Conditional';
  if (actorId === 'record-owner') return 'Allowed';
  if (actorId === 'operator') return unguarded ? 'Exposed' : 'Conditional';
  if (actorId === 'admin') return 'Allowed';
  return 'Conditional';
}

function collectAssets(parsedFiles) {
  const assets = [];
  for (const parsed of parsedFiles) {
    for (const variable of parsed.stateVariables) {
      const context = `${variable.name} ${variable.typeName}`;
      if (!containsSensitiveTerm(context)) continue;
      const terms = matchingSensitiveTerms(context);
      assets.push({
        id: stableFingerprint(['asset', variable.file, variable.contractName, variable.name, variable.startLine]),
        name: variable.name,
        label: title(variable.name),
        kind: 'storage',
        contractName: variable.contractName,
        file: variable.file,
        line: variable.startLine,
        dataType: variable.typeName,
        visibility: variable.visibility,
        terms,
        sensitivity: sensitivityFor({ visibility: variable.visibility, kind: 'storage', terms }),
      });
    }

    for (const event of parsed.events) {
      const context = `${event.name} ${event.parameters.join(' ')}`;
      if (!containsSensitiveTerm(context)) continue;
      const terms = matchingSensitiveTerms(context);
      assets.push({
        id: stableFingerprint(['asset', event.file, event.contractName, event.name, event.startLine, 'event']),
        name: event.name,
        label: `${title(event.name)} payload`,
        kind: 'event',
        contractName: event.contractName,
        file: event.file,
        line: event.startLine,
        dataType: 'event payload',
        visibility: 'public-log',
        terms,
        sensitivity: sensitivityFor({ kind: 'event', terms }),
      });
    }

    for (const fn of parsed.functions) {
      fn.parameters.forEach((parameter, index) => {
        const name = parameterName(parameter, index);
        const context = `${fn.functionName} ${parameter}`;
        if (!containsSensitiveTerm(context)) return;
        const terms = matchingSensitiveTerms(context);
        assets.push({
          id: stableFingerprint(['asset', fn.file, fn.contractName, fn.signature, name, index]),
          name,
          label: title(name),
          kind: 'calldata',
          contractName: fn.contractName,
          functionName: fn.functionName,
          file: fn.file,
          line: fn.startLine,
          dataType: fn.parameterTypes[index] ?? parameter,
          visibility: fn.visibility,
          terms,
          sensitivity: sensitivityFor({ kind: 'calldata', terms }),
        });
      });
    }
  }

  const deduped = new Map();
  for (const asset of assets) deduped.set(`${asset.kind}:${asset.file}:${asset.contractName}:${asset.name}:${asset.line}`, asset);
  return [...deduped.values()].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.name.localeCompare(b.name));
}

function collectActors(parsedFiles) {
  const discovered = new Map(BASE_ACTORS.map((actor) => [actor.id, actor]));
  for (const parsed of parsedFiles) {
    for (const fn of parsed.functions) {
      for (const modifier of fn.modifiers) {
        if (!/^(only|requires?|when)/i.test(modifier) && !/(owner|admin|role|auth|guardian|operator|manager|approver|controller)/i.test(modifier)) continue;
        const id = `role-${modifier.toLowerCase()}`;
        discovered.set(id, {
          id,
          label: title(modifier),
          class: 'project-role',
          description: `Project role inferred from the ${modifier} modifier.`,
        });
      }
    }
  }
  return [...discovered.values()];
}

function buildGraph(parsedFiles, assets, findings, policies) {
  const nodes = [];
  const edges = [];
  const addNode = (node) => nodes.push(node);
  const addEdge = (from, to, type, detail) => edges.push({ id: stableFingerprint(['edge', from, to, type, detail]), from, to, type, detail });

  for (const parsed of parsedFiles) {
    const fileId = stableFingerprint(['file', parsed.source.path]);
    addNode({ id: fileId, type: 'file', label: parsed.source.path, file: parsed.source.path, line: 1, risk: 'context' });
    for (const contract of parsed.contracts.filter((item) => item.kind !== 'interface')) {
      const contractId = stableFingerprint(['contract', contract.file, contract.name]);
      addNode({ id: contractId, type: 'contract', label: contract.name, file: contract.file, line: contract.startLine, risk: 'context' });
      addEdge(fileId, contractId, 'declares', `${contract.kind} declaration`);
    }
    for (const fn of parsed.functions.filter((item) => item.contractKind !== 'interface')) {
      const contractId = stableFingerprint(['contract', fn.file, fn.contractName]);
      const fnId = stableFingerprint(['function', fn.file, fn.contractName, fn.signature]);
      addNode({ id: fnId, type: 'function', label: fn.signature, file: fn.file, line: fn.startLine, risk: hasAccessControl(fn.source, fn.modifiers) ? 'guarded' : 'reachable' });
      addEdge(contractId, fnId, 'exposes', `${fn.visibility} ${fn.stateMutability}`);
      for (const asset of assets.filter((item) => item.file === fn.file && item.contractName === fn.contractName)) {
        if (fn.body.includes(asset.name) || fn.source.includes(asset.name) || asset.functionName === fn.functionName) {
          addEdge(fnId, asset.id, asset.kind === 'calldata' ? 'receives' : 'touches', `Source evidence references ${asset.name}`);
        }
      }
    }
  }

  for (const asset of assets) addNode({ id: asset.id, type: 'asset', label: asset.label, file: asset.file, line: asset.line, risk: asset.sensitivity.toLowerCase() });
  for (const policy of policies) {
    const fnId = stableFingerprint(['function', policy.file, policy.contractName, policy.signature]);
    const policyId = stableFingerprint(['policy', policy.file, policy.contractName, policy.selector]);
    addNode({ id: policyId, type: 'policy', label: `${policy.recommendation} · ${policy.selector}`, file: policy.file, line: policy.startLine, risk: policy.recommendation.toLowerCase() });
    addEdge(fnId, policyId, 'governed-by', policy.reason);
  }
  for (const finding of findings) {
    const findingId = stableFingerprint(['finding-node', finding.fingerprint]);
    addNode({ id: findingId, type: 'finding', label: `${finding.ruleId} · ${finding.title}`, file: finding.file, line: finding.startLine, risk: finding.severity });
    const relatedAssets = assets.filter((asset) => asset.file === finding.file && asset.contractName === finding.contractName);
    for (const asset of relatedAssets.slice(0, 4)) addEdge(asset.id, findingId, 'exposed-by', finding.category);
  }

  const uniqueNodes = new Map(nodes.map((node) => [node.id, node]));
  const uniqueEdges = new Map(edges.map((edge) => [edge.id, edge]));
  return { nodes: [...uniqueNodes.values()], edges: [...uniqueEdges.values()] };
}

export function buildPrivacyGenome(parsedFiles, findings, policies) {
  const assets = collectAssets(parsedFiles);
  const actors = collectActors(parsedFiles);
  const matrix = assets.map((asset) => ({
    assetId: asset.id,
    asset: asset.label,
    sensitivity: asset.sensitivity,
    channels: actors.map((actor) => ({ actorId: actor.id, actor: actor.label, status: exposureStatus(asset, actor.id, findings) })),
  }));
  const graph = buildGraph(parsedFiles, assets, findings, policies);
  const publicExposures = matrix.reduce((count, row) => count + row.channels.filter((entry) => entry.status === 'Exposed').length, 0);
  const permanentAssets = assets.filter((asset) => asset.kind === 'event' || asset.visibility === 'public').length;
  const blastRadius = Math.min(10, Number(((publicExposures * 0.8) + (permanentAssets * 0.55) + (findings.length * 0.2)).toFixed(1)));
  const identityLinkability = Math.min(100, Math.round((assets.filter((asset) => asset.terms.some((term) => ['identity', 'employee', 'customer', 'recipient', 'beneficiary', 'account', 'passport', 'kyc'].includes(term))).length / Math.max(1, assets.length)) * 100 + publicExposures * 3));

  return {
    version: '3.2',
    assets,
    actors,
    disclosureMatrix: matrix,
    graph,
    metrics: {
      sensitiveAssets: assets.length,
      actors: actors.length,
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      publicExposures,
      permanentAssets,
      blastRadius,
      identityLinkability: Math.min(100, identityLinkability),
    },
  };
}
