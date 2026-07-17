import type { WaveformPeak } from "../audio/types";

export function createWaveformClipPath(peaks: readonly WaveformPeak[]): string {
  if (peaks.length === 0) return "polygon(0 50%, 100% 50%)";
  const upper = peaks.map((peak, index) =>
    `${((index / Math.max(1, peaks.length - 1)) * 100).toFixed(2)}% ${(50 - peak.max * 46).toFixed(2)}%`,
  );
  const lower = [...peaks].reverse().map((peak, reverseIndex) => {
    const index = peaks.length - 1 - reverseIndex;
    return `${((index / Math.max(1, peaks.length - 1)) * 100).toFixed(2)}% ${(50 - peak.min * 46).toFixed(2)}%`;
  });
  return `polygon(${[...upper, ...lower].join(",")})`;
}
