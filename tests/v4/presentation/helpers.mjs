import { detectorResult, findings } from '../findings/helpers.mjs';
import { projectFinding, projectFindingRun, serializePresentation } from '../../../packages/analyzer/src/v4/presentation/index.js';
export function evidence(kind,id,detail='detail',location=null){return{detectorEvidenceId:id,kind,origin:id,detail,location};}
export function finding(overrides={}){const result=detectorResult({token:overrides.token??'presentation',...overrides});const value=findings(result,overrides.findingOptions).findings[0];return Object.assign(value,overrides.finding??{});}
export function projection(overrides={},options={}){return projectFinding(finding(overrides),options);}
export { projectFinding, projectFindingRun, serializePresentation };
