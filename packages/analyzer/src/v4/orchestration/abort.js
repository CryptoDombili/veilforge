import{scanError}from'./errors.js';
export function throwIfAborted(session,stage=null){if(session.signal.aborted)throw scanError('SCAN_ABORTED',`Scan aborted${session.abortReason?`: ${session.abortReason}`:''}.`,{stage,partial:sessionSummary(session)});}
export function sessionSummary(session){return{sessionId:session.sessionId,status:session.status,currentStage:session.currentStage,completedStages:[...session.results.keys()],incompleteReasons:[...session.incompleteReasons]};}
export function abortScan(session,reason='aborted'){if(!session.signal.aborted){session.abortReason=String(reason);session.abortController.abort(session.abortReason);session.status='aborted';}return sessionSummary(session);}
