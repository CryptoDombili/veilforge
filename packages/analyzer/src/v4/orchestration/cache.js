import{scanError}from'./errors.js';
export function cachedStage(session,stageName,inputDigest){const cached=session.results.get(stageName);if(!cached)return null;if(cached.inputDigest!==inputDigest)throw scanError('SCAN_CACHE_MISMATCH',`Cached stage input mismatch: ${stageName}`,{stage:stageName,partial:null});return Object.freeze({...cached,cacheHit:true});}
