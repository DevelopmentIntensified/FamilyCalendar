# 193 — Emoji as meaning-bearing UI (owner fork)
Status: open
Source: ui-design-principles audit (craft #3), 2026-10-16. Design choice — owner decides.
## Done
- Lock/globe inside `<select>` options (`EventTaskFields.svelte:46-47`, `EditTaskDialog.svelte:216`); feature chips (`TaskQuickAddPreview.svelte:48-88`); recurrence markers (`EventModalHeader.svelte:36`, `DayAllDayList.svelte:110`, `ListView.svelte:258`); sparkles (`BulkEditBar.svelte:242`, `FirstRunCard.svelte:16,22`); warning (`EventDeleteConfirm.svelte:28`); Everyone avatar (`MentionInput.svelte:246`); check (`NotificationBell.svelte:293`).
- Renders per-OS; recurrence/visibility glyphs are the meaning and can silently shift or vanish (colour/shape-alone meaning).
## Needs doing
- Option A — swap to one icon library (throws away existing visual language; needs a chosen set). Option B — bless emoji explicitly. Owner decides per the skill's bug-vs-choice split.
