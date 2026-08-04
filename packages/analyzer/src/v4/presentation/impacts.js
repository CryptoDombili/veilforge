import{catalogMessage,domainTerminology}from'./catalog.js';
export function presentImpact(finding,catalog){domainTerminology(catalog,finding.domain);const key=`impact.${finding.domain}`;return{impactKey:key,impact:catalogMessage(catalog,key)};}
