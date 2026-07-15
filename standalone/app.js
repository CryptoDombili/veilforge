'use strict';

const sensitiveTerms = ['salary','payroll','employee','customer','invoice','balance','credit','debt','bid','position','kyc','tax','identity','secret','private','amount','recipient','beneficiary','account','limit','risk','score','memo','medical','whitelist','allowlist'];
const penalties = { critical: 25, high: 15, medium: 8, low: 3 };

const vulnerableSource = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IBenefitsProvider {
    function syncEmployee(address employee, uint256 salary, string calldata medicalMemo) external;
}

contract Payroll {
    address public owner;
    mapping(address => uint256) public salaryOf;
    mapping(address => bytes32) public employeeIdentity;
    string public payrollMemo;

    event SalaryPaid(address indexed employee, uint256 amount, string payrollMemo);
    event EmployeeIdentityUpdated(address indexed employee, bytes32 identity);

    IBenefitsProvider public benefitsProvider;

    constructor(address provider) {
        owner = msg.sender;
        benefitsProvider = IBenefitsProvider(provider);
    }

    function setEmployeeSalary(address employee, uint256 salary) external {
        salaryOf[employee] = salary;
    }

    function updateEmployeeIdentity(address employee, bytes32 identity) external {
        employeeIdentity[employee] = identity;
    }

    function getSalary(address employee) external view returns (uint256) {
        require(salaryOf[employee] > 0, "employee salary record does not exist");
        return salaryOf[employee];
    }

    function submitMedicalMemo(address employee, string calldata medicalMemo) external {
        benefitsProvider.syncEmployee(employee, salaryOf[employee], medicalMemo);
    }

    function paySalary(address employee, string calldata payrollMemo_) external {
        uint256 amount = salaryOf[employee];
        (bool ok,) = employee.call{value: amount}("");
        require(ok, "salary payment failed for employee");
        emit SalaryPaid(employee, amount, payrollMemo_);
    }

    function debugDumpPayroll() external view returns (string memory) {
        return payrollMemo;
    }

    function authorizeByOrigin() external view returns (bool) {
        return tx.origin == owner;
    }

    receive() external payable {}
}`;

const hardenedSource = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PayrollPrivateReady {
    error Unauthorized();
    error MissingRecord();

    address private immutable payrollAdmin;
    mapping(address => uint256) private salaryByEmployee;
    mapping(address => bytes32) private identityCommitmentByEmployee;

    event BatchCommitmentPublished(bytes32 indexed batchCommitment, uint256 recordCount);

    modifier onlyPayrollAdmin() {
        if (msg.sender != payrollAdmin) revert Unauthorized();
        _;
    }

    constructor() {
        payrollAdmin = msg.sender;
    }

    function setEmployeeSalary(address employee, uint256 salary) external onlyPayrollAdmin {
        salaryByEmployee[employee] = salary;
    }

    function setIdentityCommitment(address employee, bytes32 identityCommitment) external onlyPayrollAdmin {
        identityCommitmentByEmployee[employee] = identityCommitment;
    }

    function viewMySalary() external view returns (uint256) {
        uint256 salary = salaryByEmployee[msg.sender];
        if (salary == 0) revert MissingRecord();
        return salary;
    }

    function publishBatchCommitment(bytes32 batchCommitment, uint256 recordCount) external onlyPayrollAdmin {
        emit BatchCommitmentPublished(batchCommitment, recordCount);
    }
}`;

let files = [{ path: 'Payroll.sol', content: vulnerableSource }];
let report = null;
let activeFile = 'Payroll.sol';

const $ = (id) => document.getElementById(id);

const ARC_CHAIN_ID = 5042002;
const ARC_CHAIN_HEX = '0x4cef52';
const ARC_RPC_URL = 'https://rpc.drpc.testnet.arc.network';
const ARC_EXPLORER = 'https://testnet.arcscan.app';
const REGISTRY_ADDRESS = '0xf8b1D03931f2c11B642259d9aB19cfA3351C0Bbc';
const REGISTRY_ABI = [
  'function publishReport(bytes32 projectId, bytes32 sourceHash, bytes32 reportHash, uint16 score, string scannerVersion, string reportURI) external returns (bytes32 reportId)'
];

function setPublishState(text, state=''){
  const status=$('publishStatus');
  const button=$('publishBtn');
  status.className=`publishStatus ${state}`.trim();
  status.innerHTML=text;
  button.disabled=state==='pending';
}

async function ensureArcNetwork(){
  if(!window.ethereum) throw new Error('MetaMask or another browser wallet was not detected.');
  const current=await window.ethereum.request({method:'eth_chainId'});
  if(current.toLowerCase()===ARC_CHAIN_HEX) return;
  try{
    await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:ARC_CHAIN_HEX}]});
  }catch(error){
    if(error && error.code===4902){
      await window.ethereum.request({method:'wallet_addEthereumChain',params:[{
        chainId:ARC_CHAIN_HEX,
        chainName:'Arc Network Testnet',
        nativeCurrency:{name:'USDC',symbol:'USDC',decimals:18},
        rpcUrls:[ARC_RPC_URL],
        blockExplorerUrls:[ARC_EXPLORER]
      }]});
    }else throw error;
  }
}

async function publishCurrentReport(){
  if(!report) return;
  try{
    setPublishState('Connecting wallet and preparing the Arc transaction…','pending');
    await ensureArcNetwork();
    if(!window.ethers) throw new Error('Wallet library failed to load. Refresh the page and try again.');
    const provider=new ethers.BrowserProvider(window.ethereum);
    await provider.send('eth_requestAccounts',[]);
    const network=await provider.getNetwork();
    if(Number(network.chainId)!==ARC_CHAIN_ID) throw new Error('Please switch your wallet to Arc Network Testnet.');
    const signer=await provider.getSigner();
    const contract=new ethers.Contract(REGISTRY_ADDRESS,REGISTRY_ABI,signer);
    const projectName=($('projectName').value||'untitled-project').trim();
    const projectId=ethers.keccak256(ethers.toUtf8Bytes(projectName));
    const reportURI=($('reportUri').value||window.location.href).trim();
    const tx=await contract.publishReport(projectId,report.sourceHash,report.reportHash,report.score,'veilforge-0.1.0',reportURI);
    setPublishState(`Transaction submitted: <a href="${ARC_EXPLORER}/tx/${tx.hash}" target="_blank" rel="noreferrer">${tx.hash.slice(0,10)}…${tx.hash.slice(-8)}</a>. Waiting for confirmation…`,'pending');
    const receipt=await tx.wait();
    if(!receipt || receipt.status!==1) throw new Error('The transaction was not confirmed successfully.');
    setPublishState(`Published on Arc Testnet. <a href="${ARC_EXPLORER}/tx/${tx.hash}" target="_blank" rel="noreferrer">View transaction on ArcScan ↗</a>`,'success');
    $('publishBtn').textContent='Publish another report';
  }catch(error){
    const message=error?.shortMessage||error?.reason||error?.message||'Transaction cancelled or failed.';
    setPublishState(`Could not publish: ${escapeHtml(message)}`,'error');
  }
}

const hasSensitive = (value) => sensitiveTerms.some((term) => splitWords(value).includes(term) || splitWords(value).join(' ').includes(term));
const splitWords = (value) => value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[^a-zA-Z0-9]+/g, ' ').toLowerCase().split(/\s+/).filter(Boolean);
const escapeHtml = (value) => value.replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[char]));
const hasGuard = (source) => /onlyOwner|onlyRole|onlyAdmin|onlyPayrollAdmin|hasRole\s*\(|msg\.sender\s*==\s*(?:owner|admin)/i.test(source);

function addFinding(findings, ruleId, title, description, severity, file, line, evidence, remediation, confidence='high') {
  const key = `${ruleId}|${file}|${line}|${evidence.trim()}`;
  if (findings.some((finding) => finding.key === key)) return;
  findings.push({ key, ruleId, title, description, severity, file, startLine: line, endLine: line, evidence: evidence.trim(), remediation, confidence });
}

function extractFunctions(source, file) {
  const lines = source.replace(/\r\n?/g,'\n').split('\n');
  const functions = [];
  for (let i=0;i<lines.length;i+=1) {
    const line = lines[i];
    const match = line.match(/\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)([^\{;]*)/);
    const receive = line.match(/\b(receive|fallback)\s*\(([^)]*)\)([^\{;]*)/);
    const found = match || receive;
    if (!found) continue;
    let block = line;
    let depth = (line.match(/\{/g)||[]).length-(line.match(/\}/g)||[]).length;
    let j=i;
    while (depth>0 && j+1<lines.length) { j+=1; block += `\n${lines[j]}`; depth += (lines[j].match(/\{/g)||[]).length-(lines[j].match(/\}/g)||[]).length; }
    const name = found[1];
    const params = found[2] || '';
    const tail = found[3] || '';
    const visibility = /\bexternal\b/.test(tail)?'external':/\bpublic\b/.test(tail)?'public':/\bprivate\b/.test(tail)?'private':/\binternal\b/.test(tail)?'internal':'default';
    const mutability = /\bview\b/.test(tail)?'view':/\bpure\b/.test(tail)?'pure':/\bpayable\b/.test(tail)?'payable':'nonpayable';
    functions.push({ file, name, params, tail, visibility, mutability, startLine:i+1, endLine:j+1, source:block, signature:`${name}(${params.split(',').map(p=>p.trim().split(/\s+/)[0]).filter(Boolean).join(',')})` });
    i=j;
  }
  return functions;
}

function scanFile(file) {
  const source = file.content.replace(/\r\n?/g,'\n');
  const lines = source.split('\n');
  const findings = [];
  const functions = extractFunctions(source,file.path);

  lines.forEach((line,index)=>{
    const n=index+1;
    const trimmed=line.trim();
    if (/\bmapping\s*\([^;]+\)\s+public\s+[A-Za-z_]/.test(line)) addFinding(findings,'VF008','Public mapping exposes indexed records','A public mapping creates an automatic getter and a durable lookup surface.','critical',file.path,n,trimmed,'Use private/internal storage and an explicitly authorized read function.');
    else if (/\bpublic\b/.test(line) && /;\s*$/.test(line) && hasSensitive(line) && !/\b(?:function|event)\b/.test(line)) addFinding(findings,'VF001','Sensitive state has an automatic public getter','Public state variables create externally readable getters.','critical',file.path,n,trimmed,'Make the state non-public and expose a Restricted read selector.');
    if (/\bevent\s+/.test(line) && hasSensitive(line)) addFinding(findings,'VF002','Event schema may disclose confidential data','Event fields are permanent public data on a standard EVM.','high',file.path,n,trimmed,'Emit commitments or aggregate status instead of raw sensitive values.');
    if (/(?:require\s*\([^;]*,[^;]*["']|revert\s*\(\s*["'])/.test(line) && hasSensitive(line)) addFinding(findings,'VF003','Revert text may leak private state','Detailed revert text can reveal account or financial conditions.','medium',file.path,n,trimmed,'Use stable error codes or non-sensitive custom errors.','medium');
    if (/\.(?:delegatecall|callcode|call|staticcall)\s*(?:\{|\()/.test(line)) addFinding(findings,'VF006',/delegatecall|callcode/.test(line)?'Delegate-style call crosses trust boundaries':'Low-level call needs privacy-boundary review','Low-level calls can carry data across public/private or trusted/untrusted boundaries.',/delegatecall|callcode/.test(line)?'critical':'medium',file.path,n,trimmed,'Use typed interfaces and document the target trust domain.');
    if (/\btx\.origin\b/.test(line)) addFinding(findings,'VF010','tx.origin used for authorization','tx.origin permits authorization confusion and phishing-style call chains.','critical',file.path,n,trimmed,'Use msg.sender with explicit roles or signatures.');
    if (/\bemit\s+/.test(line) && hasSensitive(line)) addFinding(findings,'VF011','Event emission includes sensitive runtime values','The emitted arguments appear financially or personally sensitive.','high',file.path,n,trimmed,'Emit a commitment or non-sensitive reference.','medium');
    if (/\.[A-Za-z_][A-Za-z0-9_]*\s*\([^;]+\)/.test(line) && hasSensitive(line) && !/\b(?:emit|require|revert)\b/.test(line)) addFinding(findings,'VF007','Sensitive value may cross a contract boundary','A semantically sensitive value is passed to another contract.','medium',file.path,n,trimmed,'Define trust relationships and pass the minimum necessary data.','medium');
  });

  functions.forEach((fn)=>{
    if (!['public','external'].includes(fn.visibility)) return;
    const context=`${fn.name} ${fn.params} ${fn.source}`;
    if (['view','pure'].includes(fn.mutability) && hasSensitive(context) && !hasGuard(fn.source) && !(/msg\.sender/.test(fn.source) && /(?:my|self)/i.test(fn.name))) addFinding(findings,'VF004','Sensitive read has no visible authorization','A publicly callable read appears to disclose sensitive information.','high',file.path,fn.startLine,lines[fn.startLine-1],'Add explicit authorization and recommend Restricted.');
    if (!['view','pure'].includes(fn.mutability) && hasSensitive(context) && !hasGuard(fn.source)) addFinding(findings,'VF005','Sensitive write lacks a visible guard','A public entrypoint appears to change sensitive state without an authorization boundary.',/^(deposit|pay|submit|claim|transfer)/i.test(fn.name)?'medium':'high',file.path,fn.startLine,lines[fn.startLine-1],'Document permissionless intent or add role/caller validation.','medium');
    if (/^(set|update|grant|revoke|pause|configure)/i.test(fn.name) && !hasGuard(fn.source)) addFinding(findings,'VF009','Administrative mutation lacks access control','The selector name suggests privileged configuration without a visible guard.','critical',file.path,fn.startLine,lines[fn.startLine-1],'Add least-privilege roles and revocation.','medium');
    if (/\b(?:string|bytes)\b/.test(fn.params) && hasSensitive(context)) addFinding(findings,'VF012','Sensitive dynamic payload may be public calldata','String and bytes parameters remain visible in public transaction calldata.','high',file.path,fn.startLine,lines[fn.startLine-1],'Send a hash or encrypted reference instead of plaintext.','medium');
  });

  const policies=functions.filter(fn=>['public','external'].includes(fn.visibility)).map(fn=>{
    const context=`${fn.name} ${fn.params} ${fn.source}`;
    const locked=/debug|deprecated|unsafe|destroy|dump|backdoor/i.test(fn.name);
    const guarded=hasGuard(fn.source); const sensitive=hasSensitive(context); const admin=/^(set|update|grant|revoke|pause|configure)/i.test(fn.name);
    if (locked) return {...fn,policy:'Locked',reason:'Debug, deprecated or unusually dangerous selector; unavailable by default.'};
    if (guarded||sensitive||admin) return {...fn,policy:'Restricted',reason:guarded?'Existing authorization boundary should be preserved with explicit grants.':sensitive?'Selector touches semantically sensitive data.':'Administrative selector should be limited to approved operators.'};
    return {...fn,policy:'Open',reason:['view','pure'].includes(fn.mutability)?'Non-sensitive read intended for broad use.':'Open only when permissionless access is intentional.'};
  });
  return {findings,policies};
}

async function sha256(value){const data=new TextEncoder().encode(value);const hash=await crypto.subtle.digest('SHA-256',data);return '0x'+[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function canonical(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`}

async function scanAll(){
  const all=files.flatMap(scanFile); const findings=all.flatMap(x=>x.findings).sort((a,b)=>a.file.localeCompare(b.file)||a.startLine-b.startLine||a.ruleId.localeCompare(b.ruleId)); const policies=all.flatMap(x=>x.policies);
  const penalty=findings.reduce((sum,f)=>sum+penalties[f.severity],0); const score=Math.max(0,100-penalty); const grade=score>=90?'A':score>=80?'B':score>=70?'C':score>=55?'D':'F';
  const summary={critical:0,high:0,medium:0,low:0}; findings.forEach(f=>summary[f.severity]++);
  const sourcePayload=[...files].sort((a,b)=>a.path.localeCompare(b.path)).map(f=>`${f.path}\0${f.content.replace(/\r\n?/g,'\n')}\u001e`).join('');
  const sourceHash=await sha256(sourcePayload); const stable={schemaVersion:'1.0',scannerVersion:'0.1.0',score,grade,summary,findings:findings.map(({key,...f})=>f),policies:policies.map(p=>({file:p.file,name:p.name,signature:p.signature,startLine:p.startLine,policy:p.policy,reason:p.reason})),sourceHash}; const reportHash=await sha256(canonical(stable));
  return {...stable,findings,policies,sourceHash,reportHash,disclaimer:"Pre-APS readiness analysis based on Arc's published design. Independent community tool; not an official Circle product or formal audit."};
}

function severityAtLine(line,findings){const items=findings.filter(f=>line>=f.startLine&&line<=f.endLine);return items.some(f=>f.severity==='critical')?'critical':items.some(f=>f.severity==='high')?'high':items.length?'medium':''}
function renderCode(){const file=files.find(f=>f.path===activeFile)||files[0];if(!file)return; $('activeFileName').textContent=file.path; const relevant=report.findings.filter(f=>f.file===file.path); $('codeView').innerHTML=file.content.replace(/\r\n?/g,'\n').split('\n').map((line,i)=>{const n=i+1;const count=relevant.filter(f=>n>=f.startLine&&n<=f.endLine).length;return `<div class="codeLine ${severityAtLine(n,relevant)}"><span class="lineNo">${n}</span><code>${escapeHtml(line)||' '}</code>${count?`<span class="marker">${count}</span>`:''}</div>`}).join('')}
function renderFindings(){const list=$('findingList');$('findingCount').textContent=report.findings.length; if(!report.findings.length){list.innerHTML='<div style="height:100%;display:grid;place-content:center;text-align:center;color:#75f7c8"><b>No current rule matched</b><small style="color:#738095;margin-top:6px">Continue manual review.</small></div>';return} list.innerHTML=report.findings.map(f=>`<article class="finding ${f.severity}" data-file="${escapeHtml(f.file)}" data-line="${f.startLine}"><span class="findingIcon">!</span><div><div class="findingMeta"><b>${f.ruleId}</b><em>${f.severity}</em><small>${escapeHtml(f.file)}:${f.startLine}</small></div><h3>${escapeHtml(f.title)}</h3><p>${escapeHtml(f.description)}</p></div></article>`).join(''); list.querySelectorAll('.finding').forEach(el=>el.addEventListener('click',()=>{activeFile=el.dataset.file;$('fileSelect').value=activeFile;renderCode();const line=$('codeView').children[Number(el.dataset.line)-1];if(line)line.scrollIntoView({behavior:'smooth',block:'center'})}))}
function renderPolicies(){const groups=['Open','Restricted','Locked'];$('policyGrid').innerHTML=groups.map(policy=>{const items=report.policies.filter(p=>p.policy===policy);return `<section class="policyCol"><header><div><strong>${policy}</strong><small>${policy==='Open'?'Broadly callable selector':policy==='Restricted'?'Explicit grant required':'Selector unavailable'}</small></div><span>${items.length}</span></header><div class="policyItems">${items.length?items.map(p=>`<article><code>${escapeHtml(p.signature)}</code><p>${escapeHtml(p.reason)}</p><small>${escapeHtml(p.file)} · line ${p.startLine}</small></article>`).join(''):'<p style="text-align:center;color:#596477;font-size:9px">No selectors</p>'}</div></section>`}).join('')}
function renderMetrics(){const score=report.score;$('scoreValue').textContent=score;$('gradeValue').textContent=report.grade;$('readinessLabel').textContent=score>=90?'Ready':score>=75?'Review':score>=55?'Exposed':'Critical';$('scoreRing').style.setProperty('--score',`${score*3.6}deg`);$('criticalCount').textContent=report.summary.critical;$('highCount').textContent=report.summary.high;$('policyCount').textContent=report.policies.length;$('sourceHash').textContent=report.sourceHash;$('reportHash').textContent=report.reportHash;$('proofScore').textContent=`${report.score}/100 · Grade ${report.grade}`;$('proofFindings').textContent=`${report.findings.length} deterministic checks`}
async function refresh(){report=await scanAll();renderMetrics();renderCode();renderFindings();renderPolicies();const vuln=await (async()=>{const old=files;files=[{path:'Payroll.sol',content:vulnerableSource}];const x=await scanAll();files=old;return x})();const hard=await (async()=>{const old=files;files=[{path:'PayrollPrivateReady.sol',content:hardenedSource}];const x=await scanAll();files=old;return x})();$('deltaValue').textContent=`+${hard.score-vuln.score} points`;$('deltaText').textContent=`Vulnerable ${vuln.score} → Hardened ${hard.score}`}
function setFiles(next,mode){files=next;activeFile=files[0].path;document.querySelectorAll('.modes button').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));const custom=document.querySelector('[data-mode="custom"]');custom.hidden=mode!=='custom';$('fileSelect').innerHTML=files.map(f=>`<option value="${escapeHtml(f.path)}">${escapeHtml(f.path)}</option>`).join('');$('projectName').value=mode==='hardened'?'veilforge-payroll-hardened':mode==='custom'?files[0].path.replace(/\.sol$/i,'').toLowerCase():'veilforge-payroll-demo';$('proofProject').textContent=$('projectName').value;refresh()}

function wire(){
  $('heroDemo').onclick=()=>{$('scanner').scrollIntoView({behavior:'smooth'});setFiles([{path:'Payroll.sol',content:vulnerableSource}],'vulnerable')};
  const openPicker=()=>$('fileInput').click();$('heroUpload').onclick=openPicker;$('uploadBtn').onclick=openPicker;
  $('fileInput').onchange=async(e)=>{const chosen=[...e.target.files].filter(f=>f.name.toLowerCase().endsWith('.sol'));if(!chosen.length)return;const loaded=await Promise.all(chosen.map(async f=>({path:f.name,content:await f.text()})));setFiles(loaded,'custom')};
  document.querySelectorAll('.modes button').forEach(button=>button.addEventListener('click',()=>{if(button.dataset.mode==='vulnerable')setFiles([{path:'Payroll.sol',content:vulnerableSource}],'vulnerable');if(button.dataset.mode==='hardened')setFiles([{path:'PayrollPrivateReady.sol',content:hardenedSource}],'hardened')}));
  document.querySelectorAll('.tabs button').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('active'));button.classList.add('active');document.querySelectorAll('.tabPane').forEach(p=>p.classList.remove('active'));$(`${button.dataset.tab}Tab`).classList.add('active')}));
  $('fileSelect').onchange=e=>{activeFile=e.target.value;renderCode()};
  $('projectName').oninput=e=>$('proofProject').textContent=e.target.value||'Untitled project';
  $('exportBtn').onclick=()=>{const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`veilforge-report-${report.reportHash.slice(2,10)}.json`;a.click();URL.revokeObjectURL(url)};
  $('publishBtn').onclick=publishCurrentReport;
}

async function scanStandalone(inputFiles){
  const previous=files;
  files=inputFiles;
  try { return await scanAll(); }
  finally { files=previous; }
}

if (typeof document !== 'undefined') {
  wire();
  setFiles([{path:'Payroll.sol',content:vulnerableSource}],'vulnerable');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports={scanStandalone,vulnerableSource,hardenedSource};
}
