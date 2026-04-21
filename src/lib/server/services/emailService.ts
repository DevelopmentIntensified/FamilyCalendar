import { sendEmail } from '$lib/utils/sendEmail';
import { NOREPLYEMAIL } from '$env/static/private';
import { getWaitlistConfirmationHtml } from '$lib/server/emails/waitlist-confirmation';

interface SendWaitlistConfirmationParams {
	email: string;
	name: string;
}

export async function sendWaitlistConfirmation({
	email,
	name
}: SendWaitlistConfirmationParams): Promise<{ success: boolean; error?: string }> {
	try {
		const html = getWaitlistConfirmationHtml({ name });

		const { success, error } = await sendEmail({
			to: email,
			from: NOREPLYEMAIL,
			subject: "You're on the list! Welcome to FamilyPlanner",
			html
		});

		if (!success) {
			const errorMessage = typeof error === 'string' ? error : 'Failed to send email';
			console.error('Failed to send waitlist confirmation email:', errorMessage);
			return { success: false, error: errorMessage };
		}

		return { success: true };
	} catch (err) {
		console.error('Error sending waitlist confirmation email:', err);
		return { success: false, error: 'Unexpected error' };
	}
}