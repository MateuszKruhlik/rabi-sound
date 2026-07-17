export const LEGACY_SOUND_PACK_SCHEMA = "cuelume-studio" as const;
export const SOUND_PACK_SCHEMA = "rabi-sound" as const;
export const SOUND_PACK_VERSION = 1 as const;
export const MAX_CUE_DURATION_MS = 5_000;
export const MAX_LAYERS_PER_CUE = 16;
export const MAX_CUES_PER_PACK = 32;
export const SILENCE_THRESHOLD_DBFS = -72;

export type ExportSettingsV1 = {
  bitDepth: 16 | 24;
  channels: 1 | 2;
  sampleRate: 44_100 | 48_000;
};

export type LayerBaseV1 = {
  attackMs: number;
  decayMs: number;
  enabled: boolean;
  gainDb: number;
  id: string;
  name: string;
  pan: number;
  startMs: number;
};

export type ToneLayerV1 = LayerBaseV1 & {
  detuneCents: number;
  frequencyHz: number;
  glide?: {
    durationMs: number;
    toFrequencyHz: number;
  };
  kind: "tone";
  waveform: OscillatorType;
};

export type NoiseLayerV1 = LayerBaseV1 & {
  filter: {
    cutoffHz: number;
    q: number;
    type: BiquadFilterType;
  };
  kind: "noise";
  noise: "white";
};

export type SoundLayerV1 = NoiseLayerV1 | ToneLayerV1;

export type CuelumeSourceMetadata = {
  commit: string;
  license: "MIT";
  preset: string;
  repository: string;
  version: string;
};

export type SoundRecipeV1 = {
  duration: { mode: "auto" } | { endMs: number; mode: "trim" };
  id: string;
  layers: SoundLayerV1[];
  mastering: {
    fadeInMs: number;
    fadeOutMs: number;
    normalize: boolean;
    targetPeakDbfs: number;
    trimSilence: boolean;
  };
  masterGainDb: number;
  name: string;
  seed: number;
  shimmer?: {
    delayMs: number;
    feedback: number;
    lowpassHz: number;
    wet: number;
  };
  source?: CuelumeSourceMetadata;
};

export type SoundPackV1 = {
  activeSoundId: string;
  export: ExportSettingsV1;
  id: string;
  name: string;
  schema: typeof SOUND_PACK_SCHEMA;
  sounds: SoundRecipeV1[];
  version: typeof SOUND_PACK_VERSION;
};

export type RenderedSound = {
  channels: Float32Array[];
  durationMs: number;
  peak: number;
  sampleRate: number;
};

export type WaveformPeak = {
  max: number;
  min: number;
};

export type VariationOptions = {
  intensity: number;
  seed: number;
};

export type ExportProgress = {
  completed: number;
  cueName?: string;
  phase: "render" | "encode" | "archive";
  total: number;
};
