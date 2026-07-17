import { strToU8, zipSync } from "fflate";

import type { ArchiveRequest } from "./archive-types";
import { encodeWav } from "./wav";

type ManifestEntry = {
  bytes: number;
  path: string;
  sha256: string;
};

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function buildSoundPackArchive(
  request: ArchiveRequest,
  onProgress?: (progress: number) => void,
): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const manifestEntries: ManifestEntry[] = [];
  const packBytes = strToU8(`${JSON.stringify(request.pack, null, 2)}\n`);
  files["pack.json"] = packBytes;
  manifestEntries.push({ bytes: packBytes.length, path: "pack.json", sha256: await sha256(packBytes) });

  for (let index = 0; index < request.cues.length; index += 1) {
    const cue = request.cues[index];
    const path = `audio/${cue.fileName}`;
    const bytes = encodeWav(
      {
        channels: cue.channels,
        durationMs: ((cue.channels[0]?.length ?? 0) / cue.sampleRate) * 1_000,
        peak: 0,
        sampleRate: cue.sampleRate,
      },
      request.settings,
    );
    files[path] = bytes;
    manifestEntries.push({ bytes: bytes.length, path, sha256: await sha256(bytes) });
    onProgress?.((index + 1) / Math.max(1, request.cues.length + 1));
  }

  const licensesBytes = strToU8(request.licenses);
  files["LICENSES.md"] = licensesBytes;
  manifestEntries.push({
    bytes: licensesBytes.length,
    path: "LICENSES.md",
    sha256: await sha256(licensesBytes),
  });

  const checksumText = `${manifestEntries.map((entry) => `${entry.sha256}  ${entry.path}`).join("\n")}\n`;
  const checksumBytes = strToU8(checksumText);
  files["checksums.sha256"] = checksumBytes;

  const manifest = {
    createdBy: "Rabi Sound 0.1.0",
    cueCount: request.cues.length,
    export: request.settings,
    files: manifestEntries,
    packId: request.pack.id,
    schema: "rabi-sound-pack-manifest",
    version: 1,
  };
  files["manifest.json"] = strToU8(`${JSON.stringify(manifest, null, 2)}\n`);
  onProgress?.(1);
  return zipSync(files, { level: 6 });
}

export function sanitizeFileStem(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);

  return normalized || "sound";
}

export function createUniqueWavFileNames(names: readonly string[]): string[] {
  const counts = new Map<string, number>();

  return names.map((name) => {
    const stem = sanitizeFileStem(name);
    const nextCount = (counts.get(stem) ?? 0) + 1;
    counts.set(stem, nextCount);
    return `${stem}${nextCount === 1 ? "" : `_${nextCount}`}.wav`;
  });
}
