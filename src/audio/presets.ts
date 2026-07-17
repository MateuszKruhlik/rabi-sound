import { gainToDb, hashString } from "./math";
import type {
  NoiseLayerV1,
  SoundPackV1,
  SoundRecipeV1,
  ToneLayerV1,
} from "./types";

export const CUELUME_SOURCE = {
  commit: "ce81ececf18b4ee6cd195404546dfbab31b279fe",
  license: "MIT",
  repository: "https://github.com/Danilaa1/cuelume",
  version: "v0.1.2",
} as const;

type SourceTone = {
  attack: number;
  decay: number;
  detune?: number;
  frequency: number;
  glideTime?: number;
  glideTo?: number;
  kind: "tone";
  offset?: number;
  peak: number;
  waveform: OscillatorType;
};

type SourceNoise = {
  attack: number;
  decay: number;
  filterFrequency: number;
  filterQ: number;
  filterType: "bandpass" | "highpass" | "lowpass";
  kind: "noise";
  offset?: number;
  peak: number;
};

type SourceRecipe = {
  layers: readonly (SourceNoise | SourceTone)[];
  masterGain: number;
  shimmer?: { delay: number; feedback: number; lowpass: number; wet: number };
};

const sourceRecipes = {
  chime: {
    masterGain: 0.5,
    layers: [
      { kind: "tone", waveform: "sine", frequency: 1046.5, attack: 0.006, decay: 0.22, peak: 0.09 },
      { kind: "tone", waveform: "sine", frequency: 1568, offset: 0.09, attack: 0.006, decay: 0.26, peak: 0.08 },
    ],
    shimmer: { delay: 0.12, feedback: 0.25, wet: 0.18, lowpass: 4000 },
  },
  sparkle: {
    masterGain: 0.5,
    layers: [
      { kind: "tone", waveform: "sine", frequency: 1760, attack: 0.003, decay: 0.09, peak: 0.045 },
      { kind: "tone", waveform: "sine", frequency: 2217, offset: 0.045, attack: 0.003, decay: 0.09, peak: 0.04 },
      { kind: "tone", waveform: "sine", frequency: 2637, offset: 0.09, attack: 0.003, decay: 0.1, peak: 0.038 },
      { kind: "tone", waveform: "sine", frequency: 3520, offset: 0.135, attack: 0.003, decay: 0.12, peak: 0.032 },
    ],
    shimmer: { delay: 0.07, feedback: 0.35, wet: 0.22, lowpass: 6000 },
  },
  droplet: {
    masterGain: 0.55,
    layers: [
      { kind: "tone", waveform: "sine", frequency: 1200, glideTo: 550, glideTime: 0.14, attack: 0.004, decay: 0.2, peak: 0.075 },
    ],
    shimmer: { delay: 0.09, feedback: 0.2, wet: 0.15, lowpass: 3000 },
  },
  bloom: {
    masterGain: 0.5,
    layers: [
      { kind: "tone", waveform: "sine", frequency: 528, attack: 0.06, decay: 0.32, peak: 0.06 },
      { kind: "tone", waveform: "sine", frequency: 528, detune: 12, attack: 0.06, decay: 0.34, peak: 0.05 },
    ],
    shimmer: { delay: 0.15, feedback: 0.2, wet: 0.12, lowpass: 2500 },
  },
  whisper: {
    masterGain: 0.5,
    layers: [
      { kind: "noise", filterType: "lowpass", filterFrequency: 1200, filterQ: 0.7, attack: 0.04, decay: 0.16, peak: 0.05 },
    ],
  },
  tick: {
    masterGain: 0.4,
    layers: [
      { kind: "noise", filterType: "bandpass", filterFrequency: 5400, filterQ: 1.8, attack: 0.001, decay: 0.018, peak: 0.14 },
      { kind: "tone", waveform: "sine", frequency: 2600, attack: 0.001, decay: 0.012, peak: 0.018 },
    ],
  },
  press: {
    masterGain: 0.4,
    layers: [
      { kind: "noise", filterType: "bandpass", filterFrequency: 1700, filterQ: 1.4, attack: 0.001, decay: 0.02, peak: 0.13 },
    ],
  },
  release: {
    masterGain: 0.4,
    layers: [
      { kind: "noise", filterType: "bandpass", filterFrequency: 4600, filterQ: 1.8, attack: 0.001, decay: 0.016, peak: 0.12 },
      { kind: "tone", waveform: "sine", frequency: 3200, offset: 0.006, attack: 0.001, decay: 0.05, peak: 0.02 },
    ],
  },
  toggle: {
    masterGain: 0.4,
    layers: [
      { kind: "noise", filterType: "bandpass", filterFrequency: 2200, filterQ: 1.6, attack: 0.001, decay: 0.016, peak: 0.12 },
      { kind: "noise", filterType: "bandpass", filterFrequency: 3800, filterQ: 1.6, offset: 0.024, attack: 0.001, decay: 0.02, peak: 0.1 },
    ],
  },
  success: {
    masterGain: 0.5,
    layers: [
      { kind: "tone", waveform: "sine", frequency: 880, attack: 0.004, decay: 0.09, peak: 0.06 },
      { kind: "tone", waveform: "sine", frequency: 1108.73, offset: 0.06, attack: 0.004, decay: 0.1, peak: 0.06 },
      { kind: "tone", waveform: "sine", frequency: 1318.51, offset: 0.12, attack: 0.004, decay: 0.18, peak: 0.07 },
    ],
    shimmer: { delay: 0.1, feedback: 0.22, wet: 0.16, lowpass: 4500 },
  },
  error: {
    masterGain: 0.42,
    layers: [
      { kind: "noise", filterType: "bandpass", filterFrequency: 850, filterQ: 1.1, attack: 0.001, decay: 0.035, peak: 0.13 },
      { kind: "tone", waveform: "triangle", frequency: 440, offset: 0.025, attack: 0.004, decay: 0.09, peak: 0.045 },
      { kind: "tone", waveform: "triangle", frequency: 349.23, offset: 0.1, attack: 0.004, decay: 0.14, peak: 0.04 },
    ],
  },
  page: {
    masterGain: 0.38,
    layers: [
      { kind: "noise", filterType: "lowpass", filterFrequency: 1800, filterQ: 0.7, attack: 0.006, decay: 0.08, peak: 0.11 },
      { kind: "noise", filterType: "bandpass", filterFrequency: 4200, filterQ: 1.2, offset: 0.04, attack: 0.004, decay: 0.065, peak: 0.08 },
      { kind: "tone", waveform: "sine", frequency: 2400, offset: 0.075, attack: 0.002, decay: 0.045, peak: 0.02 },
    ],
  },
  loading: {
    masterGain: 0.42,
    layers: [
      { kind: "noise", filterType: "lowpass", filterFrequency: 1400, filterQ: 0.6, attack: 0.035, decay: 0.14, peak: 0.035 },
      { kind: "tone", waveform: "sine", frequency: 420, glideTo: 630, glideTime: 0.18, attack: 0.025, decay: 0.18, peak: 0.05 },
    ],
    shimmer: { delay: 0.11, feedback: 0.18, wet: 0.12, lowpass: 2800 },
  },
  ready: {
    masterGain: 0.45,
    layers: [
      { kind: "noise", filterType: "bandpass", filterFrequency: 3200, filterQ: 1.7, attack: 0.001, decay: 0.018, peak: 0.1 },
      { kind: "tone", waveform: "sine", frequency: 659.25, offset: 0.025, attack: 0.012, decay: 0.2, peak: 0.05 },
      { kind: "tone", waveform: "sine", frequency: 987.77, offset: 0.025, attack: 0.012, decay: 0.22, peak: 0.035 },
    ],
    shimmer: { delay: 0.13, feedback: 0.2, wet: 0.13, lowpass: 3600 },
  },
} as const satisfies Record<string, SourceRecipe>;

export type CuelumePresetId = keyof typeof sourceRecipes;
export const CUELUME_PRESET_IDS = Object.keys(sourceRecipes) as CuelumePresetId[];

function convertLayer(presetId: string, layer: SourceNoise | SourceTone, index: number): NoiseLayerV1 | ToneLayerV1 {
  const base = {
    attackMs: layer.attack * 1_000,
    decayMs: layer.decay * 1_000,
    enabled: true,
    gainDb: gainToDb(layer.peak),
    id: `${presetId}-layer-${index + 1}`,
    name: `${layer.kind === "tone" ? "Tone" : "Noise"} ${index + 1}`,
    pan: 0,
    startMs: (layer.offset ?? 0) * 1_000,
  };

  if (layer.kind === "tone") {
    return {
      ...base,
      detuneCents: layer.detune ?? 0,
      frequencyHz: layer.frequency,
      glide:
        layer.glideTo === undefined
          ? undefined
          : {
              durationMs: (layer.glideTime ?? layer.attack + layer.decay) * 1_000,
              toFrequencyHz: layer.glideTo,
            },
      kind: "tone",
      waveform: layer.waveform,
    };
  }

  return {
    ...base,
    filter: {
      cutoffHz: layer.filterFrequency,
      q: layer.filterQ,
      type: layer.filterType,
    },
    kind: "noise",
    noise: "white",
  };
}

export function createPresetRecipe(presetId: CuelumePresetId, id = `cue-${presetId}`): SoundRecipeV1 {
  const source: SourceRecipe = sourceRecipes[presetId];

  return {
    duration: { mode: "auto" },
    id,
    layers: source.layers.map((layer, index) => convertLayer(presetId, layer, index)),
    mastering: {
      fadeInMs: 2,
      fadeOutMs: 8,
      normalize: true,
      targetPeakDbfs: -6,
      trimSilence: true,
    },
    masterGainDb: gainToDb(source.masterGain),
    name: presetId,
    seed: hashString(`cuelume-${CUELUME_SOURCE.version}:${presetId}`),
    shimmer: source.shimmer
      ? {
          delayMs: source.shimmer.delay * 1_000,
          feedback: source.shimmer.feedback,
          lowpassHz: source.shimmer.lowpass,
          wet: source.shimmer.wet,
        }
      : undefined,
    source: { ...CUELUME_SOURCE, preset: presetId },
  };
}

export const CUELUME_PRESETS = Object.fromEntries(
  CUELUME_PRESET_IDS.map((presetId) => [presetId, createPresetRecipe(presetId)]),
) as Record<CuelumePresetId, SoundRecipeV1>;

export function createDefaultSoundPack(): SoundPackV1 {
  const success = createPresetRecipe("success");

  return {
    activeSoundId: success.id,
    export: { bitDepth: 16, channels: 1, sampleRate: 48_000 },
    id: "pack-rabi-sound",
    name: "My UI sound pack",
    schema: "rabi-sound",
    sounds: [success],
    version: 1,
  };
}
