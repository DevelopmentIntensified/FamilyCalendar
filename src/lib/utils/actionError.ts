export type ModalAction = 'create' | 'save' | 'duplicate' | 'delete';

const WHAT: Record<ModalAction, string> = {
	create: "Couldn't create the event",
	save: "Couldn't save your changes",
	duplicate: "Couldn't duplicate the event",
	delete: "Couldn't delete the event"
};

/**
 * The fallback the modals show when the server reply carries no message:
 * names what failed, and the next step follows the status (sign in on a
 * rejected session; a connection/VPN recheck otherwise; recheck the fields
 * on an unexplained 4xx).
 */
export function actionErrorCopy(
	action: ModalAction,
	serverMessage?: string | null,
	status?: number
): string {
	if (serverMessage) return serverMessage;
	const what = WHAT[action];
	if (status === 401 || status === 403) {
		return `${what}. Your session expired. Sign in, then try again.`;
	}
	if (status === undefined || status >= 500) {
		return `${what}. Check your connection (a VPN can block it), then try again.`;
	}
	return `${what}. Check the details you entered, then try again.`;
}
