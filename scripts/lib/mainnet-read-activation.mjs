export function assertMainnetDeploymentConfig(deployment, network) {
  const matches = deployment?.environment === 'mainnet'
    && deployment?.networkKey === 'arc-mainnet'
    && deployment?.chainId === network?.chainId
    && deployment?.deploymentStatus === 'verified'
    && deployment?.contractVersion === network?.registryContractVersion
    && String(deployment?.contractAddress ?? '').toLowerCase() === String(network?.registryAddress ?? '').toLowerCase()
    && String(deployment?.transactionHash ?? '').toLowerCase() === String(network?.registryDeploymentTransaction ?? '').toLowerCase()
    && deployment?.blockNumber === network?.registryDeploymentBlock
    && deployment?.runtimeBytecodeDigest === network?.registryRuntimeBytecodeDigest
    && deployment?.deployedRuntimeBytecodeDigest === network?.registryRuntimeBytecodeDigest
    && deployment?.runtimeBytecodeExactMatch === true
    && network?.enabled === true
    && network?.proofReadEnabled === true
    && network?.deploymentStatus === 'verified';
  if (!matches) throw new Error('Arc Mainnet deployment manifest and network configuration do not match.');
  return true;
}

export function assertMainnetProductionConfig(deployment, publication, network) {
  assertMainnetDeploymentConfig(deployment, network);
  const matches = network?.publishEnabled === true
    && network?.publicationStatus === 'verified'
    && publication?.manifestVersion === 'veilforge.proof.publication.v1'
    && publication?.environment === 'mainnet'
    && publication?.networkKey === 'arc-mainnet'
    && publication?.chainId === network?.chainId
    && publication?.publicationStatus === 'verified'
    && publication?.receiptStatusHex === '0x1'
    && publication?.verification?.receiptEventReadbackConsistency === true
    && publication?.verification?.duplicateGuardOnChain === true
    && publication?.publicationTransactionCount === 1
    && publication?.registryDeploymentTransactionCountDuringStage === 0
    && publication?.otherMainnetWriteTransactionCount === 0
    && String(publication?.registryAddress ?? '').toLowerCase() === String(network?.registryAddress ?? '').toLowerCase()
    && String(publication?.runtimeBytecodeDigest ?? '').toLowerCase() === String(network?.registryRuntimeBytecodeDigest ?? '').toLowerCase()
    && String(publication?.transactionHash ?? '').toLowerCase() === String(network?.firstProofTransaction ?? '').toLowerCase()
    && publication?.blockNumber === network?.firstProofBlock
    && String(publication?.publisher ?? '').toLowerCase() === String(network?.firstProofPublisher ?? '').toLowerCase()
    && publication?.fixtureId === network?.firstProofFixtureId
    && String(publication?.projectId ?? '').toLowerCase() === String(network?.firstProofProjectId ?? '').toLowerCase()
    && String(publication?.reportHash ?? '').toLowerCase() === String(network?.firstProofReportHash ?? '').toLowerCase();
  if (!matches) throw new Error('Arc Mainnet publication evidence and production network configuration do not match.');
  return true;
}
