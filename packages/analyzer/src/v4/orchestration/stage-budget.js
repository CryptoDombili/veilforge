export const DEFAULT_GLOBAL_TIMEOUT_MS=300_000;
export const DEFAULT_STAGE_TIMEOUT_MS=120_000;
export function stageBudget(options={},stageName){const configured=options.stageBudgets?.[stageName]??{},timeoutMs=options.stageTimeouts?.[stageName]??configured.timeoutMs??options.stageTimeoutMs??DEFAULT_STAGE_TIMEOUT_MS;return Object.freeze({timeoutMs,maxItems:configured.maxItems??null,...configured});}
