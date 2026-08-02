function xrayNormalizePath(value) {
  return String(value).replaceAll('\\', '/').replace(/^\.\//, '');
}

function xrayDeclarations(source) {
  const declarations = [];
  const pattern = /\b(abstract\s+contract|contract|interface|library)\s+([A-Za-z_$][\w$]*)/g;
  for (const match of String(source).matchAll(pattern)) {
    declarations.push({ kind: match[1].replace(/\s+/g, ' '), name: match[2] });
  }
  return declarations;
}

function xrayImports(source) {
  return [...String(source).matchAll(/\bimport\s+(?:[^;'\"]+?\s+from\s+)?["']([^"']+)["']\s*;/g)]
    .map((match) => match[1]);
}

function xrayRole(path, declarations) {
  if (/(^|\/)(?:test|tests|script|scripts|mock|mocks|fixture|fixtures)(\/|$)|\.(?:t|s)\.sol$/i.test(path)) return 'excluded';
  if (declarations.some((item) => item.kind === 'contract')) return 'deployable';
  if (declarations.some((item) => item.kind === 'abstract contract')) return 'abstract';
  if (declarations.some((item) => item.kind === 'interface')) return 'interface';
  if (declarations.some((item) => item.kind === 'library')) return 'library';
  return 'supporting';
}

function xrayFramework(files) {
  const joined = files.map((file) => `${file.path}\n${file.content.slice(0, 12000)}`).join('\n');
  if (/forge-std|\.t\.sol\b|\.s\.sol\b|(^|\/)script\//im.test(joined)) return 'Foundry';
  if (/(^|\/)contracts\//im.test(joined)) return 'Hardhat / contracts layout';
  return files.length > 1 ? 'Solidity workspace' : 'Single contract';
}

export function analyzeProject(files) {
  const sourceFiles = files.map((file) => ({
    path: xrayNormalizePath(file.path),
    content: String(file.content),
  })).sort((a, b) => a.path.localeCompare(b.path));
  const inventory = sourceFiles.map((file) => {
    const declarations = xrayDeclarations(file.content);
    const imports = xrayImports(file.content);
    return { ...file, declarations, imports, role: xrayRole(file.path, declarations) };
  });
  const scopedInventory = inventory.filter((file) => file.role !== 'excluded');
  const effectiveScope = scopedInventory.length ? scopedInventory : inventory;
  const knownPaths = new Set(inventory.flatMap((file) => [file.path, file.path.split('/').at(-1)]));
  const externalImports = inventory.flatMap((file) => file.imports)
    .filter((path) => path.startsWith('@') || (!knownPaths.has(path) && !knownPaths.has(path.split('/').at(-1))));
  const entryContracts = inventory.flatMap((file) => file.declarations
    .filter((item) => item.kind === 'contract' && file.role === 'deployable')
    .map((item) => ({ name: item.name, file: file.path })));
  return {
    framework: xrayFramework(sourceFiles),
    files: inventory,
    scopeFiles: effectiveScope.map(({ path, content }) => ({ path, content })),
    entryContracts,
    imports: inventory.reduce((sum, file) => sum + file.imports.length, 0),
    externalImports: [...new Set(externalImports)].sort(),
    excluded: inventory.filter((file) => file.role === 'excluded'),
    upgradeable: inventory.some((file) => /\b(?:delegatecall|Initializable|upgradeTo|ERC1967|UUPSUpgradeable)\b/.test(file.content)),
  };
}
