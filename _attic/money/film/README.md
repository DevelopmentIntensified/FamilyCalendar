# film/ — the render pipeline

The film in `docs/plans/group-chat-video.md` built as code, not shot on location. The production
doc is the intent; this folder is the thing that actually produces a file you can publish.

## What this build is, and what it is not

**It is** a motion-graphics render: the chat, the parse, the calendar, the print sheet and the end
card, all real HTML/CSS animated on a deterministic timeline, captured frame by frame at 4K and
encoded with ffmpeg. The sound design is synthesised from scratch — no samples, no stock audio,
nothing to license.

**It is not** the location photography in the storyboard. Shots 1–3, 7 and 8 were written as a
handheld camera in a real kitchen with a real family. What is here is an honest, well-crafted
motion-graphics substitute for those, not a photograph. The room behind the phone is a soft
gradient standing in for a kitchen; the fridge is brushed steel and a printout. If the real shoot
happens, this pipeline is still useful — it becomes the screen-insert film, and the phone shots
come from a phone.

The end card uses a **placeholder wordmark**. There is no brand lockup in the repo, so one was
drawn here to unblock the render. It is not a brand asset and should be replaced before publication.

## The three files that matter

| File | Role |
| --- | --- |
| `film.html` | The entire film as one page. `window.setTime(t)` is a **pure function of time** — it takes a float in seconds and sets every element's state. No CSS transitions, no animations, no internal clock. This is what makes frame-accurate capture and resumability possible. |
| `capture.mjs` | Drives the page with Playwright, writes one PNG per frame to disk, skips frames that already exist. `deviceScaleFactor: 2` is the 4× supersample — browser text at 1× looks like a screenshot, downsampled from 2× it looks filmed. `RES=1` drops to 1080p for a fast proof. |
| `encode.mjs` | Frames → `master.video.mp4`. Refuses to run unless the frame count is exactly 1125, so a half-finished capture can never be encoded into a short film. |
| `audio.mjs` | The mix, as a pure function of time, written out as 48kHz 16-bit stereo WAV. Same purity contract as the picture, which is why the cutdowns cannot desync: both are re-sampled from the same master timeline. |
| `build.mjs` | Hero mux, the three cutdowns, the 1080p transcode, then ffprobe-verifies every file's duration, resolution and audio. Also refuses to cut a range that runs past the end of the master. |
| `threads.mjs` | The one place the CPU cap lives. |
| `stills.mjs` / `check-audio.mjs` | Review tools: single frames, and an RMS envelope that proves the mix structure without listening to it. |
| `probe.mjs` | Dumps computed styles for the end card. Exists because it caught a real bug — CSS targeting `#s8`/`#s9` while the HTML used `s5`/`s6`. |


## Rebuild

Three stages, deliberately separate. **Capture is resumable** — it writes PNG frames to disk and
skips any that already exist, so you can kill it at any point and run the identical command again
to carry on. Encode and build are cheap and re-runnable from the frames, so the picture can be
re-encoded without re-rendering an hour of frames.

```sh
# 0. proof first — 1080p, ~5 min, checks the whole film end to end
$env:RES=1
node film/capture.mjs master 0 45 25
node film/encode.mjs
node film/audio.mjs
node film/build.mjs

# 1. the real thing — 4K. Safe to interrupt and re-run.
$env:RES=2
node film/capture.mjs master 0 45 25     # ~40 min, resumable
node film/encode.mjs                     # 3840x2160 master
node film/build.mjs                       # hero + cutdowns + 1080p, then ffprobe-verify
```

### Vertical (9:16)

Same three stages with `VERTICAL=1`. The viewport is 1080x1920 (RES=1) and
`film.html?vertical=1` reflows for it: phone shots centre as-is, the
browser/paste/parse stacks instead of cropping, the month gets taller rows,
the print sheet narrows its day columns, the end card reflows. Frames and
outputs carry `-vertical-` in the name so a proof can never be mistaken for
a 16:9 deliverable.

```sh
$env:RES=1; $env:VERTICAL=1
node film/capture.mjs master 0 45 25   # -> film/out/frames-vertical-1080/
node film/encode.mjs                    # -> film/out/master.video-vertical-1080p.mp4
node film/build.mjs                     # hero + cutdowns, all *-vertical-1080p.mp4
# or, naming the master explicitly:
$env:MASTER='film/out/master.video-vertical-1080p.mp4'; $env:VERTICAL=1
node film/build.mjs
# single vertical stills for layout review (v-prefixed, no page errors expected):
$env:VERTICAL=1; node film/stills.mjs 5 15.5 20.6 28 39 43.5
```

Deliverables land in `film/out/`:

| File | Runtime | Notes |
| --- | --- | --- |
| `familyplanz-45s-hero.mp4` | 45s | 4K, the spine. Straight mux, picture not re-encoded. |
| `familyplanz-45s-hero-1080p.mp4` | 45s | For the web. |
| `familyplanz-6s-bumper6.mp4` | 6s | Paste → parse → card. Pre-roll, app store, end of every long cut. |
| `familyplanz-15s-cut15.mp4` | 15s | Social and paid. |
| `familyplanz-30s-cut30.mp4` | 30s | Homepage hero loop. |

Frames land in `film/out/frames-2160/` or `frames-1080/` (about 1.2 GB for the 4K pass). Everything
under `film/out/` is gitignored and disposable.

Single frames for review, without rendering anything:

```sh
node film/stills.mjs 12.5 14.75 20.6 39.5
node film/check-audio.mjs master       # RMS per 0.5s, proves the mix structure
```

## CPU

`threads.mjs` computes `cores - 2` (minimum 1) and every ffmpeg call in `capture.mjs`,
`encode.mjs` and `build.mjs` is capped with it, on both the decode and the encode side. A render
leaves two cores free. To use the whole machine for an overnight run, edit `THREADS` in
`threads.mjs` — it is the only place the number lives.

Capture appends to `film/out/capture.log` with a frame counter, a rate and an ETA, and logs
`COMPLETE` or `INCOMPLETE: n frame(s) missing` when it finishes. If it dies overnight, that log
tells you how far it got, and re-running the same command picks up from there.

## Non-obvious decisions

- **The film is a pure function of time.** Every animated property is recomputed from `t` on every
  frame, including the scroll position, the handheld drift, the highlight opacities and the grain
  offset. Nothing integrates state. This means any frame can be re-rendered months later and will
  be byte-identical, and a cutdown is just a list of in/out points.
- **Cutdowns cut picture and sound from the same segment list.** `build.mjs` imports `PROGRAMS`
  from `audio.mjs` and uses it for both the `filter_complex` trim/concat and the WAV. A cutdown is
  a re-timing, never a straight trim — a 15s version that is the 45s version with the middle
  removed does not work, because the beats need different lengths.
- **The paste payload is verbatim chat text.** `PASTE` in `film.html` is three real messages,
  concatenated exactly as a long-press-and-copy would produce them, including the `ok.` that
  precedes the dentist. The three resulting events are what the shipped parser is expected to do
  with it. This is the pre-production verification the production doc flagged as blocking, and it
  is still open — the render shows the *intended* result, not a captured one.
- **Two palettes, deliberately not unified.** `#c45e38` for anything the film adds, `#dd5822` for
  anything the app draws. The app's real accent is not nudged toward the marketing terracotta.
- **Georgia for the wordmark and tagline, Segoe UI everywhere else.** The app ships no webfont, so
  the UI shots render in the system stack — which is what the app genuinely looks like on Windows.
- **A compose bar on the phone.** Not in the storyboard. Without it the chat ends in a hard black
  gap, because the final message is deliberately hidden until shot 7.

## Known gaps

1. **Vertical (9:16) is built.** `VERTICAL=1` through capture/encode/build,
   `?vertical=1` reflow in `film.html`, outputs named `*-vertical-*.mp4`. Verified
   end to end at 1080x1920; the 4K vertical pass (`RES=2`) follows the same path.
2. **The parse is animated, not captured.** Shot 5 is a faithful reconstruction of the real
   `EventQuickAdd` result, driven by hand-set data. The real capture needs a seeded family and a
   human pasting on camera, as §10 of the production doc requires.
3. **The mix has not been reviewed by ear.** `check-audio.mjs` proves the structure — chaos bed, the
   hard stop at 8.0s, near-silence through the paste, the pad entering on an exact cut at 19.0s,
   the release at 44.3s — but nobody has listened to whether the buzz character is right.
4. **No captions file.** The film's text is the caption, which is the point of building it
   wordless, but there is no `.srt`/`.vtt` and no burned-in subtitle pass.
