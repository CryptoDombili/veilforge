import { compileProject } from '../../../packages/analyzer/src/v4/frontend/index.js';
import { lowerCompilationToIR } from '../../../packages/analyzer/src/v4/ir/index.js';

export const header = '// SPDX-License-Identifier: MIT\npragma solidity 0.8.24;\n';

export function compileIR(sources, settings = {}) {
  const compilation = compileProject({ sources, settings });
  if (compilation.result.status !== 'compiled') {
    throw new Error(compilation.result.diagnostics.map((item) => item.formattedMessage).join('\n'));
  }
  return { compilation, ir: lowerCompilationToIR(compilation) };
}

export const richSource = `${header}
contract Base {
  uint public inheritedCount;
  modifier onlyPositive(uint value) { require(value > 0); _; }
  event Changed(uint indexed value);
  error BadValue(uint value);
  struct Record { uint amount; }
  enum Status { Open, Closed }
  function set(uint value) public virtual { inheritedCount = value; }
  function overloaded(uint value) external pure returns (uint) { return value; }
  function overloaded(address value) external pure returns (address) { return value; }
}
contract Mix { modifier mixed() { _; } uint internal mixValue; }
contract Single is Base {}
contract Derived is Base, Mix {
  mapping(address => Record) public records;
  mapping(address => uint) internal balances;
  uint[] internal values;
  function set(uint value) public override onlyPositive(value) mixed {
    inheritedCount = value;
    records[msg.sender].amount = value;
    balances[msg.sender] = value;
    values.push(value);
    values[0] = records[msg.sender].amount;
    emit Changed(value);
  }
  function read(address account, uint index) external view returns (uint result) {
    uint localValue = records[account].amount + balances[account];
    { uint result = values[index]; return result + localValue + inheritedCount; }
  }
}`;
