# 192 — Meaningful muted text below the contrast floor (+10px type)
Status: open
Source: ui-design-principles audit (craft #9), 2026-10-16. Bug — no design sign-off needed.
## Done
- `text-slate-400` (#94a3b8, ~2.9:1 on white) carries meaningful copy: `AccountNotificationsSection.svelte:159` (11px pref hints), `MentionInput.svelte:249,274` (handles + keyboard hint), account scaffold (`AccountDashboardSection.svelte:41`, `AccountSidebar.svelte:55`, `AccountFamiliesSection.svelte:58`, `AccountSubscriptionSection.svelte:70,101-153` plan/limit labels).
- Type has no floor: `groceries/+page.svelte:631` `text-[0.625rem]`, plus `text-[10px]`/`text-[11px]` instances. Audience is phone-first families including low-vision and older users.
## Needs doing
- Lift meaningful copy to >=4.5:1 (tokenize the muted step); set a 12px type floor (11px large-only). Verify with the #131 harness or a contrast pass per route.
