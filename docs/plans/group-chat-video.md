# "The Group Chat" — intro film production doc

Status: draft, pre-production
Owner: —
Target: 45s hero + 6s / 15s / 30s cutdowns
Format: wordless. No voiceover, no narration, no spoken dialogue. All communication is on-screen text and sound design.

---

## 1. What we are making

A 45-second film that makes exactly one argument: **the family group chat is already a calendar, and Family Planz is the thing that turns it into one.**

Everything in the film serves that single moment. The product is never explained, never listed, never praised. One line of copy appears in the entire film, in the last three seconds.

This is deliberately narrower than the feature set. The app can do recurring-task cursors, anonymous accounts, offline queues, a Daily Verse, PWA share targets, and an ICS importer. None of it is in this film. The film is about the paste, because the paste is the only thing a stranger can understand in one glance.

## 2. Creative rules

These are constraints, not suggestions. If a shot breaks one, the shot is wrong.

1. **No feature list.** Not in text, not in VO, not implied by a rapid montage of screens.
2. **No "all-in-one", no "smart", no "AI", no "revolutionise".** The site says "smart algorithm" and never "AI"; the film should be even quieter than the site.
3. **No claims about bills, receipts, or money.** That surface was archived on 2026-09-25 (`docs/STATUS.md:244-251`) and the changelog and privacy page still advertise it — a known bug, issue #087. Do not put a stale claim in a video we cannot edit.
4. **No fake testimonials, no stock-photo families, no smiling-at-camera.**
5. **Chaos is real, not comedic.** Nobody is a fool. The group chat is not the enemy; it just has no memory. The film should make the audience recognise their own Tuesday, not laugh at their spouse.
6. **Silence is a beat.** The first 8 seconds carry no music. The turn happens when the buzzing stops, not when a swell begins.
7. **The app is never described.** If a viewer could remove all the UI and the film still worked, the UI shot was too long.

## 3. Format and delivery

| Item | Spec |
| --- | --- |
| Master | 3840×2160, 25fps, Rec.709, 10-bit, ProRes 422 HQ or DNxHR HQX |
| Deliverables | 16:9 (1920×1080), 9:16 (1080×1920), 1:1 (1080×1080), 4:5 (1080×1350) |
| Audio | 48kHz 24-bit stereo. Full mix and a sound-design-only stem. |
| Captions | On-screen text is the caption. Every text element must be legible at 1080 wide with the sound off. |
| Grade | Match shots 4–6 to the real app's rendered colours. See §7. |

**Aspect ratio note that will bite us if ignored:** the UI shots are a browser at a desktop viewport. You cannot crop 16:9 down to 9:16 — you would cut the event card in half. Every aspect ratio needs its **own** screen capture at its own viewport (16:9 at 1440×900, 9:16 at 430×932, 1:1 at 800×800, 4:5 at 900×1125), then the same choreography re-timed per ratio. The 9:16 build is the one that needs design attention: on a phone the paste, the parse, and the month view are three separate moments, and they may need three separate cuts rather than one continuous move.

## 4. The chat

This is the film's spine and it must be shot as a real screen. Not a mockup, not a design file — an actual iMessage or WhatsApp group on a real phone, seeded by hand, with real avatars and real timestamps.

Cast of the group — four members, so the reply traffic is plausible and the film does not need an army of names:

| Avatar | Name | Role in the film | Colour |
| --- | --- | --- | --- |
| Dad | Mike | Asks the "who's picking up?" question | `#F1B598` |
| Mom | Sarah | The one who is losing it | `#F1B598` |
| Kid's teacher | Ms. Alvarez | Sends the permission slip and the practice time | — |
| Grandma | Ruth | One warm aside, "call her on the way home" | — |

Draft transcript. These are working lines, not final copy, but they are written so that the paste payload is **genuinely parseable by the shipped parser** — every date and time below is phrased the way `naturalLanguageService` actually handles it:

```
Ms. Alvarez  7:41 AM
Permission slip for the field trip is due Friday.

Mike         7:42 AM
soccer practice every Tuesday at 4pm, riverside park

Sarah        7:43 AM
wait is it 4 or 4:15? the flyer says 4 but emma said 4:30

Mike         7:43 AM
4. she's always early

Sarah        7:44 AM
ok. also piano moved to thursdays 5pm studio B

Ruth         7:45 AM
call your mother on the way home please

Sarah        7:46 AM
ok can someone pick emma up wednesday? dentist is at 2:30

Mike         7:46 AM
i can

Ms. Alvarez  7:47 AM
Also practice is cancelled next Tuesday, inset day.

Sarah        7:48 AM
of course it is
```

Ten messages, four people, one cancelled practice, one unresolved pickup, and a permission slip nobody has looked at. That is the entire thesis of the film and it is 8 seconds of screen time.

**The paste payload is the Mike and Sarah messages from 7:42 to 7:44, long-pressed and copied as one block.** That is what a real person does — they select the run of messages that contain the actual information and ignore the noise.

> **Pre-production verification, blocking.** Nobody shoots until this exact string is pasted into `EventQuickAdd` and the resulting events are recorded. The app's quick-add is built around pasting *a message* (`EventQuickAdd.svelte:39-80`), and multi-date phrases producing N events is a different, narrower path. If the parser does not cleanly resolve a three-message block into three events, the shot changes to a rapid triple-paste — one message, `Cmd-V`, one message, `Cmd-V`, one message, `Cmd-V` — which is more honest and, incidentally, better film. Do not fake the parse with a mockup. Someone will notice.

## 5. Storyboard

Nine shots, 45 seconds. Timings are target, not lock — picture can breathe, the music cannot.

### Shot 1 — 0:00–0:02 · Black
Full black. One notification buzz at 0:00.4. Nothing else. A second buzz at 0:01.2, closer, louder, as if the phone is in the same room. Hold black one beat longer than feels comfortable.
**Sound:** absolute silence for the first 400ms, then room tone: a distant dishwasher, a kettle, traffic through a window. This is a real kitchen, not a studio. Buzzes are the only synthetic sound in the film.
**Text:** none.

### Shot 2 — 0:02–0:08 · The scroll
Over-shoulder, handheld, phone in the hand. The chat from §4 is already moving, fast enough that the messages blur. The camera does not settle and does not try to be beautiful. This is the shot that has to feel like a Tuesday.
**Camera:** 35mm equivalent, handheld, small vertical drift. Focus hunts slightly on the first two messages. Shoot 5 takes; use the most boring one.
**Sound:** the buzzes from shot 1 continue, now layered and accelerating. Text arriving, six deep, overlapping. A buzz for each new message and one that is cut off mid-arrival.
**Text:** none. Legibility is deliberately denied here.

### Shot 3 — 0:08–0:14 · The four problems
The same phone, the same framing, now still. The camera has found its rest, which is the point — the chaos is over and it did not help.

Four of the messages carry a highlight, in this order, one every 1.4 seconds, each a soft warm bloom in the speaker's own colour:

1. `7:43 AM — wait is it 4 or 4:15?` (Sarah)
2. `7:46 AM — can someone pick emma up wednesday?` (Sarah)
3. `Permission slip for the field trip is due Friday.` (Ms. Alvarez)
4. `Also practice is cancelled next Tuesday, inset day.` (Ms. Alvarez)

**Sound:** the layered buzzing stops on a hard cut to nothing at 8.0. Four seconds of kitchen room tone underneath, which now feels loud. The discomfort is the point.
**Text:** no captions over the messages. They are the caption.

### Shot 4 — 0:14–0:19 · The paste
Hard cut to a laptop. Family Planz, real app, real seeded family. The paste block from §4 is already on the clipboard. One `Cmd-V`. The field fills.
**Camera:** locked off, slight three-quarter angle, shallow depth so the screen is the only sharp thing in frame. No hands if we can crop them out — a floating cursor is more unsettling than a hand.
**Sound:** the silence holds for 900ms after the paste. The UI itself is silent: **no confirmation sound, no whoosh, no shimmer.** The absence of a sound here is the single most important audio decision in the film.
**Text:** none.

### Shot 5 — 0:19–0:24 · The parse
The parse resolving on camera, in real time, not sped up. Three events assembling from the pasted block. Each field lands with a 4px settle and no flash. 1.5 seconds maximum — if it takes longer on screen, it took longer on screen for the user too, and that is worth knowing before we publish.
**Camera:** same lock-off, no move. A slow 8% push is the only permitted camera motion in the film.
**Sound:** at 0:19.0 exactly, the music enters for the first time — one sustained warm pad, no percussion, no melody. It is the sound of the buzzing turning into something else. Under it, three very soft clicks as the three events land.
**Text:** none.

### Shot 6 — 0:24–0:31 · The calendar
Month view. The camera has pulled back far enough that the grid reads as a grid. The cells fill in colour by calendar — the shape and the colour each mean something and the film does not stop to explain. Someone else's presence indicator appears in the corner, moving: another person is looking at this right now.
**Camera:** the pull-back continues from shot 5 and settles. This is the only continuous move in the film.
**Sound:** the pad gains a slow pulse. Still no percussion.
**Text:** none.

### Shot 7 — 0:31–0:37 · The quiet
Hard cut back to the phone from shots 2 and 3. Same framing, same light, same hand. The chat has not moved. One new message, arriving from Mike, in his colour, and the film holds on it long enough to be sure it will not be followed by another:

```
Mike  7:52 AM
got it 👍
```

Nothing else arrives. That is the event.
**Sound:** the pad thins to a single sustained note and drops in level.
**Text:** none.

### Shot 8 — 0:37–0:42 · The fridge
Half a second. A refrigerator door. The sticky notes, the whiteboard photo, the curling permission slip from shot 3 — all of it gone. One clean printed sheet, landscape, in the family colours, held in place by a magnet. The camera does not move.
**Sound:** nothing added. The room tone from shots 1–3 returns underneath, unchanged, as if the film has come full circle to the same kitchen.
**Text:** none.
> This is a real feature — `/calendar/print` exists. Shoot the actual print view, not a design of it.

### Shot 9 — 0:42–0:45 · The card
Solid `#F8F6F3`. The wordmark, centred, resolving out of a blur over 8 frames and then dead still. Tagline beneath in `#2d5866`. The URL underneath in slate. Hard cut to black at 0:45.
**Sound:** the single note resolves and stops. No logo sting. No riser. The silence after the cut is part of the design.
**Text:**
```
Family Planz
The calendar your family deserves.
familyplanz.com
```

> **Blocker:** there is no wordmark or logo lockup in the repo. `static/icon.svg` is a calendar-notebook glyph in a cooler palette that does not match the marketing site, and there is no brand guide. Shot 9 cannot be finished until someone designs a lockup. That is a design task with a dependency on this doc, not a video task. Flag it now, not on the day.

## 6. Typography

The app uses the Tailwind system sans stack and no custom webfont, so the UI shots will look like every other SaaS demo. Titles in the film need a deliberate face that the app does not have.

- **Titles and the wordmark:** a warm humanist serif with real weight range. It should feel like a printed family calendar, not a product launch.
- **UI shots:** whatever the browser is already rendering. Do not restyle the app. The app looking like the app is the credibility of the whole film.
- **Chat text:** system sans at native phone size. The chat is a real phone screen; anything else breaks the illusion.
- **Minimum size:** on-screen text must survive a 1080-wide export viewed on a phone at arm's length. Nothing legible in the film is smaller than 28px in the 1080 master.

## 7. Colour and grade

The repo has two palettes and they are not identical. This is the one decision to make before any grade work starts.

| Role | Hex | Source |
| --- | --- | --- |
| Titles, logo, warm accents | `#c45e38` | marketing site, `(marketing)/+page.svelte:44` |
| App UI accent (leave alone) | `#dd5822` | `tailwind.config.js:9-37` |
| Blush / Sarah, Mike | `#FED5CF` / `#F1B598` | `(marketing)/+page.svelte:58,68` |
| Teal, secondary text | `#366d7e` / `#2d5866` | `(marketing)/+page.svelte:63,121` |
| Mint, Kids' Schedule | `#C4E9DA` | `(marketing)/+page.svelte:73` |
| Page background | `#F8F6F3` | `(marketing)/+page.svelte:8` |

**Rule:** the marketing hexes are for everything the film adds. The app hexes are for everything the app draws. Do not unify them and do not let the grade push the UI shots away from `#dd5822` — if the app on camera does not match the app in the product, the film is lying.

Shots 1–3 and 7 are the same location, so they share a grade and must be shot the same day in the same light. Morning window light, no practicals, no overhead kitchen light, nothing warm and tungsten in frame — it will fight the blush tones and there is no grade that rescues it.

## 8. Sound design

The film is wordless, so the mix carries the argument. Two textures, and only two.

1. **The chaos bed** (shots 1–3): layered message buzzes, a real kitchen room tone, no music. The buzzes should be *slightly* wrong — too close, slightly compressed, a little too many. It should sit just under the threshold of annoyance, because the audience's own phone does this to them every evening.
2. **The pad** (shots 5–9): one sustained warm tone entering at 0:19.0 on an exact cut and doing nothing dramatic ever. No percussion until shot 6. No build. No drop. The temptation to put a riser under shot 8 is exactly the temptation to make this film forget what it is about.

There is no third texture. There is no whoosh on the paste, no shimmer on the parse, no click on the logo.

## 9. Cutdowns

All cut from the same master. No reshoots.

| Length | Cut | Where it lives |
| --- | --- | --- |
| **6s** bumper | Shot 4 paste → shot 5 parse → shot 9 card, hard cuts only, 2s each. No music until the parse. | Pre-roll, app-store listing, the end of every long cut. |
| **15s** | Shots 3 (2s) → 4 (2s) → 5 (2.5s) → 6 (3s) → 9 (2.5s). Drops the phone and the fridge entirely. | Instagram, LinkedIn, X, paid social. |
| **30s** | Shots 3 (4s) → 4 (4s) → 5 (4s) → 6 (5s) → 7 (4s) → 9 (4s), chat at the front instead of shot 2's scroll. | Homepage hero loop, email header. |
| **45s** | Full storyboard as written. | YouTube, landing page, sales deck. |

**Caption note:** with no voiceover, the on-screen text *is* the caption. There is nothing to burn in for the shots that are pure screen — the messages are already the readable text, at real phone size, which is why shot 2's unreadable blur matters and why shot 3 must be genuinely legible rather than a soft bloom the viewer has to squint at.

## 10. Capture plan

The UI shots are the real application, not comps. Playwright is already in this repo and there are seeded users (`npm run db:seed`), so:

- One Playwright script per aspect ratio, each driving the same choreography against a fresh context.
- Real seeded family with real member colours, real events, real recurrence. The `by <First>` creator chips and the RSVP indicators in shot 6 have to be genuinely populated or the shot is empty.
- A 4x supersampled capture (5760px wide) downscaled in post, so the UI text is clean at 4K. Browser text at native 1x looks like a screenshot; at 4x downsampled it looks filmed.
- **A real person should paste the §4 block by hand in the browser, on camera-quality capture, rather than the script injecting the clipboard value.** If the script sets the clipboard programmatically we lose the typing, the selection, the half-second of hesitation, and the frame where the field is still empty. That half-second is the most honest half-second in the film.
- Cursor must be frame-smooth. No OS cursor acceleration curves, no teleporting between positions.

## 11. Blockers and open decisions

1. **No wordmark exists.** Blocks shot 9 and therefore every cutdown. Needs a designer.
2. **No brand guide.** Colour, type, and logo rules are being inferred from marketing-page source. Worth writing down before the grade is locked rather than after.
3. **The paste payload is unverified against the shipped parser.** §4. Shoot the triple-paste fallback if the block does not resolve. Do not fake it.
4. **Cast.** Two adults and a genuine child are needed if the fridge shot is to hold for half a second. Child performance is a permission and a safeguarding matter, not a casting note — and if it adds a day of rescheduling risk, the fridge shot can be a real parent's hands and the child is never on camera.
5. **The Daily Verse card is not in this film.** It is the most distinctive thing in the product and it is deliberately absent, because a devotional beat in a 45-second stranger-facing film is a narrowing, not a highlight. It belongs in a second film aimed at people who already use the app.
6. **Where the film runs.** The 30s loop on the homepage hero is the highest-value placement and means the 6s and 15s need to exist on day one, not as an afterthought.

## 12. Call sheet

- **Shoot day 1** — kitchen location, morning window light. Shots 1, 2, 3, 7, 8. Real phone, real chat, real hands. Fridge shot last, after the sticky-note chaos is cleared, so the "before" state is available for pickup.
- **Shoot day 1, later** — desk location, controlled light. Shots 4, 5, 6. Locked-off, no crew in the room, no music playback during capture (record wild room tone separately).
- **Post** — grade shots 1/2/3/7/8 as one unit, 4/5/6 as another, card last. Cut the 45s before the cutdowns; cutdowns are extracts, never re-edits.
