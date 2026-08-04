export function summarizeDetectorRun(results) {
  const count = (key) => Object.fromEntries([...new Set(results.map((item) => item[key]))].sort().map((value) => [value, results.filter((item) => item[key] === value).length]));
  return { total: results.length, byDetector: count('detectorId'), byDisposition: count('disposition'), byDataClass: count('dataClass'), bySinkClass: count('sinkClass'), complete: results.filter((item) => item.complete).length, incomplete: results.filter((item) => !item.complete).length };
}
