import { configDotenv } from 'dotenv';

configDotenv();

export const RESEND_API = process.env.RESEND_API,
	NOREPLYEMAIL = process.env.NOREPLYEMAIL;
