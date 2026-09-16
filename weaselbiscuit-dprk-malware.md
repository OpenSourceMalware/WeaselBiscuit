# WeaselBiscuit / Process-Tailwind: emerging suspected DPRK-linked infostealer assessment

![WeaselBiscuit Logo](WeaselBiscuit-logo-small.png)

The OpenSourceMalware team spends a lot of time looking at malicious NPM packages, so you end up seeing the same patterns a lot.  So, when you see something new and innovative, it stands out.  That's exactly what happened this week when we found 11 NPM package that secretly hide a brand new JavaScript stealer.  It looks and feels like the DPRK's Beavertail and OtterCookie, but its different.  It's much smaller and more lightweight as many of the heavier functions have been stripped out.

These are the 11 packages we've found so far:

- @biz44/id10-client 		- 2026-09-12T13:51:46Z
- @biz44/id12-client		- 2026-09-12T13:51:47Z
- @biz44/id44-client		- 2026-09-12T08:03:37Z
- @biz44/id79-client		- 2026-09-12T13:51:48Z
- @biz44/id95-client		- 2026-09-12T13:51:46Z
- @biz44/id99-client		- 2026-09-12T13:51:46Z
- @biz44/process-runtime-utils 	- 2026-09-14T04:41:47Z
- @biz44/runtime-utils		- 2026-09-14T03:39:58Z
- engin1               		- 2026-09-16T03:44:28Z - version 1.3.99 still available on NPM
- id79-client          		- 2026-09-12T13:35:09Z
- process-lhpm         		- 2026-09-15T00:44:34Z
- process-tailwind     		- 2026-09-15T00:20:01Z

## How we found it

Our automation identified these packages as malicious and grouped them together as they shared IOCs.  We quickly identified this as an emerging Node.js infostealer architecture that warrants investigation as a **possible new or lightly documented DPRK-linked strain**, or as a simplified branch/fork of the BeaverTail/OtterCookie ecosystem.

This is an analytic hypothesis, not a confirmed attribution. The recovered code has meaningful overlap with DPRK-associated Contagious Interview tooling, but there is no recovered operator infrastructure, victimology, campaign metadata, signing material, or unique-code comparison sufficient to name a new family or conclusively attribute it to DPRK.

## Why it is notable

The implant combines a package-borne Node.js loader, Npoint dead-drop resolution, Chrome extension-storage theft, clipboard collection, Windows keylogging, and a small custom HTTP control plane. It is operationally simpler than commonly documented OtterCookie deployments:

```text
npm import
  -> detached Node loader
  -> Npoint-delivered JavaScript
  -> Npoint C2 configuration
  -> plain HTTP C2 polling and exfiltration
```

There is no Socket.IO, remote shell, screenshot capability, Python InvisibleFerret handoff, browser-password decryptor, hard-coded wallet list, or server-delivered follow-on payload in the recovered client. The lack of those features may reflect an early-stage build, a reduced operational module, or a distinct actor copying familiar tradecraft.

For readability, this article uses **WeaselBiscuit** as a proposed working name. It is not an established family name.  I made it up and I think its dope. 

## Confirmed infection chain

1. An application imports `process-tailwind@1.1.99`.
2. `index.js` automatically calls `initialize()`.
3. `init.js` starts a detached `node loader.js` process and stores its PID in `<package-directory>/.pid`.
4. `loader.js` retrieves JSON from:

   ```text
   https://api.npoint.io/24c25d5f5fcbb0992a4f
   ```

5. The loader Base64-decodes the JSON `code` field and executes it through `new Function`.
6. The retrieved response is an exact match for the supplied second-stage artifact, SHA-256:

   ```text
   7b15605f23b131b3eeea57e031ae7cb32fc4b78c7bbb2025aa7a561ea5ae5159
   ```

7. The second stage obtains the C2 configuration from:

   ```text
   https://api.npoint.io/37c0a0c68bf7a94ed731
   ```

8. The configuration resolves the C2 to:

   ```text
   http://103.170.217.184:8787
   ```

## Campaign structure and identifiers

The recovered package is not an isolated sample. Static analysis and user-authorized inert retrievals identified a cluster of cloned npm loaders that retrieve near-identical WeaselBiscuit stages from distinct Npoint URLs. The stages differ materially only in a numeric `identifier` field included in system-information and Chrome-extension uploads. This strongly suggests a server-side campaign, tenant, operator, or victim-group label.

| First-stage resolver | Embedded stage identifier | Status |
| --- | ---: | --- |
| `https://api.npoint.io/24c25d5f5fcbb0992a4f` | `99` | Confirmed `process-tailwind` payload. |
| `https://api.npoint.io/641d37178a880b1e8b8f` | `10` | Confirmed `swnwall` payload. |
| `https://api.npoint.io/33e8d008c334b060adad` | `79` | Confirmed WeaselBiscuit clone. |
| `https://api.npoint.io/ddae72efbb6714fae922` | `12` | Confirmed WeaselBiscuit clone. |
| `https://api.npoint.io/933a731a5e97f4b45249` | `95` | Confirmed WeaselBiscuit clone. |
| `https://api.npoint.io/24c12c4b66a29747764f` | Unknown | Hard-coded by `id79-client`; returned HTTP 404 when retrieved. |

All five recovered stages use the same second Npoint configuration resolver, `https://api.npoint.io/37c0a0c68bf7a94ed731`, which supplied the same C2: `http://103.170.217.184:8787`.

The confirmed stage-level identifiers are therefore `10`, `12`, `79`, `95`, and `99`. They should be used as campaign-hunting markers, but their precise meaning is not yet known. The code does not label them as campaign IDs.

### Related npm packages

| Package | Package label | First-stage resolver |
| --- | --- | --- |
| `process-tailwind@1.1.99` | `ID-99 Client Module` | `24c25d5f5fcbb0992a4f` |
| `engin1@1.3.99` | `ID-99 Client Module` | `24c25d5f5fcbb0992a4f` |
| `swnwall@1.2.10` | `ID-10 Client Module` | `641d37178a880b1e8b8f` |
| `id79-client@1.1.79` | `ID-79 Client Module` | `24c12c4b66a29747764f` |

All four package loaders share the same detached Node process, `.pid` marker, Npoint JSON retrieval, Base64 decoding, and dynamic `new Function` execution template. `process-tailwind` and `engin1` have byte-identical loader, init, and index source files. The `ID-79` label in `id79-client` is consistent with the separate recovered stage carrying `identifier: "79"`, but the package's current resolver response was unavailable, so that direct delivery link is not proven.

## Capabilities

The infostealer uploads the following to the IP-hosted C2:

- Hostname, username, operating-system details, CPU, memory, home/temp paths, local interface IP/MAC addresses, public IP, and public-IP geolocation.
- Every readable, nonempty file under Chrome profiles' `Local Extension Settings` directories on Windows, macOS, and Linux.
- Changed clipboard contents, when the server enables monitoring.
- Windows keyboard events, when the server enables monitoring.

The Chrome extension-storage capability is financially relevant: it can expose wallet-extension state or other extension-held sensitive data. Clipboard and keylogging can capture credentials, API tokens, wallet addresses, or recovery phrases entered or copied during normal use. However, the code does **not** contain direct wallet draining, browser-password decryption, seed-phrase searching, or cryptocurrency transaction functionality.

## C2 design

The C2 is a plain Express HTTP service. Its client-facing interface is small:

| Route | Method | Function |
| --- | --- | --- |
| `/api/system-info` | multipart POST | Host reconnaissance report |
| `/api/upload-local-extension-settings` | multipart POST | Chrome extension storage |
| `/api/clipboard-status/<hostname>` | GET | Clipboard collection switch |
| `/api/clipboard-data` | JSON POST | Clipboard exfiltration |
| `/api/keyboard-mouse-status/<hostname>` | GET | Keylogger switch |
| `/api/keyboard-mouse-data` | JSON POST | Keystroke exfiltration |

The client polls the two status routes every five seconds. Recorded responses for a synthetic host were `200 OK` Express JSON responses with `isMonitoring: false`. No payload, command, redirect, or next-stage URL was observed in those responses.

This differs from documented OtterCookie variants that use Socket.IO and can support broader command execution. It is a polling infostealer control plane, not a full interactive RAT in the recovered code.

## DPRK/BeaverTail/OtterCookie comparison

The overlap supporting the hypothesis is behavioral rather than dispositive:

- Node.js delivery and execution in a developer/package ecosystem.
- Browser extension-storage theft with potential wallet relevance.
- Native clipboard collection using `Get-Clipboard` and `pbpaste`.
- Keylogging, host profiling, and HTTP exfiltration.
- Use of lightweight external configuration to decouple the loader from C2 infrastructure.

The divergences are equally important:

- No Socket.IO, WebSocket, or remote-shell client.
- No screenshots.
- No explicit crypto-wallet extension IDs, browser credential databases, or broad file-targeting rules.
- No InvisibleFerret/Python downloader.
- No observed persistence beyond a detached process and local PID marker.

Cisco Talos has reported that the distinction between BeaverTail and OtterCookie has blurred in recent campaigns, including Node.js keylogging, clipboard monitoring, extension/wallet data targeting, and changing C2 architectures. This makes a lineage relationship plausible but does not prove it. See: [BeaverTail and OtterCookie evolve with a new JavaScript module](https://blog.talosintelligence.com/beavertail-and-ottercookie/).

## Confidence and gaps

| Claim | Confidence | Basis / limitation |
| --- | --- | --- |
| Package is a malicious staged Node.js loader | High | Auto-start, detached loader, remote Base64 code execution, and exact recovered payload match. |
| Second stage is an infostealer | High | Static collection and upload logic. |
| `103.170.217.184:8787` is the C2 used by this stage | High | Retrieved configuration and observed client routes. |
| The implementation is a simplified/new branch | Moderate | Distinct architecture and reduced capability set; could also be a commodity copy. |
| Linked to BeaverTail/OtterCookie lineage | Low to moderate | Behavioral overlap only. |
| DPRK attribution | Low | No exclusive infrastructure, operator evidence, or campaign context in the recovered material. |
| A wholly new malware family | Low | Requires code-cluster, infrastructure, and victimology comparison. |

## Recommended investigation priorities

1. Preserve the npm tarball, package publication metadata, maintainer account, dependency graph, download history, and source repository references.
2. Search public and internal telemetry for all six Npoint UUIDs, the C2 IP/port, the stage identifiers `10`, `12`, `79`, `95`, and `99`, and the API-route strings.
3. Compare the loader and decoded stage against known BeaverTail/OtterCookie samples for shared functions, comments, string conventions, package names, and C2 patterns.
4. Identify the importing parent application: the package itself has no npm lifecycle hook, so execution requires import or manual start.
5. Review affected endpoints for `.pid`, Node child processes, PowerShell processes, and `%TEMP%\\kb-monitor\\keyboard-monitor-*.ps1`.

## Bottom line

Treat `process-tailwind` as a high-confidence malicious supply-chain package and a potentially important new data point in DPRK-linked JavaScript infostealer evolution. Treat the "new DPRK strain" label as a working investigative hypothesis until supported by corroborating code, infrastructure, or campaign evidence.
