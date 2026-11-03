import { describe, it, expect } from 'vitest';
import { addRepoLink, androidRelease, groupFingerprint, type PublishedRepo } from './release';
import committed from './published.json';

const FP = '07E80321E4FDCC712E1E89B7F8532A180C951F698909A945E268930169164705';
const REPO = 'https://www.familyplanz.com/fdroid/repo';

const publishedFixture: PublishedRepo = {
	fingerprint: FP,
	repoUrl: REPO,
	latest: {
		apk: 'com.familyplanz.app_1001.apk',
		versionName: '0.1.1',
		versionCode: 1001,
		sha256: 'feeff9d281ab9c5c75e7ac53706cdba7eda96105ba940bd6014a05fbeecf546e',
		size: 2_740_192,
		publishedAt: '2026-11-03T02:30:20Z'
	}
};

describe('addRepoLink (#287)', () => {
	it('is the fdroidrepos:// deep link with the key pinned', () => {
		expect(addRepoLink(REPO, FP)).toBe(
			`fdroidrepos://www.familyplanz.com/fdroid/repo?fingerprint=${FP}`
		);
	});

	it('upper-cases the fingerprint and drops a trailing slash', () => {
		expect(addRepoLink(`${REPO}/`, FP.toLowerCase())).toBe(
			`fdroidrepos://www.familyplanz.com/fdroid/repo?fingerprint=${FP}`
		);
	});

	it('refuses anything that is not a SHA-256 fingerprint or an https repo', () => {
		expect(() => addRepoLink(REPO, 'AB:CD')).toThrow();
		expect(() => addRepoLink('http://www.familyplanz.com/fdroid/repo', FP)).toThrow();
	});
});

describe('androidRelease', () => {
	it('has no repo and no apk before the first publish', () => {
		expect(androidRelease({ fingerprint: null, repoUrl: REPO, latest: null })).toEqual({
			repoUrl: REPO,
			repo: null,
			apk: null
		});
	});

	it('points at the published files', () => {
		const r = androidRelease(publishedFixture);
		expect(r.repo?.qrUrl).toBe('/fdroid/qr.svg');
		expect(r.repo?.fingerprintGrouped).toBe(groupFingerprint(FP));
		expect(r.repo?.fingerprintGrouped.split(' ')).toHaveLength(32);
		expect(r.apk).toMatchObject({
			url: '/fdroid/repo/com.familyplanz.app_1001.apk',
			versionName: '0.1.1',
			sizeMb: '2.7'
		});
	});

	it('the committed published.json is well-formed (null placeholder or a real release)', () => {
		const r = androidRelease();
		expect(r.repoUrl).toBe(REPO);
		if (committed.fingerprint) expect(r.repo?.addRepoLink).toMatch(/^fdroidrepos:\/\//);
		else expect(r.apk).toBeNull();
	});
});
