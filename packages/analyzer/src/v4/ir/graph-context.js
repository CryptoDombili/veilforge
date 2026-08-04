import { compareCodePoints } from '../frontend/standard-json.js';
import { resolveSourceLocation } from '../frontend/source-locations.js';
import { IRInputError } from './errors.js';

export function createGraphContext(program) {
  const compilation = program?._compilation;
  if (!compilation?.output?.sources || !compilation?.input?.sources) {
    throw new IRInputError('Graph construction requires ProgramIR with its non-serialized compilation context.');
  }
  const sourceById = new Map();
  const astById = new Map();
  const parentById = new Map();
  const callableAstById = new Map();
  const callableByAstId = new Map(program.declarations.filter((item) => ['function', 'modifier'].includes(item.kind)).map((item) => [item.astNodeId, item]));
  const contractByAstId = new Map(program.contracts.map((item) => [item.astNodeId, item]));
  const contractByName = new Map(program.contracts.map((item) => [item.canonicalName, item]));

  function walk(root) {
    const worklist = [{ node: root, parentId: null }];
    while (worklist.length) {
      const { node, parentId } = worklist.pop();
      if (!node?.nodeType) continue;
      astById.set(node.id, node);
      parentById.set(node.id, parentId);
      if (['FunctionDefinition', 'ModifierDefinition'].includes(node.nodeType) && callableByAstId.has(node.id)) callableAstById.set(node.id, node);
      const children = [];
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) children.push(...value.filter((item) => item?.nodeType));
        else if (value?.nodeType) children.push(value);
      }
      for (let index = children.length - 1; index >= 0; index -= 1) worklist.push({ node: children[index], parentId: node.id });
    }
  }

  for (const sourcePath of Object.keys(compilation.output.sources).sort(compareCodePoints)) {
    const outputSource = compilation.output.sources[sourcePath];
    sourceById.set(outputSource.id, { path: sourcePath, content: compilation.input.sources[sourcePath].content });
    walk(outputSource.ast);
  }
  return {
    compilation, sourceById, astById, parentById, callableAstById, callableByAstId, contractByAstId, contractByName,
    callableById: new Map([...callableByAstId.values()].map((item) => [item.id, item])),
    declarationByAstId: new Map(program.declarations.filter((item) => Number.isInteger(item.astNodeId)).map((item) => [item.astNodeId, item])),
    resolveLocation: (src) => resolveSourceLocation(src, sourceById),
  };
}
