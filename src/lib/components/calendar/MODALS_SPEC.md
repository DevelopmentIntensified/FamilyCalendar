# Modal Specifications

## Create Event / Quick Create Modal

**Purpose**: Fast event creation with NLP parsing, expand/collapse, multi-day support

**Behavior**:
- Opens via floating "+" button
- **Collapsed initially**: Shows only "Quick Add" NL input field with Clear button
- After parsing detects fields → **detected fields display** even when Show More is collapsed
- **Date input** applies to BOTH start and end timestamps (for single-day events)
- **Multi-day checkbox**: when checked, reveals **End Date** input
- NLP populates: date + startTime, endDate + endTime, attendants
- **Clear button** (next to NL input) resets all detected fields
- **Required**: Title + Date
- Calendar selector appears only when user has 2+ calendars
- **Attendants section**: Shows auto-detected names from NLP + allows adding family members
- Submit dispatches `create` event, modal closes
- **Description** is hidden by default in create mode (behind Show More)

When creating event:
- **Title** - visible by default (required)
- **Description** - **hidden by default** (inside Show More)
- **Quick Add** (NL input) - visible by default, triggers parsing + expand, with Clear button
- **Detected fields** - shown in a summary box even when Show More is collapsed
- **Show More/Less** button reveals: Date, Time, All-Day, Multi-Day, Location, Attendants, Calendar, Description

When editing event:
- All fields visible (Title, Description, Date, Time, All-Day, Multi-Day, Location, Attendants, Calendar, RSVP Status)

**Fields**:
- **Quick Add** (NL input) - optional, triggers parsing + expand, Clear button positioned to the right
- **Title** *required*
- **Description** - **hidden by default in create mode** (inside Show More section)
- **Date** *required* (date picker, applies to start date)
- **Start Time** (time picker, hidden when all-day is checked)
- **End Time** (time picker, optional, hidden when all-day is checked)
- **All-day** (checkbox) → hides start/end time inputs when checked - **DEFAULT CHECKED**
  - When all-day is checked: start/end time inputs are hidden
  - When start/end time are auto-detected: all-day checkbox is unchecked and time inputs are displayed
- **Multi-day** (checkbox) → reveals End Date if checked - placed **above** dates section
- **Start/End Time** → displayed on **same line** (side by side in grid-cols-2)
- **Start Date / End Date** → displayed on **same line** (side by side in grid-cols-2, when multi-day)
- **End Date** (date picker, only if multi-day, applies to end date)
- **Location** (LocationSearch component)
- **Attendants** (uses AttendantSelector component):
  - Family members from families user is part of - **improved UI with cards**
  - Recent attendants: non-user attendants previously added
  - Manual entry for non-user attendants
  - Display chips for all attendants
  - **Beautiful card-based layout** in selector with avatars
- **Calendar selector** (only if 2+ calendars)
  - Uses CalendarSelector component
  - Shows calendar name with icon/color indicator
  - Dropdown with modern card-based layout
  - Displays calendar name and type (Personal/Family)
  - Highlights currently selected calendar
- **Description** (textarea, inside Show More in create mode, always visible in edit mode)

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
- **Date** (date picker, applies to start date)
- **Start Time** (time picker)
- **End Time** (time picker, optional)
- **Multi-day** (checkbox) → reveals End Date if checked
- **End Date** (date picker, only if multi-day)
- **Location** (LocationSearch component)
- **Description** (textarea)
- **Attendants**:
  - Family member selector (multi-select dropdown) - users in families that the user is a part of
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
- [x] Description hidden by default in create mode (Show More)
- [x] Start/End time on same line (grid-cols-2)
- [x] Start/End date on same line (grid-cols-2, multi-day)
- [x] Clear button moved next to NL input
- [x] Detected fields shown even when Show More collapsed
- [ ] Improve AttendantSelector UI (card-based layout)
- [ ] RSVP info section in Edit Event Modal
- [ ] EventModal shows RSVP details
- [ ] All modal functionality tested
