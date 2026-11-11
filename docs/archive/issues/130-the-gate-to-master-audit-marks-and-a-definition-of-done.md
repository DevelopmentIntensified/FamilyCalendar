# 130 — The gate to master: audit, owner's marks, and a definition of done

Status: open
Triage: ready-for-agent

## Problem Statement

The `test` branch deploys and looks nothing like the approved design on the pages
the owner checked by hand. Three separate review rounds reported a page as
"matches the prototype" and were wrong each time, so the owner's own statement is
that the pages still do not look or feel like the marketing pages.

The cause is a method failure, not a styling failure. Rounds compared **feature
presence** — does this heading, this card, this toggle exist — instead of
**geometry and behaviour**. The family lane's own finding: "every previous round
compared feature PRESENCE, never geometry". The account round then compared
section *prose* and missed the same thing one level in. The `Mine` chip is the
third instance of one shape: the right words were checked and the behaviour
underneath them was not.

Three consequences the owner is now living with:

1. **There is no shared definition of "perfect"**, so nothing can be called done.
   Every round ends in an opinion, and the owner's opinion and the agent's
   opinion disagree.
2. **Nothing has been audited against the marketing pages**, which are the one
   surface the owner considers correct. They are the reference implementation of
   the design language, and no check compares the app to them.
3. **No whole-site code or security review has happened**, and no current
   dependency advisory has been checked against this code.

The owner also cannot see the prototypes in the deployed environment, so review
happens against a local server one developer is running, which is not reviewable
by anyone else and not reproducible.

## Solution

A gated programme with one exit criterion, defined once and never renegotiated by
an agent:

**Nothing reaches `master` until the owner's own eyes have approved screenshots
of every page, and every audit finding is closed or explicitly waived by the
owner.**

Five phases, in order:

- **Audit.** Two read-only lanes. One measures every app route against the
  marketing pages' actual design language. One reads every route and action for
  bugs and security defects, and checks current advisories for the *actually
  installed* dependency versions. Both produce numbered tickets and **no code
  edits**, so they cannot collide with in-flight work.
- **Owner's marks.** The owner marks up real screenshots and writes notes. Those
  marks become tickets verbatim. This phase is not optional even if the audits
  return clean, because "feels worth using" is the one judgement an agent cannot
  make on the owner's behalf.
- **Missing pages.** Any route without a prototype gets one built, ticketed for
  the owner's review, and implemented only on approval.
- **Implement.** Tickets dispatched by disjoint route. One lane, one folder.
  Tests first, measure rather than eyeball, commit and push per slice to `test`.
- **Gate.** A single checklist the owner runs against a promoted branch.

Three standing rules make the method failure non-recurring:

1. **An approval is a specification, not a comparison.** Build what the approved
   artefact shows, for look *and* function. "The app is already better" is not a
   reason to change nothing.
2. **Never decide alone.** A genuine fork goes to the owner with both options
   and what each costs. Irreversible DDL always asks.
3. **A page is not "done" because a test passes.** A test encodes what its author
   believed. Agreement requires the owner to have looked.

## User Stories

### The owner, deciding

1. As the owner, I want every audit finding to arrive as a numbered ticket, so
   that I can triage rather than re-read a wall of prose.
2. As the owner, I want to see real screenshots rather than agent claims, so
   that I judge what a user would actually see.
3. As the owner, I want to click any element on a screenshot and leave a note,
   so that my feedback is attached to the thing I am looking at.
4. As the owner, I want my marks and notes turned into tickets without my having
   to write them up, so that my attention goes to judgement rather than filing.
5. As the owner, I want a genuine fork presented as two options with costs, so
   that I make the decision instead of ratifying one.
6. As the owner, I want irreversible changes to stop and ask, so that nothing
   unrecoverable happens while I am away.
7. As the owner, I want to know which prototype page governs which app route, so
   that a future disagreement about "the approved version" is answerable.
8. As the owner, I want one written definition of "perfect", so that "it's
   perfect" stops meaning "I haven't found anything".
9. As the owner, I want the same language in every brief, so that agents stop
   producing "already matches" verdicts.
10. As the owner, I want blockers left visibly open rather than quietly resolved,
    so that I know what is waiting on me.

### Visual and interaction parity with the marketing pages

11. As a signed-in user, I want the calendar's radius, spacing, type scale and
    colour tokens to match the marketing pages, so that the app feels like the
    same product as the site I judged it by.
12. As a signed-in user, I want the settings page's cards to match the marketing
    card language, so that it does not read as a different product.
13. As a signed-in user, I want every route's empty state to look designed, so
    that a new account does not look broken.
14. As a signed-in user, I want every loading state to be a skeleton rather than
    a blank card, so that I know something is coming.
15. As a signed-in user, I want every error state to say what happened and what
    to do next, so that a failure is not a dead end.
16. As a signed-in user, I want destructive actions confirmed with a named
    consequence, so that I do not lose data I meant to keep.
17. As a signed-in user, I want no bare browser dialogs, so that the app does not
    look like a website from 2008 in the middle of a designed flow.
18. As a signed-in user on a phone, I want every page usable at 320px, so that I
    am not locked out on an older device.
19. As a signed-in user on a phone, I want no horizontal scroll anywhere, so that
    I never have to pan a page sideways to read it.
20. As a signed-in user, I want every interaction to acknowledge my tap within
    100ms, so that the app never feels like it ignored me.
21. As a signed-in user, I want to be told what a completed action did, so that I
    know whether it saved.
22. As a signed-in user, I want the month grid to fit one screen on a phone, so
    that I can see my month without scrolling a wall of chips.

### Using it as a family

23. As an adult family member, I want to see who is doing what today at a
    glance, so that I know whether the day needs me.
24. As an adult family member, I want a member with nothing assigned to still
    appear, so that I can see they are covered rather than missing.
25. As a parent, I want to hand a task to a specific person and see it pending
    their acceptance, so that nothing is silently dropped.
26. As a parent, I want to see recurring tasks roll forward correctly, so that a
    weekly chore does not disappear after one completion.
27. As a parent, I want the streak to mean something true, so that I trust the
    number.
28. As a parent, I want statistics that count real completions rather than a
    column the recurrence cursor overwrites, so that the numbers are honest.
29. As a parent, I want archived events to be findable and linked, so that I can
    answer "what did we do on the 4th?".
30. As a parent, I want recurring events to visibly stop in the archive, so that
    the archive does not imply endless future events.
31. As a parent, I want to import a calendar and preview before committing, so
    that a bad import is not a bad week.
32. As a parent, I want to undo a bulk import, so that one wrong file is not a
    cleanup job.
33. As an adult family member, I want an invitation code with an expiry and a
    use limit I actually chose, so that a leaked code is bounded.
34. As an adult family member, I want to revoke an invitation, so that I can cut
    off access I no longer intend to grant.
35. As a parent, I want to add a child and be warned their email must be unique,
    so that I do not create a duplicate account by accident.

### Accounts, security and access

36. As a user, I want my data to be readable only by me and my family, so that a
    guessed identifier cannot expose it.
37. As a user, I want to be signed out everywhere, so that a lost device is not a
    permanent exposure.
38. As a user, I want API tokens shown once and identifiable afterwards, so that
    I can revoke the right one.
39. As an admin of a family, I want actions checked against my role, so that a
    member cannot promote themselves.
40. As an invited user, I want a join code to be single-use and expiring, so that
    a forwarded screenshot is worthless.
41. As a user, I want state-changing requests rejected when they lack proper
    origin, so that another site cannot act as me.
42. As a user, I want my email change to be verified, so that an attacker cannot
    take over my account by changing the address.

### Accessibility

43. As a keyboard-only user, I want every control reachable and operable, so
    that I never need a mouse.
44. As a keyboard-only user, I want focus visible at all times, so that I know
    where I am.
45. As a screen-reader user, I want controls to announce their state, so that a
    toggle tells me whether it is on.
46. As a screen-reader user, I want meaningful headings in order, so that I can
    navigate by structure.
47. As a colour-blind user, I want meaning carried by more than colour, so that
    status is not colour-only.
48. As a user of reduced motion, I want animation suppressed when I ask for it,
    so that the app does not make me ill.

### Performance and reliability

49. As a user on a slow phone, I want the app to be interactive quickly, so that
    I do not abandon the task.
50. As a user, I want a failed request to be retryable without redoing my work,
    so that a dropped connection costs me nothing.
51. As a user, I want optimistic updates that roll back visibly if they fail, so
    that the interface never lies about saved state.
52. As the owner, I want the build and full suite green before every push, so
    that `test` is never broken.
53. As the owner, I want the suite to run in one command with a reported count,
    so that "the tests pass" is a fact rather than a claim.

### The review and release process itself

54. As the owner, I want reviews to produce tickets and not code, so that
    nothing reaches `test` that I have not seen.
55. As the owner, I want parallel lanes to touch disjoint folders, so that two
    agents cannot silently undo each other.
56. As the owner, I want any scope overage reported with a number, so that I can
    see where an agent exceeded what I asked.
57. As the owner, I want deleted prototypes recoverable, so that removing a
    superseded design is reversible.
58. As the owner, I want the prototype registry to have no entry pointing at a
    file that does not exist, so that the review tool cannot report fiction.
59. As the owner, I want the current dependency advisories checked against this
    code, so that a known CVE is not sitting in a shipped bundle.
60. As the owner, I want a written checklist for promotion to `master`, so that
    the decision is made once against a list rather than repeatedly from memory.

## Implementation Decisions

**Audit lanes produce tickets, never code.** Both review lanes are read-only.
This keeps them collision-free with in-flight implementation and guarantees the
owner sees a finding before any change exists.

**Parity is measured against the marketing pages specifically.** The marketing
routes are the reference implementation of the design language. The parity check
derives its expectations from the marketing pages' own emitted values rather than
from a hand-written style guide, because a second source of truth is how the
current drift happened.

**The new seam is a single route-walking design-token assertion.** Rather than one
test per page for styling, a single test enumerates the app's routes and asserts
each conforms to the shared token set. One seam at the highest available point,
rather than dozens at lower ones. Existing component, action and e2e seams are
reused unchanged; this is additive.

**A pass is not agreement.** Test coverage proves the code does what its author
believed. Every ticket's closure requires the owner's mark or an explicit waiver.
The definition-of-done checklist makes this mechanical rather than a matter of an
agent's confidence.

**Marks flow through the existing collector, in staging order.** Click stages a
mark; the composer collects the note; submit creates it. An empty mark is not
submittable. This already exists and is reused, not rebuilt.

**The owner never delegates a decision.** Genuine forks are reported with both
options and their costs. Irreversible DDL, a demoted page, and a dropped table
always ask. This is a process rule with teeth: it is written into the briefs and
into the repository's agent instructions, because three prompts did not prevent it
once already.

**Missing pages get a prototype before code.** A route without an approved
artefact is not built to an agent's judgement. The artefact goes to the owner
first.

**The prototype estate keeps what the build needs.** The brand prototype directory
is the source the raster build renders from, so it is retained along with the
unreviewed asset prototypes. Superseded and incorporated page prototypes are
removed. The registry is pruned in the same change so no entry names a missing
file.

**Security findings are ordered by exploitability, not by scanner severity.**
A reachable authorisation defect outranks a theoretical dependency advisory, and
the ordering says which is which.

**Advisories are matched to installed versions.** A CVE is only reported when
the resolved version in the lockfile is actually in the affected range.

**Schema changes are hand-written SQL for a human, except where explicitly
granted otherwise.** DDL is recorded alongside the ticket whether or not it is
executed by an agent.

## Testing Decisions

**A good test asserts external behaviour only.** What a user or a caller can
observe. Not internal state, not rendered class names for their own sake, not
implementation structure. A test that would still pass after a rewrite that
preserves behaviour is a good test; one that breaks is testing the implementation.

**Highest existing seam first.** The repository already has three good seams and
they are reused rather than replaced:

- Component render and interaction, via the testing-library setup already in use
  across roughly two hundred and forty test files.
- Server action and loader behaviour, tested directly with the existing
  fixtures and in-memory database harness.
- End-to-end user journeys, via the existing Playwright configuration.

**The one new seam is the route-walking design-token test**, described above. It
is new because no existing seam can assert cross-route consistency; adding a
per-page style assertion would multiply seams for strictly less coverage.

**Prior art to follow.** The pinned assertions on the day dashboard — a pairing,
a grid count, an ancestor walk — are the model for a test that encodes a decision
rather than an accident. The recurrence and date-resolution suites are the model
for table-driven phrasing coverage.

**Measurement replaces arithmetic.** Where a claim is dimensional, it is taken
from a real browser via the existing Playwright setup, and the number is recorded
in the ticket. Tailwind default arithmetic has already produced one claim in this
repository that understated a page by a hundred and thirty-nine pixels.

**Regression tests are written red first.** Where a defect is found by a test,
the test fails before the fix and is kept. Where a defect is found by reading,
the fix ships with a test that would have caught it.

**Full suite before every push**, with an exact file and test count reported, and
compared against the previous baseline so a silent drop in coverage is visible.

## Out of Scope

- **Promoting to `master`.** This spec defines the gate; the promotion itself is
  a separate owner action taken after the gate passes.
- **New product features.** Anything not required to make an existing page
  correct, consistent, fast and safe is out of scope regardless of appeal.
- **Redesigning the marketing pages.** They are the reference, not the subject.
- **Resolving the owner's open decisions.** The responsive band between the two
  calendar breakpoints, the unused consent table, and the statistics page's
  standing are each their own tickets, awaiting the owner.
- **A second source of design truth.** No new style guide document; the parity
  check derives from the marketing pages.

## Further Notes

The prototype review tooling records state per page and fails on drift between
the registry and the files on disk. That failure mode is desirable and is kept:
it is the check that would have caught three rounds of "matches" claims.

Deletion of superseded prototypes is performed through version control rather
than the filesystem, so the previous state is recoverable by design. No design
work is destroyed outright.

The parity definition deliberately covers the *marketing* pages as the reference
because the owner judges the product by them. Where the app legitimately differs
— a data table that must stay dense, a control that must stay reachable at a
given width — the difference is recorded as an explicit exception with a reason,
not silently permitted. An unexplained divergence is a defect.
