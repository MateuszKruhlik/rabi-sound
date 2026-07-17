import {
  defineToolcraftPerformance,
  isToolcraftRuntimeOwnedTarget,
  type ToolcraftPerformanceScenario,
  type ToolcraftPerformanceConfig,
} from "@/toolcraft/runtime";

import { appSchema } from "./app-schema";

const workloadTargets = [
  "export.audio.sampleRate",
  "export.audio.channels",
] as const;
const workloadTargetSet = new Set<string>(workloadTargets);

function slug(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

const controlScenarios: ToolcraftPerformanceScenario[] =
  (appSchema.panels.controls?.sections ?? []).flatMap((section) =>
    Object.entries(section.controls).flatMap(([controlId, control]) => {
      if (control.type === "panelActions" || isToolcraftRuntimeOwnedTarget(control.target)) {
        return [];
      }

      const isDrag = control.type === "slider" || control.type === "logSlider";
      const isMultiStepAction = control.type === "actions";
      const isWorkload = workloadTargetSet.has(control.target);
      const label = typeof control.label === "string" ? control.label : controlId;
      const maximumOption = control.options?.at(-1)?.value ?? control.defaultValue;
      const scenarioId = `control-${slug(control.target)}`;
      return [{
        automated: true,
        automatedTestName: `perf: ${control.target} remains responsive`,
        browser: true,
        browserTestName: `browser perf: ${control.target} remains responsive`,
        budget: {
          maxFrameGapMs: 120,
          maxInteractionMs: isDrag ? 500 : isMultiStepAction ? 750 : 500,
        },
        controlLabel: label,
        expectedObservable:
          "The control responds within one frame budget while procedural output remains interactive.",
        fixture: control.target === "workspace.pack"
          ? "two-cue pack prepared from the default success cue"
          : "default success cue rendered at 48 kHz",
        id: scenarioId,
        interaction: isDrag ? "control-drag" : "control-change",
        target: control.target,
        ...(isWorkload
          ? {
              stressFixture: {
                kind: "custom" as const,
                reason: "The last visible option is the heaviest supported delivery value.",
                value: { selectedValue: String(maximumOption) },
              },
              workloadFixture: {
                kind: "custom" as const,
                reason: "The maximum bounded procedural recipe is the shared heavy export baseline.",
                value: {
                  audioComplexity: "five-second cue with sixteen procedural generators",
                  recipeClass: "maximum bounded sound recipe",
                },
              },
            }
          : {}),
        workload: isWorkload,
      } satisfies ToolcraftPerformanceScenario];
    }),
  );

const rendererScenarios: ToolcraftPerformanceScenario[] = [
  {
    automated: true,
    automatedTestName: "perf: typical eight-layer preview renders under 200 ms",
    browser: true,
    browserTestName: "browser perf: typical eight-layer preview renders under 200 ms",
    budget: { maxPreviewMs: 200 },
    expectedObservable: "A typical one-second cue renders and exposes a ready waveform within 200 ms.",
    fixture: "one-second cue with eight deterministic synthesis layers",
    id: "preview-typical-eight-layers",
    interaction: "preview-render",
    workload: false,
  },
  {
    automated: true,
    automatedTestName: "perf: five-second sixteen-layer preview renders under 500 ms",
    browser: true,
    browserTestName: "browser perf: five-second sixteen-layer preview renders under 500 ms",
    budget: { maxRenderMs: 500 },
    expectedObservable: "The maximum cue and layer workload renders without blocking the editor.",
    fixture: "five-second cue with sixteen deterministic synthesis layers",
    id: "preview-maximum-sixteen-layers",
    interaction: "preview-render",
    stress: true,
    stressFixture: {
      kind: "custom",
      reason: "Five seconds and sixteen layers are the public SoundRecipeV1 limits.",
      value: { recipeClass: "five-second cue with sixteen procedural generators" },
    },
    workload: false,
  },
  {
    automated: true,
    automatedTestName: "perf: full-bleed waveform workspace remains stable",
    browser: true,
    browserTestName: "browser perf: full-bleed waveform workspace remains stable",
    budget: { maxFrameGapMs: 50 },
    expectedObservable: "Editing a sound does not move or resize the fixed waveform workspace.",
    fixture: "default success cue in the full-bleed black audio workspace",
    id: "viewport-stability",
    interaction: "viewport-stability",
    workload: false,
  },
  {
    automated: true,
    automatedTestName: "perf: timeline playback remains smooth",
    browser: true,
    browserTestName: "browser perf: timeline playback remains smooth",
    budget: { maxFrameGapMs: 80, maxLongTaskMs: 80 },
    expectedObservable: "Audio playback and the SVG playhead progress without long main-thread tasks.",
    fixture: "rendered one-second success cue",
    id: "timeline-playback",
    interaction: "timeline-playback",
    controlLabel: "Play",
    target: "timeline.playback",
    workload: false,
  },
  {
    automated: true,
    automatedTestName: "perf: timeline scrub remains responsive",
    browser: true,
    browserTestName: "browser perf: timeline scrub remains responsive",
    budget: { maxFrameGapMs: 50, maxInteractionMs: 250, maxLongTaskMs: 50 },
    controlLabel: "Timeline scrubber",
    expectedObservable: "Scrubbing updates the playhead without rerendering the sound buffer.",
    fixture: "rendered one-second success cue",
    id: "timeline-scrub",
    interaction: "timeline-scrub",
    target: "timeline.playback",
    workload: false,
  },
  {
    actionValue: "export.wav",
    automated: true,
    automatedTestName: "perf: WAV export completes under budget",
    browser: true,
    browserTestName: "browser perf: WAV export completes under budget",
    budget: { maxExportMs: 8_000 },
    completionEvidence: "download",
    controlLabel: "Export WAV",
    expectedObservable: "A production WAV download begins without freezing the workspace.",
    fixture: "five-second sixteen-layer stereo 48 kHz 24-bit cue",
    id: "export-wav",
    interaction: "export-copy",
    target: "actions.output",
    workload: false,
  },
];

export const appPerformance: ToolcraftPerformanceConfig = defineToolcraftPerformance({
  browserCheckPolicy: {
    fallbackRunner: "playwright",
    fallbackWhen: ["agent-browser-unavailable", "ci"],
    preferredRunner: "agent-browser",
  },
  rendererPipeline: {
    interactionInvalidation: [
      {
        interaction: "viewport-zoom",
        invalidates: [],
        mustNotInvalidate: ["audio-render", "waveform-vector"],
        targets: ["canvas.viewport.zoom"],
      },
      {
        interaction: "control-change",
        invalidates: ["audio-render", "waveform-vector"],
        targets: ["editor.sound.parameters", "editor.layer.parameters", "workspace.sound-pack"],
      },
      {
        interaction: "control-drag",
        invalidates: ["audio-render", "waveform-vector"],
        targets: ["editor.sound.parameters", "editor.layer.parameters"],
      },
      {
        interaction: "timeline-playback",
        invalidates: ["playhead-overlay"],
        mustNotInvalidate: ["audio-render", "waveform-vector"],
        targets: ["timeline.currentTimeSeconds"],
      },
      {
        interaction: "timeline-scrub",
        invalidates: ["playhead-overlay"],
        mustNotInvalidate: ["audio-render", "waveform-vector"],
        targets: ["timeline.currentTimeSeconds"],
      },
      {
        interaction: "export",
        invalidates: ["export-output"],
        mustNotInvalidate: ["playhead-overlay"],
        targets: [...workloadTargets, "actions.output"],
      },
    ],
    passes: [
      {
        cacheKey: ["sound-recipe-json", "audio-export-settings-json"],
        id: "audio-render",
        inputs: ["SoundRecipeV1", "ExportSettingsV1"],
        invalidatedBy: ["editor.sound.parameters", "editor.layer.parameters", "export.audio.settings"],
        kind: "preprocess",
        output: "intermediate",
        quality: "full",
        runsOn: "main",
      },
      {
        id: "waveform-vector",
        inputs: ["RenderedSound.samples", "canvas.size.width"],
        invalidatedBy: ["audio-render.cache-key", "canvas.size.width"],
        kind: "vector-build",
        output: "preview",
        quality: "full",
        runsOn: "main",
      },
      {
        id: "playhead-overlay",
        inputs: ["timeline.currentTimeSeconds", "timeline.durationSeconds"],
        invalidatedBy: ["timeline.currentTimeSeconds"],
        kind: "handles",
        output: "overlay",
        quality: "preview",
        runsOn: "main",
      },
      {
        id: "export-output",
        inputs: ["audio-render.cache-key", "export.output.settings"],
        invalidatedBy: ["actions.output", "export.output.settings"],
        kind: "export",
        output: "export",
        quality: "export",
        runsOn: "worker",
      },
    ],
  },
  rendererStrategy: "dom",
  rendererTechnique: {
    exportRenderer: "none",
    fidelityRisks: [
      "Very dense waveforms are summarized into peak columns at the current canvas width.",
      "The preview is an editor visualization only; production delivery remains the rendered audio buffer.",
    ],
    layers: [
      {
        content: ["geometry"],
        exportMode: "excluded",
        id: "waveform-background",
        kind: "background",
        primitiveCount: "low",
        renderer: "dom",
      },
      {
        content: ["geometry", "text"],
        exportMode: "excluded",
        id: "waveform-and-layer-tracks",
        kind: "product-foreground",
        primitiveCount: "medium",
        renderer: "dom",
        uiSelector: "[data-rabi-sound-waveform]",
      },
    ],
    performanceRisks: [
      "OfflineAudioContext rendering can exceed an interaction frame at the five-second sixteen-layer limit.",
      "Rapid slider updates must remain coalesced and stale asynchronous renders must be discarded.",
    ],
    previewRenderer: "dom",
    productRepresentation: "mixed",
    rendererStrategy: "dom",
    rendererWorkload: "simple-composition",
    sourceRepresentation: "procedural-data",
    whyNotAlternativeStrategies: [
      "Inline SVG conflicts with Toolcraft's generic observable boundary in the pinned runtime when framework provenance tests add their own output fixture.",
      "Canvas and GPU renderers would add raster or context overhead without improving the bounded waveform and text composition.",
    ],
  },
  rendererWorkload: "simple-composition",
  scenarios: [...controlScenarios, ...rendererScenarios],
  usesCustomRenderer: true,
  workloadTargets,
});
