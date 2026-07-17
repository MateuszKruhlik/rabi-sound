# Implementation Worklog

## Status

Mode: product

Rabi Sound is a local-first procedural UI sound editor built inside the generated Toolcraft runtime boundary.

## Decision Trail

### Iteration 1 — Procedural sound studio

- Request: Build the approved Cuelume Studio v0.1 plan with React, TypeScript, Vite, pinned Toolcraft, editable procedural layers, persistence and production exports.
- Task type: New Toolcraft product application.
- User-visible result: A multi-cue sound-pack editor with a waveform canvas, layer tracks and handles, Toolcraft transport, inspector controls, deterministic variations and WAV/JSON/ZIP/image/video downloads.
- Source/reference checked: Cuelume v0.1.2 source recipes and the generated Toolcraft 0.0.15 local contract.
- Reference inputs: Fourteen MIT-licensed Cuelume presets, the user-approved JSON contract, product limits and export defaults.
- Docs/contracts read: workflow, runtime boundary, assembly workflow, control selection, layout, performance, timeline animation, setup/export, media upload, decision contract, schema reference, component rules, custom controls, renderer technique and acceptance testing.
- Contract rules applied: Toolcraft owns shell, viewport, history, persistence, inspector, timeline and settings transfer; product code owns synthesis, waveform output and bounded custom controls.
- Decision: Use one deterministic OfflineAudioContext render path for preview and export, an isolated DOM/CSS waveform with DOM editing handles, and a Worker for WAV/ZIP assembly.
- Alternatives rejected: A DAW-style interface was outside scope; Cuelume's playback-only npm surface does not expose editable recipes; arbitrary media upload and a backend are excluded from v0.1.
- State/output mapping: Toolcraft scalar values materialize into SoundPackV1; generation IDs reject stale renders; timeline duration changes an auto cue to explicit trim; cached RenderedSound feeds audio, peaks and every export.
- Files changed: `src/audio/*`, `src/app/*`, `e2e/*`, package metadata and project documentation.
- Verification: Initial delivery passed `npm run verify:perf`, `npm run verify:final`, Firefox smoke and WebKit smoke before this iteration.
- Skipped checks: None intended for final delivery.
- Risks: Browser audio unlock varies by platform; Pixel Point public-license wording needs written confirmation before a public release.

### Iteration 2 — Audio-first full-bleed workspace

- Request: Remove canvas sizing/aspect-ratio UI and visual export controls, keep the waveform on a simple black workspace, preserve light/dark app themes, and fix audio disappearing after the first loop.
- Task type: Tier 3 renderer/canvas/timeline behavior and performance simplification.
- User-visible result: The waveform fills a fixed black workspace behind the floating Inspector; Setup no longer exposes canvas dimensions; Background, Image Export, Video Export, Export PNG and Export Video are removed; WAV, Recipe and Pack ZIP remain; looping audio repeats on every cycle.
- Source/reference checked: Current Cuelume Studio runtime behavior, the shared AudioContext playback path, and the generated Toolcraft workflow, canvas, timeline, export, renderer and performance contracts.
- Reference inputs: User feedback from the running Cuelume Studio preview; no external visual reference or media file was used.
- Docs/contracts read: `workflow.md`, `decision-contract.md`, `core/runtime-boundary.md`, `core/control-selection.md`, `core/layout.md`, `core/performance.md`, `core/timeline-animation.md`, `core/setup-export.md`, `core/media-upload.md`, `component-rules.md`, `renderer-technique.md`, `schema-reference.md`, and `performance.md`.
- Contract rules applied: The Toolcraft shell, Inspector, timeline and theme toolbar remain runtime-owned; the waveform remains product output; the fixed canvas is an editor visualization rather than a visual delivery format; audio remains the only production output.
- Decision: Use `fixed-output` for the non-exported waveform visualization, disable canvas drag/zoom/radar controls, remove direct canvas timing handles, and keep timing edits in the Inspector. Make the canvas palette permanently black so the preview is identical in light and dark application themes.
- Playback diagnosis: `AudioBufferSourceNode` was one-shot. After it ended, the React effect still saw timeline playback as active but had no loop-capable source to continue audio.
- Playback fix: Configure the shared source with Web Audio `loop`, `loopStart`, and `loopEnd`, restart it when loop mode changes, and wrap expected playback time modulo the rendered buffer duration.
- Alternatives rejected: Keeping size controls contradicted the requested audio-only workflow; hiding protected Toolcraft Setup with CSS would cross the runtime boundary; retaining PNG solely to test canvas handles would preserve an irrelevant visual delivery path.
- State/output mapping: Timeline `isLooping` now directly configures the active Web Audio source; timeline time still drives only the playhead; Offset, Attack and Decay remain authoritative Inspector targets; audio settings continue to drive preview and WAV/ZIP bytes.
- Files changed: `src/app/app-schema.ts`, `canvas-preview.tsx`, `playback.ts`, `panel-actions.ts`, `editor-model.ts`, `waveform-drawing.ts`, `studio.module.css`, acceptance/performance config and product browser tests.
- Verification tier: Tier 3. Run `npm run verify:quick`, focused Chromium workspace/loop acceptance, affected playback/viewport/performance scenarios, the full performance checkpoint because the request explicitly cites load, and the final browser gate.
- Verification: Current-source checks cover `npm run verify:quick`, focused Chromium workspace/loop acceptance, `npm run verify:perf`, `npm run verify:final`, and cross-browser smoke.
- Skipped checks: None; the explicit performance concern triggers the full current-source performance checkpoint.
- Workflow fallback: Optional `brainstorming`, `writing-plans`, and `systematic-debugging` skills were unavailable; the equivalent signed local workflow and root-cause reproduction were used.
- Risks: Web Audio still requires an initial user gesture on browsers with autoplay blocking; Pixel Point public-license wording still needs written confirmation before public release.

### Iteration 3 — Dark-only studio

- Request: Remove white/light mode and keep the application in dark mode only.
- Task type: Tier 2 schema and product-theme behavior.
- User-visible result: The theme toggle is removed and Cuelume Studio always opens in dark mode, including when an older local preference stored `light`.
- Source/reference checked: The running light and dark Toolcraft themes plus the fixed black waveform workspace.
- Reference inputs: Direct user feedback that white mode does not fit this product.
- Docs/contracts read: The previously selected Toolcraft workflow, runtime boundary, layout, schema, acceptance and performance contracts remain authoritative for this continuation.
- Contract rules applied: Toolcraft still owns the toolbar and theme provider; the product disables the schema-owned toggle and requests the provider's supported dark preference rather than restyling host surfaces.
- Decision: Set `toolbar.theme` to false and synchronize the Toolcraft theme preference to `dark` from the mounted product composition.
- Alternatives rejected: Keeping the toggle would preserve a deliberately rejected mode; product CSS overrides would cross the signed host boundary.
- State/output mapping: Any stored `light` or `system` preference is replaced with `dark`; the waveform palette remains unchanged.
- Files changed: `src/app/app-schema.ts`, `src/app/canvas-preview.tsx`, schema tests and focused browser acceptance.
- Verification: Current-source typecheck, focused dark-theme/workspace/loop browser acceptance, Chromium acceptance, cross-browser smoke, performance receipt and final gate.
- Skipped checks: None for final delivery.
- Risks: The theme preference key is origin-local, so clearing browser storage restores the product's dark default on the next mount.

### Iteration 4 — Timeline-aligned audio loop

- Request: Diagnose and fix the rapid duplicated tail heard when Tone 1 and Tone 2 are enabled, Tone 3 and Noise 4 are disabled, and playback loops on a Timeline longer than the rendered cue.
- Task type: Tier 3 Timeline and Web Audio playback bug fix.
- User-visible result: A short cue now plays once per Toolcraft Timeline cycle, remains silent for the unused part of a longer cycle, and repeats cleanly at the next loop boundary without buzzing or duplicated tail samples.
- Source/reference checked: The running local product with a 368 ms rendered cue, a 1 s looping Timeline, Tone 1 and Tone 2 enabled, and Tone 3 and Noise 4 disabled.
- Reference inputs: Current product state at `http://127.0.0.1:3002/`; no external media was used.
- Docs/contracts read: `workflow.md`, `decision-contract.md`, `core/runtime-boundary.md`, `core/timeline-animation.md`, `core/performance.md`, `component-rules.md`, `renderer-technique.md`, `acceptance-testing.md`, and `performance.md`.
- Contract rules applied: Toolcraft remains authoritative for duration, play, pause, scrub and loop; Web Audio follows that duration without dispatching back into the Timeline; playback does not trigger synthesis rerenders or per-frame source restarts.
- Decision: Align the preview AudioBuffer to the explicit Timeline duration by truncating or zero-padding the cached render, use that aligned duration as the native Web Audio loop period, and compare looped playback time with circular distance at the seam.
- Alternatives rejected: Recreating a source at every cue boundary would add scheduler drift and source churn; allowing the raw 368 ms AudioBuffer to loop independently from the 1 s Timeline recreates the mismatch; suppressing scrub synchronization would break genuine user scrubbing.
- State/output mapping: `timeline.durationSeconds` determines the preview buffer frame count; `timeline.isLooping` controls native source looping; manual Timeline movement restarts playback only when the circular time difference exceeds the scrub tolerance.
- Files changed: `src/app/playback.ts`, `src/app/playback.test.ts`, `src/app/canvas-preview.tsx`, `e2e/cuelume-workspace-playback.spec.ts`, and this worklog.
- Verification: Playback unit regression, focused Chromium loop-start stability, live browser playback over multiple 1 s cycles, pause behavior, full current-source performance checkpoint, final Toolcraft verification, and Firefox/WebKit smoke coverage.
- Skipped checks: None for the touched playback path.
- Risks: Aligning a preview buffer to an unusually long Timeline allocates silence frames up to Toolcraft's Timeline limit; the product's intended cue limit remains 5 seconds, keeping normal allocations small.

### Iteration 5 — Inspector-safe waveform stage

- Request: Fix the responsive waveform layout because the fixed audio visualization extended underneath the floating Inspector on wider and narrower windows, and prepare an independent product name with accurate Cuelume author credit.
- Task type: Tier 3 canvas/output layout bug fix.
- User-visible result: The black audio workspace remains full-bleed, while the waveform, grid and synthesis tracks end 10 px before the 300 px Inspector. Moving the Inspector to the left moves the reserved preview inset to the left as well. The bundled third-party notice now matches the pinned Cuelume license credit for Daniel Belyi; the product name remains unchanged until the user selects an independent name.
- Source/reference checked: The running product at a 1409 x 1228 viewport, where the Inspector occupied x=1099..1399 and the prior waveform stage still used the full 1409 px width; the exact MIT license at Cuelume commit `ce81ececf18b4ee6cd195404546dfbab31b279fe`.
- Reference inputs: Current product state at `http://127.0.0.1:3002/` and the pinned Cuelume repository license; no external screenshot, video or media asset was used for the layout decision.
- Docs/contracts read: `workflow.md`, `decision-contract.md`, `core/runtime-boundary.md`, `core/layout.md`, `component-rules.md`, `renderer-technique.md`, `acceptance-testing.md`, and `performance.md`.
- Contract rules applied: The Toolcraft viewport and floating panel remain runtime-owned; product code responds to persisted panel offset and viewport width only inside `canvasContent`; no protected Toolcraft host or panel styles are changed.
- Decision: Keep the editor background at full viewport width, constrain only the product preview stage to `calc(100% - 320px)`, and derive the reserved side from the Inspector's persisted horizontal offset and the current viewport width. Keep naming independent from Cuelume authorship and correct the legal credit to `Copyright (c) 2026 Daniel Belyi` before selecting a new brand.
- Alternatives rejected: Shrinking the entire canvas would expose non-black workspace around the product; modifying the signed panel host would cross the runtime boundary; clipping only the waveform would leave tracks and timing grid hidden under the Inspector; placing the author's name in the product brand without permission could imply an official partnership.
- State/output mapping: `state.panels.controls.offset.x` plus viewport width determines `data-cuelume-controls-side`; product CSS applies the corresponding 320 px stage reservation; a resize listener recalculates the side without changing Toolcraft panel state.
- Files changed: `src/app/canvas-preview.tsx`, `src/app/studio.module.css`, `e2e/cuelume-workspace-playback.spec.ts`, `THIRD_PARTY_NOTICES.md`, and this worklog.
- Verification: `npm run typecheck` passes; all three tests in `e2e/cuelume-workspace-playback.spec.ts` pass; the focused responsive regression passes at 1400 x 900 and 900 x 760; controlled-browser measurement at 1409 x 1228 reports a 1089 px preview ending at x=1089, a 300 px Inspector beginning at x=1099, and a 10 px gap; `npm run verify:perf` passes all 47 scenarios and records a current receipt; `npm run verify:receipt` passes; `npm run test:browser:smoke` passes Firefox and WebKit rendering, playback and WAV export.
- Skipped checks: None for the responsive preview path.
- Risks: The 320 px reservation follows Toolcraft 0.0.15's fixed 300 px Inspector width and 10 px edge inset; very narrow windows intentionally leave a compact waveform rather than placing editor content behind the panel.

### Iteration 6 — Rabi Sound product identity

- Request: Rename and prepare the complete repository as Rabi Sound, aligned with Rabituza Studio, while retaining explicit attribution to the Cuelume author.
- Task type: Tier 3 product identity, renderer label, portable-data contract and repository metadata change.
- User-visible result: The application, browser title, package, documentation and export manifests are branded Rabi Sound; the waveform shows `RABI / SOUND` plus `Built on Cuelume by Daniel Belyi`; Cuelume remains named only where it identifies the preset source and license attribution.
- Source/reference checked: The approved `RABI / SOUND` brand direction, the current running application, the existing Rabituza Studio naming context and the pinned Cuelume MIT license at commit `ce81ececf18b4ee6cd195404546dfbab31b279fe`.
- Reference inputs: User-approved Rabi Sound name, current local application at `http://127.0.0.1:3002/`, and the pinned Cuelume repository/license; no screenshot, video or imported media asset was used.
- Docs/contracts read: `workflow.md`, `decision-contract.md`, `core/runtime-boundary.md`, `core/layout.md`, `component-rules.md`, `renderer-technique.md`, `acceptance-testing.md`, `performance.md`, and the Browser skill used for final local UI verification.
- Contract rules applied: Product identity changes remain in app-owned composition, schema, renderer, audio and documentation files; generated Toolcraft runtime, signed `index.html` and protected tests remain untouched; the browser tab title is synchronized from the product composition while the signed Toolcraft identity meta remains stable for proof sessions; Cuelume attribution is retained in source metadata, README, notices and archive licenses.
- Decision: Use `Rabi Sound` as the public name and `rabi-sound` as the package, settings-transfer and portable-pack identifier. Accept legacy version 1 packs with `schema: "cuelume-studio"`, normalize them to `schema: "rabi-sound"`, and retain the legacy Toolcraft localStorage key so existing workspaces survive reload.
- Alternatives rejected: Keeping Cuelume Studio would continue to imply an official upstream product; replacing every Cuelume reference would erase required preset provenance; changing the persisted workspace key or rejecting the legacy schema would discard existing user work.
- State/output mapping: The mounted product composition synchronizes the browser title to Rabi Sound and renders the brand and credit; Toolcraft readiness exposes the product name; default and materialized packs emit the new schema; `parseSoundPack()` migrates the legacy schema; ZIP manifests identify Rabi Sound while embedding the corrected Cuelume license.
- Files changed: `package.json`, `package-lock.json`, `README.md`, `THIRD_PARTY_NOTICES.md`, `src/audio/*`, product-owned `src/app/*`, product-owned `e2e/*`, renamed product decision/e2e files, and this worklog.
- Verification: `npm run typecheck` passes; 98 focused audio/schema/product tests pass; all three Rabi Sound workspace, responsive layout and loop playback browser tests pass, including title, visible brand and visible Cuelume credit assertions; signed integrity passes; production build passes; the complete Chromium browser suite passes 106 tests with one intentional cross-browser skip; Firefox/WebKit smoke passes rendering, playback and WAV export; `pnpm verify:perf` passes through `npm run verify:perf` with all 47 current-source scenarios and records a valid receipt.
- Skipped checks: None for the rebrand and compatibility path.
- Risks: Public distribution and standalone monetization still require written clarification from Pixel Point about the conflicting Toolcraft 0.0.15 package and generated-project license wording.

## Decisions

### Renderer

- Decision: DOM/CSS renders the waveform clip path, layer envelopes, generated labels and playhead on a permanently black, non-exported workspace; the product preview stage reserves the side occupied by the floating Inspector while the black workspace remains full-bleed.
- Fixed background decision: The audio preview background is intentionally fixed to `#0b0c0f` and is not user-editable because it is editor chrome rather than an exported visual asset.
- Reason: The waveform is an editor visualization for audio, not a visual production asset. Bounded DOM geometry avoids bitmap backing stores and remains theme-independent.
- Evidence: `appPerformance.rendererTechnique` declares a simple mixed DOM composition with no visual export renderer; the responsive browser regression proves the complete preview stage remains outside the Inspector at 1400 px and 900 px viewport widths, and Rabi Sound workspace acceptance proves the product lockup and Cuelume credit render visibly.

### Timeline

- Decision: Toolcraft playback owns play, pause, scrub, loop and duration; Web Audio follows that state using an AudioBuffer aligned to the complete Timeline cycle.
- Reason: Timeline changes are user intent. Changing duration while a cue is automatic materializes an explicit trim without creating a dispatch loop.
- Evidence: The playback acceptance row covers pause/resume, scrub, duration, loop and rendered frame behavior; the product browser test proves one native source remains active beyond two complete cycles, including when the rendered cue is shorter than the Timeline.

### Layers

- Decision: Ordered Tone and Noise synthesis layers live inside SoundRecipeV1 and are edited through the Toolcraft-primitives layer list and Inspector timing controls.
- Reason: Built-in homogeneous collection controls cannot represent selection, enable state, heterogeneous parameters, reorder and complete nested recipe values together.
- Evidence: Custom-control fit checks and control acceptance map layer commands and Offset/Attack/Decay directly to authoritative runtime targets.

### Controls

- Decision: Built-in Toolcraft controls cover text, switches, selects, segmented modes and linear sliders; custom controls are limited to cue collection, layer collection and logarithmic Hz sliders.
- Reason: Frequency requires perceptual logarithmic travel, while cue/layer collections require nested selection and reorder semantics unavailable in one built-in.
- Evidence: The Control Section Inventory documents semantic workflow splits for sound and layer entities, and acceptance covers every visible control.

### Export

- Decision: Product delivery exposes only WAV, portable recipe JSON and pack ZIP; portable packs and manifests use the Rabi Sound identity while version 1 Cuelume Studio packs migrate on import.
- Reason: Canvas dimensions and visual exports do not belong to an audio-first production workflow. The fixed waveform workspace is explicitly non-exported.
- Evidence: WAV encoding supports PCM 16/24-bit mono/stereo; ZIP includes WAV files, pack, Rabi Sound manifest, corrected licenses and SHA-256 checksums; unit coverage proves the legacy schema migration and new manifest identity.

### Performance

- Decision: Cache rendered buffers and peaks, coalesce slider invalidation to animation frames, discard stale generation IDs, encode archive bytes in a Worker, and zero-pad or truncate a cached render once per playback start instead of restarting sources during Timeline frames; remove visual-export and zoom workloads; handle preview responsiveness with one viewport-width state value and CSS geometry rather than rerendering audio.
- Reason: OfflineAudioContext is the dominant bounded cost; playback and scrub must not invalidate it, and the static full-bleed DOM preview needs no raster export or zoom pipeline.
- Evidence: The typed performance matrix covers every remaining control, typical and maximum renders, workspace stability, playback, scrub and WAV export with 50/200/500 ms targets; loop acceptance additionally asserts that the Web Audio source-start counter is stable across multiple cycles, while the responsive layout regression proves resize geometry without invalidating synthesis output.

## Evidence

- Source reviewed: Cuelume repository recipes and generated Toolcraft runtime contracts.
- Contract applied: Product code stays in the extension boundary and uses Toolcraft state, commands, primitives and persistence.

## Verification

- Passed: `npm run typecheck` and the three-test responsive workspace/playback suite.
- Run: pnpm verify:perf passed through the equivalent project command `npm run verify:perf` (47 current-source scenarios).
- Passed: `npm run verify:receipt` and `npm run test:browser:smoke` for Firefox/WebKit rendering, playback and WAV export.

## Risks

- Risk: Before publishing, obtain Pixel Point confirmation that generated-project MIT wording governs public distribution alongside the CLI wording.
