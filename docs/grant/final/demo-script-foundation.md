# Demo Script Foundation

Use the isolated V4 preview. Do not enable the production flag, open a wallet automatically, send a transaction, expose source/report contents unnecessarily, or present mock data as live chain evidence.

## 30-second demo

1. **Landing:** “VeilForge finds application-level Solidity disclosure risks locally.”
2. **Scanner:** show exact solc 0.8.24, three Arc domains, and source-local boundary.
3. **Verified result:** open a prepared verified report and one source-backed finding.
4. **Proof:** show the existing provider-verified Arc Testnet transaction and “already published—second transaction blocked.”
5. **Close:** “The same evidence contract supports CLI, SDK, SARIF, CI, and policy gates.”

## 2-minute demo

1. Landing: explain problem, local-first solution, and V4 Grant Candidate status.
2. Launch V4 Scanner; point out local/private, Arc Testnet, 1 MiB, exact compiler.
3. Upload a reviewed Solidity fixture and run the scan.
4. Show progress: validating, compiling, analyzing, verifying.
5. Review summary, severity/domain, source→sink, trace, evidence, remediation, and incomplete boundary if present.
6. Expand report identity and explain deterministic schema/hash.
7. Open proof; show the existing verified Testnet receipt/event identity and ArcScan link.
8. Show duplicate protection; do not click Publish.
9. Show CLI/SDK/SARIF/GitHub Action evidence paths.
10. Close with open core, hosted roadmap, mainnet NO-GO, and grant milestones.

## 3-minute demo

Follow the 2-minute path, then add:

- the 60-case benchmark table and its bounded interpretation;
- JSON/Markdown/manifest verified exports and local history;
- receipt/event publisher, registry, block, and report-hash reconciliation;
- the fail-closed mainnet model and Registry V2 operational limitations;
- Community/Developer/Team/Enterprise status, explicitly distinguishing shipped free capabilities from roadmap hypotheses;
- budget and measurable acceptance evidence for the four proposed milestones.

## Click-by-click path

1. Open V4 preview landing.
2. Select **Launch V4 Scanner**.
3. Add a reviewed `.sol` fixture or folder.
4. Confirm selected domain(s), policy, exact compiler, count, and size.
5. Select **Run verified V4 scan**.
6. Wait for completed verification; do not navigate during the worker run.
7. Review the summary and filter findings.
8. Select **Review finding**; show trace/evidence/remediation; close with Escape.
9. Expand report identity and technical details.
10. Open proof workflow only if a verified report exists.
11. Show the restored existing Testnet receipt or use the acceptance document if provider access is unavailable.
12. Show `already-published` and disabled/absent send workflow; never trigger a wallet popup.
13. Show verified exports/history.
14. Show repository evidence for CLI, SDK, SARIF, Action, gate, benchmark, commercial roadmap, and mainnet runbooks.

## What to show

- Local compiler and privacy boundary.
- Real source-backed evidence, not a fabricated dashboard.
- Explicit verified/incomplete status.
- Deterministic report hash and export verification.
- Existing Arc Testnet proof identity.
- Duplicate protection and second-send block.
- Bounded benchmark and limitations.
- Shipped versus roadmap separation.

## What not to claim

- “Universal detection,” “zero risk,” “secure,” “confidential,” “audit passed,” or “formal verification.”
- Mainnet deployment, production billing, paid customers, partnerships, endorsement, grant certainty, or revenue.
- Firefox/Edge support as passed while clean-CI confirmation remains pending.
- Testnet fee as a mainnet estimate.

## Fallbacks

- **Wallet unavailable:** do not install/connect during the demo; use read-only acceptance evidence and the canonical transaction hash.
- **Explorer/provider unavailable:** show the stored acceptance document and explain that live reconciliation is provider-dependent; do not fabricate a response.
- **Scan runtime unavailable:** show the verified benchmark/report evidence and recorded browser smoke result, then state the runtime limitation.
- **Existing transaction:** preferred path; show confirmed identity and duplicate block. Do not send another transaction.
- **Network uncertainty:** stop proof interaction and keep the mainnet/Testnet distinction explicit.

