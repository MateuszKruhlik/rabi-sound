import { Toaster } from "sonner";

import type { ToolcraftAppComposition } from "@/toolcraft/runtime/react";

import { appSchema } from "./app-schema";
import { RabiSoundCanvasPreview } from "./canvas-preview";
import { studioControlRenderers } from "./custom-controls";
import { handleStudioPanelAction } from "./panel-actions";

export const appComposition = {
  canvasContent: (
    <>
      <RabiSoundCanvasPreview />
      <Toaster position="bottom-right" richColors />
    </>
  ),
  controlRenderers: studioControlRenderers,
  onPanelAction: handleStudioPanelAction,
  renderDefaultCanvasMedia: false,
  schema: appSchema,
} satisfies ToolcraftAppComposition;
