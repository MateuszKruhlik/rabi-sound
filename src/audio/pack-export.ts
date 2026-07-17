import { buildSoundPackArchive, createUniqueWavFileNames, sanitizeFileStem } from "./archive";
import type {
  ArchiveRequest,
  ArchiveWorkerRequest,
  ArchiveWorkerResponse,
} from "./archive-types";
import { renderSound } from "./audio-engine";
import { PACK_LICENSES_MARKDOWN } from "./licenses";
import { parseSoundPack } from "./schema";
import type { ExportProgress, SoundPackV1, SoundRecipeV1 } from "./types";

let nextWorkerRequestId = 1;

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function runArchiveWorker(
  request: ArchiveRequest,
  onProgress?: (progress: number) => void,
): Promise<Uint8Array> {
  if (typeof Worker === "undefined") {
    return buildSoundPackArchive(request, onProgress);
  }

  const worker = new Worker(new URL("./export-worker.ts", import.meta.url), { type: "module" });
  const id = nextWorkerRequestId;
  nextWorkerRequestId += 1;

  return new Promise<Uint8Array>((resolve, reject) => {
    worker.addEventListener("message", (event: MessageEvent<ArchiveWorkerResponse>) => {
      const response = event.data;

      if (response.id !== id) {
        return;
      }

      if (response.type === "progress") {
        onProgress?.(response.progress);
        return;
      }

      worker.terminate();
      if (response.type === "complete") {
        resolve(response.bytes);
      } else {
        reject(new Error(response.error));
      }
    });
    worker.addEventListener("error", (event) => {
      worker.terminate();
      reject(event.error instanceof Error ? event.error : new Error(event.message));
    });
    worker.postMessage({ id, request } satisfies ArchiveWorkerRequest);
  });
}

export async function exportSoundPackZip(
  input: SoundPackV1,
  onProgress?: (progress: ExportProgress) => void,
): Promise<Uint8Array> {
  const pack = parseSoundPack(input);
  const fileNames = createUniqueWavFileNames(pack.sounds.map((sound) => sound.name));
  const cues: ArchiveRequest["cues"] = [];

  for (let index = 0; index < pack.sounds.length; index += 1) {
    const recipe = pack.sounds[index];
    onProgress?.({
      completed: index,
      cueName: recipe.name,
      phase: "render",
      total: pack.sounds.length,
    });
    const rendered = await renderSound(recipe, pack.export);
    cues.push({
      channels: rendered.channels,
      fileName: fileNames[index],
      recipeId: recipe.id,
      sampleRate: rendered.sampleRate,
    });
    await yieldToBrowser();
  }

  return runArchiveWorker(
    { cues, licenses: PACK_LICENSES_MARKDOWN, pack, settings: pack.export },
    (progress) => {
      onProgress?.({
        completed: Math.round(progress * pack.sounds.length),
        phase: progress >= 1 ? "archive" : "encode",
        total: pack.sounds.length,
      });
    },
  );
}

export function createRecipeJson(recipe: SoundRecipeV1): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(recipe, null, 2)}\n`);
}

export function getRecipeFileName(recipe: SoundRecipeV1): string {
  return `${sanitizeFileStem(recipe.name)}.json`;
}

export function getPackFileName(pack: SoundPackV1): string {
  return `${sanitizeFileStem(pack.name)}.zip`;
}

