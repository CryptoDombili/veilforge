import { stableFingerprint } from './canonical.js';

const VISIBILITY_VALUES = Object.freeze({
  publicObserver: new Set(['allowed', 'denied']),
  externalContract: new Set(['allowed', 'restricted', 'denied']),
  recordOwner: new Set(['allowed', 'restricted']),
});

function normalizeChoice(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}

function normalizeDeclaration(value = {}) {
  const defaults = value.defaults ?? value;
  const controls = value.controls ?? value;
  return {
    defaults: {
      publicObserver: normalizeChoice(defaults.publicObserver, VISIBILITY_VALUES.publicObserver, 'denied'),
      externalContract: normalizeChoice(defaults.externalContract, VISIBILITY_VALUES.externalContract, 'restricted'),
      recordOwner: normalizeChoice(defaults.recordOwner, VISIBILITY_VALUES.recordOwner, 'allowed'),
    },
    controls: {
      requireLeastPrivilege: controls.requireLeastPrivilege !== false,
      requireRevocationPath: controls.requireRevocationPath !== false,
      prohibitSensitiveRevertData: controls.prohibitSensitiveRevertData !== false,
      requireDeploymentLineage: controls.requireDeploymentLineage !== false,
    },
  };
}

function yamlList(items, indent = 4) {
  const pad = ' '.repeat(indent);
  return items.length ? items.map((item) => `${pad}- ${item}`).join('\n') : `${pad}- none`;
}

function assetKey(asset, index) {
  return String(asset.name || `asset_${index + 1}`).replace(/[^A-Za-z0-9_]/g, '_').toLowerCase();
}

export function buildPrivacyIntent(genome, findings, declaredIntent) {
  const declaration = normalizeDeclaration(declaredIntent);
  const assets = genome.assets.slice(0, 24);
  const violations = [];
  for (const row of genome.disclosureMatrix) {
    const publicExposure = row.channels.find((entry) => entry.actorId === 'public-observer' && entry.status === 'Exposed');
    const externalExposure = row.channels.find((entry) => entry.actorId === 'external-contract' && entry.status === 'Exposed');
    if (publicExposure && declaration.defaults.publicObserver !== 'allowed') violations.push({
      id: stableFingerprint(['intent-violation', row.assetId, 'public']),
      assetId: row.assetId,
      asset: row.asset,
      actor: publicExposure.actor,
      severity: row.sensitivity === 'Confidential' ? 'critical' : 'high',
      rule: 'Confidential assets must not be visible to a public observer.',
    });
    if (externalExposure && declaration.defaults.externalContract !== 'allowed') violations.push({
      id: stableFingerprint(['intent-violation', row.assetId, 'external']),
      assetId: row.assetId,
      asset: row.asset,
      actor: externalExposure.actor,
      severity: declaration.defaults.externalContract === 'denied' ? 'critical' : 'high',
      rule: declaration.defaults.externalContract === 'denied'
        ? 'The declared policy denies external-contract visibility.'
        : 'External contracts require an explicit restricted policy.',
    });
  }

  if (declaration.controls.prohibitSensitiveRevertData) {
    for (const finding of findings.filter((item) => item.ruleId === 'VF003')) violations.push({
      id: stableFingerprint(['intent-control-violation', finding.fingerprint, 'revert-data']),
      assetId: null,
      asset: finding.title,
      actor: 'Execution observer',
      severity: finding.severity,
      rule: 'The declared policy prohibits sensitive revert data.',
    });
  }

  const penalty = violations.reduce((total, item) => total + (item.severity === 'critical' ? 18 : 10), 0);
  const complianceScore = Math.max(0, 100 - penalty);
  const document = [
    'version: "3.2"',
    'mode: local-deterministic',
    'defaults:',
    `  public_observer: ${declaration.defaults.publicObserver}`,
    `  external_contract: ${declaration.defaults.externalContract}`,
    `  record_owner: ${declaration.defaults.recordOwner}`,
    'assets:',
    ...(assets.length ? assets.flatMap((asset, index) => [
      `  ${assetKey(asset, index)}:`,
      `    classification: ${asset.sensitivity.toLowerCase()}`,
      `    source: "${asset.file}:${asset.line}"`,
      '    visible_to:',
      yamlList(['record_owner', 'protocol_admin'], 6),
      '    hidden_from:',
      yamlList(['public_observer'], 6),
      '    prohibited_channels:',
      yamlList(['raw_event', 'unrestricted_getter'], 6),
    ]) : ['  none: {}']),
    'controls:',
    `  require_least_privilege: ${declaration.controls.requireLeastPrivilege}`,
    `  require_revocation_path: ${declaration.controls.requireRevocationPath}`,
    `  prohibit_sensitive_revert_data: ${declaration.controls.prohibitSensitiveRevertData}`,
    `  require_deployment_lineage: ${declaration.controls.requireDeploymentLineage}`,
    '',
  ].join('\n');

  return {
    version: '3.2',
    declarationSource: declaredIntent ? 'user-declared' : 'default-profile',
    declaration,
    profile: genome.assets.some((asset) => asset.terms.includes('payroll') || asset.terms.includes('salary')) ? 'Arc Payroll' : 'Arc Custom',
    complianceScore,
    status: violations.length === 0 ? 'Compliant' : complianceScore >= 75 ? 'Review required' : 'Policy violated',
    declaredAssets: assets.length,
    violations,
    linkedFindings: findings.map((finding) => finding.fingerprint),
    document,
  };
}
