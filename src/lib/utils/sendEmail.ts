/**
 * @param {Request} request
 * @returns {Promise<Response>}
 */
import { Resend } from 'resend';
import { RESENDAPIKEY } from '$env/static/private';
const resend = new Resend(RESENDAPIKEY);

export const sendEmail = async (data: { to; from; subject; html }) => {
  const res = await resend.emails.send(data);
  console.log(res.error);

  if (!res.error) {
    return { success: true };
  } else {
    return { success: false };
  }
};

