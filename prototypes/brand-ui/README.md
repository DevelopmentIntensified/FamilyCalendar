# brand-ui

Everything **outside** the product: the mark, the share card, the words.

Generated, not sourced. The icon that ships today came off svgrepo and matches
nothing; the hero photo is hotlinked from Pexels. Every asset in this set is
drawn from [`marks.js`](marks.js) and rendered into `static/brand/` by
`npm run brand:build`.

## Run it

Same collector as the other sets, rooted at the tree:

```powershell
npm run proto:serve     # http://127.0.0.1:4180/brand-ui/
npm run proto:check     # includes brand-check
```

Serve over HTTP, not `file://` — see the root README.

## The pages

| | question |
|---|---|
| [`theme.html`](theme.html) | What does the calendar prototype page specify, and is it enough to name? |
| [`icon.html`](icon.html) | Which of the three marks survives being shrunk to 16px? |
| [`og.html`](og.html) | What should a shared link look like in a chat? |
| [`copy.html`](copy.html) | Which headline can the app actually back up? |

## The one source

`marks.js` holds every mark and every card as a function. Nothing in
`static/brand/` is hand-edited, so a prototype page and the shipped file cannot
drift apart.

```powershell
npm run brand:build     # write static/brand/ and rasters/
npm run brand:check     # fail if either has drifted from marks.js
```

The check compares **decoded pixels**, not PNG bytes. A PNG carries encoder
metadata, so two renders of identical art differ byte-for-byte after a browser
bump; hashing the RGBA does not have that failure mode. It also hashes
`marks.js` itself, so editing the mark and forgetting to re-render is caught.

### Why the rasters are here too

The collector is rooted at `prototypes/` and cannot serve `../../static`. So
`brand:build` writes the same bytes into `rasters/` as well. Not a second copy
that can rot — one plan, two destinations, both covered by the manifest, both
proved by `brand:check`. Delete `rasters/` and the check fails.

## The palette and the theme

Read off [`../calendar-ui/`](../calendar-ui/) — the `:root` tokens, the hero
wash, the four orbs, the four card tints, the glass calendar frame, the button
shadows, the 150ms transition. Not invented, and not carried over from
`static/theme-preview.html`, which was a fourth palette nothing adopted.

It now lives in **`src/lib/marketing/theme.css`** as `--mp-*` custom properties,
imported by `src/routes/(marketing)/+layout.svelte`. Before that, the marketing
pages carried their colours as Tailwind arbitrary values written per class
(`bg-[#FED5CF]`, `text-[#c45e38]`) across five files.

| token | hex | used for |
|---|---|---|
| `--mp-canvas` | `#f8f6f3` | the paper |
| `--mp-brand` | `#c45e38` | buttons, links, the mark |
| `--mp-blush` | `#fed5cf` | warm tint |
| `--mp-peach` | `#f1b598` | warm accent |
| `--mp-blue` | `#bedae3` | cool, data |
| `--mp-mint` | `#c4e9da` | cool, done |
| `--mp-lavender` | `#d3c7e6` | the fifth tint |
| `--mp-ink` | `#0f172a` | headlines |

**The decision this set cannot make for you:** the app's Tailwind `primary` is
`#dd5822` and the marketing pages use `#c45e38`. Two oranges, close enough to
be a mistake and different enough to be visible side by side. The theme uses
`#c45e38` and names the other one `--mp-warm-600` rather than hiding it.
`theme_color` in the manifest and `app.html` is still the app one. That is on
the hub and on `theme.html`.

## Ground rules

1. **Nothing here is sourced.** No svgrepo, no Pexels, no icon font. If it is in
   this set, it is drawn in `marks.js`.
2. **One source, two roots.** The prototype and `static/` are the same bytes.
3. **A claim is not copy until the app can back it.** See `copy.html` and 087.
4. **The losers stay on disk.** A, B and C are all still here after the
   synthesis ships — they are the record of the argument.
