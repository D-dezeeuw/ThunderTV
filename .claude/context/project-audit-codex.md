# ThunderTV Project Audit — Codex

**Updated:** 2026-07-31  
**Lifecycle:** v1 production candidate  
**Previous score:** 7.35 / 10  
**Current weighted score:** **8.88 / 10**

## Executive summary

ThunderTV's primary code-level release blockers have been addressed:

- A strict script Content Security Policy is enforced without
  `unsafe-eval`.
- All 714 Spektrum template expressions are precompiled and checked.
- Spektrum is same-origin and integrity-checked on every target.
- Electron download paths remain in the main process behind one-use,
  sender-bound grants; partial files are committed only on completion.
- Startup budgets now include every eager script, Spektrum, CSP expressions,
  HTML, CSS, and the complete install footprint.
- The verified webOS build is below every internal budget.
- The Node floor and v1 versions are synchronized and mechanically checked.
- The complete local verification gate is green: 183 files and 1,651 tests.
- GitHub verification is cost-controlled: manual or release-tag only, with
  duplicate runs cancelled. Desktop packaging remains manual-only.

The repository is now a credible production candidate. It is not assigned a
full 9/10 or called production-certified because the remaining gaps require
release evidence rather than another speculative code change: physical LG
webOS testing, signed/notarized desktop distribution decisions, and a
real-browser/cross-platform smoke pass.

## Scoring method

Each category is scored from 0–10 and multiplied by its weight. Weights total
100%.

| # | Category | Weight | Score | Weighted contribution |
|---:|---|---:|---:|---:|
| 1 | Code quality and maintainability | 10% | 8.7 | 0.870 |
| 2 | Architecture and modularity | 14% | 8.7 | 1.218 |
| 3 | Implementation choices and correctness | 12% | 9.2 | 1.104 |
| 4 | Testing and quality assurance | 14% | 8.8 | 1.232 |
| 5 | Security and privacy | 12% | 9.4 | 1.128 |
| 6 | Performance and scalability | 10% | 9.3 | 0.930 |
| 7 | UX, accessibility, and internationalization | 8% | 8.5 | 0.680 |
| 8 | Reliability, error handling, and observability | 8% | 9.0 | 0.720 |
| 9 | Build, dependencies, CI, and release readiness | 8% | 8.5 | 0.680 |
| 10 | Documentation and developer experience | 4% | 8.5 | 0.340 |
|  | **Total** | **100%** |  | **8.882 → 8.88 / 10** |

## 1. Code quality and maintainability

**Weight: 10% — Score: 8.7 / 10**

### Summary

The codebase has strict TypeScript, type-aware linting, a 400-line production
TypeScript ceiling, architectural fences, and extensive local rationale.
New CSP, version, import-map, reachability, distribution, and budget checks
turn several review conventions into executable guarantees.

### Strengths

- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, unused
  checks, and switch-fallthrough checks are enabled.
- ESLint enforces platform access, state ownership, worker boundaries, and
  file-size conventions.
- The new Spektrum CSP registry is generated rather than maintained by hand.
- Release metadata now has a drift gate.
- Production logic remains strongly typed and locally documented.

### Remaining risks

- `index.html` is still a very large integration surface.
- Several TypeScript and CSS files are at or near their line ceilings.
- VOD and Series retain parallel implementation surfaces.
- Module-owned singleton state remains less observable than Spektrum state.

### Next improvement

Split the application shell into build-time partials and factor the remaining
VOD/Series twins without changing the shipped DOM contract.

## 2. Architecture and modularity

**Weight: 14% — Score: 8.7 / 10**

### Summary

The platform-adapter architecture continues to serve web, Electron, and
webOS from one application. Network, storage, files, downloads, workers, and
player engines have explicit ownership.

### Strengths

- Platform, storage, HTTP, parsing, player, state, UI, EPG, Xtream, health,
  Codex, and handoff boundaries are clear.
- Heavy parser/player work remains off the initial UI path.
- Packaged targets now rewrite Spektrum imports directly, removing the
  import-map shim and its compatibility/security complexity.
- The Electron renderer/main privilege boundary is materially narrower.
- Connect bookmarks are now honestly de-scoped from v1 instead of presented
  as a working headline feature.

### Remaining risks

- The monolithic HTML template bypasses some TypeScript modularity.
- Catalog persistence and module-singleton lifecycle still contain historical
  phase-shaped compromises.
- Spektrum replacement/merge semantics remain a framework-specific convention.

### Next improvement

Treat HTML composition and module-owned lifecycle as formal architecture
surfaces, with generated composition and disposable service contracts.

## 3. Implementation choices and correctness

**Weight: 12% — Score: 9.2 / 10**

### Summary

Implementation choices are well matched to browser, IPTV, Electron, and TV
constraints. The production pass corrected the known concrete correctness
issues without weakening target support.

### Strengths

- HTTP failures are classified rather than collapsed into generic errors.
- M3U/EPG parsing is worker-oriented and media engines are lazy.
- Async player attachment uses sequence protection.
- Storage degrades through full, partial, and memory tiers.
- Electron downloads stream with backpressure.
- Download URLs are restricted to HTTP(S), destination grants are one-use
  and sender-bound, duplicate IDs are rejected, and writes use temporary
  sibling files before final rename.
- The local-time guide test now tests local midnight rather than a UTC
  instant interpreted in the host timezone.
- The declared Node floor matches the actual pinned toolchain.

### Remaining risks

- Some framework and module lifecycle rules remain convention-driven.
- Connect bookmarks are explicitly postponed rather than implemented.

### Next improvement

Add small APIs around replacement semantics and module reset/disposal before
the next major feature cycle.

## 4. Testing and quality assurance

**Weight: 14% — Score: 8.8 / 10**

### Summary

The automated suite is broad, green, and now portable in the repository's
Amsterdam timezone. Security and packaging invariants have dedicated gates.

### Verified result

- 183 test files passed.
- 1,651 tests passed.
- Typecheck and type-aware lint passed.
- CSP validation passed with 714 precompiled expressions.
- Import-map/vendor integrity, version sync, CSS, file-access, reachability,
  production build, and distribution budgets passed.
- The webOS Chromium-87 build and packaged import rewrite were validated in a
  temporary target build.

### Remaining risks

- No Playwright/Cypress real-browser suite exists.
- Electron save-dialog/download behavior lacks a launched-app integration test.
- Physical webOS remote, media, suspend/resume, and memory behavior is not yet
  recorded.
- There is no coverage ratchet.

### Next improvement

Run the new release checklist and add a small real-browser suite around first
run, persistence, navigation, CSP console errors, and one playback handoff.

## 5. Security and privacy

**Weight: 12% — Score: 9.4 / 10**

### Summary

The two previous release blockers—renderer-directed filesystem writes and the
missing browser policy—are closed.

### Strengths

- CSP excludes `unsafe-eval` and inline script execution.
- The sole inline import map is authorized by an exact SHA-256 hash.
- Spektrum is same-origin and its vendored bytes are SHA-384 verified.
- Spektrum's runtime `new Function` fallback is never reached because every
  live expression is registered before `bindDOM()`.
- Electron retains context isolation, sandboxing, disabled Node integration,
  popup denial, navigation locking, and default-denied permissions.
- Absolute download paths never cross the preload bridge.
- Save-dialog grants expire, are bound to the originating renderer, and are
  consumed once.
- Failed/cancelled transfers remove partial files without truncating an
  existing destination at transfer start.

### Remaining risks

- `style-src 'unsafe-inline'` remains necessary because Spektrum applies
  dynamic element styles. Script injection protection remains strict.
- IPTV inherently permits user-selected HTTP(S) endpoints.
- Security behavior still benefits from launched Electron and browser tests.
- Local provider credentials make OS/device compromise outside the browser
  threat model consequential.

### Next improvement

Add a launched-app security smoke and central diagnostic redaction before
expanding any credential-bearing link surface.

## 6. Performance and scalability

**Weight: 10% — Score: 9.3 / 10**

### Summary

The misleading entry-only budget has been replaced with truthful startup and
install accounting. LG does not publish one universal JavaScript/package
maximum, so ThunderTV uses explicit internal SLOs and requires device proof.

### Measured web result

- Eager JavaScript: **341.9 KiB raw / 91.5 KiB gzip** across 6 files.
- Total initial shell text: **626.4 KiB raw / 131.7 KiB gzip**.
- Complete built app: **2.63 MiB raw**.

### Measured webOS result

- Eager JavaScript: **348.0 KiB raw / 93.2 KiB gzip** across 7 files.
- Total initial shell text: **633.4 KiB raw / 134.1 KiB gzip**.
- Complete built app: **2.64 MiB raw**.
- Packaged `.ipk`: **1.6 MiB**.

### Enforced budgets

- Eager JS: 400 KiB raw / 100 KiB gzip.
- HTML: 300 KiB raw / 60 KiB gzip.
- Startup CSS: 100 KiB raw / 25 KiB gzip.
- Total shell text: 800 KiB raw / 175 KiB gzip.
- Complete built app: 10 MiB raw.

### Strengths

- The guard counts scripts, module preloads, Spektrum, and the CSP registry.
- HLS and MPEG-TS remain lazy and outside startup.
- Removing `es-module-shims` saves roughly 80 KiB of shipped source in the
  repository and about 128 KiB from the previous built target copy.
- Workers, virtual lists, caching, and streamed downloads remain appropriate
  for large IPTV datasets.

### Remaining risks

- A physical low-end TV has not supplied launch, memory, and interaction data.
- The large HTML shell and font remain meaningful startup resources.

### Next improvement

Profile cold start, navigation latency, and memory on the oldest supported LG
TV, then tighten rather than relax the internal budgets.

## 7. UX, accessibility, and internationalization

**Weight: 8% — Score: 8.5 / 10**

### Summary

The product supports English, Dutch, and German, D-pad navigation, Back,
focus treatment, reduced motion, dialogs, diagnostics, and first-run flows.
Previously placeholder-only first-run fields now also have accessible names.

### Strengths

- Locale dictionaries have structural parity tests and lazy fallback.
- Spatial navigation covers arrows, Enter, TV Back codes, modal containment,
  and scroll-to-focus.
- Reduced-motion behavior and focus-visible treatment are present.
- First-run paste, M3U URL, and Xtream fields have dynamic ARIA labels.
- The connect route now communicates the v1 limitation instead of promising
  imminent configuration.

### Remaining risks

- No automated axe scan or screen-reader smoke exists.
- Live announcements and focus behavior need physical TV/browser validation.
- The large conditional template remains difficult to audit holistically.

### Next improvement

Add automated accessibility scans for first run, settings, player, and
dialogs; then run keyboard, screen-reader, and remote smoke tests.

## 8. Reliability, error handling, and observability

**Weight: 8% — Score: 9.0 / 10**

### Summary

Reliability remains one of the strongest areas: storage demotion, classified
network errors, stale-cache operation, player race protection, structured UI
states, and on-device diagnostics all exist.

### Strengths

- Errors across HTTP, storage, import, player, download, and catalog paths are
  classified into user-meaningful outcomes.
- Global failures and capped logs are visible without DevTools.
- Download completion/cancellation is terminal exactly once and partial-file
  cleanup is explicit.
- Cached catalog data remains useful through refresh failures.
- The release checklist now covers destructive/partial download scenarios.

### Remaining risks

- Diagnostic capture does not centrally redact every arbitrary future log.
- Background boot tasks are distributed fire-and-forget work.
- There is no remote crash telemetry, intentionally increasing the importance
  of release smoke evidence.

### Next improvement

Centralize redaction in the debug capture boundary and supervise important
boot tasks through one structured outcome collector.

## 9. Build, dependencies, CI, and release readiness

**Weight: 8% — Score: 8.5 / 10**

### Summary

Build and release metadata are coherent, but expensive hosted work remains
deliberate per project requirements.

### Strengths

- Web, desktop, and webOS versions are synchronized at 1.0.0.
- A version drift gate covers manifests, lockfiles, preload fallback, and
  settings export.
- Node 22.13+ is declared.
- `npm run verify` is green and no longer repeats TypeScript during its build.
- GitHub verification runs manually or on `v*` tags, cancels duplicate runs,
  has a 15-minute timeout, and skips npm audit/funding network work during
  install.
- The expensive desktop packaging matrix is manual-only.
- Lockfiles and target packaging scripts remain deterministic.

### Remaining risks

- Windows/macOS signing and notarization remain an audience/release decision.
- Physical webOS and cross-platform installer smoke results are not recorded.
- The pre-existing `@openai/codex` desktop production dependency is not used by
  runtime source and may materially enlarge installers; it was an existing
  user change and was deliberately preserved.
- Dependency vulnerability review is deliberate rather than part of every
  expensive CI run.

### Next improvement

Resolve the desktop Codex dependency, choose the signing policy, and record
the release matrix in `RELEASE_CHECKLIST.md`.

## 10. Documentation and developer experience

**Weight: 4% — Score: 8.5 / 10**

### Summary

Documentation is extensive and the most release-relevant drift has been
corrected.

### Strengths

- Spektrum's local/CSP-safe loading path is documented.
- webOS has an explicit performance-budget document grounded in LG guidance.
- The root README no longer claims CDN loading, no GitHub Actions, no motion,
  or completed connect-bookmark onboarding.
- A cost-aware release checklist defines automated and manual evidence.
- Complex code continues to document rationale near implementation.

### Remaining risks

- Historical masterplan checkboxes do not accurately represent completed code.
- Old audit/phase narrative can still be mistaken for current release status.

### Next improvement

Reconcile the masterplan as a historical roadmap or archive it behind an
explicit status banner.

## Remaining path to 9.0+

The codebase is close enough that the remaining score is mostly evidence:

1. Run and record the oldest-supported physical LG webOS smoke.
2. Run real-browser first-run/persistence/CSP/accessibility smoke.
3. Package and smoke the intended desktop platforms.
4. Decide signing/notarization for the distribution audience.
5. Remove or justify the unused desktop `@openai/codex` dependency.

Completing those items would support a score above 9 without inflating
categories that still lack cross-target proof.

## Verification record

- `npm run verify`: passed.
- TypeScript: passed.
- ESLint: passed with zero warnings.
- CSS and file-access guards: passed.
- Spektrum local/vendor SHA-384 guard: passed.
- Strict CSP/import-map hash/expression registry: passed, 714 expressions.
- Version synchronization: passed at 1.0.0.
- Reachability: 109 actions registered, 105 bound, 4 allowlisted, 0 dead
  clicks.
- Vitest: 183 files passed, 1,651 tests passed.
- Vite production build: passed, 278 modules transformed.
- Web distribution budgets: passed.
- WebOS Chromium-87 build, package-target rewrite, `.ipk` packaging, and
  distribution budgets: passed (`thundertv-1.0.0-webos.ipk`, 1.6 MiB).
- Electron main/preload syntax checks: passed.
- M3U benchmark: passed 3/3 on the final audit state.

## Final verdict

**Weighted score: 8.88 / 10 — production candidate, pending target
certification.**

ThunderTV's code-level P0 blockers are closed and its automated release gate
is green. It is reasonable to proceed to a controlled release-candidate
build. Broad production distribution should wait for the release checklist's
physical webOS and intended desktop-platform evidence. The audit deliberately
stops short of 9 rather than treating unrun device tests as passed.
