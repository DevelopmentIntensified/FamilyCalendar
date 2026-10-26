/** PROTOTYPE (issue 208) — throwaway reflow variants for
 *  /calendar/dashboard. Shape-copied from DayDashboard.svelte's props so the
 *  variants read exactly the data the real band reads. Deleted with the
 *  prototype. */
import type { Event } from '$lib/types';
import type { GlanceEvent } from '../TodayGlanceCard.svelte';
import type { GroceryCardItem } from '../GroceriesCard.svelte';

export interface PrototypeProps {
	dateLabel: string;
	isToday: boolean;
	meId: string;
	familyId: string | null;
	dailyVerse: { reference: string; text: string; attribution?: string } | null;
	glance: { doneToday: number; openToday: number; weekStreak: number };
	dayEvents: GlanceEvent[];
	top3: {
		id: string;
		title: string;
		dueDate: string | null;
		priority: string;
		userId: string;
		assignedTo: string | null;
		assignmentStatus: string | null;
		assigneeFirstName?: string | null;
		assigneeLastName?: string | null;
	}[];
	familyTasks: {
		id: string;
		title: string;
		dueDate: string | null;
		completedAt: string | null;
		priority: string;
		assignedTo: string | null;
		assignmentStatus: string | null;
		userId: string;
		assigneeFirstName?: string | null;
		assigneeLastName?: string | null;
		creatorFirstName?: string | null;
	}[];
	familyMembers: { userId: string; firstName: string; lastName: string }[];
	kidsSchedule: {
		id: string;
		title: string;
		start: string;
		end: string | null;
		allDay: boolean;
		location: string | null;
		kids: { id: string; name: string }[];
	}[];
	completedToday: { id: string; title: string; completedAt: string | null }[];
	familyGroceries: GroceryCardItem[];
	mineGroceries: GroceryCardItem[];
	loadWarnings: string[];
	modules: Record<string, boolean>;
	/** The glance card's own click seam — variants that render glance rows wire it. */
	onEventClick?: (e: GlanceEvent) => void;
}

export const VARIANTS = ['A', 'B', 'C'] as const;
export type VariantKey = (typeof VARIANTS)[number];
