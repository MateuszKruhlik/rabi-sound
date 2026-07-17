import type { ExportSettingsV1, RenderedSound } from "./types";

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}

export function encodeWav(sound: RenderedSound, settings: ExportSettingsV1): Uint8Array {
  const channels = Math.min(settings.channels, sound.channels.length) as 1 | 2;
  const frameCount = sound.channels[0]?.length ?? 0;
  const bytesPerSample = settings.bitDepth / 8;
  const blockAlign = channels * bytesPerSample;
  const dataSize = frameCount * blockAlign;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  writeAscii(bytes, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(bytes, 8, "WAVE");
  writeAscii(bytes, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, settings.sampleRate, true);
  view.setUint32(28, settings.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, settings.bitDepth, true);
  writeAscii(bytes, 36, "data");
  view.setUint32(40, dataSize, true);

  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, sound.channels[channel]?.[frame] ?? 0));
      const offset = 44 + frame * blockAlign + channel * bytesPerSample;

      if (settings.bitDepth === 16) {
        const integer = sample < 0 ? Math.round(sample * 32_768) : Math.round(sample * 32_767);
        view.setInt16(offset, integer, true);
      } else {
        const integer = sample < 0 ? Math.round(sample * 8_388_608) : Math.round(sample * 8_388_607);
        view.setUint8(offset, integer & 0xff);
        view.setUint8(offset + 1, (integer >> 8) & 0xff);
        view.setUint8(offset + 2, (integer >> 16) & 0xff);
      }
    }
  }

  return bytes;
}

