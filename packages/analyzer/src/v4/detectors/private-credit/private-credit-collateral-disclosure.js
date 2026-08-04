import { detectorEvidence } from '../detector-evidence.js'; import { semanticIncomplete } from './factory.js';
const PUBLIC_SINKS=new Set(['public-storage','public-getter','event','calldata','return','revert-custom-error','external-call','metadata-uri']);
function alias(source){return (source.evidence.find(x=>x.kind==='taxonomy-alias')?.detail??'').split(':')[0];}
export const privateCreditCollateralDisclosure=Object.freeze({detectorId:'arc-private-credit.collateral-disclosure',detectorVersion:'1.0.0',domain:'arc-private-credit',remediationKey:'private-credit.collateral-disclosure',
  matches:({source,sink})=>source.dataClass==='collateral'&&PUBLIC_SINKS.has(sink.sinkClass), incompleteReasons:({source})=>semanticIncomplete(source),
  evidence:({source,sink})=>[detectorEvidence('private-credit-collateral-relationship',source.sourceCandidateId,`${alias(source)}:${sink.sinkClass}`,source.location)]});
