/**
 * The `/android` view model (#287): the three states of the page, the
 * `fdroidrepos://` deep link, the grouped fingerprint, and the committed
 * `published.json` the page reads. Expected values are the worked example of
 * the legacy `release.test.ts` / `page.ssr.test.ts`.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import committed from '$lib/fdroid/published.json';
import {
	addRepoLink,
	androidRelease,
	groupFingerprint,
	type AndroidRelease,
	type PublishedRepo
} from './marketing.android.rules';

const FP = '07E80321E4FDCC712E1E89B7F8532A180C951F698909A945E268930169164705';
const FP_GROUPED =
	'07 E8 03 21 E4 FD CC 71 2E 1E 89 B7 F8 53 2A 18 0C 95 1F 69 89 09 A9 45 E2 68 93 01 69 16 47 05';
const REPO = 'https://www.familyplanz.com/fdroid/repo';
const DEEP_LINK = `fdroidrepos://www.familyplanz.com/fdroid/repo?fingerprint=${FP}`;

const latest = {
	apk: 'com.familyplanz.app_1001.apk',
	versionName: '0.1.1',
	versionCode: 1001,
	sha256: 'feeff9d281ab9c5c75e7ac53706cdba7eda96105ba940bd6014a05fbeecf546e',
	size: 2_740_192,
	publishedAt: '2026-11-03T02:30:20Z'
};

const published: PublishedRepo = { fingerprint: FP, repoUrl: REPO, latest };

describe('addRepoLink (#287)', () => {
	it('is the fdroidrepos:// deep link with the key pinned', () => {
		expect(addRepoLink(REPO, FP)).toBe(DEEP_LINK);
	});

	it('upper-cases the fingerprint and drops a trailing slash', () => {
		expect(addRepoLink(`${REPO}/`, FP.toLowerCase())).toBe(DEEP_LINK);
	});

	it.each([
		{ why: 'a colon-separated fingerprint', repoUrl: REPO, fingerprint: 'AB:CD' },
		{ why: 'a 63-digit fingerprint', repoUrl: REPO, fingerprint: FP.slice(1) },
		{ why: 'a fingerprint with a non-hex digit', repoUrl: REPO, fingerprint: `G${FP.slice(1)}` },
		{
			why: 'a repo that is not https',
			repoUrl: 'http://www.familyplanz.com/fdroid/repo',
			fingerprint: FP
		}
	])('refuses $why', ({ repoUrl, fingerprint }) => {
		expect(() => addRepoLink(repoUrl, fingerprint)).toThrow();
	});
});

describe('groupFingerprint', () => {
	it('reads 32 pairs aloud, upper-cased', () => {
		expect(groupFingerprint(FP.toLowerCase())).toBe(FP_GROUPED);
	});
});

describe('androidRelease', () => {
	type Row = {
		readonly state: string;
		readonly input: PublishedRepo;
		readonly release: AndroidRelease;
	};

	const repo = {
		fingerprint: FP,
		fingerprintGrouped: FP_GROUPED,
		addRepoLink: DEEP_LINK,
		qrUrl: '/fdroid/qr.svg'
	};

	it.each<Row>([
		{
			state: 'before the first publish: coming soon, no links',
			input: { fingerprint: null, repoUrl: REPO, latest: null },
			release: { repoUrl: REPO, repo: null, apk: null }
		},
		{
			state: 'a repo with no APK listed: the deep link and fingerprint, no APK button',
			input: { ...published, latest: null },
			release: { repoUrl: REPO, repo, apk: null }
		},
		{
			state: 'a build with no fingerprint shows nothing',
			input: { ...published, fingerprint: null },
			release: { repoUrl: REPO, repo: null, apk: null }
		},
		{
			state: 'published: repo links, QR, and the APK with its size in MB',
			input: published,
			release: {
				repoUrl: REPO,
				repo,
				apk: {
					url: '/fdroid/repo/com.familyplanz.app_1001.apk',
					versionName: '0.1.1',
					sizeMb: '2.7',
					sha256: 'feeff9d281ab9c5c75e7ac53706cdba7eda96105ba940bd6014a05fbeecf546e'
				}
			}
		}
	])('$state', ({ input, release }) => {
		expect(androidRelease(input)).toEqual(release);
	});

	it('upper-cases a lower-case fingerprint', () => {
		const release = androidRelease({ ...published, fingerprint: FP.toLowerCase() });
		expect(release.repo?.fingerprint).toBe(FP);
	});

	it.each([
		{ repoUrl: REPO, qrUrl: '/fdroid/qr.svg', apkUrl: '/fdroid/repo/a.apk' },
		{ repoUrl: `${REPO}/`, qrUrl: '/fdroid/qr.svg', apkUrl: '/fdroid/repo/a.apk' },
		{ repoUrl: 'https://example.com/fd', qrUrl: '/fd/qr.svg', apkUrl: '/fd/a.apk' },
		{ repoUrl: 'https://example.com', qrUrl: '/qr.svg', apkUrl: '/a.apk' }
	])('serves the QR and APK next to the repo path of $repoUrl', ({ repoUrl, qrUrl, apkUrl }) => {
		const release = androidRelease({ ...published, repoUrl, latest: { ...latest, apk: 'a.apk' } });
		expect(release.repo?.qrUrl).toBe(qrUrl);
		expect(release.apk?.url).toBe(apkUrl);
	});

	it.each([
		{ size: 2_740_192, mb: '2.7' },
		{ size: 3_407_901, mb: '3.4' },
		{ size: 1_000_000, mb: '1.0' },
		{ size: 0, mb: '0.0' }
	])('prints $size bytes as $mb MB (decimal megabytes, one digit)', ({ size, mb }) => {
		const release = androidRelease({ ...published, latest: { ...latest, size } });
		expect(release.apk?.sizeMb).toBe(mb);
	});

	it('the committed published.json is well-formed (null placeholder or a real release)', () => {
		const release = androidRelease(committed);
		expect(release.repoUrl).toBe(REPO);
		if (committed.fingerprint) expect(release.repo?.addRepoLink).toMatch(/^fdroidrepos:\/\//);
		else expect(release.apk).toBeNull();
	});
});
