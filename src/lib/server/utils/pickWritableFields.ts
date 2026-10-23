// #168: drops every key outside `fields`, so mass-assignment cannot reach the
// database even through a cast or a hand-rolled caller.
export function pickWritableFields<T extends object>(data: T, fields: readonly (keyof T)[]): T {
	const out: Partial<Record<keyof T, unknown>> = {};
	for (const field of fields) {
		if (data[field] !== undefined) {
			out[field] = data[field];
		}
	}
	return out as T;
}
