pragma solidity 0.8.24;
contract Boundary { function invoke(address target, bytes calldata data) external { target.delegatecall(data); } }
