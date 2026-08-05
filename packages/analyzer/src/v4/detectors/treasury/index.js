import { DetectorRegistry } from '../detector-registry.js';
import { treasuryApprovalDisclosure } from './treasury-approval-disclosure.js';
import { treasuryCalldataObservation } from './treasury-calldata-observation.js';
import { treasuryEventDisclosure } from './treasury-event-disclosure.js';
import { treasuryExternalCallDisclosure } from './treasury-external-call-disclosure.js';
import { treasuryMetadataDisclosure } from './treasury-metadata-disclosure.js';
import { treasuryPublicGetterDisclosure } from './treasury-public-getter-disclosure.js';
import { treasuryPublicStorageDisclosure } from './treasury-public-storage-disclosure.js';
import { treasuryReturnDisclosure } from './treasury-return-disclosure.js';
import { treasuryRevertDisclosure } from './treasury-revert-disclosure.js';
export const treasuryDetectors = Object.freeze([treasuryApprovalDisclosure, treasuryCalldataObservation, treasuryEventDisclosure,
  treasuryExternalCallDisclosure, treasuryMetadataDisclosure, treasuryPublicGetterDisclosure, treasuryPublicStorageDisclosure,
  treasuryReturnDisclosure, treasuryRevertDisclosure]);
export function createTreasuryDetectorRegistry() { return new DetectorRegistry(treasuryDetectors); }
export { treasuryApprovalDisclosure, treasuryCalldataObservation, treasuryEventDisclosure, treasuryExternalCallDisclosure,
  treasuryMetadataDisclosure, treasuryPublicGetterDisclosure, treasuryPublicStorageDisclosure, treasuryReturnDisclosure, treasuryRevertDisclosure };
