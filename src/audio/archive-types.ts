import type { ExportSettingsV1, SoundPackV1 } from "./types";

export type ArchiveRenderedCue = {
  channels: Float32Array[];
  fileName: string;
  recipeId: string;
  sampleRate: number;
};

export type ArchiveRequest = {
  cues: ArchiveRenderedCue[];
  licenses: string;
  pack: SoundPackV1;
  settings: ExportSettingsV1;
};

export type ArchiveWorkerRequest = {
  id: number;
  request: ArchiveRequest;
};

export type ArchiveWorkerResponse =
  | { id: number; progress: number; type: "progress" }
  | { bytes: Uint8Array; id: number; type: "complete" }
  | { error: string; id: number; type: "error" };

