function proofLabNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function proofLabFoundryResults(value, output = []) {
  if (!value || typeof value !== 'object') return output;
  if (value.test_results && typeof value.test_results === 'object') output.push(...Object.values(value.test_results));
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') proofLabFoundryResults(child, output);
  }
  return output;
}

export function parseProofLabReceipt(input, receiptName = 'test receipt.json') {
  const parsed = typeof input === 'string' ? JSON.parse(input) : input;
  if (!parsed || typeof parsed !== 'object') throw new Error('The test receipt must be a JSON object.');
  const foundryResults = proofLabFoundryResults(parsed);
  const explicitTests = parsed.tests && !Array.isArray(parsed.tests) ? parsed.tests : parsed.summary?.tests || null;
  const mochaStats = parsed.stats || null;
  let total = proofLabNumber(explicitTests?.total ?? explicitTests?.tests ?? mochaStats?.tests, foundryResults.length);
  let failed = proofLabNumber(explicitTests?.failed ?? explicitTests?.failures ?? mochaStats?.failures);
  let skipped = proofLabNumber(explicitTests?.skipped ?? explicitTests?.pending ?? mochaStats?.pending);
  let passed = proofLabNumber(explicitTests?.passed ?? explicitTests?.passes ?? mochaStats?.passes, Math.max(0, total - failed - skipped));
  if (foundryResults.length) {
    total = foundryResults.length;
    failed = foundryResults.filter((result) => /fail|revert|error/i.test(String(result?.status || result?.kind || ''))).length;
    skipped = foundryResults.filter((result) => /skip|pending/i.test(String(result?.status || result?.kind || ''))).length;
    passed = Math.max(0, total - failed - skipped);
  }
  const framework = parsed.framework || (foundryResults.length ? 'Foundry' : mochaStats ? 'Hardhat / Mocha' : 'VeilForge receipt');
  const fuzz = parsed.fuzz || parsed.summary?.fuzz || {};
  const storage = parsed.storageLayout || parsed.storage_layout || {};
  const explicitCompilation = parsed.compilation?.success ?? parsed.compile?.success ?? parsed.compiled;
  const compilationPassed = explicitCompilation === undefined ? total > 0 : Boolean(explicitCompilation);
  if (!total && explicitCompilation === undefined) throw new Error('No recognizable Foundry, Hardhat/Mocha or VeilForge test summary was found.');
  return {
    version: '3.2-proof-receipt',
    receiptName,
    framework,
    compilationPassed,
    tests: { total, passed, failed, skipped, durationMs: proofLabNumber(explicitTests?.durationMs ?? mochaStats?.duration) },
    fuzz: {
      runs: proofLabNumber(fuzz.runs ?? fuzz.totalRuns ?? parsed.fuzzRuns ?? parsed.fuzz_runs),
      failures: proofLabNumber(fuzz.failures ?? fuzz.failed ?? parsed.fuzzFailures),
    },
    storageLayoutSafe: typeof storage.safe === 'boolean' ? storage.safe : typeof parsed.storageLayoutSafe === 'boolean' ? parsed.storageLayoutSafe : null,
    sourceHash: parsed.sourceHash || parsed.source_hash || null,
    command: parsed.command || null,
  };
}

export function buildProofLabSnapshot({ report, projectXray, artifact, bytecodeVerification, receipt, receiptName = '', hash }) {
  const upgradeable = Boolean(projectXray?.upgradeable);
  const sourceMismatch = Boolean(receipt?.sourceHash && report?.sourceHash && receipt.sourceHash !== report.sourceHash);
  const checks = [
    { id: 'source', label: 'Canonical source baseline', detail: report?.sourceHash || 'No scan report', status: report ? 'pass' : 'block' },
    { id: 'privacy', label: 'Privacy regression gate', detail: report ? `${report.summary.critical} critical · ${report.summary.high} high` : 'No findings baseline', status: report && !report.summary.critical && !report.summary.high ? 'pass' : 'block' },
    { id: 'forge', label: 'Candidate patch review', detail: report ? `${report.forgePlan.summary.candidateReady} automatic · ${report.forgePlan.summary.engineeringReview} manual` : 'Forge plan unavailable', status: report?.forgePlan.summary.engineeringReview ? 'review' : report ? 'pass' : 'block' },
    { id: 'artifact', label: 'Compiler runtime artifact', detail: artifact ? `${artifact.contractName} · ${artifact.compilerVersion}` : 'Foundry/Hardhat artifact required', status: artifact ? 'pass' : 'review' },
    { id: 'compile', label: 'Compiler-backed build', detail: receipt ? `${receipt.framework} receipt` : 'Test receipt required', status: receipt ? receipt.compilationPassed ? 'pass' : 'block' : 'review' },
    { id: 'tests', label: 'Regression test suite', detail: receipt ? `${receipt.tests.passed}/${receipt.tests.total} passed · ${receipt.tests.failed} failed` : 'No test execution evidence', status: receipt ? receipt.tests.total > 0 && receipt.tests.failed === 0 ? 'pass' : 'block' : 'review' },
    { id: 'fuzz', label: 'Privacy fuzz campaign', detail: receipt?.fuzz.runs ? `${receipt.fuzz.runs} runs · ${receipt.fuzz.failures} failures` : `${report?.fuzzPlan?.summary?.vectors || 0} vectors generated; execution required`, status: receipt?.fuzz.runs ? receipt.fuzz.runs >= 1024 && receipt.fuzz.failures === 0 ? 'pass' : 'block' : 'review' },
    { id: 'storage', label: 'Upgradeable storage layout', detail: upgradeable ? receipt?.storageLayoutSafe === true ? 'Compatible layout reported' : receipt?.storageLayoutSafe === false ? 'Unsafe layout reported' : 'Compatibility evidence required' : 'Not an upgradeable project', status: !upgradeable ? 'pass' : receipt?.storageLayoutSafe === true ? 'pass' : receipt?.storageLayoutSafe === false ? 'block' : 'review' },
    { id: 'chain', label: 'Arc Bytecode Truth', detail: bytecodeVerification?.status || 'Chain identity not verified', status: bytecodeVerification?.verified ? 'pass' : bytecodeVerification ? 'block' : 'review' },
    { id: 'binding', label: 'Receipt source binding', detail: sourceMismatch ? 'Receipt source hash differs from the active scan' : receipt?.sourceHash ? 'Receipt bound to active source hash' : 'Receipt has no source hash claim', status: sourceMismatch ? 'block' : receipt?.sourceHash ? 'pass' : 'review' },
  ];
  const blocked = checks.filter((check) => check.status === 'block').length;
  const review = checks.filter((check) => check.status === 'review').length;
  const decision = blocked ? 'BLOCKED' : review ? 'EVIDENCE REQUIRED' : 'FIX PROVEN';
  const receiptFingerprint = receipt ? hash(JSON.stringify(receipt)) : null;
  const proofPayload = {
    version: '3.2-proof-of-fix',
    decision,
    sourceHash: report?.sourceHash || null,
    reportHash: report?.reportHash || null,
    artifactHash: bytecodeVerification?.artifactHash || null,
    chainBytecodeHash: bytecodeVerification?.targetHash || bytecodeVerification?.implementationHash || null,
    receiptFingerprint,
    receiptName,
    checks,
  };
  return {
    ...proofPayload,
    proofId: hash(JSON.stringify(proofPayload)),
    blocked,
    review,
    passed: checks.length - blocked - review,
    generatedAt: new Date().toISOString(),
    receipt,
    commands: {
      foundry: 'forge build && forge test --fuzz-runs 1024 --json > veilforge-proof-results.json',
      hardhat: 'npx hardhat compile && npx hardhat test --reporter json > veilforge-proof-results.json',
    },
  };
}
