# Mac-Local Runtime Design

**Date:** 2026-07-19

## Objective

Run the complete Posts Automáticos application on the user's Mac, preserving the
fast local Whisper and FFmpeg performance while making the service resilient to a
closed browser, application crashes, login restarts, and interrupted Reel jobs.

The Mac becomes the single scheduler and publisher. The VPS deployment is not part
of the active publishing path after migration, which prevents two independent
schedulers from publishing duplicate posts.

## Runtime choice

Keep the existing native local runtime (`npm start`) because it is already working
and has demonstrated substantially better processing performance on this Mac. Run
it as a macOS LaunchAgent instead of requiring an open Terminal window.

The LaunchAgent will:

- start the server when the user logs in;
- restart it after an unexpected exit;
- write stdout and stderr to persistent log files;
- use the repository's existing `.env` file and local dependencies.

Closing the browser will not affect the server. Logging out, shutting down, or
putting the Mac to sleep will pause processing and publishing until macOS is active
again. Closing the MacBook lid is not treated as an available runtime condition.

## Persistent state

The existing publication queue remains in `data/queue.json`, and Reel source,
working, and final files remain under `data/reels/`.

The in-memory `reelBatch` will be replaced by a disk-backed batch file at
`data/reel-batch.json`. Updates must be written atomically so an interruption cannot
leave half-written JSON.

Each stored Reel item contains its source file, display name, status, processing
stage, optional hook override, error, and final result metadata. File paths stored in
the batch are relative to `data/reels/` so the repository can be moved without
invalidating the queue.

## Startup recovery

At startup the application loads and validates the persisted Reel batch:

- `queued` items with an existing source file return to the worker;
- `processing` items become `queued` and resume from the last reusable artifacts;
- `done` items remain available if their final video exists;
- items whose required files are missing become `error` with an actionable message.

The existing Whisper JSON cache inside each Reel work directory is reused. An
interrupted job can therefore skip transcription when valid transcription output
already exists, while later rendering steps may safely run again.

Only one Reel is processed at a time, matching the current behavior and avoiding
unnecessary contention on the Mac.

## Sleep behavior

While a Reel is processing or a publication request is actively running, the app
starts a macOS `caffeinate` child process to prevent idle system sleep. The inhibitor
is stopped in a `finally` block when the work completes or fails.

This does not override a closed lid, manual sleep, logout, or shutdown. The app does
not attempt to change global macOS power settings.

## Scheduler recovery and publication safety

The scheduler runs once immediately at server startup and then once per minute.
Scheduled posts whose time passed while the Mac was unavailable are published on
the first available scheduler pass.

Before contacting external publication services, the queue item is persisted with
a `publishing` status. After success it becomes `published`; an ordinary API failure
becomes `error`.

If the application stops while an item is `publishing`, startup changes it to an
`unknown` state instead of publishing it automatically again. The Agenda explains
that the Instagram account must be checked before the user chooses to retry. This
avoids an automatic duplicate when a remote publication succeeded but the local
success response was never persisted.

## User-visible status

The interface exposes a compact runtime status with:

- server active state;
- next scheduled publication;
- whether Reel processing is active;
- a warning that sleeping or shutting down the Mac pauses the scheduler;
- recovery/error messages for interrupted jobs and uncertain publications.

The Agenda supports the new `publishing` and `unknown` statuses. Retrying an
`unknown` publication always requires explicit user confirmation.

## Migration from the VPS

The Mac and VPS must not remain active as independent schedulers. Migration is:

1. Review the VPS Agenda and finish, remove, or recreate every future scheduled
   item on the Mac.
2. Verify the Mac has the required Instagram, image-host, and Anthropic credentials.
3. Verify one manual publication from the Mac.
4. Verify one short scheduled publication from the Mac.
5. Stop the VPS stack only after those checks pass.

The VPS stack and volumes are retained as a rollback option; they are not deleted.

## Logging and errors

LaunchAgent stdout and stderr are stored under `data/logs/`. Reel state changes,
recovery decisions, scheduler attempts, and publication outcomes include item IDs
and timestamps without logging API keys or access tokens.

A Reel processing failure keeps its source and reusable work files and exposes a
Retry action. A corrupt persisted batch is not silently replaced: it is preserved
for diagnosis and the UI reports the recovery error.

## Verification

The implementation is accepted when these scenarios pass:

1. Closing and reopening the browser does not interrupt a Reel.
2. Stopping the server during Whisper and restarting it resumes the job.
3. A completed but unscheduled Reel remains visible after restart.
4. A scheduled post survives server and Mac restart.
5. An overdue post is attempted after the Mac becomes active again.
6. A simulated stop during publication produces `unknown`, not an automatic retry.
7. The LaunchAgent starts at login and restarts the server after a forced exit.
8. Idle runtime shows no sustained processing load.

## Out of scope

- Processing work sent from a phone or another computer.
- Synchronizing Mac and VPS queues.
- Keeping the Mac reachable from the public internet.
- Waking a shut down Mac or a MacBook with its lid closed.
- Parallel Reel processing.
