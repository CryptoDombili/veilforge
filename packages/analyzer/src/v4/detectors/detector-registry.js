export class DetectorRegistry {
  constructor(detectors = []) { this.detectors = []; for (const detector of detectors) this.register(detector); }
  register(detector) {
    if (!detector?.detectorId || typeof detector.matches !== 'function') throw new TypeError('Invalid detector registration.');
    if (this.detectors.some((item) => item.detectorId === detector.detectorId)) throw new TypeError(`Duplicate detector: ${detector.detectorId}`);
    this.detectors.push(detector); this.detectors.sort((a, b) => a.detectorId.localeCompare(b.detectorId)); return this;
  }
}
