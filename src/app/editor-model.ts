import type { ToolcraftCommand, ToolcraftState } from "@/toolcraft/runtime";

import { createId } from "../audio/math";
import { SOUND_PACK_SCHEMA } from "../audio/types";
import type {
  NoiseLayerV1,
  SoundLayerV1,
  SoundPackV1,
  SoundRecipeV1,
  ToneLayerV1,
} from "../audio/types";

export const targets = {
  bitDepth: "export.audio.bitDepth",
  channels: "export.audio.channels",
  cueName: "editor.sound.name",
  durationMode: "editor.sound.durationMode",
  fadeInMs: "editor.sound.fadeInMs",
  fadeOutMs: "editor.sound.fadeOutMs",
  layerAttackMs: "editor.layer.attackMs",
  layerDecayMs: "editor.layer.decayMs",
  layerDetuneCents: "editor.layer.detuneCents",
  layerEnabled: "editor.layer.enabled",
  layerFilterCutoffHz: "editor.layer.filterCutoffHz",
  layerFilterQ: "editor.layer.filterQ",
  layerFilterType: "editor.layer.filterType",
  layerFrequencyHz: "editor.layer.frequencyHz",
  layerGainDb: "editor.layer.gainDb",
  layerGlideDurationMs: "editor.layer.glideDurationMs",
  layerGlideEnabled: "editor.layer.glideEnabled",
  layerGlideToHz: "editor.layer.glideToHz",
  layerKind: "editor.layer.kind",
  layerName: "editor.layer.name",
  layerPan: "editor.layer.pan",
  layerStartMs: "editor.layer.startMs",
  layerWaveform: "editor.layer.waveform",
  loadedLayerId: "editor.loadedLayerId",
  loadedSoundId: "editor.loadedSoundId",
  masterGainDb: "editor.sound.masterGainDb",
  normalize: "editor.sound.normalize",
  pack: "workspace.pack",
  packName: "workspace.packName",
  presetId: "editor.presetId",
  sampleRate: "export.audio.sampleRate",
  selectedLayerId: "editor.selectedLayerId",
  shimmerDelayMs: "editor.sound.shimmerDelayMs",
  shimmerEnabled: "editor.sound.shimmerEnabled",
  shimmerFeedback: "editor.sound.shimmerFeedback",
  shimmerLowpassHz: "editor.sound.shimmerLowpassHz",
  shimmerWet: "editor.sound.shimmerWet",
  targetPeakDbfs: "editor.sound.targetPeakDbfs",
  trimEndMs: "editor.sound.trimEndMs",
  trimSilence: "editor.sound.trimSilence",
  variationIntensity: "editor.variationIntensity",
  variationSeed: "editor.variationSeed",
} as const;

export function getActiveSound(pack: SoundPackV1): SoundRecipeV1 {
  return pack.sounds.find((sound) => sound.id === pack.activeSoundId) ?? pack.sounds[0];
}

export function getSelectedLayer(
  sound: SoundRecipeV1,
  selectedLayerId: unknown,
): SoundLayerV1 {
  return sound.layers.find((layer) => layer.id === selectedLayerId) ?? sound.layers[0];
}

function getToneDefaults(layer: SoundLayerV1): ToneLayerV1 {
  if (layer.kind === "tone") {
    return layer;
  }

  return {
    ...layer,
    detuneCents: 0,
    frequencyHz: 880,
    kind: "tone",
    waveform: "sine",
  };
}

function getNoiseDefaults(layer: SoundLayerV1): NoiseLayerV1 {
  if (layer.kind === "noise") {
    return layer;
  }

  return {
    ...layer,
    filter: { cutoffHz: 2_000, q: 0.7, type: "bandpass" },
    kind: "noise",
    noise: "white",
  };
}

export function createEditorSnapshot(
  pack: SoundPackV1,
  selectedLayerId?: string,
): Record<string, unknown> {
  const sound = getActiveSound(pack);
  const layer = getSelectedLayer(sound, selectedLayerId);
  const tone = getToneDefaults(layer);
  const noise = getNoiseDefaults(layer);

  return {
    [targets.bitDepth]: pack.export.bitDepth,
    [targets.channels]: pack.export.channels,
    [targets.cueName]: sound.name,
    [targets.durationMode]: sound.duration.mode,
    [targets.fadeInMs]: sound.mastering.fadeInMs,
    [targets.fadeOutMs]: sound.mastering.fadeOutMs,
    [targets.layerAttackMs]: layer.attackMs,
    [targets.layerDecayMs]: layer.decayMs,
    [targets.layerDetuneCents]: tone.detuneCents,
    [targets.layerEnabled]: layer.enabled,
    [targets.layerFilterCutoffHz]: noise.filter.cutoffHz,
    [targets.layerFilterQ]: noise.filter.q,
    [targets.layerFilterType]: noise.filter.type,
    [targets.layerFrequencyHz]: tone.frequencyHz,
    [targets.layerGainDb]: layer.gainDb,
    [targets.layerGlideDurationMs]: tone.glide?.durationMs ?? 120,
    [targets.layerGlideEnabled]: tone.glide !== undefined,
    [targets.layerGlideToHz]: tone.glide?.toFrequencyHz ?? tone.frequencyHz,
    [targets.layerKind]: layer.kind,
    [targets.layerName]: layer.name,
    [targets.layerPan]: layer.pan,
    [targets.layerStartMs]: layer.startMs,
    [targets.layerWaveform]: tone.waveform,
    [targets.loadedLayerId]: layer.id,
    [targets.loadedSoundId]: sound.id,
    [targets.masterGainDb]: sound.masterGainDb,
    [targets.normalize]: sound.mastering.normalize,
    [targets.packName]: pack.name,
    [targets.sampleRate]: pack.export.sampleRate,
    [targets.selectedLayerId]: layer.id,
    [targets.shimmerDelayMs]: sound.shimmer?.delayMs ?? 100,
    [targets.shimmerEnabled]: sound.shimmer !== undefined,
    [targets.shimmerFeedback]: sound.shimmer?.feedback ?? 0.2,
    [targets.shimmerLowpassHz]: sound.shimmer?.lowpassHz ?? 4_000,
    [targets.shimmerWet]: sound.shimmer?.wet ?? 0.15,
    [targets.targetPeakDbfs]: sound.mastering.targetPeakDbfs,
    [targets.trimEndMs]: sound.duration.mode === "trim" ? sound.duration.endMs : 1_000,
    [targets.trimSilence]: sound.mastering.trimSilence,
  };
}

export function dispatchEditorSnapshot(
  dispatch: (command: ToolcraftCommand) => void,
  pack: SoundPackV1,
  selectedLayerId?: string,
): void {
  const snapshot = createEditorSnapshot(pack, selectedLayerId);

  for (const [target, value] of Object.entries(snapshot)) {
    dispatch({ history: "skip", target, type: "controls.setValue", value });
  }
}

function numberValue(values: Record<string, unknown>, target: string, fallback: number): number {
  const value = values[target];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function stringValue(values: Record<string, unknown>, target: string, fallback: string): string {
  return typeof values[target] === "string" ? String(values[target]) : fallback;
}

function booleanValue(values: Record<string, unknown>, target: string, fallback: boolean): boolean {
  return typeof values[target] === "boolean" ? Boolean(values[target]) : fallback;
}

function materializeSelectedLayer(
  layer: SoundLayerV1,
  values: Record<string, unknown>,
): SoundLayerV1 {
  const base = {
    ...layer,
    attackMs: numberValue(values, targets.layerAttackMs, layer.attackMs),
    decayMs: numberValue(values, targets.layerDecayMs, layer.decayMs),
    enabled: booleanValue(values, targets.layerEnabled, layer.enabled),
    gainDb: numberValue(values, targets.layerGainDb, layer.gainDb),
    name: stringValue(values, targets.layerName, layer.name),
    pan: numberValue(values, targets.layerPan, layer.pan),
    startMs: numberValue(values, targets.layerStartMs, layer.startMs),
  };

  if (layer.kind === "tone") {
    const glideEnabled = booleanValue(values, targets.layerGlideEnabled, layer.glide !== undefined);
    return {
      ...base,
      detuneCents: numberValue(values, targets.layerDetuneCents, layer.detuneCents),
      frequencyHz: numberValue(values, targets.layerFrequencyHz, layer.frequencyHz),
      glide: glideEnabled
        ? {
            durationMs: numberValue(values, targets.layerGlideDurationMs, layer.glide?.durationMs ?? 120),
            toFrequencyHz: numberValue(values, targets.layerGlideToHz, layer.glide?.toFrequencyHz ?? layer.frequencyHz),
          }
        : undefined,
      kind: "tone",
      waveform: stringValue(values, targets.layerWaveform, layer.waveform) as OscillatorType,
    };
  }

  return {
    ...base,
    filter: {
      cutoffHz: numberValue(values, targets.layerFilterCutoffHz, layer.filter.cutoffHz),
      q: numberValue(values, targets.layerFilterQ, layer.filter.q),
      type: stringValue(values, targets.layerFilterType, layer.filter.type) as BiquadFilterType,
    },
    kind: "noise",
    noise: "white",
  };
}

export function materializePackFromValues(values: Record<string, unknown>): SoundPackV1 {
  const sourcePack = values[targets.pack] as SoundPackV1;
  const pack = structuredClone(sourcePack);
  const activeSound = getActiveSound(pack);
  const loadedSoundId = values[targets.loadedSoundId];

  pack.name = stringValue(values, targets.packName, pack.name);
  pack.schema = SOUND_PACK_SCHEMA;
  pack.export = {
    bitDepth: numberValue(values, targets.bitDepth, pack.export.bitDepth) as 16 | 24,
    channels: numberValue(values, targets.channels, pack.export.channels) as 1 | 2,
    sampleRate: numberValue(values, targets.sampleRate, pack.export.sampleRate) as 44_100 | 48_000,
  };

  if (loadedSoundId !== activeSound.id) {
    return pack;
  }

  const selectedLayerId = values[targets.selectedLayerId];
  const materializedSound: SoundRecipeV1 = {
    ...activeSound,
    duration:
      stringValue(values, targets.durationMode, activeSound.duration.mode) === "trim"
        ? { endMs: numberValue(values, targets.trimEndMs, 1_000), mode: "trim" }
        : { mode: "auto" },
    layers: activeSound.layers.map((layer) =>
      layer.id === selectedLayerId ? materializeSelectedLayer(layer, values) : layer,
    ),
    mastering: {
      fadeInMs: numberValue(values, targets.fadeInMs, activeSound.mastering.fadeInMs),
      fadeOutMs: numberValue(values, targets.fadeOutMs, activeSound.mastering.fadeOutMs),
      normalize: booleanValue(values, targets.normalize, activeSound.mastering.normalize),
      targetPeakDbfs: numberValue(values, targets.targetPeakDbfs, activeSound.mastering.targetPeakDbfs),
      trimSilence: booleanValue(values, targets.trimSilence, activeSound.mastering.trimSilence),
    },
    masterGainDb: numberValue(values, targets.masterGainDb, activeSound.masterGainDb),
    name: stringValue(values, targets.cueName, activeSound.name),
    shimmer: booleanValue(values, targets.shimmerEnabled, activeSound.shimmer !== undefined)
      ? {
          delayMs: numberValue(values, targets.shimmerDelayMs, activeSound.shimmer?.delayMs ?? 100),
          feedback: numberValue(values, targets.shimmerFeedback, activeSound.shimmer?.feedback ?? 0.2),
          lowpassHz: numberValue(values, targets.shimmerLowpassHz, activeSound.shimmer?.lowpassHz ?? 4_000),
          wet: numberValue(values, targets.shimmerWet, activeSound.shimmer?.wet ?? 0.15),
        }
      : undefined,
  };
  pack.sounds = pack.sounds.map((sound) =>
    sound.id === materializedSound.id ? materializedSound : sound,
  );
  return pack;
}

export function commitActiveValues(state: ToolcraftState): SoundPackV1 {
  return materializePackFromValues(state.values);
}

export function createToneLayer(index: number): ToneLayerV1 {
  return {
    attackMs: 4,
    decayMs: 180,
    detuneCents: 0,
    enabled: true,
    frequencyHz: 880,
    gainDb: -24,
    id: createId("tone"),
    kind: "tone",
    name: `Tone ${index}`,
    pan: 0,
    startMs: 0,
    waveform: "sine",
  };
}

export function createNoiseLayer(index: number): NoiseLayerV1 {
  return {
    attackMs: 2,
    decayMs: 100,
    enabled: true,
    filter: { cutoffHz: 2_000, q: 0.7, type: "bandpass" },
    gainDb: -24,
    id: createId("noise"),
    kind: "noise",
    name: `Noise ${index}`,
    noise: "white",
    pan: 0,
    startMs: 0,
  };
}
