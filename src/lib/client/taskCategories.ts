import type { CategoryItem } from '$lib/utils/taskCategory';

/** Thin client for /api/task-categories (#280). Callers own optimistic
 * state + toasts; this owns the request and error text. */

export type CategoryResult<T> = ({ ok: true } & T) | { ok: false; status: number; error: string };

async function errorOf(res: Response): Promise<string> {
	const j = await res.json().catch(() => ({}));
	return typeof j?.error === 'string' && j.error ? j.error : "That didn't work. Try again.";
}

const NETWORK = { ok: false as const, status: 0, error: 'Network problem. Try again.' };

export async function renameTaskCategory(
	id: string,
	name: string
): Promise<CategoryResult<{ category: CategoryItem }>> {
	try {
		const res = await fetch(`/api/task-categories/${encodeURIComponent(id)}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name })
		});
		if (!res.ok) return { ok: false, status: res.status, error: await errorOf(res) };
		const j = await res.json();
		return { ok: true, category: j.category };
	} catch {
		return NETWORK;
	}
}

export async function deleteTaskCategory(id: string): Promise<CategoryResult<object>> {
	try {
		const res = await fetch(`/api/task-categories/${encodeURIComponent(id)}`, {
			method: 'DELETE'
		});
		if (!res.ok) return { ok: false, status: res.status, error: await errorOf(res) };
		return { ok: true };
	} catch {
		return NETWORK;
	}
}
