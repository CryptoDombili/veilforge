export const SCAN_STAGES=Object.freeze(['input-validation','compilation','ir','graphs','intraprocedural','interprocedural','classification','detectors','findings','presentation','report','report-integrity','markdown-export','export-verification']);
export const stageIndex=name=>SCAN_STAGES.indexOf(name);
export function assertStageName(name){if(stageIndex(name)<0)throw new TypeError(`Unknown scan stage: ${name}`);return name;}
