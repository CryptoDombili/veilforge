import { paymentDetector } from './factory.js';
export const paymentReturnDisclosure = paymentDetector('arc-payments.return-disclosure', 'return', 'payments.return-disclosure', { publicCallable: true });
