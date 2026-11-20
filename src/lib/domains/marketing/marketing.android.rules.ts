/**
 * The self-hosted F-Droid repo as the `/android` page sees it (issue #287).
 *
 * `src/lib/fdroid/published.json` is written by scripts/fdroid-publish.sh after
 * it verified the signed index; it is committed, so the fingerprint is public
 * and reviewable. Before the first publish it holds `fingerprint: null,
 * latest: null` and the page says "no release yet" instead of linking to files
 * that do not exist. The record is a parameter: reading the file is the page
 * load's job, and the file does not move (the release scripts write that path).
 *
 * Doc: ./README.md#invariants
 */

/** The shape of the committed `published.json`. */
export type PublishedRepo = {
	readonly fingerprint: string | null;
	readonly repoUrl: string;
	readonly latest: {
		readonly apk: string;
		readonly versionName: string;
		readonly versionCode: number;
		readonly sha256: string;
		readonly size: number;
		readonly publishedAt: string;
	} | null;
};

/** What the page renders; each part is null until there is something to link to. */
export type AndroidRelease = {
	readonly repoUrl: string;
	/** null until the owner's first publish */
	readonly repo: {
		readonly fingerprint: string;
		/** "07 E8 03 …" — for reading aloud / comparing by eye */
		readonly fingerprintGrouped: string;
		readonly addRepoLink: string;
		readonly qrUrl: string;
	} | null;
	readonly apk: {
		readonly url: string;
		readonly versionName: string;
		readonly sizeMb: string;
		readonly sha256: string;
	} | null;
};

const FINGERPRINT = /^[0-9A-F]{64}$/;

/**
 * `fdroidrepos://www.familyplanz.com/fdroid/repo?fingerprint=…`: opens the
 * F-Droid client's "add repository" screen with the key pinned. Throws for a
 * fingerprint that is not 64 hex digits (any case) or a repo that is not https.
 */
export function addRepoLink(repoUrl: string, fingerprint: string): string {
	const fp = fingerprint.toUpperCase();
	if (!FINGERPRINT.test(fp)) throw new Error(`not a SHA-256 fingerprint: ${fingerprint}`);
	const url = new URL(repoUrl);
	if (url.protocol !== 'https:') throw new Error(`repo must be https: ${repoUrl}`);
	return `fdroidrepos://${url.host}${url.pathname.replace(/\/+$/, '')}?fingerprint=${fp}`;
}

/** The fingerprint upper-cased in pairs separated by spaces, for comparing by eye. */
export function groupFingerprint(fingerprint: string): string {
	return (fingerprint.toUpperCase().match(/.{2}/g) ?? []).join(' ');
}

/**
 * The `/android` view model. No fingerprint: no repo and no APK ("coming
 * soon"). A fingerprint without a `latest` build: the repo links but no APK
 * button. Both: everything. A `latest` with no fingerprint shows nothing.
 */
export function androidRelease(published: PublishedRepo): AndroidRelease {
	const repoPath = new URL(published.repoUrl).pathname.replace(/\/+$/, '');
	const repo = published.fingerprint
		? {
				fingerprint: published.fingerprint.toUpperCase(),
				fingerprintGrouped: groupFingerprint(published.fingerprint),
				addRepoLink: addRepoLink(published.repoUrl, published.fingerprint),
				qrUrl: `${repoPath.replace(/\/repo$/, '')}/qr.svg`
			}
		: null;
	const apk =
		repo && published.latest
			? {
					url: `${repoPath}/${published.latest.apk}`,
					versionName: published.latest.versionName,
					sizeMb: (published.latest.size / 1_000_000).toFixed(1),
					sha256: published.latest.sha256
				}
			: null;
	return { repoUrl: published.repoUrl, repo, apk };
}
