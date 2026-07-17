/// <reference lib="webworker" />

import { buildSoundPackArchive } from "./archive";
import type { ArchiveWorkerRequest, ArchiveWorkerResponse } from "./archive-types";

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.addEventListener("message", (event: MessageEvent<ArchiveWorkerRequest>) => {
  const { id, request } = event.data;

  void buildSoundPackArchive(request, (progress) => {
    workerScope.postMessage({ id, progress, type: "progress" } satisfies ArchiveWorkerResponse);
  })
    .then((bytes) => {
      workerScope.postMessage(
        { bytes, id, type: "complete" } satisfies ArchiveWorkerResponse,
        [bytes.buffer],
      );
    })
    .catch((error: unknown) => {
      workerScope.postMessage({
        error: error instanceof Error ? error.message : String(error),
        id,
        type: "error",
      } satisfies ArchiveWorkerResponse);
    });
});

