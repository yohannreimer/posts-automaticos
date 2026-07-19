# Whisper Runtime Installation Design

## Problem

The production image contains `whisper-cli`, but the executable cannot start because
`libwhisper.so.1` is absent. The Dockerfile manually copies a subset of build outputs
and suppresses copy failures, allowing an incomplete image to be published.

## Design

Use whisper.cpp's CMake install rules with `/usr/local` as the installation prefix.
This installs `whisper-cli`, the versioned Whisper and GGML libraries, and their
symlinks as one coherent runtime. Run `ldconfig`, then execute `whisper-cli --help`
during the image build so an unresolved shared library fails CI immediately.

## Scope

- Modify only the whisper.cpp build block in `Dockerfile`.
- Keep the existing transcription model and application environment variables.
- Do not change Reel upload or processing behavior.

## Verification

- Build the Docker image.
- Confirm `whisper-cli --help` succeeds during the build.
- Inspect `ldd /usr/local/bin/whisper-cli` and fail if any dependency is `not found`.
- Reprocess a Reel after deploying the rebuilt image.
