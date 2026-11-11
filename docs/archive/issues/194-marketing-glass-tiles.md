# 194 — Marketing glass/orbs/tinted tiles + dead theme tokens (fork + cleanup)
Status: open
Source: ui-design-principles audit (craft #1/#2/#5/#6), 2026-10-16. Two-orange context lives in #170 (referenced, not re-litigated).
## Done
- `theme.css:96-120` orange-tinted glows (`--mp-shadow-brand`, `--mp-shadow-cell`), washes/tints gradients; `.mp-frame:167` `backdrop-filter: blur(8px)` + translucent surface; `routes/(marketing)/+page.svelte:13-15` two 64px-blur hero orbs; `featureIcons.ts:25-71` six hand-picked tile tints (`bg-[#FED5CF]` etc., some `bg-white/80`, unscaled). File is self-aware these are prototype-recovered, not invented.
- Dead: `mp-frame` / `mp-shadow-brand` / `mp-shadow-cell` unreferenced by any route; `--mp-hairline` + glass refs dead — shipping unused UI.
## Needs doing
- Bug half (no sign-off): delete-or-consume the dead tokens. Fork half (brand call): keep or strip orbs/glass/tinted tiles.
