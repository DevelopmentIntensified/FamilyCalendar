export const PALETTE = [
	'bg-rose-100 text-rose-700',
	'bg-amber-100 text-amber-700',
	'bg-emerald-100 text-emerald-700',
	'bg-sky-100 text-sky-700',
	'bg-violet-100 text-violet-700',
	'bg-fuchsia-100 text-fuchsia-700',
	'bg-lime-100 text-lime-700',
	'bg-orange-100 text-orange-700'
];

export function avatarColor(id: string): string {
	let hash = 0;
	for (let i = 0; i < id.length; i++) hash += id.charCodeAt(i);
	return PALETTE[hash % PALETTE.length];
}
