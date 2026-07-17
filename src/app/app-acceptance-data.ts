import type {
  ToolcraftComponentAcceptance,
  ToolcraftControlSectionInventoryEntry,
  ToolcraftProductReadiness,
  ToolcraftTransferMode,
} from "./acceptance/types";
import { isToolcraftRuntimeOwnedTarget } from "@/toolcraft/runtime";
import { appSchema, DEFAULT_TIMELINE_DURATION_SECONDS } from "./app-schema";
import { targets } from "./editor-model";

export const appTransferMode: ToolcraftTransferMode = {
  animationIntent: {
    loopDuration: {
      evidence:
        "The initial playback range is derived from the auto-rendered Cuelume success preset and then follows the rendered cue or an explicit user trim.",
      seconds: DEFAULT_TIMELINE_DURATION_SECONDS,
      source: "product-derived",
    },
    mode: "timeline-playback",
  },
  mode: "new-toolcraft-app",
};

export const appProductReadiness: ToolcraftProductReadiness = {
  mode: "product",
  productName: "Rabi Sound",
  productSummary:
    "A local-first procedural UI sound editor that composes short cues from tone and noise layers and exports production-ready assets.",
  requestedBehavior:
    "Edit multi-cue packs, audition deterministic Web Audio renders, manipulate synthesis timing, create controlled variations, persist the workspace, and export WAV, JSON, and ZIP production files.",
};

const sections = appSchema.panels.controls?.sections ?? [];

const splitSectionMetadata: Record<
  string,
  Pick<ToolcraftControlSectionInventoryEntry, "entity" | "splitReason" | "workflowStage">
> = {
  "Sound Pack": {
    entity: "active sound",
    splitReason:
      "Identity and cue selection lead the sound workflow before synthesis and mastering edits.",
    workflowStage: "identity and selection",
  },
  "Master & Shimmer": {
    entity: "active sound",
    splitReason:
      "Sound-wide level and shimmer are adjusted after individual synthesis layers are shaped.",
    workflowStage: "sound effects",
  },
  "Trim & Mastering": {
    entity: "active sound",
    splitReason:
      "Delivery length, fades, silence trimming and normalization form the final mastering stage.",
    workflowStage: "sound mastering",
  },
  Layers: {
    entity: "selected synthesis layer",
    splitReason:
      "Layer selection and identity precede detailed envelope, generator and level editing.",
    workflowStage: "layer selection",
  },
  "Layer Timing": {
    entity: "selected synthesis layer",
    splitReason:
      "Offset and envelope timing are manipulated together on both tracks and numeric controls.",
    workflowStage: "layer envelope",
  },
  Tone: {
    entity: "selected synthesis layer",
    splitReason:
      "Tone-only oscillator and pitch parameters are conditional on the selected layer kind.",
    workflowStage: "tone generator",
  },
  Noise: {
    entity: "selected synthesis layer",
    splitReason:
      "Noise-only filter parameters are conditional on the selected layer kind.",
    workflowStage: "noise generator",
  },
  "Layer Level": {
    entity: "selected synthesis layer",
    splitReason:
      "Gain and pan are shared output controls applied after either tone or noise generation.",
    workflowStage: "layer output",
  },
};

export const appControlSectionInventory: readonly ToolcraftControlSectionInventoryEntry[] =
  sections
    .filter(
      (section) =>
        Boolean(section.title) && section.title !== "Setup" && section.layout !== "standalone",
    )
    .map((section) => ({
      entity: section.title,
      groupingReason: `The ${section.title} section groups controls that edit one sound-design entity or one delivery stage.`,
      targets: Object.values(section.controls).map((control) => control.target),
      title: section.title!,
      ...(splitSectionMetadata[section.title ?? ""] ?? {}),
    }));

function customControlContract(
  type: string,
): Pick<ToolcraftComponentAcceptance, "builtInFitCheck" | "customControlCoverage"> {
  if (type === "cueLibrary") {
    return {
      builtInFitCheck: {
        capabilities: [
          "collection",
          "reorder",
          "selection",
          "commands",
          "custom-value-model",
        ],
        checkedBuiltIns: ["collectionActions", "actions", "select"],
        closestBuiltIn: "collectionActions",
        productObservable:
          "Selecting or reordering a cue changes the active named waveform and pack export order.",
        whyInsufficient:
          "CollectionActions changes a homogeneous item count, but a cue library must select, order, duplicate, delete, and preserve complete nested SoundRecipeV1 values.",
      },
      customControlCoverage: "all-custom-control-behavior",
    };
  }

  if (type === "layerStack") {
    return {
      builtInFitCheck: {
        capabilities: [
          "collection",
          "reorder",
          "selection",
          "commands",
          "custom-value-model",
        ],
        checkedBuiltIns: ["collectionActions", "actions", "select"],
        closestBuiltIn: "collectionActions",
        productObservable:
          "Adding, muting, selecting, or reordering a synthesis layer changes the rendered cue and its envelope tracks.",
        whyInsufficient:
          "CollectionActions cannot represent a heterogeneous ordered union of editable ToneLayerV1 and NoiseLayerV1 objects with selection and visibility.",
      },
      customControlCoverage: "all-custom-control-behavior",
    };
  }

  return {
    builtInFitCheck: {
      capabilities: ["custom-interaction", "custom-value-model"],
      checkedBuiltIns: ["slider"],
      closestBuiltIn: "slider",
      productObservable:
        "Equal pointer travel covers perceptually useful frequency octaves and changes the procedural waveform.",
      whyInsufficient:
        "The built-in slider uses a linear numeric domain; frequency and filter cutoff require logarithmic pointer mapping while preserving the actual Hz runtime value.",
    },
    customControlCoverage: "all-custom-control-behavior",
  };
}

const controlAcceptance = sections.flatMap((section) =>
  Object.entries(section.controls).flatMap(([controlId, control]) => {
    if (isToolcraftRuntimeOwnedTarget(control.target)) return [];
    const actionValues = control.actions?.map((action) =>
      typeof action === "string" ? action : action.value,
    );
    const isCustom = ["cueLibrary", "layerStack", "logSlider"].includes(control.type);
    const isExport = control.type === "panelActions";
    const id = isExport ? "actions.output" : control.target;
    const acceptance: ToolcraftComponentAcceptance = {
      ...(actionValues ? { actionCoverage: actionValues } : {}),
      automated: true,
      automatedTestName: `${id} maps to procedural sound output`,
      browser: true,
      browserTestName: `browser: ${id} maps to procedural sound output`,
      componentType: control.type,
      evidence: isExport ? "exported-bytes" : "product-output",
      expectedObservable: isExport
        ? "The selected delivery action downloads non-empty bytes in the requested production format."
        : `Changing ${String(control.label || controlId)} updates the active waveform, layer tracks, pack state, or export result.`,
      fixture: "default success cue with three deterministic tone layers",
      id,
      kind: "control",
      ...(isCustom ? customControlContract(control.type) : {}),
      ...(control.options ? { optionCoverage: "each-visible-item" as const } : {}),
      target: control.target,
      userAction: isExport
        ? "Choose export settings and activate each sticky delivery action."
        : `Operate the visible ${String(control.label || controlId)} control.`,
      ...(control.visibleWhen
        ? { visibilityCoverage: "all-conditional-visibility" as const }
        : {}),
    };
    return [acceptance];
  }),
);

const runtimeAcceptance: ToolcraftComponentAcceptance[] = [
  {
    automated: true,
    automatedTestName: "timeline playback drives audio and waveform playhead",
    browser: true,
    browserTestName: "browser: timeline playback drives audio and waveform playhead",
    componentType: "timeline",
    evidence: "timeline-output",
    expectedObservable:
      "Play, pause, scrub, duration and loop remain synchronized with the shared AudioContext and visible waveform playhead.",
    fixture: "rendered success cue with one-second Toolcraft playback range",
    id: "timeline.playback",
    kind: "runtime",
    timelineCoverage: "playback",
    timelineLoopProof: {
      direction: "forward-only",
      durationChange: "reproved-after-edit",
      reversePlayback: "forbidden",
      seam: "first-last-match",
    },
    timelinePlaybackCoverage: [
      "pause-resume",
      "scrub",
      "duration",
      "loop",
      "rendered-frame",
    ],
    userAction: "Play, pause, scrub, enable loop, and edit the Toolcraft timeline duration.",
  },
  {
    automated: true,
    automatedTestName: "workspace values restore after reload",
    browser: true,
    browserTestName: "browser: workspace values restore after reload",
    componentType: "persistence",
    evidence: "persistence-state",
    expectedObservable: "A renamed pack and edited synthesis value remain restored after a real reload.",
    fixture: "renamed default sound pack",
    id: "persistence.workspace",
    kind: "runtime",
    persistenceCoverage: "reload",
    target: targets.packName,
    userAction: "Rename the pack, wait for persistence, and reload the page.",
  },
  {
    automated: true,
    automatedTestName: "fixed audio workspace stays full bleed and stable",
    browser: true,
    browserTestName: "browser: fixed audio workspace stays full bleed and stable",
    canvasSizingCoverage: "fixed-output-size",
    componentType: "canvas",
    evidence: "viewport-side-effect",
    expectedObservable:
      "The non-exported waveform workspace keeps a stable fixed surface without exposing output dimensions while viewport panning leaves audio samples unchanged.",
    fixture: "full-bleed black waveform workspace",
    id: "canvas.viewport",
    kind: "runtime",
    userAction: "Open the fixed waveform workspace and pan its viewport.",
  },
];

export const appAcceptance: readonly ToolcraftComponentAcceptance[] = [
  ...controlAcceptance,
  ...runtimeAcceptance,
];
