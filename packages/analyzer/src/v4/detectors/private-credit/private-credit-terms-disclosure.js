import { detectorEvidence } from '../detector-evidence.js'; import { semanticIncomplete } from './factory.js';
const PUBLIC_SINKS=new Set(['public-storage','public-getter','event','calldata','return','revert-custom-error','external-call','metadata-uri']);
function alias(source){return (source.evidence.find(x=>x.kind==='taxonomy-alias')?.detail??'').split(':')[0];}
function isTerms(source){return ['loan-terms','interest-rate','settlement-reference'].includes(source.dataClass);}
export const privateCreditTermsDisclosure=Object.freeze({detectorId:'arc-private-credit.terms-disclosure',detectorVersion:'1.0.0',domain:'arc-private-credit',remediationKey:'private-credit.terms-disclosure',
  matches:({source,sink})=>PUBLIC_SINKS.has(sink.sinkClass)&&isTerms(source), incompleteReasons:({source})=>semanticIncomplete(source),
  evidence:({source,sink})=>[detectorEvidence('private-credit-terms-relationship',source.sourceCandidateId,`${alias(source)}:${source.dataClass}:${sink.sinkClass}`,source.location)]});
