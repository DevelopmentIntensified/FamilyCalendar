/**
 * THE repo's name hash (115): a charCode-sum with `hash << 5` mixing, shared
 * by every deterministic colour derivation from a NAME. One copy, so two
 * surfaces hatching a colour for the same name always land on the same one.
 *
 * Not a cryptographic hash and not meant to be: swatches over a small
 * palette, collisions permitted and disclosed, never prevented (096).
 */
export function hashName(name: string): number {
	let hash = 0;
	for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
	return hash;
}
