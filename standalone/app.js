'use strict';

const sensitiveTerms = ['salary','payroll','employee','customer','invoice','balance','credit','debt','bid','position','kyc','tax','identity','secret','private','amount','recipient','beneficiary','account','limit','risk','score','memo','medical','whitelist','allowlist'];
const penalties = { critical: 25, high: 15, medium: 8, low: 3 };

const remediationPlaybook = {
  VF001: {
    category: 'public-state',
    impact: 'Anyone can call the compiler-generated getter and correlate the returned value with an account, business process or identity.',
    saferPattern: `mapping(address => uint256) private salaryByEmployee;

function viewSalary(address employee)
    external
    view
    onlyAuthorized
    returns (uint256)
{
    return salaryByEmployee[employee];
}`
  },
  VF002: {
    category: 'event-disclosure',
    impact: 'Log data is durable and indexable. Once emitted, sensitive values can be copied and correlated outside the application forever.',
    saferPattern: `event PaymentCommitted(
    bytes32 indexed commitment,
    uint64 indexed batchId
);`
  },
  VF003: {
    category: 'revert-disclosure',
    impact: 'State-specific error text can reveal account status, limits or private workflow details to callers and monitoring infrastructure.',
    saferPattern: `error Unauthorized();
error MissingRecord();

if (!authorized) revert Unauthorized();`
  },
  VF004: {
    category: 'unprotected-read',
    impact: 'An arbitrary caller may retrieve sensitive financial or identity-linked information without a visible authorization boundary.',
    saferPattern: `function viewMySalary()
    external
    view
    returns (uint256)
{
    return salaryByEmployee[msg.sender];
}`
  },
  VF005: {
    category: 'unprotected-write',
    impact: 'An untrusted caller may change sensitive state, corrupt records or trigger financial actions outside the intended workflow.',
    saferPattern: `function setSalary(address employee, uint256 amount)
    external
    onlyPayrollAdmin
{
    salaryByEmployee[employee] = amount;
}`
  },
  VF006: {
    category: 'trust-boundary',
    impact: 'Low-level execution hides interface guarantees and can move control or confidential values across an unintended trust boundary.',
    saferPattern: `interface ISettlementTarget {
    function settle(bytes32 commitment) external;
}

ISettlementTarget(target).settle(commitment);`
  },
  VF007: {
    category: 'cross-contract-flow',
    impact: 'Sensitive values may leave the current contract and become observable or usable by a destination with different privacy guarantees.',
    saferPattern: `bytes32 commitment = keccak256(
    abi.encode(employee, salary, nonce)
);
settlement.submitCommitment(commitment);`
  },
  VF008: {
    category: 'public-mapping',
    impact: 'Automatic mapping getters let observers query known keys and gradually reconstruct sensitive indexed records.',
    saferPattern: `mapping(address => uint256) private salaryByEmployee;

function viewMySalary() external view returns (uint256) {
    return salaryByEmployee[msg.sender];
}`
  },
  VF009: {
    category: 'administrative-access',
    impact: 'A public administrative selector can alter roles, configuration or critical state without proving the caller is authorized.',
    saferPattern: `function setOperator(address next)
    external
    onlyAdmin
{
    operator = next;
}`
  },
  VF010: {
    category: 'authorization',
    impact: 'tx.origin can authorize a malicious intermediary contract and breaks clear caller boundaries required by financial applications.',
    saferPattern: `if (msg.sender != owner) {
    revert Unauthorized();
}`
  },
  VF011: {
    category: 'runtime-event-disclosure',
    impact: 'Runtime values placed in an event become permanent public metadata even when the surrounding contract flow is intended to be private.',
    saferPattern: `bytes32 paymentCommitment = keccak256(
    abi.encode(employee, amount, nonce)
);
emit PaymentCommitted(paymentCommitment);`
  },
  VF012: {
    category: 'public-calldata',
    impact: 'Plaintext string and bytes arguments remain visible in transaction calldata and can expose documents, identities, memos or KYC data.',
    saferPattern: `function submitDocument(bytes32 documentHash) external {
    documentHashByAccount[msg.sender] = documentHash;
}`
  }
};

const severityRank = { critical: 0, high: 1, medium: 2, low: 3 };


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
let baselineReports = { vulnerable: null, hardened: null };
let findingFilters = { severity: 'all', policy: 'all', query: '' };

const $ = (id) => document.getElementById(id);

const ARC_CHAIN_ID = 5042002;
const ARC_CHAIN_HEX = '0x4cef52';
const ARC_RPC_URL = 'https://rpc.drpc.testnet.arc.network';
const ARC_EXPLORER = 'https://testnet.arcscan.app';
const REGISTRY_ADDRESS = '0xf8b1D03931f2c11B642259d9aB19cfA3351C0Bbc';
const WALLET_SESSION_KEY = 'veilforge-wallet-disconnected';
let headerWalletAddress = '';

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


function shortAddress(address){
  return address ? `${address.slice(0,6)}…${address.slice(-4)}` : 'Connect wallet';
}

function setHeaderWallet(address='', connected=false){
  const button=$('headerWalletBtn');
  const label=$('headerWalletLabel');
  if(!button || !label) return;
  headerWalletAddress=connected ? address : '';
  button.classList.toggle('connected',connected);
  button.setAttribute('aria-expanded','false');
  label.textContent=connected ? shortAddress(address) : 'Connect wallet';
  const publishButton=$('publishBtn');
  if(publishButton && !/Publish another report/i.test(publishButton.textContent||'')) {
    publishButton.textContent=connected ? 'Publish report on Arc' : 'Connect wallet & publish on Arc';
  }
  button.title=connected ? `Connected to Arc Testnet as ${address}. Click to manage.` : 'Connect a browser wallet';
  const menuAddress=$('walletMenuAddress');
  const explorer=$('walletViewExplorer');
  if(menuAddress) menuAddress.textContent=connected ? address : '—';
  if(explorer) explorer.href=connected ? `${ARC_EXPLORER}/address/${address}` : '#';
}

function openWalletMenu(){
  if(!headerWalletAddress) return;
  const menu=$('walletMenu');
  const backdrop=$('walletMenuBackdrop');
  if(!menu || !backdrop) return;
  menu.hidden=false; backdrop.hidden=false;
  menu.setAttribute('aria-hidden','false');
  $('headerWalletBtn')?.setAttribute('aria-expanded','true');
  requestAnimationFrame(()=>{menu.classList.add('open');backdrop.classList.add('open')});
}
function closeWalletMenu(){
  const menu=$('walletMenu');
  const backdrop=$('walletMenuBackdrop');
  if(!menu || !backdrop) return;
  menu.classList.remove('open');backdrop.classList.remove('open');
  menu.setAttribute('aria-hidden','true');
  $('headerWalletBtn')?.setAttribute('aria-expanded','false');
  setTimeout(()=>{menu.hidden=true;backdrop.hidden=true},160);
}
function disconnectHeaderWallet(){
  localStorage.setItem(WALLET_SESSION_KEY,'1');
  setHeaderWallet('',false);
  closeWalletMenu();
  setPublishState('Wallet disconnected from VeilForge. Reconnect when you are ready to publish.','');
  const publish=$('publishBtn');
  if(publish) publish.textContent='Connect wallet & publish on Arc';
}
async function copyWalletAddress(){
  if(!headerWalletAddress) return;
  try{await navigator.clipboard.writeText(headerWalletAddress);
    const button=$('walletCopyAddress'); if(button){const old=button.textContent;button.textContent='Copied';setTimeout(()=>button.textContent=old,1200)}
  }catch{}
}

async function connectHeaderWallet(){
  if(headerWalletAddress){openWalletMenu();return;}
  const button=$('headerWalletBtn');
  try{
    if(button) button.disabled=true;
    await ensureArcNetwork();
    const accounts=await window.ethereum.request({method:'eth_requestAccounts'});
    const address=accounts?.[0]||'';
    if(address) localStorage.removeItem(WALLET_SESSION_KEY);
    setHeaderWallet(address,Boolean(address));
    setPublishState(address ? `Wallet connected: ${escapeHtml(shortAddress(address))} on Arc Testnet.` : 'Wallet connection was not completed.',address?'success':'');
  }catch(error){
    const message=error?.shortMessage||error?.reason||error?.message||'Wallet connection failed.';
    setHeaderWallet('',false);
    setPublishState(`Could not connect wallet: ${escapeHtml(message)}`,'error');
  }finally{
    if(button) button.disabled=false;
  }
}

async function hydrateWalletState(){
  if(!window.ethereum || localStorage.getItem(WALLET_SESSION_KEY)==='1'){setHeaderWallet('',false);return;}
  try{
    const accounts=await window.ethereum.request({method:'eth_accounts'});
    setHeaderWallet(accounts?.[0]||'',Boolean(accounts?.[0]));
  }catch{}
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
    const signerAddress=await signer.getAddress();
    localStorage.removeItem(WALLET_SESSION_KEY);
    setHeaderWallet(signerAddress,true);
    const contract=new ethers.Contract(REGISTRY_ADDRESS,REGISTRY_ABI,signer);
    const projectName=($('projectName').value||'untitled-project').trim();
    const projectId=ethers.keccak256(ethers.toUtf8Bytes(projectName));
    const reportURI=($('reportUri').value||window.location.href).trim();
    const tx=await contract.publishReport(projectId,report.sourceHash,report.reportHash,report.score,'veilforge-1.1.0',reportURI);
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
  const playbook = remediationPlaybook[ruleId] || {
    category: 'privacy-review',
    impact: description,
    saferPattern: ''
  };
  const suggestedPolicy = severity === 'critical' ? 'Locked' : severity === 'high' || severity === 'medium' ? 'Restricted' : 'Open';
  findings.push({
    key, ruleId, title, description, severity, file, startLine: line, endLine: line,
    evidence: evidence.trim(), remediation, confidence,
    category: playbook.category,
    impact: playbook.impact,
    saferPattern: playbook.saferPattern,
    suggestedPolicy
  });
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

function extractPublicGetters(source, file) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const getters = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (
      !trimmed ||
      trimmed.startsWith('//') ||
      !trimmed.endsWith(';') ||
      !/\bpublic\b/.test(trimmed) ||
      /\b(function|event|error|struct|enum|modifier)\b/.test(trimmed)
    ) {
      return;
    }

    const mappingMatch = trimmed.match(
      /^mapping\s*\(\s*([^=]+?)\s*=>\s*([^)]+?)\s*\)\s+public\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/
    );

    if (mappingMatch) {
      const keyType = mappingMatch[1].trim();
      const returnType = mappingMatch[2].trim();
      const name = mappingMatch[3];

      getters.push({
        file,
        name,
        params: keyType,
        tail: 'external view',
        visibility: 'external',
        mutability: 'view',
        startLine: index + 1,
        endLine: index + 1,
        source: line,
        signature: `${name}(${keyType})`,
        generatedGetter: true,
        returnType
      });

      return;
    }

    const variableMatch = trimmed.match(
      /^(.+?)\s+public\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/
    );

    if (!variableMatch) return;

    const returnType = variableMatch[1].trim();
    const name = variableMatch[2];

    if (/^(mapping|function)\b/.test(returnType)) return;

    getters.push({
      file,
      name,
      params: '',
      tail: 'external view',
      visibility: 'external',
      mutability: 'view',
      startLine: index + 1,
      endLine: index + 1,
      source: line,
      signature: `${name}()`,
      generatedGetter: true,
      returnType
    });
  });

  return getters;
}



function scanFile(file) {
  const source = file.content.replace(/\r\n?/g,'\n');
  const lines = source.split('\n');
  const findings = [];
  const functions = [
  ...extractFunctions(source, file.path),
  ...extractPublicGetters(source, file.path)
];

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
    if (fn.generatedGetter) return;
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
  const sourceHash=await sha256(sourcePayload); const stable={schemaVersion:'1.1',scannerVersion:'1.1.0',score,grade,summary,findings:findings.map(({key,...f})=>f),policies:policies.map(p=>({file:p.file,name:p.name,signature:p.signature,startLine:p.startLine,policy:p.policy,reason:p.reason})),sourceHash}; const reportHash=await sha256(canonical(stable));
  return {...stable,findings,policies,sourceHash,reportHash,disclaimer:"Pre-APS readiness analysis based on Arc's published design. Independent community tool; not an official Circle product or formal audit."};
}

function severityAtLine(line,findings){const items=findings.filter(f=>line>=f.startLine&&line<=f.endLine);return items.some(f=>f.severity==='critical')?'critical':items.some(f=>f.severity==='high')?'high':items.length?'medium':''}
function renderCode(){const file=files.find(f=>f.path===activeFile)||files[0];if(!file)return; $('activeFileName').textContent=file.path; const relevant=report.findings.filter(f=>f.file===file.path); $('codeView').innerHTML=file.content.replace(/\r\n?/g,'\n').split('\n').map((line,i)=>{const n=i+1;const count=relevant.filter(f=>n>=f.startLine&&n<=f.endLine).length;return `<div class="codeLine ${severityAtLine(n,relevant)}"><span class="lineNo">${n}</span><code>${escapeHtml(line)||' '}</code>${count?`<span class="marker">${count}</span>`:''}</div>`}).join('')}
function getFilteredFindings(){
  const query=findingFilters.query.trim().toLowerCase();
  return report.findings.filter(f=>{
    const severityMatch=findingFilters.severity==='all'||f.severity===findingFilters.severity;
    const policyMatch=findingFilters.policy==='all'||f.suggestedPolicy===findingFilters.policy;
    const haystack=`${f.ruleId} ${f.title} ${f.description} ${f.file} ${f.category} ${f.suggestedPolicy}`.toLowerCase();
    return severityMatch&&policyMatch&&(!query||haystack.includes(query));
  });
}
function renderFindings(){
  const list=$('findingList');
  const filtered=getFilteredFindings();
  $('findingCount').textContent=filtered.length===report.findings.length?report.findings.length:`${filtered.length}/${report.findings.length}`;
  if(!report.findings.length){list.innerHTML='<div class="finding-empty"><b>No current rule matched</b><small>Continue manual review.</small></div>';return}
  if(!filtered.length){list.innerHTML='<div class="finding-empty"><b>No findings match these filters</b><small>Clear the search or select another severity.</small></div>';return}
  list.innerHTML=filtered.map(f=>`<article class="finding ${f.severity}" data-file="${escapeHtml(f.file)}" data-line="${f.startLine}"><span class="findingIcon">!</span><div><div class="findingMeta"><b>${f.ruleId}</b><em>${f.severity}</em><small>${escapeHtml(f.file)}:${f.startLine}</small></div><h3>${escapeHtml(f.title)}</h3><p>${escapeHtml(f.description)}</p><span class="finding-policy policy-${f.suggestedPolicy.toLowerCase()}">${f.suggestedPolicy}</span></div></article>`).join('');
  list.querySelectorAll('.finding').forEach(el=>el.addEventListener('click',()=>{activeFile=el.dataset.file;$('fileSelect').value=activeFile;renderCode();const line=$('codeView').children[Number(el.dataset.line)-1];if(line)line.scrollIntoView({behavior:'smooth',block:'center'})}));
}

let selectedRemediationKey = null;

function renderRemediation(){
  const root = $('remediationContent');
  if(!root || !report) return;
  const prioritized = [...report.findings].sort((a,b)=>
    severityRank[a.severity]-severityRank[b.severity] ||
    a.file.localeCompare(b.file) ||
    a.startLine-b.startLine
  ).slice(0,12);

  if(!prioritized.length){
    root.innerHTML = `<div class="remediation-empty">
      <div class="remediation-empty-icon">✓</div>
      <strong>No deterministic rule matched this source bundle.</strong>
      <p>Continue manual review. VeilForge is a privacy-readiness assistant, not a formal security audit.</p>
    </div>`;
    return;
  }

  if(!prioritized.some(f=>f.key===selectedRemediationKey)) selectedRemediationKey=prioritized[0].key;
  const selected=prioritized.find(f=>f.key===selectedRemediationKey)||prioritized[0];

  root.innerHTML = `<div class="remediation-layout">
    <aside class="fix-queue">
      <div class="fix-queue-title"><div><span>PRIORITIZED FIX PLAN</span><strong>${report.findings.length} actions</strong></div><b>✓</b></div>
      <div class="fix-queue-list">
        ${prioritized.map((f,index)=>`<button type="button" class="fix-queue-item fix-${f.severity} ${f.key===selected.key?'active':''}" data-key="${escapeHtml(f.key)}">
          <span class="fix-rank">${String(index+1).padStart(2,'0')}</span>
          <span class="fix-copy"><span><b>${f.ruleId}</b><em>${f.severity}</em></span><strong>${escapeHtml(f.title)}</strong><small>${escapeHtml(f.file)}:${f.startLine}</small></span>
          <span class="fix-arrow">→</span>
        </button>`).join('')}
      </div>
    </aside>
    <article class="remediation-detail detail-${selected.severity}">
      <div class="remediation-heading">
        <div>
          <span class="finding-kicker">⚠ ${selected.ruleId} · ${selected.severity}</span>
          <h3>${escapeHtml(selected.title)}</h3>
          <p>${escapeHtml(selected.description)}</p>
        </div>
        <span class="policy-chip policy-${selected.suggestedPolicy.toLowerCase()}">${selected.suggestedPolicy}</span>
      </div>
      <div class="remediation-meta-grid">
        <div><span>Category</span><strong>${escapeHtml((selected.category||'privacy-review').replaceAll('-',' '))}</strong></div>
        <div><span>Confidence</span><strong>${escapeHtml(selected.confidence)}</strong></div>
        <div><span>Source</span><strong>${escapeHtml(selected.file)}:${selected.startLine}</strong></div>
      </div>
      <section class="remediation-section">
        <span class="section-label">◈ Why it matters</span>
        <p>${escapeHtml(selected.impact||selected.description)}</p>
      </section>
      <section class="remediation-section">
        <div class="section-heading-row"><span class="section-label">⌘ Evidence</span><button type="button" class="copy-mini" data-copy="evidence">Copy evidence</button></div>
        <pre><code>${escapeHtml(selected.evidence)}</code></pre>
      </section>
      <section class="remediation-section recommended-fix">
        <div class="section-heading-row"><span class="section-label">⚡ Recommended remediation</span><button type="button" class="copy-mini" data-copy="policy">Copy policy</button></div>
        <p>${escapeHtml(selected.remediation)}</p>
      </section>
      ${selected.saferPattern?`<section class="remediation-section safer-pattern">
        <div class="section-heading-row"><span class="section-label">✓ Safer Solidity pattern</span><button type="button" class="copy-mini" data-copy="pattern">Copy pattern</button></div>
        <pre><code>${escapeHtml(selected.saferPattern)}</code></pre>
        <small>Illustrative pattern only. Adapt authorization and data design to the application.</small>
      </section>`:''}
    </article>
  </div>`;

  root.querySelectorAll('.fix-queue-item').forEach(button=>button.addEventListener('click',()=>{
    selectedRemediationKey=button.dataset.key;
    renderRemediation();
  }));
  root.querySelectorAll('.copy-mini').forEach(button=>button.addEventListener('click',()=>{
    const kind=button.dataset.copy;
    const value=kind==='evidence'?selected.evidence:kind==='pattern'?selected.saferPattern:`${selected.suggestedPolicy}: ${selected.remediation}`;
    copyText(value||'',button);
  }));
}

function reportToMarkdown(currentReport){
  const lines = [
    '# VeilForge Privacy Readiness Report',
    '',
    `- Scanner: VeilForge v${currentReport.scannerVersion}`,
    `- Schema: ${currentReport.schemaVersion}`,
    `- Score: ${currentReport.score}/100 (Grade ${currentReport.grade})`,
    `- Source hash: \`${currentReport.sourceHash}\``,
    `- Report hash: \`${currentReport.reportHash}\``,
    '',
    '## Summary',
    '',
    `- Critical: ${currentReport.summary.critical}`,
    `- High: ${currentReport.summary.high}`,
    `- Medium: ${currentReport.summary.medium}`,
    `- Low: ${currentReport.summary.low}`,
    '',
    '## Findings',
    ''
  ];
  if(!currentReport.findings.length) lines.push('No deterministic rule matched this source bundle.', '');
  currentReport.findings.forEach((f,index)=>{
    lines.push(
      `### ${index+1}. ${f.ruleId} — ${f.title}`,
      '',
      `- Severity: **${f.severity.toUpperCase()}**`,
      `- Policy: **${f.suggestedPolicy}**`,
      `- Source: \`${f.file}:${f.startLine}\``,
      `- Confidence: ${f.confidence}`,
      '',
      f.description,
      '',
      '#### Why it matters',
      '',
      f.impact || f.description,
      '',
      '#### Evidence',
      '',
      '```solidity',
      f.evidence,
      '```',
      '',
      '#### Recommended remediation',
      '',
      f.remediation,
      ''
    );
    if(f.saferPattern){
      lines.push('#### Safer pattern','','```solidity',f.saferPattern,'```','');
    }
  });
  lines.push('## APS-aligned policy recommendations','');
  currentReport.policies.forEach(p=>lines.push(`- **${p.policy}** \`${p.signature}\` — ${p.reason} (${p.file}:${p.startLine})`));
  lines.push('', '---', '', currentReport.disclaimer);
  return lines.join('\n');
}

function buildPolicyManifest(currentReport){
  return {
    schema: 'veilforge-policy/1.1',
    generatedBy: `VeilForge v${currentReport.scannerVersion}`,
    sourceHash: currentReport.sourceHash,
    reportHash: currentReport.reportHash,
    selectors: currentReport.policies.map(policy=>({
      signature: policy.signature,
      file: policy.file,
      line: policy.startLine,
      policy: policy.policy,
      reason: policy.reason
    })),
    disclaimer: 'Pre-APS policy recommendation artifact. Review manually before applying to production.'
  };
}

function saferPatternsToMarkdown(currentReport){
  const seen=new Set();
  const lines=['# VeilForge Safer Solidity Patterns','',`Generated by VeilForge v${currentReport.scannerVersion}`,''];
  currentReport.findings.forEach((finding,index)=>{
    if(!finding.saferPattern) return;
    const key=`${finding.ruleId}|${finding.saferPattern}`;
    if(seen.has(key)) return;
    seen.add(key);
    lines.push(`## ${finding.ruleId} — ${finding.title}`,'',finding.remediation,'','```solidity',finding.saferPattern,'```','');
  });
  if(!seen.size) lines.push('No deterministic remediation pattern was generated for this source bundle.','');
  lines.push('---','',currentReport.disclaimer);
  return lines.join('\n');
}

function proofMetadata(currentReport){
  return {
    scannerVersion: currentReport.scannerVersion,
    schemaVersion: currentReport.schemaVersion,
    sourceHash: currentReport.sourceHash,
    reportHash: currentReport.reportHash,
    score: currentReport.score,
    grade: currentReport.grade,
    findings: currentReport.findings.length,
    chain: { name: 'Arc Testnet', chainId: 5042002 },
    registry: '0xf8b1D03931f2c11B642259d9aB19cfA3351C0Bbc',
    storageModel: 'Hashes and metadata only'
  };
}

function crc32(bytes){
  let crc=-1;
  for(const byte of bytes){
    crc^=byte;
    for(let i=0;i<8;i++) crc=(crc>>>1)^((crc&1)?0xEDB88320:0);
  }
  return (crc^-1)>>>0;
}
function le16(value){return [value&255,(value>>>8)&255]}
function le32(value){return [value&255,(value>>>8)&255,(value>>>16)&255,(value>>>24)&255]}
function createStoredZip(files){
  const encoder=new TextEncoder();
  const local=[]; const central=[]; let offset=0;
  Object.entries(files).forEach(([name,content])=>{
    const nameBytes=encoder.encode(name); const data=typeof content==='string'?encoder.encode(content):content;
    const crc=crc32(data);
    const localHeader=new Uint8Array([
      0x50,0x4b,0x03,0x04,20,0,0,0,0,0,0,0,0,0,...le32(crc),...le32(data.length),...le32(data.length),...le16(nameBytes.length),0,0
    ]);
    local.push(localHeader,nameBytes,data);
    const centralHeader=new Uint8Array([
      0x50,0x4b,0x01,0x02,20,0,20,0,0,0,0,0,0,0,0,0,...le32(crc),...le32(data.length),...le32(data.length),...le16(nameBytes.length),0,0,0,0,0,0,0,0,0,0,0,0,...le32(offset)
    ]);
    central.push(centralHeader,nameBytes);
    offset+=localHeader.length+nameBytes.length+data.length;
  });
  const centralSize=central.reduce((n,part)=>n+part.length,0);
  const end=new Uint8Array([0x50,0x4b,0x05,0x06,0,0,0,0,...le16(Object.keys(files).length),...le16(Object.keys(files).length),...le32(centralSize),...le32(offset),0,0]);
  return new Blob([...local,...central,end],{type:'application/zip'});
}
function downloadRemediationPack(currentReport){
  const id=currentReport.reportHash.slice(2,10);
  const manifest=buildPolicyManifest(currentReport);
  const files={
    'veilforge-report.md': reportToMarkdown(currentReport),
    'veilforge-report.json': JSON.stringify(currentReport,null,2),
    'veilforge-policy.json': JSON.stringify(manifest,null,2),
    'safer-patterns.md': saferPatternsToMarkdown(currentReport),
    'proof-metadata.json': JSON.stringify(proofMetadata(currentReport),null,2),
    'README.txt': 'VeilForge Remediation Pack\n\nReview all generated recommendations manually before production use. Source code remains local; the proof artifact contains hashes and metadata only.'
  };
  const blob=createStoredZip(files);
  const url=URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=url; a.download=`veilforge-remediation-pack-${id}.zip`; a.click(); URL.revokeObjectURL(url);
}
async function copyText(text,button){
  try{await navigator.clipboard.writeText(text); const old=button.textContent; button.textContent='Copied ✓'; setTimeout(()=>button.textContent=old,1200)}
  catch{button.textContent='Copy failed'}
}

function downloadBlob(content,type,filename){
  const blob=new Blob([content],{type});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=filename;
  a.click();
  URL.revokeObjectURL(url);
}


function topFinding(){
  const ranks={critical:0,high:1,medium:2,low:3};
  return [...report.findings].sort((a,b)=>ranks[a.severity]-ranks[b.severity]||a.startLine-b.startLine)[0]||null;
}
function renderExecutiveSummary(){
  const root=$('executiveSummary');
  if(!root||!report)return;
  const top=topFinding();
  const locked=report.policies.filter(p=>p.policy==='Locked').length;
  const restricted=report.policies.filter(p=>p.policy==='Restricted').length;
  const ranks={critical:0,high:1,medium:2,low:3};
  const actions=[...report.findings].sort((a,b)=>ranks[a.severity]-ranks[b.severity]).slice(0,3);
  const exposure=report.score>=90?'Low':report.score>=75?'Moderate':report.score>=55?'High':'Critical';
  root.innerHTML=`<div class="executive-main"><div><span class="executive-kicker">EXECUTIVE SCAN SUMMARY</span><h3>${report.score}/100 · ${exposure} exposure</h3><p>${report.findings.length} deterministic findings across ${report.policies.length} callable ${report.policies.length===1?'selector':'selectors'}. ${top?`Top risk: <strong>${escapeHtml(top.title)}</strong>.`:'No deterministic privacy risk matched.'}</p></div><div class="executive-badge grade-${report.grade.toLowerCase()}"><small>GRADE</small><b>${report.grade}</b></div></div><div class="executive-stats"><span><b>${report.summary.critical}</b> Critical</span><span><b>${report.summary.high}</b> High</span><span><b>${locked}</b> Locked</span><span><b>${restricted}</b> Restricted</span></div><div class="top-actions"><small>TOP ACTIONS BEFORE DEPLOYMENT</small>${actions.length?actions.map((f,i)=>`<button type="button" data-key="${escapeHtml(f.key)}"><i>${i+1}</i><span><b>${escapeHtml(f.title)}</b><em>${escapeHtml(f.remediation)}</em></span><strong>${f.suggestedPolicy}</strong></button>`).join(''):'<p>No deterministic action required. Continue manual review.</p>'}</div>`;
  root.querySelectorAll('.top-actions button').forEach(button=>button.addEventListener('click',()=>{selectedRemediationKey=button.dataset.key;document.querySelector('[data-tab="remediation"]').click();renderRemediation();}));
}
function renderComparison(){
  const root=$('comparisonContent');
  const before=baselineReports.vulnerable, after=baselineReports.hardened;
  if(!root||!before||!after)return;
  const policyCounts=r=>({open:r.policies.filter(p=>p.policy==='Open').length,restricted:r.policies.filter(p=>p.policy==='Restricted').length,locked:r.policies.filter(p=>p.policy==='Locked').length});
  const bp=policyCounts(before), ap=policyCounts(after);
  const resolved=Math.max(0,before.findings.length-after.findings.length);
  root.innerHTML=`<section class="compare-hero"><div><small>HARDENING IMPACT</small><h3>See exactly what remediation changes.</h3><p>The same payroll workflow, measured before and after privacy hardening.</p></div><div class="compare-gain"><span>READINESS GAIN</span><b>+${after.score-before.score}</b><small>points</small></div></section><section class="compare-grid"><article class="compare-card before"><header><span>BEFORE</span><b>Vulnerable Payroll</b></header><div class="compare-score"><strong>${before.score}</strong><small>/100 · Grade ${before.grade}</small></div><dl><div><dt>Findings</dt><dd>${before.findings.length}</dd></div><div><dt>Critical</dt><dd>${before.summary.critical}</dd></div><div><dt>High</dt><dd>${before.summary.high}</dd></div><div><dt>Restricted</dt><dd>${bp.restricted}</dd></div><div><dt>Locked</dt><dd>${bp.locked}</dd></div></dl></article><div class="compare-flow"><span>→</span><b>${resolved} risks resolved</b><small>Deterministic before / after delta</small></div><article class="compare-card after"><header><span>AFTER</span><b>Hardened Payroll</b></header><div class="compare-score"><strong>${after.score}</strong><small>/100 · Grade ${after.grade}</small></div><dl><div><dt>Findings</dt><dd>${after.findings.length}</dd></div><div><dt>Critical</dt><dd>${after.summary.critical}</dd></div><div><dt>High</dt><dd>${after.summary.high}</dd></div><div><dt>Restricted</dt><dd>${ap.restricted}</dd></div><div><dt>Locked</dt><dd>${ap.locked}</dd></div></dl></article></section><section class="compare-outcomes"><article><span>01</span><div><b>Public indexed records removed</b><p>Automatic getters no longer expose payroll and identity-linked storage.</p></div></article><article><span>02</span><div><b>Authorization boundaries added</b><p>Sensitive reads and writes move behind explicit caller controls.</p></div></article><article><span>03</span><div><b>Raw disclosures replaced</b><p>Events and cross-contract payloads use minimal or committed data.</p></div></article></section>`;
}

function renderPolicies(){const groups=['Open','Restricted','Locked'];$('policyGrid').innerHTML=groups.map(policy=>{const items=report.policies.filter(p=>p.policy===policy);return `<section class="policyCol"><header><div><strong>${policy}</strong><small>${policy==='Open'?'Broadly callable selector':policy==='Restricted'?'Explicit grant required':'Selector unavailable'}</small></div><span>${items.length}</span></header><div class="policyItems">${items.length?items.map(p=>`<article><code>${escapeHtml(p.signature)}</code><p>${escapeHtml(p.reason)}</p><small>${escapeHtml(p.file)} · line ${p.startLine}</small></article>`).join(''):'<p style="text-align:center;color:#596477;font-size:9px">No selectors</p>'}</div></section>`}).join('')}
function renderMetrics(){const score=report.score;$('scoreValue').textContent=score;$('gradeValue').textContent=report.grade;$('readinessLabel').textContent=score>=90?'Ready':score>=75?'Review':score>=55?'Exposed':'Critical';$('scoreRing').style.setProperty('--score',`${score*3.6}deg`);$('criticalCount').textContent=report.summary.critical;$('highCount').textContent=report.summary.high;$('policyCount').textContent=report.policies.length;$('sourceHash').textContent=report.sourceHash;$('reportHash').textContent=report.reportHash;$('proofScore').textContent=`${report.score}/100 · Grade ${report.grade}`;$('proofFindings').textContent=`${report.findings.length} deterministic checks`}
async function refresh(){
  report=await scanAll();
  const vuln=await (async()=>{const old=files;files=[{path:'Payroll.sol',content:vulnerableSource}];const x=await scanAll();files=old;return x})();
  const hard=await (async()=>{const old=files;files=[{path:'PayrollPrivateReady.sol',content:hardenedSource}];const x=await scanAll();files=old;return x})();
  baselineReports={vulnerable:vuln,hardened:hard};
  renderMetrics();renderExecutiveSummary();renderCode();renderFindings();renderRemediation();renderComparison();renderPolicies();
  $('deltaValue').textContent=`+${hard.score-vuln.score} points`;
  $('deltaText').textContent=`Vulnerable ${vuln.score} → Hardened ${hard.score}`;
}
function setFiles(next,mode){files=next;activeFile=files[0].path;document.querySelectorAll('.modes button').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));const custom=document.querySelector('[data-mode="custom"]');custom.hidden=mode!=='custom';$('fileSelect').innerHTML=files.map(f=>`<option value="${escapeHtml(f.path)}">${escapeHtml(f.path)}</option>`).join('');$('projectName').value=mode==='hardened'?'veilforge-payroll-hardened':mode==='custom'?files[0].path.replace(/\.sol$/i,'').toLowerCase():'veilforge-payroll';$('proofProject').textContent=$('projectName').value;refresh()}

function wire(){
  $('heroDemo').onclick=()=>{$('scanner').scrollIntoView({behavior:'smooth'});setFiles([{path:'Payroll.sol',content:vulnerableSource}],'vulnerable')};
  const openPicker=()=>$('fileInput').click();$('heroUpload').onclick=openPicker;$('uploadBtn').onclick=openPicker;
  $('fileInput').onchange=async(e)=>{
  const uploadStatus=$('uploadStatus');
  const chosen=[...e.target.files].filter(f=>f.name.toLowerCase().endsWith('.sol'));

  if(!chosen.length){
    if(uploadStatus){
      uploadStatus.textContent='Upload failed. Please select a valid Solidity file.';
      uploadStatus.className='uploadStatus error';
    }
    return;
  }

  try{
    if(uploadStatus){
      uploadStatus.textContent='Uploading and analyzing...';
      uploadStatus.className='uploadStatus pending';
    }

    const loaded=await Promise.all(
      chosen.map(async f=>({
        path:f.name,
        content:await f.text()
      }))
    );

    setFiles(loaded,'custom');

    if(uploadStatus){
      const uploadedName=loaded.length===1
        ? loaded[0].path
        : `${loaded.length} Solidity files`;

      uploadStatus.textContent=`${uploadedName} uploaded and analyzed successfully.`;
      uploadStatus.className='uploadStatus success';
    }

    e.target.value='';
  }catch(error){
    console.error(error);

    if(uploadStatus){
      uploadStatus.textContent='Upload failed. Please select a valid Solidity file.';
      uploadStatus.className='uploadStatus error';
    }
  }
};
  document.querySelectorAll('.modes button').forEach(button=>button.addEventListener('click',()=>{if(button.dataset.mode==='vulnerable')setFiles([{path:'Payroll.sol',content:vulnerableSource}],'vulnerable');if(button.dataset.mode==='hardened')setFiles([{path:'PayrollPrivateReady.sol',content:hardenedSource}],'hardened')}));
  document.querySelectorAll('.tabs button').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('active'));button.classList.add('active');document.querySelectorAll('.tabPane').forEach(p=>p.classList.remove('active'));$(`${button.dataset.tab}Tab`).classList.add('active')}));
  $('fileSelect').onchange=e=>{activeFile=e.target.value;renderCode()};
  $('findingSearch').oninput=e=>{findingFilters.query=e.target.value;renderFindings()};
  $('policyFilter').onchange=e=>{findingFilters.policy=e.target.value;renderFindings()};
  document.querySelectorAll('.severity-filters button').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('.severity-filters button').forEach(b=>b.classList.remove('active'));button.classList.add('active');findingFilters.severity=button.dataset.severity;renderFindings()}));
  $('projectName').oninput=e=>$('proofProject').textContent=e.target.value||'Untitled project';
  $('exportBtn').onclick=()=>downloadBlob(JSON.stringify(report,null,2),'application/json',`veilforge-report-${report.reportHash.slice(2,10)}.json`);
  $('markdownBtn').onclick=()=>downloadBlob(reportToMarkdown(report),'text/markdown',`veilforge-report-${report.reportHash.slice(2,10)}.md`);
  $('policyBtn').onclick=()=>downloadBlob(JSON.stringify(buildPolicyManifest(report),null,2),'application/json',`veilforge-policy-${report.reportHash.slice(2,10)}.json`);
  $('packBtn').onclick=()=>downloadRemediationPack(report);
  $('publishBtn').onclick=publishCurrentReport;
  if($('headerWalletBtn')) $('headerWalletBtn').onclick=connectHeaderWallet;
  if($('walletMenuClose')) $('walletMenuClose').onclick=closeWalletMenu;
  if($('walletMenuBackdrop')) $('walletMenuBackdrop').onclick=closeWalletMenu;
  if($('walletDisconnect')) $('walletDisconnect').onclick=disconnectHeaderWallet;
  if($('walletCopyAddress')) $('walletCopyAddress').onclick=copyWalletAddress;
  document.addEventListener('keydown',event=>{if(event.key==='Escape') closeWalletMenu()});
  if(window.ethereum){
    window.ethereum.on?.('accountsChanged',(accounts)=>{
      if(!accounts?.length){localStorage.setItem(WALLET_SESSION_KEY,'1');setHeaderWallet('',false);closeWalletMenu();return;}
      if(localStorage.getItem(WALLET_SESSION_KEY)!=='1') setHeaderWallet(accounts[0],true);
    });
    window.ethereum.on?.('chainChanged',()=>hydrateWalletState());
  }
}

async function scanStandalone(inputFiles){
  const previous=files;
  files=inputFiles;
  try { return await scanAll(); }
  finally { files=previous; }
}

if (typeof document !== 'undefined') {
  wire();
  hydrateWalletState();
  setFiles([{path:'Payroll.sol',content:vulnerableSource}],'vulnerable');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports={scanStandalone,vulnerableSource,hardenedSource};
}
