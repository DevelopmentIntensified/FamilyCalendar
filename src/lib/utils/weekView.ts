export function getEventTop(start: Date | string | undefined): number {
	if (!start) return 0;
	const d = typeof start === 'string' ? new Date(start) : start;
	return ((d.getHours() * 60 + d.getMinutes()) / (24 * 60)) * 100;
}

export function getEventHeight(start: Date | string | undefined, end: Date | string | undefined): number {
	if (!start) return 5;
	const startD = typeof start === 'string' ? new Date(start) : start;
	const startMin = startD.getHours() * 60 + startD.getMinutes();
	let endMin = startMin + 60;
	if (end) {
		const endD = typeof end === 'string' ? new Date(end) : end;
		endMin = endD.getHours() * 60 + endD.getMinutes();
		if (endMin <= startMin) endMin = startMin + 60;
	}
	return Math.max(((endMin - startMin) / (24 * 60)) * 100, 2.5);
}
