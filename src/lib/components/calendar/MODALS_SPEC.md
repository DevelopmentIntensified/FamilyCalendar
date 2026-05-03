# Modal Specifications

## Create Event / Quick Create Modal

**Purpose**: Fast event creation with NLP parsing, expand/collapse, multi-day support

**Behavior**:
- Opens via floating "+" button
- **Collapsed initially**: Shows only **Quick Add (NLP)**, **Title**, and **Description** fields
- **Quick Add visibility**: The Quick Add (NLP) input is **always visible at the top** in create mode unless the user has disabled AI features in settings (`autoParseEventDetails`, `useCloudAI`, `useLocalAI`). If all AI-related settings are off, Quick Add is hidden entirely.
- **Field tracking**: Track `userTouchedFields` vs NLP-detected fields. When Quick Add input changes, hide NLP-detected fields unless the user has manually touched them. Green checkmarks shown on labels for detected/touched fields.
- **Detected fields display**: Detected fields (Date, Time, Location, Attendants, etc.) show inline when NLP parses them, even when Show More is collapsed. No summary box; instead, per-field touch tracking determines visibility.
- **AI Quick Add triggers layout changes**: When start/end times are detected by NLP, the All-Day and Multi-Day checkboxes are **hidden**. When times are NOT detected, checkboxes are shown.
- **Date input** applies to BOTH start and end timestamps (for single-day events)
- **Multi-day checkbox**: when checked, reveals **End Date** input
- NLP populates: date + startTime, endDate + endTime, location, attendants
- **Clear button** (next to NL input) resets all detected fields
- **Required**: Title + Date
- Calendar selector appears only when user has 2+ calendars
- **Attendants section**: Uses contact-style select with deduplicated family users (by `userId`) + recent non-user attendants from `localStorage`. Mixed array: `userId` strings for family members, plain names for recent non-users. Manual entry supported.
- **Form submission**: Modal directly POSTs to `/api/events` (create) or PUTs to `/api/events/{id}` (edit) via `fetch()`. Loading state shown during submission. Page handlers (`+page.svelte`) only close modals on dispatch events.
- Submit dispatches `create`/`update` event, modal closes

When creating event:
- **Quick Add** (NL input) - always visible at the top (unless AI features are disabled in user settings)
- **Title** - visible by default (required)
- **Description** - visible by default
- **Detected fields** - shown inline when NLP detects them, hidden on Quick Add change unless user-touched
- **Show More/Less** button reveals: Date, Time, All-Day, Multi-Day, Location, Attendants, Calendar

When editing event:
- All fields visible (Title, Description, Date, Time, All-Day, Multi-Day, Location, Attendants, Calendar, RSVP Status)
- Show More button is NOT shown - all fields expanded by default
- Quick Add input is hidden in edit mode (or optionally visible for appending notes)

**Fields**:
- **Quick Add** (NL input) - always visible at top in create mode unless AI features are disabled in user settings (`autoParseEventDetails`, `useCloudAI`, `useLocalAI`). Triggers parsing on input, Clear button positioned to the right
- **Title** *required* - always visible
- **Description** - always visible in both create and edit mode
- **Date** *required* (date picker, applies to start date) - hidden by default in create mode (inside Show More section)
- **Start Time** (time picker, hidden when all-day is checked)
- **End Time** (time picker, optional, hidden when all-day is checked)
- **All-day** (checkbox) → hides start/end time inputs when checked
  - When all-day is checked: start/end time inputs are hidden
  - When start/end time are auto-detected: all-day checkbox is unchecked and time inputs are displayed
  - **All-day checkbox is NOT shown when start/end times are detected by NLP**
- **Multi-day** (checkbox) → reveals End Date if checked
  - **Multi-day checkbox is NOT shown when start/end times are detected by NLP**
- **Start/End Time** → displayed on **same line** (side by side in grid-cols-2)
- **All-Day and Multi-Day checkboxes** → displayed on **same line** (side by side), **above** the date/time fields
- **Start Date / End Date** → displayed on **same line** (side by side in grid-cols-2, when multi-day), **below** the All-Day/Multi-Day checkboxes
- **End Date** (date picker, only if multi-day, applies to end date)
- **Location** (LocationSearch component) - hidden by default (inside Show More)
- **Attendants** (uses AttendantSelector component):
  - **Contact-style select**: Deduplicated family users (by `userId`) displayed as scrollable cards with avatars
  - Recent attendants: non-user attendants previously added, cached in `localStorage` under key `recent_attendants`
  - Manual entry for non-user attendants
  - Display chips for all selected attendants
- **Calendar selector** (only if 2+ calendars) - hidden by default (inside Show More)

**Layout (Create Mode)**:
```
┌─────────────────────────────────┐
│ Quick Add (NL Input)            │  ← always visible (unless AI disabled)
│ [Clear] button next to input    │
│ Title                           │  ← always visible
│ Description                     │  ← always visible
│                                 │
│ ┌────────────┐ ┌──────────────┐ │
│ │ Start Date │ │  End Date    │ │ ← side by side (only when multi-day detected/enabled)
│ └────────────┘ └──────────────┘ │  ← below All-Day/Multi-Day checkboxes
│                                 │
│ [All-Day ☐]  [Multi-Day ☐]     │  ← side by side, NOT shown when times detected
│                                 │
│ ┌────────────┐ ┌──────────────┐ │
│ │ Start Time │ │  End Time    │ │ ← side by side (hidden when all-day or times detected)
│ └────────────┘ └──────────────┘ │
│                                 │
│ Location (if detected/touched)  │
│ Attendants (if detected/touched)│
│ Calendar (if 2+, detected/touched)
│                                 │
│ [Show More ▼]                   │  ← toggle button (reveals hidden fields)
│                                 │
│ ── Inside Show More ──         │
│ (any fields not yet shown)      │
└─────────────────────────────────┘
```

**Layout (Edit Mode)**:
```
┌─────────────────────────────────┐
│ Title                           │
│ Description                     │
│                                 │
│ [All-Day ☐]  [Multi-Day ☐]     │
│                                 │
│ ┌────────────┐ ┌──────────────┐ │
│ │ Start Date │ │  End Date    │ │ ← side by side (only when multi-day)
│ └────────────┘ └──────────────┘ │
│                                 │
│ ┌────────────┐ ┌──────────────┐ │
│ │ Start Time │ │  End Time    │ │ ← side by side (hidden when all-day)
│ └────────────┘ └──────────────┘ │
│                                 │
│ Location                        │
│ Attendants                      │
│ Calendar                        │
│                                 │
│ ── RSVP Status ──               │
│ Going: [...]                    │
│ Maybe: [...]                    │
│ Not Going: [...]                │
│ Non-user Attendants: [...]      │
│                                 │
│ [Delete]          [Update Event]│
└─────────────────────────────────┘
```
┌─────────────────────────────────┐
│ Quick Add (NL Input)            │  ← always visible (unless AI disabled)
│ [Clear] button next to input    │
│ Title                           │  ← always visible
│ Description                     │  ← always visible
│ [Detected Fields Summary]       │  ← visible only when NLP detects fields
│                                 │
│ [Show More ▼]                   │  ← toggle button
│                                 │
│ ── Inside Show More ──         │
│ [All-Day ☐]  [Multi-Day ☐]     │  ← side by side
│                                 │
│ ┌────────────┐ ┌──────────────┐ │
│ │ Start Date │ │  End Date    │ │ ← side by side (only when multi-day)
│ └────────────┘ └──────────────┘ │
│                                 │
│ ┌────────────┐ ┌──────────────┐ │
│ │ Start Time │ │  End Time    │ │ ← side by side (hidden when all-day)
│ └────────────┘ └──────────────┘ │
│                                 │
│ Location                        │
│ Attendants                      │
│ Calendar (if 2+)                │
└─────────────────────────────────┘
```

**Layout (Edit Mode)**:
```
┌─────────────────────────────────┐
│ Title                           │
│ Description                     │
│                                 │
│ [All-Day ☐]  [Multi-Day ☐]     │
│                                 │
│ ┌────────────┐ ┌──────────────┐ │
│ │ Start Date │ │  End Date    │ │ ← side by side (only when multi-day)
│ └────────────┘ └──────────────┘ │
│                                 │
│ ┌────────────┐ ┌──────────────┐ │
│ │ Start Time │ │  End Time    │ │ ← side by side (hidden when all-day)
│ └────────────┘ └──────────────┘ │
│                                 │
│ Location                        │
│ Attendants                      │
│ Calendar                        │
│                                 │
│ ── RSVP Status ──               │
│ Going: [...]                    │
│ Maybe: [...]                    │
│ Not Going: [...]                │
│ Non-user Attendants: [...]      │
│                                 │
│ [Delete]          [Update Event]│
└─────────────────────────────────┘
```

---

## Edit Event Modal

**Purpose**: Modify or delete existing events with all fields editable + RSVP management

**Behavior**:
- Opens when clicking an event in Month/Week/List view
- **Always expanded** (editing existing event)
- **All fields pre-populated** from existing event data
- **Multi-day auto-detected**: if event.end date differs from event.start date
- **RSVP section visible** (unlike create modal):
  - **Going**: Users who RSVP'd "going" (with their names)
  - **Not Going**: Users who RSVP'd "declined" or "not_going"
  - **Maybe**: Users who RSVP'd "maybe"
  - **Non-user Attendants**: Names from attendants field that aren't registered users
- **All fields editable**: Title, Date, Start/End Time, End Date (if multi-day), Location, Description, Calendar, Attendants
- "Delete" button (left-aligned, red) dispatches delete event
- "Cancel" button closes modal without saving
- "Update Event" button dispatches update

**Fields** (all editable, pre-filled):
- **Title**
- **Description**
-- all below fields are hidden by default in create mode, but visible by default in edit mode unless show more is clicked --
- **Date** (date picker, applies to start date and end date if not multi-day)
- **Start Time** (time picker, optional if all-day, hidden when all-day is checked)
- **End Time** (time picker, optional, hidden when all-day is checked)
- **All-day** (checkbox)
- **Multi-day** (checkbox) → reveals End Date if checked
- **End Date** (date picker, only if multi-day)
- **Location** (LocationSearch component)
- **Description** (textarea)
- **Attendants**:
  - Family member selector (multi-select) - users in families that the user is a part of
  - Recent attendants: non-user attendants that the user has previously added to events
  - Manual entry for non-user attendants
  - Display chips for all attendants
- **RSVP Status** (read-only display section):
  - Going: [user1, user2, user3]
  - Maybe: [user4, user5]
  - Not Going: [user6]
  - Non-user Attendants: [John, Sarah, Mom]
- **Calendar selector** (all user calendars available)

---

## View Event Detail Modal (EventModal)

**Purpose**: Quick view of event details with RSVP management (no edit)

**Behavior**:
- Opens when clicking event in calendar views (alternative to Edit)
- **Read-only display** of all event info
- **RSVP section** shows:
  - Current user's RSVP status with Going/Maybe/Not Going buttons
  - List of other users' RSVP statuses
  - Non-user attendants list
- "Edit" button → closes this modal, opens Edit Event Modal
- "Delete" button → confirmation dialog → dispatches delete

**Display Sections**:
- Title (large)
- Date & Time
- Location
- Description
- **RSVP Summary**:
  - Going (3): Alice, Bob, Charlie
  - Maybe (2): David, Eve
  - Not Going (1): Frank
  - Attendants (non-user): Grandma, Uncle Joe
- **Your RSVP**: [Going] [Maybe] [Not Going] buttons
- **Actions**: [Edit] [Delete]

---

## Key Schema Mappings

| UI Field | Database Field | Type |
|----------|----------------|------|
| Date + Start Time | `start` | timestamp with timezone |
| End Date + End Time | `end` | timestamp with timezone (optional) |
| Title | `title` | text (required) |
| Location | `location` | text (optional) |
| Description | `description` | text (optional) |
| Attendants | NLP-parsed names | stored in description or separate table |
| RSVP Status | `event_attendees` table | requires checking schema |

---

## Implementation Status

- [x] Date input applies to both start/end
- [x] Multi-day checkbox with end date
- [x] Attendants field (user + non-user)
- [x] Description visible by default (both create and edit mode)
- [x] Start/End time on same line (grid-cols-2)
- [x] Start/End date on same line (grid-cols-2, multi-day)
- [x] Clear button next to NL input
- [x] Detected fields shown inline when NLP detects them
- [x] AttendantSelector UI (card-based layout with avatars)
- [x] RSVP info section in Edit Event Modal
- [x] EventModal shows RSVP details
- [x] Quick Add always visible at top in create mode
- [x] User-touched vs NLP-detected field tracking
- [x] All-Day/Multi-Day checkboxes hidden when times detected
- [x] End Date below All-Day/Multi-Day checkboxes (when multi-day)
- [x] Form submission to backend API via fetch()
- [ ] All modal functionality tested
