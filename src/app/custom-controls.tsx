import {
  CaretDownIcon,
  CaretUpIcon,
  CopyIcon,
  EyeIcon,
  EyeSlashIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import * as React from "react";
import { Button, Input } from "@/toolcraft/ui";
import { Slider as PrimitiveSlider } from "@/toolcraft/ui/components/primitives";
import type {
  ToolcraftControlRendererMap,
  ToolcraftCustomControlRendererProps,
} from "@/toolcraft/runtime/react";

import { createPresetRecipe, CUELUME_PRESET_IDS, type CuelumePresetId } from "../audio/presets";
import { MAX_CUES_PER_PACK, MAX_LAYERS_PER_CUE, type SoundPackV1 } from "../audio/types";
import {
  commitActiveValues,
  createNoiseLayer,
  createToneLayer,
  dispatchEditorSnapshot,
  getActiveSound,
  targets,
} from "./editor-model";
import styles from "./studio.module.css";

function setRuntimePack<Value>(
  props: ToolcraftCustomControlRendererProps<Value>,
  pack: SoundPackV1,
  label: string,
): void {
  props.dispatch({ label, target: targets.pack, type: "controls.setValue", value: pack });
}

function CueLibraryControl(
  props: ToolcraftCustomControlRendererProps<SoundPackV1>,
): React.JSX.Element {
  const pack = props.value;

  function selectCue(soundId: string): void {
    const committed = commitActiveValues(props.state);
    const next = { ...committed, activeSoundId: soundId };
    props.setValue(next, { history: "record" });
    dispatchEditorSnapshot(props.dispatch, next);
    props.dispatch({ currentTimeSeconds: 0, type: "timeline.setCurrentTime" });
  }

  function moveCue(index: number, direction: -1 | 1): void {
    const committed = commitActiveValues(props.state);
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= committed.sounds.length) return;
    const sounds = [...committed.sounds];
    [sounds[index], sounds[nextIndex]] = [sounds[nextIndex], sounds[index]];
    props.setValue({ ...committed, sounds });
  }

  function duplicateCue(soundId: string): void {
    const committed = commitActiveValues(props.state);
    if (committed.sounds.length >= MAX_CUES_PER_PACK) return;
    const source = committed.sounds.find((sound) => sound.id === soundId);
    if (!source) return;
    const id = `${source.id}-copy-${Date.now().toString(36)}`;
    const duplicate = {
      ...structuredClone(source),
      id,
      layers: source.layers.map((layer, index) => ({
        ...structuredClone(layer),
        id: `${id}-layer-${index + 1}`,
      })),
      name: `${source.name} copy`,
      source: undefined,
    };
    const next = { ...committed, activeSoundId: id, sounds: [...committed.sounds, duplicate] };
    props.setValue(next);
    props.dispatch({ history: "skip", target: targets.cueName, type: "controls.setValue", value: duplicate.name });
    props.dispatch({ history: "skip", target: targets.selectedLayerId, type: "controls.setValue", value: duplicate.layers[0].id });
    props.dispatch({ history: "skip", target: targets.loadedSoundId, type: "controls.setValue", value: duplicate.id });
    props.dispatch({ history: "skip", target: targets.loadedLayerId, type: "controls.setValue", value: duplicate.layers[0].id });
  }

  function deleteCue(soundId: string): void {
    const committed = commitActiveValues(props.state);
    if (committed.sounds.length <= 1) return;
    const sounds = committed.sounds.filter((sound) => sound.id !== soundId);
    const activeSoundId = committed.activeSoundId === soundId ? sounds[0].id : committed.activeSoundId;
    const next = { ...committed, activeSoundId, sounds };
    props.setValue(next);
    dispatchEditorSnapshot(props.dispatch, next);
  }

  function addCue(): void {
    const committed = commitActiveValues(props.state);
    if (committed.sounds.length >= MAX_CUES_PER_PACK) return;
    // Seed the new cue from the currently chosen Cuelume preset; picking a different
    // preset afterwards auto-applies to it (and audition-on-select plays it right away).
    const chosen = String(props.state.values[targets.presetId] ?? "success");
    const presetId = (CUELUME_PRESET_IDS as readonly string[]).includes(chosen)
      ? (chosen as CuelumePresetId)
      : "success";
    const id = `cue-${Date.now().toString(36)}`;
    const cue = createPresetRecipe(presetId, id);
    const next = { ...committed, activeSoundId: id, sounds: [...committed.sounds, cue] };
    props.setValue(next, { history: "record" });
    dispatchEditorSnapshot(props.dispatch, next);
    props.dispatch({ currentTimeSeconds: 0, type: "timeline.setCurrentTime" });
  }

  return (
    <div className={styles.collection} data-rabi-sound-cue-library="">
      <div className={styles.collectionList}>
        {pack.sounds.map((sound, index) => {
          const selected = sound.id === pack.activeSoundId;
          return (
            <div className={styles.collectionRow} key={sound.id}>
              <Button
                aria-pressed={selected}
                className={`${styles.collectionMain} ${selected ? styles.collectionMainSelected : ""}`}
                onClick={() => selectCue(sound.id)}
                size="sm"
                variant="outline"
              >
                <span className={styles.rowLabel}>{sound.name}</span>
                <span className={styles.rowMeta}>{sound.layers.length}</span>
              </Button>
              <div className={styles.rowActions}>
                <Button aria-label={`Move ${sound.name} up`} disabled={index === 0} onClick={() => moveCue(index, -1)} size="icon-xs" variant="ghost">
                  <CaretUpIcon />
                </Button>
                <Button aria-label={`Move ${sound.name} down`} disabled={index === pack.sounds.length - 1} onClick={() => moveCue(index, 1)} size="icon-xs" variant="ghost">
                  <CaretDownIcon />
                </Button>
                <Button aria-label={`Duplicate ${sound.name}`} disabled={pack.sounds.length >= MAX_CUES_PER_PACK} onClick={() => duplicateCue(sound.id)} size="icon-xs" variant="ghost">
                  <CopyIcon />
                </Button>
                <Button aria-label={`Delete ${sound.name}`} disabled={pack.sounds.length <= 1} onClick={() => deleteCue(sound.id)} size="icon-xs" variant="ghost">
                  <TrashIcon />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <div className={styles.collectionFooter}>
        <Button
          disabled={pack.sounds.length >= MAX_CUES_PER_PACK}
          onClick={addCue}
          size="sm"
          variant="outline"
        >
          <PlusIcon /> New sound
        </Button>
      </div>
    </div>
  );
}

function LayerStackControl(
  props: ToolcraftCustomControlRendererProps<string>,
): React.JSX.Element {
  const pack = props.state.values[targets.pack] as SoundPackV1;
  const sound = getActiveSound(pack);

  function updateLayers(
    updater: (pack: SoundPackV1, activeSoundIndex: number) => SoundPackV1,
    label: string,
  ): SoundPackV1 {
    const committed = commitActiveValues(props.state);
    const activeSoundIndex = committed.sounds.findIndex(
      (candidate) => candidate.id === committed.activeSoundId,
    );
    const next = updater(committed, activeSoundIndex);
    setRuntimePack(props, next, label);
    return next;
  }

  function selectLayer(layerId: string): void {
    const committed = commitActiveValues(props.state);
    setRuntimePack(props, committed, "Commit layer");
    props.setValue(layerId, { history: "skip" });
    dispatchEditorSnapshot(props.dispatch, committed, layerId);
  }

  function toggleLayer(layerId: string): void {
    const next = updateLayers((committed, soundIndex) => {
      const sounds = [...committed.sounds];
      const active = sounds[soundIndex];
      sounds[soundIndex] = {
        ...active,
        layers: active.layers.map((layer) =>
          layer.id === layerId ? { ...layer, enabled: !layer.enabled } : layer,
        ),
      };
      return { ...committed, sounds };
    }, "Toggle layer");
    dispatchEditorSnapshot(props.dispatch, next, props.value);
  }

  function moveLayer(index: number, direction: -1 | 1): void {
    const next = updateLayers((committed, soundIndex) => {
      const sounds = [...committed.sounds];
      const active = sounds[soundIndex];
      const layers = [...active.layers];
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= layers.length) return committed;
      [layers[index], layers[nextIndex]] = [layers[nextIndex], layers[index]];
      sounds[soundIndex] = { ...active, layers };
      return { ...committed, sounds };
    }, "Reorder layer");
    dispatchEditorSnapshot(props.dispatch, next, props.value);
  }

  function addLayer(kind: "noise" | "tone"): void {
    if (sound.layers.length >= MAX_LAYERS_PER_CUE) return;
    let createdLayerId = "";
    const next = updateLayers((committed, soundIndex) => {
      const sounds = [...committed.sounds];
      const active = sounds[soundIndex];
      const layer =
        kind === "tone"
          ? createToneLayer(active.layers.length + 1)
          : createNoiseLayer(active.layers.length + 1);
      createdLayerId = layer.id;
      sounds[soundIndex] = { ...active, layers: [...active.layers, layer] };
      return { ...committed, sounds };
    }, `Add ${kind} layer`);
    props.setValue(createdLayerId, { history: "skip" });
    dispatchEditorSnapshot(props.dispatch, next, createdLayerId);
  }

  function deleteLayer(layerId: string): void {
    if (sound.layers.length <= 1) return;
    let nextSelectedId = props.value;
    const next = updateLayers((committed, soundIndex) => {
      const sounds = [...committed.sounds];
      const active = sounds[soundIndex];
      const layers = active.layers.filter((layer) => layer.id !== layerId);
      if (nextSelectedId === layerId) nextSelectedId = layers[0].id;
      sounds[soundIndex] = { ...active, layers };
      return { ...committed, sounds };
    }, "Delete layer");
    props.setValue(nextSelectedId, { history: "skip" });
    dispatchEditorSnapshot(props.dispatch, next, nextSelectedId);
  }

  return (
    <div className={styles.collection} data-rabi-sound-layer-stack="">
      <div className={styles.collectionList}>
        {sound.layers.map((layer, index) => {
          const selected = layer.id === props.value;
          return (
            <div className={styles.collectionRow} key={layer.id}>
              <Button
                aria-pressed={selected}
                className={`${styles.collectionMain} ${selected ? styles.collectionMainSelected : ""}`}
                onClick={() => selectLayer(layer.id)}
                size="sm"
                variant="outline"
              >
                <span className={styles.rowLabel}>{layer.name}</span>
                <span className={styles.rowMeta}>{layer.kind}</span>
              </Button>
              <div className={styles.rowActions}>
                <Button aria-label={`${layer.enabled ? "Mute" : "Enable"} ${layer.name}`} onClick={() => toggleLayer(layer.id)} size="icon-xs" variant="ghost">
                  {layer.enabled ? <EyeIcon /> : <EyeSlashIcon />}
                </Button>
                <Button aria-label={`Move ${layer.name} up`} disabled={index === 0} onClick={() => moveLayer(index, -1)} size="icon-xs" variant="ghost">
                  <CaretUpIcon />
                </Button>
                <Button aria-label={`Move ${layer.name} down`} disabled={index === sound.layers.length - 1} onClick={() => moveLayer(index, 1)} size="icon-xs" variant="ghost">
                  <CaretDownIcon />
                </Button>
                <Button aria-label={`Delete ${layer.name}`} disabled={sound.layers.length <= 1} onClick={() => deleteLayer(layer.id)} size="icon-xs" variant="ghost">
                  <TrashIcon />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <div className={styles.collectionFooter}>
        <Button disabled={sound.layers.length >= MAX_LAYERS_PER_CUE} onClick={() => addLayer("tone")} size="sm" variant="outline">
          <PlusIcon /> Tone
        </Button>
        <Button disabled={sound.layers.length >= MAX_LAYERS_PER_CUE} onClick={() => addLayer("noise")} size="sm" variant="outline">
          <PlusIcon /> Noise
        </Button>
      </div>
    </div>
  );
}

function LogSliderControl(
  props: ToolcraftCustomControlRendererProps<number>,
): React.JSX.Element {
  const minimum = Math.max(0.0001, props.control.min ?? 20);
  const maximum = Math.max(minimum + 0.0001, props.control.max ?? 20_000);
  const value = Math.min(maximum, Math.max(minimum, Number(props.value) || minimum));
  const toPosition = (input: number) =>
    ((Math.log(input) - Math.log(minimum)) / (Math.log(maximum) - Math.log(minimum))) * 1_000;
  const fromPosition = (position: number) =>
    Math.exp(Math.log(minimum) + (position / 1_000) * (Math.log(maximum) - Math.log(minimum)));

  return (
    <div className={styles.logControl}>
      <PrimitiveSlider
        aria-label={String(props.control.label || props.name)}
        max={1_000}
        min={0}
        onValueChange={(position) =>
          props.setValue(
            Math.min(maximum, Math.max(minimum, fromPosition(Number(position)))),
            {
              history: "merge",
              historyGroup: `log-slider:${props.controlId}`,
            },
          )
        }
        step={1}
        value={toPosition(value)}
      />
      <div className={styles.logReadout}>
        <Input
          aria-label={`${String(props.control.label || props.name)} value`}
          className={styles.logInput}
          inputMode="decimal"
          onChange={(event) => {
            const parsed = Number(event.currentTarget.value);
            if (Number.isFinite(parsed)) {
              props.setValue(Math.min(maximum, Math.max(minimum, parsed)));
            }
          }}
          size="sm"
          type="number"
          value={Math.round(value * 100) / 100}
        />
        <span className={styles.logUnit}>{props.control.unit}</span>
      </div>
    </div>
  );
}

export const studioControlRenderers: ToolcraftControlRendererMap = {
  cueLibrary: CueLibraryControl as never,
  layerStack: LayerStackControl as never,
  logSlider: LogSliderControl as never,
};
