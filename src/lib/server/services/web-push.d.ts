// web-push ships no types. Declared to match the WebPushModule interface in
// pushService.ts so the static import (required for Vercel file tracing to
// bundle the package) type-checks.
declare module 'web-push' {
	const webpush: {
		sendNotification(
			subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
			payload?: string | null,
			options?: {
				vapidDetails?: { subject: string; publicKey: string; privateKey: string };
			}
		): Promise<void>;
	};
	export default webpush;
}
