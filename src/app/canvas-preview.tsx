import * as React from "react";
import { useToolcraft, useToolcraftTheme } from "@/toolcraft/runtime/react";

import {
  renderSound,
  renderWaveformPeaks,
  type RenderedSound,
  type WaveformPeak,
} from "../audio";
import {
  dispatchEditorSnapshot,
  getActiveSound,
  materializePackFromValues,
  targets,
} from "./editor-model";
import {
  getAudioPlaybackSnapshot,
  isPlaybackTimeOutOfSync,
  startAudioPlayback,
  stopAudioPlayback,
  unlockAudioPlayback,
} from "./playback";
import styles from "./studio.module.css";
import { createWaveformClipPath } from "./waveform-drawing";

const CONTROLS_PANEL_WIDTH_PX = 300;
const PANEL_EDGE_MARGIN_PX = 10;

export function RabiSoundCanvasPreview(): React.JSX.Element {
  const { dispatch, state } = useToolcraft();
  const { setThemePreference, themePreference } = useToolcraftTheme();
  const pack = React.useMemo(() => materializePackFromValues(state.values), [state.values]);
  const activeSound = React.useMemo(() => getActiveSound(pack), [pack]);
  const [rendered, setRendered] = React.useState<RenderedSound | null>(null);
  const [peaks, setPeaks] = React.useState<WaveformPeak[]>([]);
  const [renderError, setRenderError] = React.useState<string | null>(null);
  const [rendering, setRendering] = React.useState(true);
  const [viewportWidth, setViewportWidth] = React.useState(() => globalThis.innerWidth);
  const renderGeneration = React.useRef(0);
  const scheduledRender = React.useRef<number | null>(null);
  const previousTimelineDuration = React.useRef(state.timeline.durationSeconds);
  const previousPlaying = React.useRef(false);
  const previousLooping = React.useRef(state.timeline.isLooping);
  const previousRendered = React.useRef<RenderedSound | null>(null);
  const playbackInitialized = React.useRef(false);
  const durationMs = Math.max(10, state.timeline.durationSeconds * 1_000);
  const width = state.canvas.size.width;
  const height = state.canvas.size.height;
  const padding = Math.max(80, width * 0.1);
  const waveformHeight = Math.min(280, height * 0.3);
  const trackGap = Math.max(24, Math.min(38, 360 / Math.max(1, activeSound.layers.length)));
  const visualizationHeight = waveformHeight + 44 + trackGap * activeSound.layers.length;
  const waveformTop = Math.max(140, (height - visualizationHeight) / 2);
  const trackTop = waveformTop + waveformHeight + 44;
  const controlsPanelCenterX =
    viewportWidth - PANEL_EDGE_MARGIN_PX - CONTROLS_PANEL_WIDTH_PX / 2 +
    state.panels.controls.offset.x;
  const controlsPanelSide =
    controlsPanelCenterX < viewportWidth / 2 ? "left" : "right";

  React.useLayoutEffect(() => {
    const syncViewportWidth = () => setViewportWidth(window.innerWidth);
    syncViewportWidth();
    window.addEventListener("resize", syncViewportWidth);
    return () => window.removeEventListener("resize", syncViewportWidth);
  }, []);

  React.useLayoutEffect(() => {
    document.title = "Rabi Sound";
  }, []);

  React.useEffect(() => {
    if (themePreference === "dark") return undefined;
    const frame = requestAnimationFrame(() => setThemePreference("dark"));
    return () => cancelAnimationFrame(frame);
  }, [setThemePreference, themePreference]);

  React.useLayoutEffect(() => {
    if (playbackInitialized.current) return;
    playbackInitialized.current = true;
    if (state.timeline.isPlaying) {
      dispatch({ isPlaying: false, type: "timeline.setPlaying" });
    }
  }, [dispatch, state.timeline.isPlaying]);

  React.useEffect(() => {
    const sourcePack = state.values[targets.pack] as typeof pack;
    const sourceActive = getActiveSound(sourcePack);
    const selectedId = state.values[targets.selectedLayerId];
    const hasSelectedLayer = sourceActive.layers.some((layer) => layer.id === selectedId);

    if (
      state.values[targets.loadedSoundId] !== sourceActive.id ||
      state.values[targets.loadedLayerId] !== selectedId ||
      !hasSelectedLayer
    ) {
      dispatchEditorSnapshot(
        dispatch,
        pack,
        hasSelectedLayer ? String(selectedId) : sourceActive.layers[0].id,
      );
    }
  }, [dispatch, pack, state.values]);

  React.useEffect(() => {
    const unlock = () => {
      void unlockAudioPlayback().catch(() => undefined);
    };
    document.addEventListener("pointerdown", unlock, { once: true });
    return () => document.removeEventListener("pointerdown", unlock);
  }, []);

  React.useEffect(() => {
    const generation = renderGeneration.current + 1;
    renderGeneration.current = generation;
    setRendering(true);
    setRenderError(null);

    if (scheduledRender.current !== null) cancelAnimationFrame(scheduledRender.current);
    scheduledRender.current = requestAnimationFrame(() => {
      void renderSound(activeSound, pack.export)
        .then((nextRendered) => {
          if (renderGeneration.current !== generation) return;
          setRendered(nextRendered);
          setPeaks(renderWaveformPeaks(nextRendered, Math.min(520, Math.round(width / 2))));
          setRendering(false);
        })
        .catch((error: unknown) => {
          if (renderGeneration.current !== generation) return;
          setRendering(false);
          setRenderError(error instanceof Error ? error.message : String(error));
        });
    });

    return () => {
      if (scheduledRender.current !== null) cancelAnimationFrame(scheduledRender.current);
    };
  }, [activeSound, pack.export, width]);

  React.useEffect(() => {
    const previousDuration = previousTimelineDuration.current;
    previousTimelineDuration.current = state.timeline.durationSeconds;

    if (Math.abs(previousDuration - state.timeline.durationSeconds) < 0.001) {
      return;
    }

    if (
      activeSound.duration.mode === "auto" &&
      rendered
    ) {
      const historyGroup = `timeline-trim:${activeSound.id}`;
      dispatch({
        historyGroup,
        target: targets.durationMode,
        type: "controls.setValue",
        value: "trim",
      });
      dispatch({
        history: "merge",
        historyGroup,
        target: targets.trimEndMs,
        type: "controls.setValue",
        value: Math.min(5_000, Math.round(state.timeline.durationSeconds * 1_000)),
      });
    }
  }, [activeSound, dispatch, rendered, state.timeline.durationSeconds]);

  React.useEffect(() => {
    const isPlaying = state.timeline.isPlaying;
    const shouldStart = isPlaying && (!previousPlaying.current || rendered === null);
    const loopChanged = previousLooping.current !== state.timeline.isLooping;
    const renderedChanged = rendered !== null && rendered !== previousRendered.current;

    if (!isPlaying) {
      stopAudioPlayback();
    } else if (rendered) {
      const scrubbed = isPlaybackTimeOutOfSync(state.timeline.currentTimeSeconds);
      if (shouldStart || scrubbed || loopChanged || renderedChanged) {
        void startAudioPlayback(rendered, state.timeline.currentTimeSeconds, {
          durationSeconds: state.timeline.durationSeconds,
          loop: state.timeline.isLooping,
        }).catch((error: unknown) => {
            setRenderError(
              error instanceof Error
                ? `Playback blocked: ${error.message}`
                : "Playback is blocked until the next user interaction.",
            );
            dispatch({ isPlaying: false, type: "timeline.setPlaying" });
          });
      }
    }

    previousPlaying.current = isPlaying;
    previousLooping.current = state.timeline.isLooping;
    previousRendered.current = rendered;
  }, [
    dispatch,
    rendered,
    state.timeline.currentTimeSeconds,
    state.timeline.isLooping,
    state.timeline.isPlaying,
  ]);

  React.useEffect(() => () => stopAudioPlayback(), []);

  const waveformClipPath = createWaveformClipPath(peaks);
  const playheadX =
    padding +
    (width - padding * 2) *
      Math.max(0, Math.min(1, state.timeline.currentTimeSeconds / state.timeline.durationSeconds));

  const timeToX = (timeMs: number) => padding + (width - padding * 2) * (timeMs / durationMs);
  const meta = `${(rendered?.durationMs ?? durationMs).toFixed(0)} ms  •  ${pack.export.sampleRate / 1_000} kHz  •  ${pack.export.channels === 1 ? "mono" : "stereo"}  •  ${(20 * Math.log10(Math.max(rendered?.peak ?? 0.000_001, 0.000_001))).toFixed(1)} dBFS`;
  const usableWidth = width - padding * 2;
  const audioPlayback = getAudioPlaybackSnapshot();
  const audioIsActive = state.timeline.isPlaying && audioPlayback.active;
  const audioIsLooping = audioIsActive && audioPlayback.looping;

  return (
    <div
      className={styles.canvasRoot}
      data-rabi-sound-canvas-root=""
      data-rabi-sound-controls-side={controlsPanelSide}
      data-rabi-sound-render-status={rendering ? "rendering" : renderError ? "error" : "ready"}
      style={{
        height: "100dvh",
        transform: `translate(calc((${width}px - 100dvw) / 2), calc((${height}px - 100dvh) / 2))`,
        width: "100dvw",
      }}
    >
      <div
        data-rabi-sound-preview-stage=""
        data-rabi-sound-waveform=""
        data-rabi-sound-product-state=""
        data-rabi-sound-state-signature={JSON.stringify(state.values)}
        data-rabi-sound-audio-active={String(audioIsActive)}
        data-rabi-sound-audio-looping={String(audioIsLooping)}
        data-rabi-sound-audio-start-count={String(audioPlayback.startCount)}
        data-rabi-sound-canvas-offset-x={String(state.canvas.offset.x)}
        data-rabi-sound-canvas-offset-y={String(state.canvas.offset.y)}
        data-rabi-sound-canvas-zoom={String(state.canvas.zoom)}
        data-rabi-sound-pack-name={pack.name}
        data-rabi-sound-timeline-duration={state.timeline.durationSeconds.toFixed(3)}
        data-rabi-sound-timeline-looping={String(state.timeline.isLooping)}
        data-rabi-sound-timeline-playing={String(state.timeline.isPlaying)}
        data-rabi-sound-timeline-time={state.timeline.currentTimeSeconds.toFixed(3)}
        data-rabi-sound-render-state={rendering ? "rendering" : "ready"}
        data-rabi-sound-render-generation={String(renderGeneration.current)}
        aria-label={`Rabi Sound: ${activeSound.name} procedural waveform and synthesis layers`}
        className={styles.domPreview}
        role="img"
      >
        <span
          aria-hidden="true"
          className={styles.domBrand}
          data-label="RABI / SOUND"
          style={{ left: `${(padding / width) * 100}%`, top: `${((waveformTop - 112) / height) * 100}%` }}
        />
        <span
          aria-hidden="true"
          className={styles.domCredit}
          data-label="Built on Cuelume by Daniel Belyi"
          style={{ right: `${(padding / width) * 100}%`, top: `${((waveformTop - 106) / height) * 100}%` }}
        />
        {Array.from({ length: 9 }, (_, index) => (
          <span
            aria-hidden="true"
            className={styles.domGrid}
            key={index}
            style={{
              height: `${((height - 24 - waveformTop) / height) * 100}%`,
              left: `${((padding + (usableWidth * index) / 8) / width) * 100}%`,
              top: `${(waveformTop / height) * 100}%`,
            }}
          />
        ))}
        <span
          className={styles.domTitle}
          data-label={activeSound.name}
          style={{ left: `${(padding / width) * 100}%`, top: `${((waveformTop - 74) / height) * 100}%` }}
        />
        <span
          className={styles.domMeta}
          data-label={meta}
          style={{ left: `${(padding / width) * 100}%`, top: `${((waveformTop - 44) / height) * 100}%` }}
        />
        <span
          aria-hidden="true"
          className={styles.domWaveformCenter}
          style={{
            left: `${(padding / width) * 100}%`,
            top: `${((waveformTop + waveformHeight / 2) / height) * 100}%`,
            width: `${(usableWidth / width) * 100}%`,
          }}
        />
        <span
          aria-hidden="true"
          className={styles.domWaveform}
          style={{
            clipPath: waveformClipPath,
            height: `${(waveformHeight / height) * 100}%`,
            left: `${(padding / width) * 100}%`,
            top: `${(waveformTop / height) * 100}%`,
            width: `${(usableWidth / width) * 100}%`,
          }}
        />
        <span
          aria-hidden="true"
          className={styles.domPlayhead}
          data-rabi-sound-playhead=""
          style={{
            height: `${((waveformHeight + 20) / height) * 100}%`,
            left: `${(playheadX / width) * 100}%`,
            top: `${((waveformTop - 10) / height) * 100}%`,
          }}
        />
        {activeSound.layers.map((layer, index) => {
          const y = trackTop + index * trackGap;
          const startX = timeToX(layer.startMs);
          const endX = timeToX(layer.startMs + layer.attackMs + layer.decayMs);
          return (
            <span
              aria-hidden="true"
              className={styles.domTrack}
              data-disabled={layer.enabled ? undefined : "true"}
              key={layer.id}
              style={{
                height: `${(22 / height) * 100}%`,
                left: `${(padding / width) * 100}%`,
                top: `${(y / height) * 100}%`,
                width: `${(usableWidth / width) * 100}%`,
              }}
            >
              <span
                className={layer.kind === "tone" ? styles.domTrackTone : styles.domTrackNoise}
                style={{
                  left: `${((startX - padding) / usableWidth) * 100}%`,
                  width: `${(Math.max(3, endX - startX) / usableWidth) * 100}%`,
                }}
              />
              <span className={styles.domTrackLabel} data-label={layer.name} />
            </span>
          );
        })}
        {rendering ? (
          <span
            className={styles.domRenderBadge}
            data-label="RENDERING"
            style={{ right: `${(padding / width) * 100}%`, top: `${((waveformTop - 68) / height) * 100}%` }}
          />
        ) : null}
        {renderError ? <span className={styles.domError} data-label={renderError} /> : null}
      </div>
    </div>
  );
}
