// TEST-ONLY in-memory TaskfocusSessionStore (#293). Never imported by
// runtime code. Mirrors the drizzle store's guards: user scoping, the
// `absorbed_at IS NULL` write guards, and the one-open-per-user index.

import type { TaskfocusSession } from '$lib/server/db/schema';
import type { TaskfocusSessionStore } from './taskfocusSessions';

export type MemoryStore = TaskfocusSessionStore & {
	rows: TaskfocusSession[];
	/** taskId -> user ids that can see it. */
	visible: Map<string, Set<string>>;
	grant(taskId: string, ...userIds: string[]): void;
};

export function memoryStore(): MemoryStore {
	const rows: TaskfocusSession[] = [];
	const visible = new Map<string, Set<string>>();
	let seq = 0;
	const find = (userId: string, id: string) => rows.find((r) => r.id === id && r.userId === userId);
	return {
		rows,
		visible,
		grant(taskId, ...userIds) {
			const set = visible.get(taskId) ?? new Set<string>();
			for (const u of userIds) set.add(u);
			visible.set(taskId, set);
		},
		async canSeeTask(userId, taskId) {
			return visible.get(taskId)?.has(userId) ?? false;
		},
		async findById(userId, id) {
			return find(userId, id);
		},
		async findOpen(userId) {
			return rows.find((r) => r.userId === userId && r.endedAt === null);
		},
		async insert(row) {
			if (row.endedAt === null && rows.some((r) => r.userId === row.userId && r.endedAt === null)) {
				return undefined;
			}
			const created: TaskfocusSession = {
				id: `s${++seq}`,
				source: 'phone',
				absorbedAt: null,
				createdAt: new Date('2026-11-03T12:00:00Z'),
				...row
			};
			rows.push(created);
			return created;
		},
		async setEndedAt(userId, id, endedAt) {
			const r = find(userId, id);
			if (!r || r.absorbedAt) return undefined;
			r.endedAt = endedAt;
			return r;
		},
		async deleteUnabsorbed(userId, id) {
			const i = rows.findIndex((r) => r.id === id && r.userId === userId && !r.absorbedAt);
			if (i < 0) return false;
			rows.splice(i, 1);
			return true;
		},
		async markAbsorbed(userId, id, at) {
			const r = find(userId, id);
			if (!r || r.absorbedAt || !r.endedAt) return undefined;
			r.absorbedAt = at;
			return r;
		},
		async listClosedUnabsorbed(userId, limit) {
			return rows
				.filter((r) => r.userId === userId && !r.absorbedAt && r.endedAt)
				.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime() || a.id.localeCompare(b.id))
				.slice(0, limit);
		},
		async listUnabsorbed(userId) {
			return rows.filter((r) => r.userId === userId && !r.absorbedAt);
		}
	};
}
