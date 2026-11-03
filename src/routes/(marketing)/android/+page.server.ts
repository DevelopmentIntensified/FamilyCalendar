import type { PageServerLoad } from './$types';
import { androidRelease } from '$lib/fdroid/release';

export const load: PageServerLoad = () => ({ release: androidRelease() });
