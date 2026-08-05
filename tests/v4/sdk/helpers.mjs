import fs from 'node:fs';
import path from 'node:path';

const manifest = JSON.parse(fs.readFileSync('tests/corpus/manifest.json', 'utf8'));
function collect(root, directory = root, output = {}) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, item.name);
    if (item.isDirectory()) collect(root, absolute, output);
    else if (item.isFile() && item.name.endsWith('.sol')) output[path.relative(root, absolute).replaceAll('\\', '/')] = { content: fs.readFileSync(absolute, 'utf8') };
  }
  return output;
}

export function sdkCorpusInput(caseId = 'PAY-POS-001') {
  const entry = manifest.cases.find((item) => item.id === caseId);
  const compiler = JSON.parse(fs.readFileSync(path.join(entry.path, 'compiler.json'), 'utf8'));
  return {
    projectId: caseId,
    projectName: `SDK ${caseId}`,
    sources: collect(path.join(entry.path, 'project')),
    compiler: { version: compiler.version },
    settings: compiler.settings,
    taxonomy: fs.readFileSync('docs/grant-candidate/financial-data-taxonomy.yaml', 'utf8'),
    policy: JSON.parse(fs.readFileSync(path.join(entry.path, 'policy.json'), 'utf8')),
    domains: [entry.domain],
    evaluationTime: '2026-08-05T00:00:00Z',
  };
}

export const tinyInput = () => ({
  projectId: 'tiny-sdk-project',
  sources: { 'contracts/Tiny.sol': { content: 'pragma solidity 0.8.24; contract Tiny { uint256 public value; }' } },
});
