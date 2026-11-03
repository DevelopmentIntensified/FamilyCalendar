/**
 * The self-hosted F-Droid repo as the /android page sees it (issue #287).
 *
 * `published.json` is written by scripts/fdroid-publish.sh after it verified the
 * signed index; it is committed, so the fingerprint is public and reviewable.
 * Before the first publish it holds `fingerprint: null, latest: null` and the
 * page says "no release yet" instead of linking to files that do not exist.
 */
import published from './published.json';

export type PublishedRepo = {
	fingerprint: string | null;
	repoUrl: string;
	latest: {
		apk: string;
		versionName: string;
		versionCode: number;
		sha256: string;
		size: number;
		publishedAt: string;
	} | null;
};

export type AndroidRelease = {
	repoUrl: string;
	/** null until the owner's first publish */
	repo: {
		fingerprint: string;
		/** "07 E8 03 …" — for reading aloud / comparing by eye */
		fingerprintGrouped: string;
		addRepoLink: string;
		qrUrl: string;
	} | null;
	apk: {
		url: string;
		versionName: string;
		sizeMb: string;
		sha256: string;
	} | null;
};

const FINGERPRINT = /^[0-9A-F]{64}$/;

/** `fdroidrepos://www.familyplanz.com/fdroid/repo?fingerprint=…`: opens the F-Droid
 *  client's "add repository" screen with the key pinned. */
export function addRepoLink(repoUrl: string, fingerprint: string): string {
	const fp = fingerprint.toUpperCase();
	if (!FINGERPRINT.test(fp)) throw new Error(`not a SHA-256 fingerprint: ${fingerprint}`);
	const url = new URL(repoUrl);
	if (url.protocol !== 'https:') throw new Error(`repo must be https: ${repoUrl}`);
	return `fdroidrepos://${url.host}${url.pathname.replace(/\/+$/, '')}?fingerprint=${fp}`;
}

export function groupFingerprint(fingerprint: string): string {
	return (fingerprint.toUpperCase().match(/.{2}/g) ?? []).join(' ');
}

// SAFETY: published.json is written only by scripts/fdroid-publish.sh (via
// fdroid-verify.py) in exactly this shape; release.test.ts parses the committed file.
const committedRepo = published as PublishedRepo;

export function androidRelease(p: PublishedRepo = committedRepo): AndroidRelease {
	const repoPath = new URL(p.repoUrl).pathname.replace(/\/+$/, '');
	const repo = p.fingerprint
		? {
				fingerprint: p.fingerprint.toUpperCase(),
				fingerprintGrouped: groupFingerprint(p.fingerprint),
				addRepoLink: addRepoLink(p.repoUrl, p.fingerprint),
				qrUrl: `${repoPath.replace(/\/repo$/, '')}/qr.svg`
			}
		: null;
	const apk =
		repo && p.latest
			? {
					url: `${repoPath}/${p.latest.apk}`,
					versionName: p.latest.versionName,
					sizeMb: (p.latest.size / 1_000_000).toFixed(1),
					sha256: p.latest.sha256
				}
			: null;
	return { repoUrl: p.repoUrl, repo, apk };
}
