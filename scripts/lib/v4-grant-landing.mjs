const githubUrl = 'https://github.com/CryptoDombili/veilforge';

const grantSections = `
    <section class="grant-proof-strip" aria-label="Verified release evidence">
      <article><strong>60/60</strong><span>maintained oracle cases passed</span></article>
      <article><strong>56 TP / 0 FP / 0 FN</strong><span>bounded benchmark baseline</span></article>
      <article><strong>Arc Testnet</strong><span>real proof publication verified</span></article>
      <article><strong>Local-first</strong><span>analysis runs without source upload</span></article>
    </section>

    <section class="grant-section" id="arc-impact">
      <header class="grant-section-head"><p>WHY VEILFORGE MATTERS FOR ARC</p><h2>Privacy readiness for the applications that move value.</h2><span>VeilForge gives Arc teams a reproducible way to inspect application-level disclosure risk before release.</span></header>
      <div class="grant-grid four">
        <article><small>01</small><h3>Payments</h3><p>Trace sensitive payment data into events, returns, metadata, storage getters, and external calls.</p></article>
        <article><small>02</small><h3>Treasury</h3><p>Review approvals, operational metadata, and disclosure paths with source-backed evidence.</p></article>
        <article><small>03</small><h3>Private credit</h3><p>Inspect borrower terms and collateral flows across contract boundaries and public surfaces.</p></article>
        <article><small>04</small><h3>Release evidence</h3><p>Carry deterministic findings, policy, integrity hashes, and proof identity into release review.</p></article>
      </div>
      <p class="grant-boundary">VeilForge is a privacy-readiness analysis and evidence tool. It is not an audit, formal verification, a confidentiality guarantee, or proof of universal correctness.</p>
    </section>

    <section class="grant-section evidence-section" id="technical-evidence">
      <header class="grant-section-head"><p>EVIDENCE, NOT PROMISES</p><h2>A reviewable chain from compiler to publication.</h2></header>
      <div class="evidence-layout">
        <img src="./whitepaper/figures/veilforge-architecture.svg" alt="VeilForge architecture from local Solidity input through deterministic analysis, verified report, policy gate, and proof publication" />
        <ul>
          <li><b>Exact compiler boundary</b><span>solc 0.8.24 with bounded browser inputs.</span></li>
          <li><b>Verified report identity</b><span>Schema 4.1.0 and veilforge.report.hash.v2.</span></li>
          <li><b>Developer workflow</b><span>CLI, SDK, SARIF, GitHub Action, and policy gate.</span></li>
          <li><b>Real Testnet evidence</b><span>Receipt/event reconciliation and duplicate prevention.</span></li>
          <li><b>Fail-closed mainnet</b><span>Read and publish remain disabled until operational gates resolve.</span></li>
        </ul>
      </div>
    </section>

    <section class="grant-section whitepaper-section" id="whitepaper">
      <div class="whitepaper-copy"><p>VEILFORGE V4 WHITEPAPER</p><h2>Read the architecture, evidence model, and measurable roadmap.</h2><span>The full paper connects the product boundary to reproducible technical evidence, real Arc Testnet proof, sustainability hypotheses, and explicit limitations.</span><div class="grant-actions"><a class="launch" href="./whitepaper/">Read Whitepaper</a><a class="secondary" href="./whitepaper/VeilForge_V4_Whitepaper.pdf" download>Download PDF</a><a class="secondary" href="./whitepaper/executive-brief.html">Executive Brief</a></div></div>
      <div class="paper-stack" aria-hidden="true"><span>VEILFORGE V4</span><strong>Deterministic privacy-readiness analysis and verifiable evidence for Solidity on Arc.</strong><small>GRANT CANDIDATE / AUGUST 2026</small></div>
    </section>

    <section class="grant-section brief-card" id="executive-brief">
      <div><p>NEED THE TWO-MINUTE VERSION?</p><h2>Start with the executive brief.</h2><span>A concise review of the problem, shipped evidence, Arc relevance, grant use, and bounded claims.</span></div>
      <div class="grant-actions"><a class="launch" href="./whitepaper/executive-brief.html">Read Executive Brief</a><a class="secondary" href="./whitepaper/VeilForge_V4_Executive_Brief.pdf" download>Download PDF</a></div>
    </section>

    <section class="grant-final-cta">
      <p>THE NEXT MEASURABLE STAGE</p><h2>Built evidence-first.<br />Ready for the next measurable stage.</h2>
      <div class="grant-actions"><a class="launch" href="./app/index.html#scanner">Launch V4 Scanner</a><a class="secondary" href="./whitepaper/">Read Whitepaper</a><a class="secondary" href="${githubUrl}" target="_blank" rel="noreferrer">View Open Source</a></div>
    </section>`;

export function buildV4GrantLanding(source) {
  return source
    .replace('<link rel="stylesheet" href="./landing-fixes.css?v=32.7" />', '<link rel="stylesheet" href="./landing-fixes.css?v=32.7" />\n  <link rel="stylesheet" href="./v4-grant-landing.css?v=1" />')
    .replace('<body>', '<body class="v4-grant-landing">')
    .replace(/<div class="navlinks">[\s\S]*?<\/div>\s*<div class="landing-nav-actions">/u, '<div class="navlinks"><a href="#whitepaper">Whitepaper</a><a href="#executive-brief">Executive Brief</a><a href="#technical-evidence">Technical Evidence</a><a href="https://github.com/CryptoDombili/veilforge" target="_blank" rel="noreferrer">Open Source</a></div>\n    <div class="landing-nav-actions">')
    .replace(/<p class="flow-intro-copy">[\s\S]*?<\/p>/u, '<p class="flow-intro-copy">Deterministic Solidity analysis that runs locally, preserves source privacy, and produces verifiable release evidence for Arc teams.</p>')
    .replace('<div class="actions hero-actions"><a class="launch" href="./app/index.html#scanner">Launch V4 Scanner</a><a class="secondary hero-upload" href="./app/index.html#scanner">Upload Solidity project</a></div>', '<div class="actions hero-actions"><a class="launch" href="./app/index.html#scanner">Launch V4 Scanner</a><a class="secondary" href="./whitepaper/">Read Whitepaper</a><a class="secondary" href="./whitepaper/executive-brief.html">Executive Brief</a></div>')
    .replace(/\n    <section class="product"[\s\S]*?\n    <section class="cta">[\s\S]*?<\/section>/u, grantSections);
}
