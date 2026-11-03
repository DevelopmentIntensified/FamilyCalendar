import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import AndroidPage from './+page.svelte';
import { androidRelease, type PublishedRepo } from '$lib/fdroid/release';

/** #287: /android is SSR'd from published.json; it must render before the
 *  owner's first publish (placeholder) and after it (links + fingerprint). */
const FP = '07E80321E4FDCC712E1E89B7F8532A180C951F698909A945E268930169164705';
const publishedFixture: PublishedRepo = {
	fingerprint: FP,
	repoUrl: 'https://www.familyplanz.com/fdroid/repo',
	latest: {
		apk: 'com.familyplanz.app_1001.apk',
		versionName: '0.1.1',
		versionCode: 1001,
		sha256: 'feeff9d281ab9c5c75e7ac53706cdba7eda96105ba940bd6014a05fbeecf546e',
		size: 2_740_192,
		publishedAt: '2026-11-03T02:30:20Z'
	}
};

describe('/android SSR (#287)', () => {
	it('renders "coming soon" and no download/F-Droid links before the first publish', () => {
		const release = androidRelease({
			fingerprint: null,
			repoUrl: 'https://www.familyplanz.com/fdroid/repo',
			latest: null
		});
		const { body } = render(AndroidPage, { props: { data: { release } } });
		expect(body).toContain('data-testid="no-release"');
		expect(body).not.toContain('download-apk');
		expect(body).not.toContain('fdroidrepos://');
		expect(body).not.toContain('/fdroid/qr.svg');
	});

	it('renders the APK button, deep link, QR and fingerprint once published', () => {
		const release = androidRelease(publishedFixture);
		const { body } = render(AndroidPage, { props: { data: { release } } });
		expect(body).not.toContain('data-testid="no-release"');
		expect(body).toContain(`href="fdroidrepos://www.familyplanz.com/fdroid/repo?fingerprint=${FP}"`);
		expect(body).toContain('href="/fdroid/repo/com.familyplanz.app_1001.apk"');
		expect(body).toContain('src="/fdroid/qr.svg"');
		expect(body).toContain('07 E8 03 21');
		expect(body).toContain('Family Planz 0.1.1 (2.7 MB)');
	});

	it('hides the APK button when a repo exists but no APK is listed', () => {
		const release = androidRelease({ ...publishedFixture, latest: null });
		const { body } = render(AndroidPage, { props: { data: { release } } });
		expect(body).toContain('fdroidrepos://');
		expect(body).not.toContain('download-apk');
	});
});
