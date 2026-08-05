import { DetectorRegistry } from '../detector-registry.js';
import { paymentCalldataObservation } from './payment-calldata-observation.js';
import { paymentEventDisclosure } from './payment-event-disclosure.js';
import { paymentExternalCallDisclosure } from './payment-external-call-disclosure.js';
import { paymentMetadataDisclosure } from './payment-metadata-disclosure.js';
import { paymentPublicGetterDisclosure } from './payment-public-getter-disclosure.js';
import { paymentPublicStorageDisclosure } from './payment-public-storage-disclosure.js';
import { paymentReturnDisclosure } from './payment-return-disclosure.js';
import { paymentRevertDisclosure } from './payment-revert-disclosure.js';

export const paymentsDetectors = Object.freeze([
  paymentCalldataObservation, paymentEventDisclosure, paymentExternalCallDisclosure, paymentMetadataDisclosure,
  paymentPublicGetterDisclosure, paymentPublicStorageDisclosure, paymentReturnDisclosure, paymentRevertDisclosure,
]);
export function createPaymentsDetectorRegistry() { return new DetectorRegistry(paymentsDetectors); }
export { paymentCalldataObservation, paymentEventDisclosure, paymentExternalCallDisclosure, paymentMetadataDisclosure,
  paymentPublicGetterDisclosure, paymentPublicStorageDisclosure, paymentReturnDisclosure, paymentRevertDisclosure };
