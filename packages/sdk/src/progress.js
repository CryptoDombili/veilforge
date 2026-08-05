import { getScanProgress as internalProgress } from '../../analyzer/src/v4/orchestration/index.js';
import { sdkError } from './errors.js';
import { immutablePublic } from './types.js';

const MESSAGE = Object.freeze({
  'scan-started': 'Scan started.', 'stage-started': 'Stage started.', 'stage-progress': 'Stage progress updated.',
  'stage-completed': 'Stage completed.', 'stage-incomplete': 'Stage completed with incomplete analysis.',
  'stage-failed': 'Stage failed.', 'stage-timeout': 'Stage timed out.', 'scan-completed': 'Scan completed.', 'scan-aborted': 'Scan aborted.',
});
const STATUS = Object.freeze({ 'scan-started': 'running', 'stage-started': 'running', 'stage-progress': 'running', 'stage-completed': 'completed', 'stage-incomplete': 'incomplete', 'stage-failed': 'failed', 'stage-timeout': 'timed-out', 'scan-completed': 'completed', 'scan-aborted': 'aborted' });

export function createProgressAdapter(options, sessionProvider) {
  if (!options.onProgress) return undefined;
  return (event) => {
    const session = sessionProvider();
    const progress = session ? internalProgress(session) : null;
    const payload = immutablePublic({
      event: event.type,
      stage: event.stageName,
      status: event.type === 'scan-completed' ? (event.metadata.status ?? STATUS[event.type]) : STATUS[event.type],
      completedStageCount: progress?.completedStages.length ?? (event.metadata.index ?? 0),
      totalStageCount: progress?.stages.length ?? event.metadata.total ?? event.metadata.stageCount ?? 14,
      message: MESSAGE[event.type] ?? 'Scan progress updated.',
      progress: {
        index: Number.isInteger(event.metadata.index) ? event.metadata.index : null,
        cacheHit: event.metadata.cacheHit === true,
        phase: typeof event.metadata.phase === 'string' ? event.metadata.phase : null,
      },
    });
    try { options.onProgress(payload); } catch {
      if (options.progressCallbackErrorMode === 'fail') throw sdkError('SDK_PROGRESS_CALLBACK_FAILED', { stage: event.stageName });
    }
  };
}
