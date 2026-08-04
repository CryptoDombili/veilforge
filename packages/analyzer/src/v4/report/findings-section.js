import{compareCodePoints}from'../frontend/standard-json.js';
export function findingsSection(projections=[]){return[...projections].sort((a,b)=>compareCodePoints(a.findingId,b.findingId));}
