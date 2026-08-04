import { FindingInputError } from './errors.js';

export function createFindingContext(input, options = {}) {
  const runs = Array.isArray(input) ? input : [input];
  const results = Array.isArray(input) && input.every((item) => item?.detectorResultId) ? input : runs.flatMap((item) => item?.results ?? []);
  if (!results.every((item) => item?.detectorResultId && item.detectorId)) throw new FindingInputError('Finding builder requires DetectorResult records.');
  return { runs, results, options, engineVersion: options.engineVersion ?? runs.find((item) => item?.engineVersion)?.engineVersion ?? '4.0.0-gc.1' };
}
