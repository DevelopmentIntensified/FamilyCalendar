import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { calendars, events, families, familyMembers } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getUserSettings } from '$lib/server/db/actions/userSettings';
import { createUserCalendar } from '$lib/server/db/actions/calendar';
import { parseEvents, expandEventsForUser } from '$lib/server/services/eventDisplayService';

const MONTH_NAMES = [
	'January', 'February', 'March', 'April', 'May', 'June',
	'July', 'August', 'September', 'October', 'November', 'December'
];

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	const userId = event.locals.user.id;

	const now = new Date();
	const year = parseInt(event.url.searchParams.get('year') || '') || now.getFullYear();
	const month = Math.min(12, Math.max(1, parseInt(event.url.searchParams.get('month') || '') || now.getMonth() + 1));

	const userSettings = await getUserSettings(userId);
	const weekStart = userSettings?.weekStart === 'monday' ? 'monday' : 'sunday';
	const personalColor = userSettings?.color || '#fa8072';

	let userCalendar = await db.select().from(calendars).where(eq(calendars.ownerId, userId));
	if (userCalendar.length === 0) {
		await createUserCalendar(userId);
		userCalendar = await db.select().from(calendars).where(eq(calendars.ownerId, userId));
	}

	let familyColor = '#e0ffff';
	let familyName: string | null = null;
	const [member] = await db.select().from(familyMembers).where(eq(familyMembers.userId, userId));
	if (member?.familyId) {
		const [family] = await db.select().from(families).where(eq(families.id, member.familyId));
		familyName = family?.name ?? null;
		familyColor = family?.color || familyColor;
	}

	const rawEvents = userCalendar.length
		? await db.select().from(events).where(eq(events.calendarId, userCalendar[0].id)).orderBy(events.start)
		: [];

	// Family events appear on the fridge too.
	let familyRawEvents: typeof rawEvents = [];
	if (member?.familyId) {
		const famCals = await db.select().from(calendars).where(eq(calendars.familyId, member.familyId));
		if (famCals.length > 0) {
			familyRawEvents = await db
				.select()
				.from(events)
				.where(eq(events.calendarId, famCals[0].id))
				.orderBy(events.start);
		}
	}

	const colorByCalId = new Map<string, string>();
	if (userCalendar[0]) colorByCalId.set(userCalendar[0].id, personalColor);

	const displayEvents = [
		...parseEvents(await expandEventsForUser(rawEvents)).map((e) => ({
			...e,
			color: colorByCalId.get(String(e.calendarId)) || personalColor
		})),
		...parseEvents(await expandEventsForUser(familyRawEvents)).map((e) => ({ ...e, color: familyColor }))
	];

	// Build the 6x7 grid for the requested month.
	const firstOfMonth = new Date(year, month - 1, 1);
	const daysInMonth = new Date(year, month, 0).getDate();
	const offset = weekStart === 'monday' ? 1 : 0;
	const firstWeekday = (firstOfMonth.getDay() - offset + 7) % 7;
	const leading = firstWeekday;
	const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;

	type CellItem = { title: string; color: string; allDay: boolean };
	const grid: { day: number; iso: string; inMonth: boolean; isToday: boolean; items: CellItem[] }[] = [];

	const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

	for (let i = 0; i < totalCells; i++) {
		const cellDateNum = i - leading + 1;
		const cellDate = new Date(year, month - 1, cellDateNum);
		const iso = `${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(2, '0')}-${String(cellDate.getDate()).padStart(2, '0')}`;
		const inMonth = cellDate.getMonth() + 1 === month;

		const items: CellItem[] = displayEvents
			.filter((e) => {
				if (!e.date || !(e.date instanceof Date)) return false;
				return e.date.toDateString() === cellDate.toDateString();
			})
			.map((e) => ({
				title: String(e.title),
				color: String(e.color || personalColor),
				allDay: !!e.allDay
			}));

		grid.push({ day: cellDate.getDate(), iso, inMonth, isToday: iso === todayIso, items });
	}

	const prevMonth = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
	const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };

	return {
		year,
		month,
		monthName: MONTH_NAMES[month - 1],
		weekStart,
		familyName,
		grid,
		prev: prevMonth,
		next: nextMonth,
		isCurrentMonth: year === now.getFullYear() && month === now.getMonth() + 1
	};
};
