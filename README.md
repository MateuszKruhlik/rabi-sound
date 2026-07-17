# Rabi Sound

Rabi Sound is a local-first browser editor for short procedural UI sounds by Rabituza Studio. It turns tone and filtered-noise layers into production-ready WAV assets without uploading audio or requiring a backend.

Built on [Cuelume](https://github.com/Danilaa1/cuelume) by Daniel Belyi. The fourteen bundled Cuelume presets remain attributed under the MIT License in `THIRD_PARTY_NOTICES.md` and every exported sound pack.

The initial sound pack contains the Cuelume `success` preset. The Preset Browser includes all 14 recipes adapted from Cuelume v0.1.2.

## What it does

- Compose up to 32 cues with up to 16 Tone or Noise layers per cue.
- Edit timing, envelope, pitch/glide, noise filtering, gain, pan and shimmer.
- Create deterministic, non-destructive variations from a seed and intensity.
- Preview the exact render path used by export.
- Export one WAV, one recipe JSON, or a complete ZIP sound pack.
- Persist the workspace locally and transfer it with Toolcraft Settings Import/Export.

The ZIP export contains WAV files, `pack.json`, `manifest.json`, `LICENSES.md` and SHA-256 checksums. Supported audio delivery formats are 44.1/48 kHz, PCM 16/24-bit and mono/stereo.

## Run locally

Requirements: a current Node.js LTS release and npm.

```bash
npm install
npm run dev
```

The dev command prints the verified local URL. No environment variables, accounts or external services are required.

## Verify

```bash
npm run verify:quick
npm run verify:perf
npm run verify:final
```

Optional Firefox and WebKit smoke coverage:

```bash
npm run test:browser:smoke
```

## Build and deploy

```bash
npm run build
```

Publish the generated `dist/` directory as a static site on Cloudflare Pages, GitHub Pages or another static host. The app has no server-side routes or backend dependencies.

## Architecture

- React, TypeScript and Vite
- `@pixel-point/toolcraft@0.0.15` generated runtime and UI
- Web Audio `OfflineAudioContext` for deterministic synthesis
- one cached rendering path for preview and delivery
- a Web Worker plus `fflate` for WAV encoding and ZIP assembly
- Zod validation for the portable `SoundPackV1` JSON contract

The public audio API is exported from `src/audio/index.ts`: `renderSound`, `renderWaveformPeaks`, `encodeWav`, `createVariation`, `parseSoundPack` and `exportSoundPackZip`.

Portable sound packs use `schema: "rabi-sound"`, version `1`. `parseSoundPack()` also migrates version 1 files created before the rename with `schema: "cuelume-studio"`. The legacy Toolcraft localStorage key is intentionally retained so existing local workspaces survive the rebrand.

## v0.1 scope

Rabi Sound is deliberately not a DAW. Arbitrary audio import, MP3/OGG, EQ/compression, plugin effects, accounts, telemetry and PWA installation are outside v0.1.

## License

The generated project and included Toolcraft source identify themselves as MIT in `LICENSE.md`, `NOTICE.md` and `package.json`. Cuelume recipe attribution is preserved in `THIRD_PARTY_NOTICES.md`, preset metadata and every exported pack.

Before a public release, retain the planned checkpoint: request written confirmation from Pixel Point about the differing Toolcraft CLI/generated-project license wording. See `THIRD_PARTY_NOTICES.md`.
