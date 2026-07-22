# Privacy model

## Source handling

The browser reads selected `.sol` files through the File API. Analysis executes locally. The web application has no source-upload endpoint.

The CLI reads local files and writes output only when requested.

## Local history

The web interface stores only:

- project name
- source hash
- report hash
- score and grade
- triage state
- finding and contract counts
- timestamp

Source text is not stored in local history.

## Exports

Exports are generated locally. The Remediation Pack ZIP can include the source files selected by the user because the archive is downloaded directly to the user's device.

## Network activity

Network access is needed only for normal static application delivery, links and optional Arc wallet/proof operations. The analyzer itself does not call a remote service.

## AI decision

VeilForge contains no AI analysis, AI remediation or chat assistant. This preserves reproducibility and avoids sending private code to a model provider.

## Arc privacy status

VeilForge is pre-APS readiness tooling. Arc's official documentation currently describes Arc Privacy Sector as roadmap functionality that is not yet available. VeilForge therefore generates forward-looking policy guidance and does not claim to execute or configure live private transactions.
