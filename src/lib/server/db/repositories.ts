import { db } from '$lib/server/db';
import { calendars, events, eventAttendance, type Calendar, type CalendarEvent } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export class CalendarRepository {
	async findAll(): Promise<Calendar[]> {
		return db.select().from(calendars);
	}

	async findById(id: string): Promise<Calendar | undefined> {
		const [calendar] = await db.select().from(calendars).where(eq(calendars.id, id));
		return calendar;
	}

	async findByOwner(userId: string): Promise<Calendar | undefined> {
		const [calendar] = await db.select().from(calendars).where(eq(calendars.ownerId, userId));
		return calendar;
	}

	async findOrCreateForOwner(userId: string): Promise<Calendar> {
		let calendar = await this.findByOwner(userId);
		if (!calendar) {
			const [created] = await db.insert(calendars).values({ ownerId: userId }).returning();
			calendar = created;
		}
		return calendar;
	}

	async create(data: typeof calendars.$inferInsert): Promise<Calendar> {
		const [created] = await db.insert(calendars).values(data).returning();
		return created;
	}

	async update(id: string, data: Partial<Omit<Calendar, 'id' | 'createdAt'>>): Promise<Calendar | undefined> {
		const [updated] = await db.update(calendars).set(data).where(eq(calendars.id, id)).returning();
		return updated;
	}

	async delete(id: string): Promise<Calendar | undefined> {
		const [deleted] = await db.delete(calendars).where(eq(calendars.id, id)).returning();
		return deleted;
	}
}

export class EventRepository {
	async findAll(): Promise<CalendarEvent[]> {
		return db.select().from(events).orderBy(events.start);
	}

	async findById(id: string): Promise<CalendarEvent | undefined> {
		const [event] = await db.select().from(events).where(eq(events.id, id));
		return event;
	}

	async create(data: Omit<CalendarEvent, 'id' | 'created_at'>, ownerId: string): Promise<CalendarEvent | undefined> {
		const [created] = await db.insert(events).values(data).returning();
		if (created && ownerId) {
			await this.autoRsvpCreator(created.id, ownerId);
		}
		return created;
	}

	async update(id: string, data: Partial<Omit<CalendarEvent, 'id'>>): Promise<CalendarEvent | undefined> {
		const [updated] = await db.update(events).set(data).where(eq(events.id, id)).returning();
		return updated;
	}

	async delete(id: string): Promise<void> {
		await db.delete(events).where(eq(events.id, id));
	}

	async upsertRsvp(eventId: string, userId: string, status: 'going' | 'maybe' | 'declined' | 'undecided'): Promise<void> {
		const existing = await db
			.select()
			.from(eventAttendance)
			.where(and(eq(eventAttendance.eventId, eventId), eq(eventAttendance.userId, userId)));

		if (existing.length > 0) {
			await db
				.update(eventAttendance)
				.set({ status })
				.where(and(eq(eventAttendance.eventId, eventId), eq(eventAttendance.userId, userId)));
		} else {
			await db.insert(eventAttendance).values({ eventId, userId, status });
		}
	}

	async getRsvpStatus(eventId: string) {
		return db.select().from(eventAttendance).where(eq(eventAttendance.eventId, eventId));
	}

	async getUserRsvp(eventId: string, userId: string) {
		const [rsvp] = await db
			.select()
			.from(eventAttendance)
			.where(and(eq(eventAttendance.eventId, eventId), eq(eventAttendance.userId, userId)));
		return rsvp;
	}

	private async autoRsvpCreator(eventId: string, userId: string): Promise<void> {
		await db.insert(eventAttendance).values({ eventId, userId, status: 'going' });
	}
}
