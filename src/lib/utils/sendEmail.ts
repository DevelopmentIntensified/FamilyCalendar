/**
 * @param {Request} request
 * @returns {Promise<Response>}
 */
import { Resend } from 'resend';
import { RESEND_API } from '$env/static/private';
const resend = new Resend(RESEND_API);

export const sendEmail = async (data: { to; from; subject; html }) => {
  const res = await resend.emails.send(data);
  console.log(res.error);

  if (!res.error) {
    return { success: true, error: undefined };
  } else {
    return { success: false, error: res.error };
  }
};

