import { createAudioBuffer } from "../audio/audio-engine";
import type { RenderedSound } from "../audio/types";

type ActivePlayback = {
  contextStartedAt: number;
  durationSeconds: number;
  looping: boolean;
  offsetSeconds: number;
  source: AudioBufferSourceNode;
};

export type AudioPlaybackSnapshot = {
  active: boolean;
  looping: boolean;
  startCount: number;
};

let sharedContext: AudioContext | null = null;
let activePlayback: ActivePlayback | null = null;
let playbackStartCount = 0;

export function alignRenderedSoundToPlaybackDuration(
  sound: RenderedSound,
  durationSeconds: number,
): RenderedSound {
  const fallbackDurationSeconds = Math.max(1 / sound.sampleRate, sound.durationMs / 1_000);
  const safeDurationSeconds =
    Number.isFinite(durationSeconds) && durationSeconds > 0
      ? durationSeconds
      : fallbackDurationSeconds;
  const frameCount = Math.max(1, Math.round(safeDurationSeconds * sound.sampleRate));

  if (sound.channels.every((channel) => channel.length === frameCount)) return sound;

  let peak = 0;
  const channels = sound.channels.map((channel) => {
    const aligned = new Float32Array(frameCount);
    aligned.set(channel.subarray(0, frameCount));
    for (const sample of aligned) peak = Math.max(peak, Math.abs(sample));
    return aligned;
  });

  return {
    channels,
    durationMs: (frameCount / sound.sampleRate) * 1_000,
    peak,
    sampleRate: sound.sampleRate,
  };
}

export function getSharedAudioContext(): AudioContext {
  if (!sharedContext) {
    const AudioContextConstructor = globalThis.AudioContext;
    if (!AudioContextConstructor) {
      throw new Error("AudioContext is not available in this browser.");
    }
    sharedContext = new AudioContextConstructor({ latencyHint: "interactive" });
  }
  return sharedContext;
}

export async function unlockAudioPlayback(): Promise<void> {
  const context = getSharedAudioContext();
  if (context.state !== "running") {
    await context.resume();
  }
}

export function stopAudioPlayback(): void {
  if (!activePlayback) return;
  try {
    activePlayback.source.stop();
  } catch {
    // The source may already have reached its natural end.
  }
  activePlayback = null;
}

export async function startAudioPlayback(
  sound: RenderedSound,
  offsetSeconds: number,
  options: { durationSeconds?: number; loop?: boolean } = {},
): Promise<void> {
  const context = getSharedAudioContext();
  await unlockAudioPlayback();
  stopAudioPlayback();
  const source = context.createBufferSource();
  const playbackSound = alignRenderedSoundToPlaybackDuration(
    sound,
    options.durationSeconds ?? sound.durationMs / 1_000,
  );
  source.buffer = createAudioBuffer(playbackSound, context);
  source.loop = options.loop ?? false;
  if (source.loop) {
    source.loopStart = 0;
    source.loopEnd = source.buffer.duration;
  }
  source.connect(context.destination);
  const safeOffset = Math.max(0, Math.min(offsetSeconds, source.buffer.duration - 0.000_1));
  source.start(0, safeOffset);
  playbackStartCount += 1;
  activePlayback = {
    contextStartedAt: context.currentTime,
    durationSeconds: source.buffer.duration,
    looping: source.loop,
    offsetSeconds: safeOffset,
    source,
  };
  source.addEventListener("ended", () => {
    if (activePlayback?.source === source) activePlayback = null;
  });
}

export function getPlaybackExpectedTime(): number | null {
  if (!activePlayback || !sharedContext) return null;
  const elapsed = activePlayback.offsetSeconds + (sharedContext.currentTime - activePlayback.contextStartedAt);
  return activePlayback.looping
    ? elapsed % activePlayback.durationSeconds
    : elapsed;
}

export function isPlaybackTimeOutOfSync(
  currentTimeSeconds: number,
  toleranceSeconds = 0.16,
): boolean {
  const expectedTime = getPlaybackExpectedTime();
  if (expectedTime === null || !activePlayback) return false;
  const directDifference = Math.abs(expectedTime - currentTimeSeconds);
  const difference = activePlayback.looping
    ? Math.min(
        directDifference,
        Math.max(0, activePlayback.durationSeconds - directDifference),
      )
    : directDifference;
  return difference > toleranceSeconds;
}

export function getAudioPlaybackSnapshot(): AudioPlaybackSnapshot {
  return {
    active: activePlayback !== null,
    looping: activePlayback?.looping ?? false,
    startCount: playbackStartCount,
  };
}
