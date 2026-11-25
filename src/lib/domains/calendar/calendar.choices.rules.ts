/**
 * The default-calendar picker's labels (Q-082 B). A calendar row stores no
 * name of its own: a personal calendar is "Personal Calendar" and a family
 * calendar carries its family's name, so two rows can share a label. The
 * picker must tell them apart, so a repeated label keeps its first row as is
 * and numbers the later ones in list order ("Personal Calendar",
 * "Personal Calendar 2", …).
 *
 * Doc: ./README.md#invariants
 */

/** The same labels in the same order, each repeat numbered from 2. */
export function calendarDistinctNames(names: readonly string[]): string[] {
	const seen = new Map<string, number>();
	return names.map((name) => {
		const count = (seen.get(name) ?? 0) + 1;
		seen.set(name, count);
		return count === 1 ? name : `${name} ${count}`;
	});
}
