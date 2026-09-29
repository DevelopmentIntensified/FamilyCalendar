/* ============================================================================
   Mock data for the non-calendar app pages, shaped like the real Drizzle
   schema (src/lib/server/db/schema.ts) and the real loaders.
   Where a field maps to a real column, the column is named in the comment —
   so a prototype can be checked against the model rather than guessed at.
   ========================================================================== */

/* ── users + familyMembers (schema.ts:18, :223) ─────────────────────────── */
export const FAMILY = { id: 'fam_hopper', name: 'The Hoppers', color: '#c45e38' };

export const MEMBERS = [
	{ id: 'u_jon',  firstName: 'Jon',   lastName: 'Hopper', initials: 'J', role: 'creator', memberType: 'parent',  email: 'jon@example.com',  tone: 'bg-[#FED5CF] text-[#c45e38]', tint: 'blush' },
	{ id: 'u_sarah',firstName: 'Sarah', lastName: 'Hopper', initials: 'S', role: 'admin',   memberType: 'parent',  email: 'sarah@example.com',tone: 'bg-[#BEDAE3] text-[#366d7e]', tint: 'blue' },
	{ id: 'u_mia',  firstName: 'Mia',   lastName: 'Hopper', initials: 'M', role: 'member', memberType: 'child',   email: 'mia@kids.example', tone: 'bg-[#C4E9DA] text-[#2d5866]', tint: 'mint' },
	{ id: 'u_eli',  firstName: 'Eli',   lastName: 'Hopper', initials: 'E', role: 'member', memberType: 'child',   email: 'eli@kids.example', tone: 'bg-[#F1B598] text-[#84412e]', tint: 'peach' }
];
export const byId = (id) => MEMBERS.find((m) => m.id === id) || MEMBERS[0];
export const nameOf = (id) => { const m = byId(id); return `${m.firstName} ${m.lastName}`; };

/* ── events (schema.ts:410) + eventAttendance (schema.ts:360) ───────────── */
export const ATTENDANCE = { going: 4, invited: 5, declined: 1, undecided: 0 };

export const DAY_EVENTS = [
	{ id: 'e1', title: 'Morning prayer',     start: '07:30', end: '08:30', cal: 'fam',   rsvp: 'going',  where: null },
	{ id: 'e2', title: 'School drop-off',    start: '08:00', end: '08:45', cal: 'school', rsvp: 'going',  where: 'Northside Elementary' },
	{ id: 'e3', title: 'Team standup',       start: '12:15', end: '13:00', cal: 'work',  rsvp: 'going',  where: null },
	{ id: 'e4', title: 'Piano — Eli',        start: '17:30', end: '18:30', cal: 'kids',  rsvp: 'maybe',  where: 'Lesson Room 2', attendance: { going: 2, invited: 3 } },
	{ id: 'e5', title: 'Dinner with Gran',   start: '19:00', end: '20:30', cal: 'fam',   rsvp: 'going',  where: "Nana's" }
];

/* ── tasks (schema.ts:525) + taskTags (schema.ts:689) ───────────────────── */
export const PRIORITY_TONE = { low: 's-muted', normal: 's-blue', high: 's-red' };
export const RECURRING_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };

let T = 0;
const task = (o) => ({ id: 't' + ++T, completedAt: null, archivedAt: null, assignmentStatus: 'none', priority: 'normal', visibility: 'public', tags: [], completionCount: 0, ...o });

export const TASKS = [
	task({ title: 'Sign Mia’s permission slip', due: 'Yesterday', overdue: true, assignedTo: 'u_jon', tags: ['school'], priority: 'high' }),
	task({ title: 'Book Eli’s t-ball jersey',   due: 'Today 3:00 PM', assignedTo: 'u_jon', tags: ['kids', 'shopping'] }),
	task({ title: 'Order Mia’s birthday cake', due: 'Friday',     assignedTo: 'u_sarah', tags: ['kids'] }),
	task({ title: 'Renew car registration',     due: 'Next week',  assignedTo: 'u_jon', tags: ['admin'], recurrence: 'yearly' }),
	task({ title: 'Return library books',       due: 'Next week',  assignedTo: 'u_sarah', tags: ['errands'] }),
	task({ title: 'Choir costume order',       due: 'Later',      assignedTo: 'u_sarah', tags: ['kids'], recurrence: 'monthly', completionCount: 3 }),
	task({ title: 'Plan Memorial Day picnic',  due: 'Later',      assignedTo: null, tags: ['family'], priority: 'low' }),
	task({ title: 'Photo day forms',           due: 'In 2 weeks', assignedTo: 'u_sarah', tags: ['school'] }),
	task({ title: 'Take Mia to the dentist',   due: 'Completed today', completedAt: '08:10', assignedTo: 'u_jon', tags: ['health'] }),
	task({ title: 'Weekly meal plan',          due: 'Completed today', completedAt: '07:45', assignedTo: 'u_sarah', tags: ['home'], recurrence: 'weekly', completionCount: 12 }),
	task({ title: 'Pay the electricity bill',  due: 'Completed today', completedAt: '06:30', assignedTo: 'u_jon', tags: ['admin'], recurrence: 'monthly', completionCount: 7 })
];

export const ASSIGNMENT_INBOX = [
	{ id: 'a1', title: 'Book the climbing wall for Mia’s birthday', from: 'u_sarah', assignmentStatus: 'pending', due: 'This week' },
	{ id: 'a2', title: 'Order Eli’s school shoes',                from: 'u_jon',   assignmentStatus: 'pending', due: 'Next week' },
	{ id: 'a3', title: 'Chaperone the field trip',                from: 'u_jon',   assignmentStatus: 'pending', due: 'Friday' }
];

export const SENT_REQUESTS = [
	{ id: 'r1', title: 'Collect the school forms', to: 'u_jon', status: 'pending' },
	{ id: 'r2', title: 'Fix the bike brake',       to: 'u_sarah', status: 'accepted' },
	{ id: 'r3', title: 'Call the dentist',        to: 'u_sarah', status: 'declined' }
];

export const STATS = {
	streak: { weeks: 6, best: 11, frozen: false },
	completed: 23, recurring: 7,
	mostAssignedTo: [
		{ who: 'u_jon',   count: 14 },
		{ who: 'u_sarah', count: 9 },
		{ who: 'u_mia',   count: 4 },
		{ who: 'u_eli',   count: 3 }
	],
	mostAssignedBy: [
		{ who: 'u_sarah', count: 12 },
		{ who: 'u_jon',   count: 8 }
	],
	recentlyCompleted: [
		{ title: 'Take Mia to the dentist', when: 'Today 08:10', recurring: false },
		{ title: 'Weekly meal plan',        when: 'Today 07:45', recurring: true },
		{ title: 'Pay the electricity bill', when: 'Today 06:30', recurring: true },
		{ title: 'Sign the school form',     when: 'Yesterday',   recurring: false }
	]
};

/* ── grocery_items (schema.ts:890) + grocery_store_memory (schema.ts:915) ──
   There is no grocery-LIST entity. Scope is `family_id` null = Mine, set =
   Family. That is why the page has two tabs and not two lists. */
export const GROCERIES = {
	family: [
		{ id: 'g1', name: 'Whole milk',        qty: 2, stores: ['Northside Market', 'Costco'],        checked: false },
		{ id: 'g2', name: 'Sourdough',         qty: 1, stores: ['Corner Bakery'],                    checked: false },
		{ id: 'g3', name: 'Eggs',              qty: 2, stores: ['Northside Market', 'Costco', 'Aldi'], checked: false },
		{ id: 'g4', name: 'Free-range chicken',qty: 1, stores: ['Northside Market'],                checked: true },
		{ id: 'g5', name: 'Lemons',            qty: 4, stores: ['Northside Market', 'Trader Joe’s'], checked: false },
		{ id: 'g6', name: 'Coffee beans',      qty: 1, stores: ['Costco'],                           checked: false },
		{ id: 'g7', name: 'Dishwasher tablets',qty: 1, stores: ['Target'],                           checked: false }
	],
	mine: [
		{ id: 'g8',  name: 'Oat milk',       qty: 1, stores: ['Costco'],   checked: false },
		{ id: 'g9',  name: 'Granola',        qty: 1, stores: ['Trader Joe’s'], checked: false },
		{ id: 'g10', name: 'Lunch for work', qty: 1, stores: ['Corner Deli'], checked: false }
	]
};

/* ── notifications (schema.ts:733) ─────────────────────────────────────── */
export const NOTIF_TYPES = {
	assignment_pending:  { label: 'Asked you',        tone: 'blue' },
	assignment_accepted: { label: 'Accepted',         tone: 'mint' },
	assignment_declined: { label: 'Declined',         tone: 'red' },
	task_completed:      { label: 'Completed',        tone: 'mint' },
	added_to_family:     { label: 'Added to family',  tone: 'peach' }
};

export const NOTIFICATIONS = [
	{ id: 'n1', type: 'task_completed',      actorName: 'Sarah',      message: 'completed “Weekly meal plan”',        when: '12 min ago', read: false, link: '/calendar/tasks' },
	{ id: 'n2', type: 'assignment_pending',  actorName: 'Sarah',      message: 'asked you to book the climbing wall', when: '1 hr ago',  read: false, link: '/calendar/tasks' },
	{ id: 'n3', type: 'added_to_family',     actorName: 'Jon',        message: 'added Eli to the Hopper family',     when: 'Yesterday', read: true,  link: '/family/fam_hopper' },
	{ id: 'n4', type: 'assignment_accepted', actorName: 'Mia',        message: 'accepted “Take the bins out”',       when: 'Yesterday', read: true,  link: '/calendar/tasks' },
	{ id: 'n5', type: 'assignment_declined', actorName: 'Jon',        message: 'declined the school forms',          when: '2 days ago', read: true,  link: '/calendar/tasks' },
	{ id: 'n6', type: 'task_completed',      actorName: 'Eli',        message: 'completed “Tidy the toys”',          when: '3 days ago', read: true,  link: '/calendar/tasks' }
];

/* ── familyInviteCodes (schema.ts:244) ──────────────────────────────────── */
export const INVITE = {
	code: 'HOP-4K2X',
	url: 'https://familyplanz.com/family/join/HOP-4K2X',
	expiresAt: 'in 6 days', maxUses: 5, useCount: 2, createdBy: 'u_jon'
};

/* ── dashboardModuleSwitches (schema.ts:306) + dashboardModules.ts ────────
   A row only exists when the module is switched OFF, so an empty table means
   "everything on". `meals` is listed but its card is not mounted anywhere. */
export const DASHBOARD_MODULES = [
	{ id: 'verse',         label: 'Daily verse',   scope: 'personal', enabled: true,  live: true },
	{ id: 'glance',        label: 'Today at a glance', scope: 'personal', enabled: true, live: true },
	{ id: 'top3',          label: 'Top 3 priorities',  scope: 'personal', enabled: true, live: true },
	{ id: 'completed',     label: 'Completed today',  scope: 'personal', enabled: true, live: true },
	{ id: 'board',         label: 'Family task board',scope: 'family',   enabled: true,  live: true },
	{ id: 'memberStrip',   label: 'Member strip',    scope: 'family',   enabled: true,  live: true },
	{ id: 'kids',          label: 'Kids’ schedule', scope: 'family',   enabled: true,  live: true },
	{ id: 'meals',         label: 'Meals',          scope: 'family',   enabled: false, live: false }
];

export const KIDS_SCHEDULE = [
	{ kid: 'u_mia', items: [
		{ what: 'Soccer practice',   when: '16:30 – 17:15', where: 'Riverside Fields' },
		{ what: 'Art class',         when: '17:30 – 18:30', where: 'Community Centre' }
	] },
	{ kid: 'u_eli', items: [
		{ what: 't-ball',            when: '16:45 – 17:30', where: 'Riverside Fields' },
		{ what: 'Piano',             when: '17:30 – 18:30', where: 'Lesson Room 2' }
	] }
];

export const FAMILY_ACTIVITY = [
	{ who: 'u_sarah', what: 'completed “Weekly meal plan”',   when: '12 min ago' },
	{ who: 'u_jon',   what: 'added Eli to the family',        when: 'Yesterday' },
	{ who: 'u_mia',   what: 'accepted “Take the bins out”',  when: 'Yesterday' },
	{ who: 'u_sarah', what: 'created the family calendar',   when: '12 Mar' }
];

/* ── archive (events older than subscriptionTypes.retentionViewDays) ───── */
export const ARCHIVE = [
	{ title: 'Thanksgiving at Nana’s',  date: '28 Nov 2025', cal: 'fam',   where: 'Nana’s' },
	{ title: 'Eli — first football',   date: '14 Sep 2025', cal: 'kids',  where: 'Riverside Fields' },
	{ title: 'School — parents evening', date: '2 Oct 2025', cal: 'school', where: 'Northside Elementary' },
	{ title: 'Dentist — Mia',          date: '19 Aug 2025', cal: 'school', where: 'Bright Smiles' }
];

/* ── the plan (subscriptionTypes, schema.ts:156) ───────────────────────── */
export const PLAN = {
	name: 'Family', tierName: 'family',
	familyLimit: 3, memberLimit: 8, retentionViewDays: 365, archivedRetentionDays: 730,
	attachmentLimitBytes: 26214400, aiEventCreationsPerMonth: 100, exportImportEnabled: true
};
export const USAGE = { aiUsed: 23, aiLimit: PLAN.aiEventCreationsPerMonth, families: 1, familyLimit: PLAN.familyLimit };

/* ============================================================================
   The data model, as a browsable reference.

   39 tables in src/lib/server/db/schema.ts. Each lists its columns, the
   relationships, roughly how many rows a real family has, and which pages
   read and write it. Built from the schema, not invented.
   ========================================================================== */
export const MODEL_GROUPS = [
	{
		id: 'people', label: 'People & access', tone: 'blush',
		tables: [
			{ name: 'users', rows: '2–6 per family', purpose: 'One row per person, including anonymous guests.',
				cols: ['id text PK', 'firstName, lastName', 'email text UNIQUE (nullable)', 'passwordHash (nullable)', 'emailVerified bool', 'roles json[]', 'lastActiveAt, lastLogin', 'picture · phonenumber · phonenumberVerified (write-only)'],
				used: 'Every page' },
			{ name: 'userSettings', rows: 'exactly 1 per user', purpose: 'Per-user preferences: week start, timezone, colour, ad consent, hidden dashboard modules, default view.',
				cols: ['userId FK→users', 'weekStart', 'timeZone', 'color', 'syncEventsToFamilyCalendar', 'showAdsAsEvents · showAdMarkers · personalizedAds', 'autoParseEventDetails', 'useCloudAI · useLocalAI', 'showDailyVerse · verseTranslation', 'hiddenDashboardModules text[]', 'defaultCalendarId FK', 'defaultView'],
				used: 'layout (every page) · /account' },
			{ name: 'familyMembers', rows: '2–8 per family', purpose: 'The join table — but it also carries permission (role) and profile label (memberType).',
				cols: ['user_id + family_id  COMPOSITE PK', 'role: creator | admin | member', 'memberType: parent | child | member'],
				used: 'Dashboard · Tasks · Family · Calendar' },
			{ name: 'families', rows: '1 per family', purpose: 'The family unit.',
				cols: ['id PK', 'name', 'color'], used: 'Family · Calendar (colour) · Groceries' },
			{ name: 'sessions', rows: '1–5 per user', purpose: 'Auth sessions, one per device.',
				cols: ['id PK', 'userId FK', 'expiresAt'], used: 'login / logout' },
			{ name: 'accounts', rows: '0–1 per user', purpose: 'OAuth / credential links.',
				cols: ['provider + providerAccountId  COMPOSITE PK', 'userId FK', 'token fields'], used: 'login / signup' },
			{ name: 'codes', rows: '0–3 transient', purpose: 'Email verification and password-reset codes.',
				cols: ['code PK UNIQUE', 'expiresAt', 'email', 'type', 'pendingEmail'], used: 'login · /account' }
		]
	},
	{
		id: 'calendar', label: 'Calendar', tone: 'blue',
		tables: [
			{ name: 'calendars', rows: '1 personal per user + 1 per family', purpose: 'Container that events belong to. A calendar is owned by a user OR a family.',
				cols: ['id PK', 'owner_id FK→users (nullable)', 'family_id FK→families (nullable)', 'created_at'],
				used: 'Calendar · Event detail · Import · Print · Archive' },
			{ name: 'events', rows: '50–400 per family/yr', purpose: 'Calendar entries. A recurring series is ONE row, expanded in memory.',
				cols: ['id PK', 'calendar_id FK', 'owner_id FK', 'title', 'start', 'end (nullable)', 'all_day', 'description · location', 'recurrence_frequency · interval · by_day · count · until', 'reminder_minutes', 'mirror_of FK→events (self)'],
				used: 'Calendar · Dashboard · Event detail · Print · Archive' },
			{ name: 'eventExceptions', rows: '0–5 per recurring event', purpose: 'Per-occurrence edits and cancellations on a series.',
				cols: ['id PK', 'event_id FK', 'original_date', 'is_cancelled', 'title · description · location', 'start · end · all_day'],
				used: 'Calendar (NOT Archive — see findings)' },
			{ name: 'eventAttendance', rows: '~10–40 per family/yr', purpose: 'One RSVP row per person (or named guest) per event.',
				cols: ['id PK', 'event_id FK', 'user_id FK (nullable)', 'name (nullable, non-user guest)', 'status: going | maybe | declined | undecided', 'invite_type: required | optional'],
				used: 'Calendar · Dashboard · Event detail' }
		]
	},
	{
		id: 'tasks', label: 'Tasks', tone: 'mint',
		tables: [
			{ name: 'tasks', rows: '20–150 open per family', purpose: 'One row per logical task. Recurrence is a CURSOR — completing advances dueDate, so completedAt is not history.',
				cols: ['id PK', 'title', 'notes', 'due_date', 'completed_at', 'archived_at', 'recurrence_frequency · interval', 'completion_count', 'assigned_to FK (set null)', 'assignment_status: none | pending | accepted | declined', 'priority: low | normal | high', 'visibility: public | private', 'user_id FK', 'family_id FK (nullable)', 'event_id FK (nullable)'],
				used: 'Dashboard · Tasks · Family tasks' },
			{ name: 'taskCompletions', rows: '200–2000 per family/yr', purpose: 'IMMUTABLE check-off history. Exists only because the cursor overwrites completed_at. This is what powers streaks and stats.',
				cols: ['id PK', 'taskId FK', 'userId FK  (who it was for)', 'actorId FK (nullable, who did it)', 'familyId FK (nullable)', 'completedAt'],
				used: 'Dashboard · Stats' },
			{ name: 'taskTags', rows: '0–5 per task', purpose: 'Freeform labels, lowercased and deduped.',
				cols: ['taskId + name  COMPOSITE PK', 'name'], used: 'Tasks' }
		]
	},
	{
		id: 'groceries', label: 'Groceries', tone: 'peach',
		tables: [
			{ name: 'groceryItems', rows: '10–40 open per family', purpose: 'THE WHOLE FEATURE IS ONE TABLE. There is no grocery-list entity — the "list" is a scope: family_id NULL = Mine, family_id SET = Family. That is why the page has two tabs, not two lists.',
				cols: ['id PK', 'user_id FK', 'family_id FK (NULL = Mine)', 'name', 'name_key (normalised)', 'quantity int', 'stores text[] (ordered, [0] primary, rest alternates)', 'checked_at (set = hidden)', 'created_at'],
				used: 'Groceries' },
			{ name: 'groceryStoreMemory', rows: '0–200 per family', purpose: 'Learned item → store mapping, so the store field is a suggestion not a question.',
				cols: ['id PK', 'user_id FK', 'family_id FK (nullable)', 'name_key', 'store', 'count', 'updated_at'],
				used: 'Groceries' }
		]
	},
	{
		id: 'comms', label: 'Notifications & money', tone: 'lav',
		tables: [
			{ name: 'notifications', rows: '5–100 per user/yr', purpose: 'In-app alerts plus web-push fan-out. Never pruned.',
				cols: ['id PK', 'userId FK', 'type: assignment_pending | assignment_accepted | assignment_declined | task_completed | added_to_family', 'actorName', 'message', 'link (navigates on click)', 'readAt (null = unread)', 'createdAt'],
				used: 'Notifications · Navbar bell · Bottom nav badge' },
			{ name: 'subscriptionTypes', rows: '~3–6 site-wide', purpose: 'The plan catalogue. Entitlements are read from here everywhere.',
				cols: ['id PK', 'name · tierName', 'planType', 'durationMonths', 'enabled', 'familyLimit · memberLimit', 'retentionViewDays · archivedRetentionDays', 'attachmentLimitBytes', 'aiEventCreationsPerMonth', 'exportImportEnabled'],
				used: '/account · Archive gate · Family create' },
			{ name: 'subscriptions', rows: '0–1 per paying user', purpose: 'A user’s active plan, with per-user overrides of every limit.',
				cols: ['id PK', 'userId FK', 'startDate · endDate', 'notificationMethods jsonb', 'subscriptionTypeId FK', 'familyLimitOverride · memberLimitOverride · retentionViewDaysOverride · archivedRetentionDaysOverride · attachmentLimitBytesOverride'],
				used: '/account · Archive' },
			{ name: 'pushSubscriptions', rows: '1–3 per user', purpose: 'Web-push device subscriptions.',
				cols: ['id PK', 'userId FK', 'endpoint UNIQUE', 'p256dh · auth'], used: 'push settings' }
		]
	},
	{
		id: 'parked', label: 'Parked & orphaned', tone: 'red',
		tables: [
			{ name: 'meals', rows: '0–4 per day per family', purpose: 'PARKED. Table, actions, /api/meals and MealsCard.svelte all exist — but MealsCard is imported by nothing except its own test, and no loader ever reads meals. Yet /account still shows a Meals toggle that switches nothing.',
				cols: ['id PK', 'familyId FK', 'date (YYYY-MM-DD day key)', 'kind: breakfast | lunch | dinner | snack', 'label', 'createdBy FK'],
				used: 'NOTHING — half-wired' },
			{ name: 'bills · receiptItems · itemTags', rows: 'n/a', purpose: 'PARKED. The whole money subsystem lives in _attic/ but the tables are still declared and migrated, with zero readers. The changelog still advertises “Scan receipts” and “Mark bills paid” to users.',
				cols: ['bills: amount_cents, due_date, category, paid_at, frequency, source', 'receiptItems: billId, price_cents, category', 'itemTags: key, category, weight'],
				used: 'NOTHING — advertised but dead' },
			{ name: 'groups · userGroups · familyGroups', rows: '0, always', purpose: 'ORPHANED. Three tables declared in the schema with zero references anywhere in src/.',
				cols: ['groups: id, color, created_at', 'userGroups: group_id + user_id', 'familyGroups: group_id + family_id'],
				used: 'NOTHING' },
			{ name: 'adEvents', rows: '0–20/month site-wide', purpose: 'Sponsored “events” shown on the grid. The ad gate is ONE field — userSettings.showAdsAsEvents, default false. The duplicate userAdConsent table is gone (#088).',
				cols: ['adEvents: sponsorName, message, ctaText, scheduledFor, impressions, clicks, conversions', 'userSettings.showAdsAsEvents (the only ad control)'],
				used: 'Calendar · /account' },
			{ name: 'waitlist · unmatchedPhrases · bugReports', rows: 'site-wide', purpose: 'Growth + ops. waitlist.email has NO unique index, so the onConflictDoNothing duplicate guard never fires and duplicate emails insert.',
				cols: ['waitlist: email (no unique!), status, region, preferences', 'unmatchedPhrases: source, phrase, sample, count, resolved', 'bugReports: area, description, status, resolvedAt'],
				used: '/waitlist · /admin · /report-bug' }
		]
	},
	{
		id: 'ops', label: 'Ops & plumbing', tone: 'slate',
		tables: [
			{ name: 'familyInviteCodes', rows: '0–2 per family', purpose: 'A join code. THE ONLY way a second adult gets in — there is no share-a-link-to-join flow, so this table is load-bearing for growth and easy to break.',
				cols: ['id PK', 'familyId FK', 'code UNIQUE', 'createdById FK', 'expiresAt', 'maxUses', 'useCount'],
				used: 'Family · Invitations · /family/join/[code]' },
			{ name: 'dashboardModuleSwitches', rows: '0–8 per user', purpose: 'A row exists only when a module is switched OFF, so an EMPTY table means everything on. Counter-intuitive, and it is why the Meals toggle still appears.',
				cols: ['id PK', 'userId FK', 'moduleId', 'familyId FK (nullable)'],
				used: 'Dashboard loader · /account' },
			{ name: 'claimTokens', rows: '0–1 per guest', purpose: 'How an anonymous account is CLAIMED: a guest builds a family, then claims it with an email. The token is the only thing standing between a throwaway account and a real family.',
				cols: ['id PK', 'token UNIQUE', 'userId FK', 'familyId FK (nullable)', 'expiresAt', 'usedAt'],
				used: '/claim · /account#claim' },
			{ name: 'apiTokens', rows: '0–5 per user', purpose: 'Personal API tokens. Hash only, never stored raw. Lives in Ops rather than Comms because nothing in the UI writes it.',
				cols: ['id PK', 'userId FK', 'name', 'tokenHash UNIQUE', 'lastUsedAt'],
				used: '/account#api' },
			{ name: 'discounts · userDiscounts', rows: '0–5 active site-wide', purpose: 'Coupon pricing. discounts defines the code, userDiscounts records who redeemed it.',
				cols: ['discounts: code UNIQUE, percentOff / amountOff, maxUses, usedCount, expiresAt, active', 'userDiscounts: userId + discountId, redeemedAt'],
				used: 'checkout · /account' },
			{ name: 'aiUsageTracking', rows: '0–100 per user/month', purpose: 'Counts AI event creations against the plan allowance. Quota is read from subscriptionTypes, not from a plan column on the user.',
				cols: ['id PK', 'userId FK', 'action: event_creation | parse | classify', 'createdAt'],
				used: 'AI creation path · /account usage' }
		]
	}
];

/* ── shared formatting ─────────────────────────────────────────────────── */
export const groupBy = (rows, key) => rows.reduce((acc, r) => {
	const k = typeof key === 'function' ? key(r) : r[key];
	(acc[k] = acc[k] || []).push(r);
	return acc;
}, {});

export const plural = (n, s, p) => `${n} ${n === 1 ? s : p || s + 's'}`;
