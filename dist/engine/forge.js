import { stableFingerprint } from './canonical.js';

function patchFor(finding) {
  if (finding.ruleId === 'VF001' || finding.ruleId === 'VF008') {
    const after = finding.evidence.replace(/\bpublic\b/, 'private');
    if (after !== finding.evidence) return {
      transformation: 'visibility-hardening',
      confidence: 'high',
      before: finding.evidence,
      after,
      behaviorChange: 'Removes the compiler-generated public getter. Add an explicitly authorized reader if the application requires access.',
    };
  }
  if (finding.ruleId === 'VF003') {
    const after = finding.evidence.replace(/(["']).*?\1/g, '"SensitiveOperationFailed"');
    if (after !== finding.evidence) return {
      transformation: 'revert-redaction',
      confidence: 'medium',
      before: finding.evidence,
      after,
      behaviorChange: 'Redacts sensitive revert text while preserving the failure path.',
    };
  }
  return null;
}

export function buildForgePlan(files, findings) {
  const patches = findings.map((finding) => {
    const candidate = patchFor(finding);
    return {
      id: stableFingerprint(['forge', finding.fingerprint]),
      findingFingerprint: finding.fingerprint,
      ruleId: finding.ruleId,
      title: finding.title,
      file: finding.file,
      line: finding.startLine,
      sourceAnchor: stableFingerprint(['forge-anchor', finding.file, finding.startLine, finding.evidence]),
      severity: finding.severity,
      supported: Boolean(candidate),
      status: candidate ? 'Candidate ready' : 'Engineering review',
      transformation: candidate?.transformation ?? 'manual-remediation',
      confidence: candidate?.confidence ?? finding.confidence,
      before: candidate?.before ?? finding.evidence,
      after: candidate?.after ?? finding.saferPattern ?? finding.remediation,
      behaviorChange: candidate?.behaviorChange ?? 'No automatic mutation is applied because a generic edit could change contract behavior.',
      verification: candidate ? ['Source replacement prepared', 'Fresh scan required', 'Project compiler and tests required'] : ['Manual implementation required', 'Fresh scan required'],
    };
  });

  return {
    version: '3.2',
    mode: 'deterministic-candidate-patches',
    sourceFiles: files.map((file) => file.path),
    patches,
    summary: {
      total: patches.length,
      candidateReady: patches.filter((patch) => patch.supported).length,
      engineeringReview: patches.filter((patch) => !patch.supported).length,
    },
  };
}

export function applyForgeCandidates(files, forgePlan) {
  const applied = [];
  const output = files.map((file) => {
    let content = file.content;
    const filePatches = forgePlan.patches.filter((patch) => patch.supported && patch.file === file.path && patch.before && patch.after);
    for (const patch of filePatches) {
      let index = -1;
      let cursor = 0;
      while (cursor <= content.length) {
        const candidate = content.indexOf(patch.before, cursor);
        if (candidate < 0) break;
        const candidateLine = content.slice(0, candidate).split('\n').length;
        if (candidateLine === patch.line) {
          index = candidate;
          break;
        }
        cursor = candidate + 1;
      }
      if (index < 0) continue;
      content = `${content.slice(0, index)}${patch.after}${content.slice(index + patch.before.length)}`;
      applied.push({ patchId: patch.id, ruleId: patch.ruleId, file: patch.file, line: patch.line, transformation: patch.transformation });
    }
    return { path: file.path, content };
  });
  return { files: output, applied };
}
