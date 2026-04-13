/**
 * @param {Request} request
 * @returns {Promise<Response>}
 */
import { Resend } from 'resend';
import { RESEND_API_KEY } from '$env/static/private';
const resend = new Resend(RESEND_API_KEY);

export const sendEmail = async (data: { to; from; subject; html }) => {
	const res = await resend.emails.send(data);

	if (!res.error) {
		return { success: true, error: undefined, data: res.data };
	} else {
		return { success: false, error: res.error };
	}
};
