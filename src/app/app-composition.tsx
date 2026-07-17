import type { ToolcraftAppComposition } from "@/toolcraft/runtime/react";

import { appSchema } from "./app-schema";
import { RabiSoundCanvasPreview } from "./canvas-preview";
import { studioControlRenderers } from "./custom-controls";
import { handleStudioPanelAction } from "./panel-actions";

export const appComposition = {
  canvasContent: <RabiSoundCanvasPreview />,
  controlRenderers: studioControlRenderers,
  onPanelAction: handleStudioPanelAction,
  renderDefaultCanvasMedia: false,
  schema: appSchema,
} satisfies ToolcraftAppComposition;
