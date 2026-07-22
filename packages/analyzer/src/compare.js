export function compareReports(baseline, current) {
  if (!baseline || !current) {
    return { baselineHash: baseline?.reportHash ?? null, currentHash: current?.reportHash ?? null, resolved: [], ongoing: [], introduced: [], scoreDelta: 0 };
  }

  const oldMap = new Map(baseline.findings.map((finding) => [finding.fingerprint, finding]));
  const newMap = new Map(current.findings.map((finding) => [finding.fingerprint, finding]));

  const resolved = baseline.findings.filter((finding) => !newMap.has(finding.fingerprint));
  const ongoing = current.findings.filter((finding) => oldMap.has(finding.fingerprint));
  const introduced = current.findings.filter((finding) => !oldMap.has(finding.fingerprint));

  return {
    baselineHash: baseline.reportHash,
    currentHash: current.reportHash,
    baselineScore: baseline.score,
    currentScore: current.score,
    scoreDelta: current.score - baseline.score,
    resolved,
    ongoing,
    introduced,
    summary: {
      resolved: resolved.length,
      ongoing: ongoing.length,
      introduced: introduced.length,
    },
  };
}
