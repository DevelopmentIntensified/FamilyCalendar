// web-push ships no types. Declared to match `WebPushTransport` in
// pushTransport.server.ts so its static import (required for Vercel file
// tracing to bundle the package) type-checks. The legacy
// `services/web-push.d.ts` declaration went with `services/pushService.ts`.
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
