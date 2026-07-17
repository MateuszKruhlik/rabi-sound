import { clamp, createSeededRandom, dbToGain, hashString } from "./math";
import { soundRecipeV1Schema } from "./schema";
import {
  MAX_CUE_DURATION_MS,
  SILENCE_THRESHOLD_DBFS,
  type ExportSettingsV1,
  type NoiseLayerV1,
  type RenderedSound,
  type SoundLayerV1,
  type SoundRecipeV1,
  type ToneLayerV1,
  type WaveformPeak,
} from "./types";

const SOURCE_STOP_PADDING_SECONDS = 0.05;
const CLEANUP_MARGIN_SECONDS = 0.05;
const INAUDIBLE_GAIN = 0.001;
const renderCache = new Map<string, Promise<RenderedSound>>();

function getOfflineAudioContextConstructor(): typeof OfflineAudioContext {
  const constructor = globalThis.OfflineAudioContext;

  if (!constructor) {
    throw new Error("OfflineAudioContext is not available in this browser.");
  }

  return constructor;
}

function getLayerEndSeconds(layer: SoundLayerV1): number {
  return (layer.startMs + layer.attackMs + layer.decayMs) / 1_000 + SOURCE_STOP_PADDING_SECONDS;
}

function getShimmerTailSeconds(recipe: SoundRecipeV1): number {
  const shimmer = recipe.shimmer;

  if (!shimmer || shimmer.feedback <= 0) {
    return 0;
  }

  const delaySeconds = shimmer.delayMs / 1_000;
  return delaySeconds * (1 + Math.ceil(Math.log(INAUDIBLE_GAIN) / Math.log(shimmer.feedback)));
}

export function getAutomaticDurationMs(recipe: SoundRecipeV1): number {
  const enabledLayers = recipe.layers.filter((layer) => layer.enabled);
  const sourceEnd = enabledLayers.length > 0 ? Math.max(...enabledLayers.map(getLayerEndSeconds)) : 0.1;
  return Math.min(
    MAX_CUE_DURATION_MS,
    Math.ceil((sourceEnd + getShimmerTailSeconds(recipe) + CLEANUP_MARGIN_SECONDS) * 1_000),
  );
}

function connectLayerOutput(
  context: OfflineAudioContext,
  source: AudioNode,
  destination: AudioNode,
  pan: number,
  channels: 1 | 2,
): void {
  if (channels === 2 && typeof context.createStereoPanner === "function") {
    const panner = context.createStereoPanner();
    panner.pan.value = clamp(pan, -1, 1);
    source.connect(panner).connect(destination);
    return;
  }

  source.connect(destination);
}

function scheduleEnvelope(
  gain: AudioParam,
  startSeconds: number,
  attackSeconds: number,
  decaySeconds: number,
  peak: number,
): void {
  const safeAttack = Math.max(0.0001, attackSeconds);
  const safeDecay = Math.max(0.0001, decaySeconds);
  const safePeak = Math.max(0.0001, peak);
  gain.setValueAtTime(0.0001, startSeconds);
  gain.exponentialRampToValueAtTime(safePeak, startSeconds + safeAttack);
  gain.exponentialRampToValueAtTime(0.0001, startSeconds + safeAttack + safeDecay);
}

function renderToneLayer(
  context: OfflineAudioContext,
  destination: AudioNode,
  layer: ToneLayerV1,
  channels: 1 | 2,
): void {
  const startSeconds = layer.startMs / 1_000;
  const attackSeconds = layer.attackMs / 1_000;
  const decaySeconds = layer.decayMs / 1_000;
  const oscillator = context.createOscillator();
  const envelope = context.createGain();

  oscillator.type = layer.waveform;
  oscillator.frequency.setValueAtTime(layer.frequencyHz, startSeconds);
  oscillator.detune.setValueAtTime(layer.detuneCents, startSeconds);

  if (layer.glide) {
    oscillator.frequency.exponentialRampToValueAtTime(
      layer.glide.toFrequencyHz,
      startSeconds + Math.max(0.0001, layer.glide.durationMs / 1_000),
    );
  }

  scheduleEnvelope(
    envelope.gain,
    startSeconds,
    attackSeconds,
    decaySeconds,
    dbToGain(layer.gainDb),
  );
  oscillator.connect(envelope);
  connectLayerOutput(context, envelope, destination, layer.pan, channels);
  oscillator.start(startSeconds);
  oscillator.stop(startSeconds + attackSeconds + decaySeconds + SOURCE_STOP_PADDING_SECONDS);
}

function renderNoiseLayer(
  context: OfflineAudioContext,
  destination: AudioNode,
  layer: NoiseLayerV1,
  channels: 1 | 2,
  recipeSeed: number,
): void {
  const startSeconds = layer.startMs / 1_000;
  const attackSeconds = layer.attackMs / 1_000;
  const decaySeconds = layer.decayMs / 1_000;
  const durationSeconds = attackSeconds + decaySeconds + SOURCE_STOP_PADDING_SECONDS;
  const frameCount = Math.max(1, Math.ceil(durationSeconds * context.sampleRate));
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const samples = buffer.getChannelData(0);
  const random = createSeededRandom(recipeSeed ^ hashString(layer.id));

  for (let frame = 0; frame < frameCount; frame += 1) {
    samples[frame] = random() * 2 - 1;
  }

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();
  source.buffer = buffer;
  filter.type = layer.filter.type;
  filter.frequency.value = layer.filter.cutoffHz;
  filter.Q.value = layer.filter.q;
  scheduleEnvelope(
    envelope.gain,
    startSeconds,
    attackSeconds,
    decaySeconds,
    dbToGain(layer.gainDb),
  );
  source.connect(filter).connect(envelope);
  connectLayerOutput(context, envelope, destination, layer.pan, channels);
  source.start(startSeconds);
  source.stop(startSeconds + durationSeconds);
}

function attachShimmer(
  context: OfflineAudioContext,
  source: AudioNode,
  destination: AudioNode,
  shimmer: NonNullable<SoundRecipeV1["shimmer"]>,
): void {
  const delay = context.createDelay(MAX_CUE_DURATION_MS / 1_000);
  const feedbackFilter = context.createBiquadFilter();
  const feedbackGain = context.createGain();
  const wetGain = context.createGain();
  delay.delayTime.value = shimmer.delayMs / 1_000;
  feedbackFilter.type = "lowpass";
  feedbackFilter.frequency.value = shimmer.lowpassHz;
  feedbackGain.gain.value = shimmer.feedback;
  wetGain.gain.value = shimmer.wet;
  source.connect(delay);
  delay.connect(feedbackFilter);
  feedbackFilter.connect(feedbackGain);
  feedbackGain.connect(delay);
  feedbackFilter.connect(wetGain);
  wetGain.connect(destination);
}

function findAudibleRange(channels: readonly Float32Array[], threshold: number): [number, number] {
  const frameCount = channels[0]?.length ?? 0;
  let start = 0;
  let end = frameCount;

  startLoop: for (; start < frameCount; start += 1) {
    for (const channel of channels) {
      if (Math.abs(channel[start] ?? 0) >= threshold) {
        break startLoop;
      }
    }
  }

  endLoop: for (; end > start; end -= 1) {
    for (const channel of channels) {
      if (Math.abs(channel[end - 1] ?? 0) >= threshold) {
        break endLoop;
      }
    }
  }

  return [start, Math.max(start + 1, end)];
}

function fitChannelsToLength(channels: readonly Float32Array[], frameCount: number): Float32Array[] {
  return channels.map((channel) => {
    const output = new Float32Array(frameCount);
    output.set(channel.subarray(0, frameCount));
    return output;
  });
}

function applyFades(
  channels: readonly Float32Array[],
  sampleRate: number,
  fadeInMs: number,
  fadeOutMs: number,
): void {
  const frameCount = channels[0]?.length ?? 0;
  const fadeInFrames = Math.min(frameCount, Math.round((fadeInMs / 1_000) * sampleRate));
  const fadeOutFrames = Math.min(frameCount, Math.round((fadeOutMs / 1_000) * sampleRate));

  for (const channel of channels) {
    for (let frame = 0; frame < fadeInFrames; frame += 1) {
      channel[frame] *= frame / Math.max(1, fadeInFrames);
    }

    for (let frame = 0; frame < fadeOutFrames; frame += 1) {
      const index = frameCount - 1 - frame;
      channel[index] *= frame / Math.max(1, fadeOutFrames);
    }
  }
}

function getPeak(channels: readonly Float32Array[]): number {
  let peak = 0;

  for (const channel of channels) {
    for (const sample of channel) {
      peak = Math.max(peak, Math.abs(sample));
    }
  }

  return peak;
}

export function masterRenderedChannels(
  sourceChannels: readonly Float32Array[],
  sampleRate: number,
  recipe: SoundRecipeV1,
): RenderedSound {
  let channels: Float32Array[] = sourceChannels.map((channel) => new Float32Array(channel));

  if (recipe.mastering.trimSilence) {
    const [start, end] = findAudibleRange(channels, dbToGain(SILENCE_THRESHOLD_DBFS));
    channels = channels.map((channel) => channel.slice(start, end));
  }

  if (recipe.duration.mode === "trim") {
    const exactFrameCount = Math.max(1, Math.round((recipe.duration.endMs / 1_000) * sampleRate));
    channels = fitChannelsToLength(channels, exactFrameCount);
  }

  applyFades(
    channels,
    sampleRate,
    recipe.mastering.fadeInMs,
    recipe.mastering.fadeOutMs,
  );

  let peak = getPeak(channels);

  if (recipe.mastering.normalize && peak > 0) {
    const targetPeak = dbToGain(recipe.mastering.targetPeakDbfs);
    const scale = Math.min(1 / peak, targetPeak / peak);

    for (const channel of channels) {
      for (let frame = 0; frame < channel.length; frame += 1) {
        channel[frame] *= scale;
      }
    }
    peak = getPeak(channels);
  }

  return {
    channels,
    durationMs: ((channels[0]?.length ?? 0) / sampleRate) * 1_000,
    peak,
    sampleRate,
  };
}

async function renderUncached(
  recipeInput: SoundRecipeV1,
  settings: ExportSettingsV1,
): Promise<RenderedSound> {
  const recipe = soundRecipeV1Schema.parse(recipeInput) as SoundRecipeV1;
  const durationMs =
    recipe.duration.mode === "trim" ? recipe.duration.endMs : getAutomaticDurationMs(recipe);
  const frameCount = Math.max(1, Math.ceil((durationMs / 1_000) * settings.sampleRate));
  const OfflineContext = getOfflineAudioContextConstructor();
  const context = new OfflineContext(settings.channels, frameCount, settings.sampleRate);
  const layerBus = context.createGain();
  const master = context.createGain();
  master.gain.value = dbToGain(recipe.masterGainDb);
  layerBus.connect(master).connect(context.destination);

  if (recipe.shimmer) {
    attachShimmer(context, master, context.destination, recipe.shimmer);
  }

  for (const layer of recipe.layers) {
    if (!layer.enabled) {
      continue;
    }

    if (layer.kind === "tone") {
      renderToneLayer(context, layerBus, layer, settings.channels);
    } else {
      renderNoiseLayer(context, layerBus, layer, settings.channels, recipe.seed);
    }
  }

  const audioBuffer = await context.startRendering();
  const channels = Array.from({ length: settings.channels }, (_, channel) =>
    audioBuffer.getChannelData(channel).slice(),
  );
  return masterRenderedChannels(channels, settings.sampleRate, recipe);
}

export function renderSound(
  recipe: SoundRecipeV1,
  settings: ExportSettingsV1,
): Promise<RenderedSound> {
  const cacheKey = JSON.stringify([recipe, settings]);
  const cached = renderCache.get(cacheKey);

  if (cached) {
    return cached.then((sound) => ({
      ...sound,
      channels: sound.channels.map((channel) => channel.slice()),
    }));
  }

  const render = renderUncached(recipe, settings);
  renderCache.set(cacheKey, render);

  return render.then((sound) => ({
    ...sound,
    channels: sound.channels.map((channel) => channel.slice()),
  }));
}

export function clearRenderCache(): void {
  renderCache.clear();
}

export function renderWaveformPeaks(sound: RenderedSound, pointCount = 360): WaveformPeak[] {
  const source = sound.channels[0] ?? new Float32Array();
  const points = Math.max(1, Math.min(pointCount, source.length || 1));
  const framesPerPoint = Math.max(1, Math.ceil(source.length / points));

  return Array.from({ length: points }, (_, pointIndex) => {
    const start = pointIndex * framesPerPoint;
    const end = Math.min(source.length, start + framesPerPoint);
    let minimum = 0;
    let maximum = 0;

    for (let frame = start; frame < end; frame += 1) {
      const value = source[frame] ?? 0;
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }

    return { max: maximum, min: minimum };
  });
}

export function createAudioBuffer(sound: RenderedSound, context: BaseAudioContext): AudioBuffer {
  const buffer = context.createBuffer(
    sound.channels.length,
    sound.channels[0]?.length ?? 1,
    sound.sampleRate,
  );

  sound.channels.forEach((channel, index) =>
    buffer.copyToChannel(new Float32Array(channel), index),
  );
  return buffer;
}
