# Research: Mindfulness & habit apps (Headspace, Calm, Finch, Streaks, Habitica, Forest, The Fabulous)

## Raw notes

**Headspace** — daily streak with **streak recovery** (breaks are recoverable, not resets; ~48% longer streaks past day 7); soft post-break tone ("something that happened", never failure); private milestone badges, deliberately non-shareable; no points/levels/leaderboards; cooperative "who practiced today" board without ranking.

**Calm** — streak counts multiple activity types (multiple completion paths per day); manual history editing to repair broken streaks; streak opt-out for anxiety-prone users; shareable milestone cards; daily fresh content as appointment mechanic.

**Finch** — virtual pet: tasks earn Energy → adventures → currency → customization; pet lives continuously (presence design); one clear daily objective via progress bar; micro-events mapped to natural day rhythm; random rewards fight monotony; adaptive compassion (mechanic bends to help when you feel bad); ~60% day-1 retention attributed to pet-naming onboarding creating emotional investment.

**Streaks** — Apple Design Award; tap-circle loop; **max 24 tasks** (enforced scarcity); **schedule-aware streaks** — off-days never break the streak (key insight); one-tap completion; milestone achievements; no leaderboards.

**Habitica** — full RPG: Habits/Dailies/To-Dos grant XP+gold; missed Dailies damage HP; gold buys gear AND **custom self-defined real-life rewards** ("watch an episode"); party quests for social accountability; difficulty tiers scale rewards.

**Forest** — tree dies if you leave (loss aversion + visible shame); forest = living history portfolio; coins unlock species + fund real-tree planting; "Plant Together" synchronized sessions with collective stakes.

**The Fabulous** — journeys framed as story chapters; **tiered daily streak** (Core < Silver < Golden — partial credit keeps streak alive); **Streak Freeze** earned at milestones; onboarding as commitment device (promising your routine); ritual-trigger notifications; welcomes you back without shaming.

## Tagged backlog

- `[recurring-events][stats][retention]` Schedule-aware streaks counting only scheduled days
- `[tasks][retention]` Tiered daily credit — partial completion still extends the streak
- `[retention][stats]` Streak Freeze earned at milestones; lapses don't zero history
- `[retention][family-engagement]` Soft post-break messaging, never failure framing
- `[tasks][retention]` Multiple completion paths count toward a day's streak
- `[stats][retention]` Per-person milestone badges on profile
- `[family-engagement][stats]` Family progress bar toward a shared weekly goal
- `[family-engagement][retention]` Gentle nudge button, cooperative framing, no ranking
- `[family-engagement]` Opt-in collective-stakes family challenge week
- `[stats][recurring-events]` Calendar heatmap of completed occurrences
- `[tasks][stats]` Retroactive completion editing repairs streaks
- `[retention][onboarding]` Streak visibility toggle (anxiety-sensitive opt-out)
- `[onboarding]` Commitment moment during first-run (check boxes committing to routines)
- `[onboarding][family-engagement]` Named-entity emotional hook early in onboarding
- `[family-engagement][tasks]` Custom family-defined rewards purchasable with earned points
- `[retention]` Random micro-rewards on completion to counter predictability
- `[stats]` Completion dashboard: current/best streak, rate per Recurring Event, trends
- `[stats][family-engagement]` Load-balance insight ("Mia did trash 14×, Alex 3×") surfaced gently

## Mini-PRDs

### A — Schedule-aware forgiving streaks (effort M)
Per-person streak anchored to assigned occurrences of Recurring Events. Only scheduled days count; tiered daily credit (any occurrence = Core keeps streak, all = Gold bonus); Streak Freeze starts at 2, earned per 7/30-day milestone, consumed before a break; soft break copy preserving best streak. Converts the recurring-events + stats layer into a retention engine.

### B — Cooperative family weekly meter + nudges (effort M–L)
One shared weekly progress bar filled by any member's completions and RSVPs; threshold celebrations optionally tied to a custom family reward ("pizza night"). Pre-framed friendly nudges, rate-limited, positive-only templates — no leaderboards. Cooperative-by-default is the mechanic single-player competitors structurally can't copy.

**Cross-cutting rule from research:** every app that sustained engagement paired a loss-aversion mechanic with a relief valve (freeze, recovery, tiered credit, opt-out). Ship streaks and their relief valves in the same release, never streaks alone.
