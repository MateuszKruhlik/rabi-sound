# Rabi Sound product decisions

## Audio-first output

Rabi Sound produces procedural UI audio. Its delivery formats are WAV, recipe JSON,
and a sound-pack ZIP; the waveform is an editor visualization and is not a visual asset.

## Fixed background

The waveform workspace has a fixed background of `#0b0c0f`. This background is
intentionally non-editable because it belongs to editor chrome, is excluded from export,
and stays visually consistent while the surrounding Toolcraft shell switches between
light and dark themes.

