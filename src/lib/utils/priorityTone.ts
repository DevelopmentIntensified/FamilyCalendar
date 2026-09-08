/** Shared priority + due-date tone mapping for task surfaces (tasks page, FamilyTaskBoardCard, TopPrioritiesCard). Single palette: low never outshouts normal. */
export type TaskPriority = 'high' | 'normal' | 'low';

export const PRIORITY_ORDER = ['low', 'normal', 'high'] as const;

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
	low: 'Low',
	normal: 'Normal',
	high: 'High'
};

/** Dot colors: high shouts, normal neutral, low muted (never outshouts normal). */
export const PRIORITY_DOT: Record<TaskPriority, string> = {
	high: 'bg-red-500',
	normal: 'bg-slate-300',
	low: 'bg-slate-200'
};

/** Label chip tones: high shouts, normal neutral, low muted. */
export function priorityTone(p: string): string {
	if (p === 'high') return 'bg-red-100 text-red-700';
	if (p === 'low') return 'bg-slate-100 text-slate-500';
	return 'bg-slate-100 text-slate-600';
}

export function priorityDot(p: string): string {
	if (p === 'high' || p === 'normal' || p === 'low') return PRIORITY_DOT[p];
	return PRIORITY_DOT.normal;
}

export function priorityLabel(p: string): string {
	if (p === 'high' || p === 'normal' || p === 'low') return PRIORITY_LABEL[p];
	return p;
}

/** Start-of-day boundary shared by all surfaces. */
export function startOfToday(): Date {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	return d;
}

export function isOverdue(due: string | null | undefined): boolean {
	if (!due) return false;
	const t = new Date(due).getTime();
	if (isNaN(t)) return false;
	return t < startOfToday().getTime();
}

function isToday(due: string): boolean {
	const t = new Date(due).getTime();
	if (isNaN(t)) return false;
	const start = startOfToday().getTime();
	const end = new Date();
	end.setHours(23, 59, 59, 999);
	return t >= start && t <= end.getTime();
}

/** Due chip tone: overdue red / today amber / else grey. '' when no due date. */
export function dueTone(due: string | null | undefined): string {
	if (!due) return '';
	if (isOverdue(due)) return 'bg-red-100 text-red-700';
	if (isToday(due)) return 'bg-amber-100 text-amber-700';
	return 'bg-slate-100 text-slate-600';
}
