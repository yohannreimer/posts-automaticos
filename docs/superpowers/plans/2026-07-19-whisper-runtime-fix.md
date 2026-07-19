# Whisper Runtime Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production image in which `whisper-cli` can resolve every Whisper and GGML shared library.

**Architecture:** Delegate runtime installation to whisper.cpp's CMake install targets instead of manually copying selected artifacts. Add build-time runtime checks so CI cannot publish an image with unresolved shared libraries.

**Tech Stack:** Docker, Debian Bookworm, CMake, whisper.cpp, `ldconfig`, `ldd`

---

### Task 1: Replace manual runtime copying

**Files:**
- Modify: `Dockerfile:10-18`

- [ ] **Step 1: Confirm the current image build has no runtime validation**

Run:

```bash
rg -n 'cmake --install|whisper-cli --help|not found' Dockerfile
```

Expected: no matches.

- [ ] **Step 2: Install whisper.cpp through CMake**

Replace the manual `cp` block with:

```dockerfile
RUN git clone --depth 1 https://github.com/ggml-org/whisper.cpp /tmp/whisper.cpp \
    && cmake -S /tmp/whisper.cpp -B /tmp/whisper.cpp/build \
       -DCMAKE_BUILD_TYPE=Release \
       -DCMAKE_INSTALL_PREFIX=/usr/local \
    && cmake --build /tmp/whisper.cpp/build -j --config Release \
    && cmake --install /tmp/whisper.cpp/build \
    && ldconfig \
    && ldd /usr/local/bin/whisper-cli \
    && ! ldd /usr/local/bin/whisper-cli | grep -q 'not found' \
    && whisper-cli --help >/dev/null 2>&1 \
    && rm -rf /tmp/whisper.cpp
```

- [ ] **Step 3: Validate Dockerfile formatting**

Run:

```bash
git diff --check
```

Expected: exit code 0 with no output.

### Task 2: Verify the production image

**Files:**
- Verify: `Dockerfile`

- [ ] **Step 1: Build the image**

Run:

```bash
docker build --progress=plain -t posts-automaticos:whisper-fix .
```

Expected: build completes and the Whisper layer prints `ldd` output without `not found`.

- [ ] **Step 2: Run runtime checks inside the image**

Run:

```bash
docker run --rm --entrypoint sh posts-automaticos:whisper-fix -c \
  "ldd /usr/local/bin/whisper-cli && whisper-cli --help >/dev/null"
```

Expected: exit code 0 and no dependency marked `not found`.

- [ ] **Step 3: Commit the correction**

```bash
git add Dockerfile docs/superpowers/plans/2026-07-19-whisper-runtime-fix.md
git commit -m "fix: install whisper runtime libraries"
```
