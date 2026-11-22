/**
 * The access wire contract: every request schema's coercions and refusals, the
 * response shapes, and the exact legacy copy. Expected bodies come from the
 * legacy handlers the frozen golden pins (`access.http.db.test.ts`), never
 * from running this code.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { firstIssueMessage, z } from '$lib/kernel/validation/validators';
import {
	AccessClaimParams,
	AccessEmailLinkQuery,
	CLAIM_ACCOUNT_HAS_EMAIL_MESSAGE,
	CLAIM_INVALID_EMAIL_MESSAGE,
	CLAIM_SEND_FAILED_MESSAGE,
	ClaimRequestBody,
	ClaimRequestForm,
	ChangeEmailBody,
	ChangeEmailForm,
	ChangeEmailResponse,
	CodeErrorResponse,
	EMAIL_CHANGE_GUEST_MESSAGE,
	EMAIL_CHANGE_INVALID_MESSAGE,
	EMAIL_CHANGE_SAME_MESSAGE,
	EMAIL_CHANGE_SEND_FAILED_MESSAGE,
	EMAIL_CHANGE_SENT_MESSAGE,
	FORGOT_EMAIL_REQUIRED_MESSAGE,
	FORGOT_SEND_FAILED_MESSAGE,
	ForgotPasswordBody,
	GuestClaimErrorResponse,
	MOBILE_ACCOUNT_EXISTS_MESSAGE,
	MOBILE_INVALID_EMAIL_MESSAGE,
	MOBILE_INVALID_INTENT_MESSAGE,
	MOBILE_JSON_MESSAGE,
	MOBILE_MISSING_NAME_MESSAGE,
	MOBILE_MISSING_PASSWORD_MESSAGE,
	MOBILE_RATE_LIMIT_MESSAGE,
	MOBILE_SEND_FAILED_MESSAGE,
	MOBILE_SERVER_ERROR_MESSAGE,
	MOBILE_WRONG_CODE_MESSAGE,
	MOBILE_WRONG_PASSWORD_MESSAGE,
	LOGOUT_REDIRECT_PATH,
	MobileEmailBody,
	MobileGuestBody,
	MobilePasswordBody,
	MobileSignupBody,
	MobileSignupResponse,
	MobileTokenResponse,
	MobileVerifyBody,
	PASSWORD_VERIFY_CALLBACK_PATH,
	RATE_LIMIT_MESSAGE,
	RESET_ACCOUNT_NOT_FOUND_MESSAGE,
	RESET_FAILED_MESSAGE,
	RESET_FIELDS_REQUIRED_MESSAGE,
	RESET_INVALID_PAYLOAD_MESSAGE,
	RESET_INVALID_TOKEN_MESSAGE,
	RESET_USED_MESSAGE,
	RESEND_FAILED_MESSAGE,
	ResetPasswordBody,
	SentResponse,
	SIGNUP_FIELDS_REQUIRED_MESSAGE,
	SuccessResponse,
	UNAUTHORIZED_MESSAGE,
	VERIFY_GENERIC_ERROR_MESSAGE,
	VerifyEmailBody,
	VerifyEmailForm,
	WireErrorResponse
} from './access.contract';
import { PASSWORD_TOO_SHORT_MESSAGE } from './access.password.rules';

function messageOf(schema: z.ZodType, value: unknown): string | null {
	const result = schema.safeParse(value);
	return result.success ? null : firstIssueMessage(result.error);
}

describe('wire copy', () => {
	it('keeps every legacy sentence verbatim', () => {
		expect({
			logoutLocation: LOGOUT_REDIRECT_PATH,
			mobileJson: MOBILE_JSON_MESSAGE,
			mobileEmail: MOBILE_INVALID_EMAIL_MESSAGE,
			mobileIntent: MOBILE_INVALID_INTENT_MESSAGE,
			mobileName: MOBILE_MISSING_NAME_MESSAGE,
			mobileRate: MOBILE_RATE_LIMIT_MESSAGE,
			mobileCode: MOBILE_WRONG_CODE_MESSAGE,
			mobilePassword: MOBILE_MISSING_PASSWORD_MESSAGE,
			mobileWrongPassword: MOBILE_WRONG_PASSWORD_MESSAGE,
			mobileExists: MOBILE_ACCOUNT_EXISTS_MESSAGE,
			mobileSend: MOBILE_SEND_FAILED_MESSAGE,
			mobileServer: MOBILE_SERVER_ERROR_MESSAGE,
			unauthorized: UNAUTHORIZED_MESSAGE,
			rate: RATE_LIMIT_MESSAGE,
			signupFields: SIGNUP_FIELDS_REQUIRED_MESSAGE,
			passwordShort: PASSWORD_TOO_SHORT_MESSAGE,
			claimRegistered: CLAIM_ACCOUNT_HAS_EMAIL_MESSAGE,
			claimEmail: CLAIM_INVALID_EMAIL_MESSAGE,
			claimSend: CLAIM_SEND_FAILED_MESSAGE,
			changeGuest: EMAIL_CHANGE_GUEST_MESSAGE,
			changeInvalid: EMAIL_CHANGE_INVALID_MESSAGE,
			changeSame: EMAIL_CHANGE_SAME_MESSAGE,
			changeSent: EMAIL_CHANGE_SENT_MESSAGE,
			changeSend: EMAIL_CHANGE_SEND_FAILED_MESSAGE,
			verifyGeneric: VERIFY_GENERIC_ERROR_MESSAGE,
			resendFailed: RESEND_FAILED_MESSAGE,
			forgotRequired: FORGOT_EMAIL_REQUIRED_MESSAGE,
			forgotFailed: FORGOT_SEND_FAILED_MESSAGE,
			resetFields: RESET_FIELDS_REQUIRED_MESSAGE,
			resetInvalid: RESET_INVALID_TOKEN_MESSAGE,
			resetPayload: RESET_INVALID_PAYLOAD_MESSAGE,
			resetUsed: RESET_USED_MESSAGE,
			resetNoAccount: RESET_ACCOUNT_NOT_FOUND_MESSAGE,
			resetFailed: RESET_FAILED_MESSAGE,
			verifyCallback: PASSWORD_VERIFY_CALLBACK_PATH
		}).toEqual({
			logoutLocation: '/',
			mobileJson: 'Request body must be JSON',
			mobileEmail: 'Enter a valid email',
			mobileIntent: 'intent must be "login" or "signup"',
			mobileName: 'First and last name are required',
			mobileRate: 'Too many attempts — try again in a few minutes',
			mobileCode: 'That code is wrong or expired',
			mobilePassword: 'Email and password are required',
			mobileWrongPassword: 'Email or password is incorrect',
			mobileExists: 'An account with this email already exists — sign in instead',
			mobileSend: "Couldn't send the email — try again",
			mobileServer: 'Something went wrong — try again',
			unauthorized: 'Unauthorized',
			rate: 'Too many attempts. Try again shortly.',
			signupFields: 'All fields are required',
			passwordShort: 'Password must be at least 8 characters',
			claimRegistered: 'Account already has an email',
			claimEmail: 'Please enter a valid email address',
			claimSend: 'Failed to send email. Please try again.',
			changeGuest:
				"You're using a guest calendar — add your first email from the Save-your-calendar banner instead.",
			changeInvalid: 'Valid email is required',
			changeSame: 'New email must be different from current email',
			changeSent: 'Verification email sent. Please check your inbox.',
			changeSend: 'Failed to send verification email',
			verifyGeneric: 'Unexpected error, please try again',
			resendFailed: 'There was an error. Please try again.',
			forgotRequired: 'Email is required',
			forgotFailed: 'Failed to send reset email',
			resetFields: 'Token and password are required',
			resetInvalid: 'Invalid or expired reset token. Please request a new one.',
			resetPayload: 'Invalid reset token',
			resetUsed: 'This reset link has already been used. Please request a new one.',
			resetNoAccount: 'Account not found',
			resetFailed: 'Failed to reset password',
			verifyCallback: '/signup/password/verify'
		});
	});
});

describe('MobileEmailBody', () => {
	it.each<[string, unknown]>([
		['malformed/absent (null)', null],
		['an array', [1, 2]],
		['a string', 'body'],
		['a number', 7]
	])('refuses %s with the mobile JSON sentence', (_label, body) => {
		expect(messageOf(MobileEmailBody, body)).toBe(MOBILE_JSON_MESSAGE);
	});

	it('validates in the handler order: address, then intent', () => {
		expect(messageOf(MobileEmailBody, {})).toBe(MOBILE_INVALID_EMAIL_MESSAGE);
		expect(messageOf(MobileEmailBody, { email: 'a@b.co' })).toBe(MOBILE_INVALID_INTENT_MESSAGE);
	});

	it('reads a non-string name as the legacy empty string', () => {
		expect(
			MobileEmailBody.parse({ email: 'a@b.co', intent: 'signup', firstName: null, lastName: {} })
		).toEqual({ email: 'a@b.co', intent: 'signup', firstName: '', lastName: '' });
	});

	it('trims the address and leaves the intent exact', () => {
		expect(
			MobileEmailBody.parse({
				email: '  Mia@Example.test  ',
				intent: 'signup',
				firstName: '  Mia ',
				lastName: ' Lopez '
			})
		).toEqual({
			email: 'Mia@Example.test',
			intent: 'signup',
			firstName: 'Mia',
			lastName: 'Lopez'
		});
	});

	it('refuses an address without a dot and an unknown intent with their own sentences', () => {
		expect(messageOf(MobileEmailBody, { email: 'nope', intent: 'login' })).toBe(
			MOBILE_INVALID_EMAIL_MESSAGE
		);
		expect(messageOf(MobileEmailBody, { email: 'a@b.co', intent: 'LOGIN' })).toBe(
			MOBILE_INVALID_INTENT_MESSAGE
		);
	});
});

describe('MobileVerifyBody', () => {
	it('accepts a missing code (the handler owns that refusal)', () => {
		expect(MobileVerifyBody.parse({ email: 'a@b.co', intent: 'login' })).toEqual({
			email: 'a@b.co',
			intent: 'login',
			code: '',
			deviceName: ''
		});
	});

	it('trims the code and leaves the device name alone', () => {
		expect(
			MobileVerifyBody.parse({
				email: 'a@b.co',
				intent: 'login',
				code: ' 13572468 ',
				deviceName: '  Pixel 9 Pro  '
			})
		).toEqual({
			email: 'a@b.co',
			intent: 'login',
			code: '13572468',
			deviceName: '  Pixel 9 Pro  '
		});
	});

	it('refuses a non-object body with the mobile sentence', () => {
		expect(messageOf(MobileVerifyBody, null)).toBe(MOBILE_JSON_MESSAGE);
	});
});

describe('MobilePasswordBody', () => {
	it('does not format-check the address or trim the password', () => {
		expect(MobilePasswordBody.parse({ email: '  nope ', password: ' secret ' })).toEqual({
			email: 'nope',
			password: ' secret ',
			deviceName: ''
		});
	});

	it('reads a null password as empty so the handler can refuse it', () => {
		expect(MobilePasswordBody.parse({ email: 'a@b.co', password: null })).toEqual({
			email: 'a@b.co',
			password: '',
			deviceName: ''
		});
	});
});

describe('MobileGuestBody', () => {
	it('accepts an object with no fields', () => {
		expect(MobileGuestBody.parse({})).toEqual({ deviceName: '' });
	});

	it.each<[unknown]>([[null], [[1]], ['body']])('refuses %j as not JSON', (body) => {
		expect(messageOf(MobileGuestBody, body)).toBe(MOBILE_JSON_MESSAGE);
	});

	it('keeps the device name untrimmed for the token-name rule', () => {
		expect(MobileGuestBody.parse({ deviceName: '  Pixel  ' })).toEqual({
			deviceName: '  Pixel  '
		});
	});
});

describe('MobileSignupBody', () => {
	it('refuses a malformed/non-object body with the house copy', () => {
		expect(messageOf(MobileSignupBody, null)).toBe('Invalid JSON');
		expect(messageOf(MobileSignupBody, [1, 2])).toBe('Invalid JSON');
	});

	it('trims the names/address but never the password', () => {
		expect(
			MobileSignupBody.parse({
				email: '  Mia@Example.test ',
				password: ' correct-horse-battery ',
				firstName: '  Mia ',
				lastName: ' Lopez ',
				deviceName: '  Pixel '
			})
		).toEqual({
			email: 'Mia@Example.test',
			password: ' correct-horse-battery ',
			firstName: 'Mia',
			lastName: 'Lopez',
			deviceName: '  Pixel '
		});
	});

	it('reads blank fields as empty rather than refusing them in the schema', () => {
		expect(MobileSignupBody.parse({})).toEqual({
			email: '',
			password: '',
			firstName: '',
			lastName: '',
			deviceName: ''
		});
	});
});

describe('the /api/me bodies', () => {
	it('ClaimRequestBody trims and lowercases, and a non-string reads empty', () => {
		expect(ClaimRequestBody.parse({ email: '  Mia@Example.TEST ' })).toEqual({
			email: 'mia@example.test'
		});
		expect(ClaimRequestBody.parse({ email: 42 })).toEqual({ email: '' });
		expect(ClaimRequestBody.parse({})).toEqual({ email: '' });
	});

	it('ChangeEmailBody trims but never lowercases or format-checks', () => {
		expect(ChangeEmailBody.parse({ email: '  Mia@Example.TEST ' })).toEqual({
			email: 'Mia@Example.TEST'
		});
		expect(ChangeEmailBody.parse({ email: 'nope' })).toEqual({ email: 'nope' });
		expect(ChangeEmailBody.parse({ email: null })).toEqual({ email: '' });
	});

	it('VerifyEmailBody trims the code and reads a non-string as empty', () => {
		expect(VerifyEmailBody.parse({ code: ' 24681357 ' })).toEqual({ code: '24681357' });
		expect(VerifyEmailBody.parse({ code: 7 })).toEqual({ code: '' });
		expect(VerifyEmailBody.parse({})).toEqual({ code: '' });
	});

	it.each<z.ZodType>([ClaimRequestBody, ChangeEmailBody, VerifyEmailBody])(
		'a malformed body is the house Invalid JSON',
		(schema) => {
			expect(messageOf(schema, null)).toBe('Invalid JSON');
			expect(messageOf(schema, 'body')).toBe('Invalid JSON');
		}
	);
});

describe('page boundary inputs', () => {
	it('reads a callback token as an optional string and leaves the redirect to the flow', () => {
		expect(AccessEmailLinkQuery.parse({})).toEqual({ token: undefined });
		expect(AccessEmailLinkQuery.parse({ token: '' })).toEqual({ token: '' });
		expect(AccessEmailLinkQuery.parse({ token: 'abc' })).toEqual({ token: 'abc' });
	});

	it('requires the claim path segment', () => {
		expect(AccessClaimParams.parse({ token: 'abc' })).toEqual({ token: 'abc' });
		expect(AccessClaimParams.safeParse({}).success).toBe(false);
	});

	it('reads a form field the legacy way: first value, absent or file is empty, no trim', () => {
		expect(ClaimRequestForm.parse({ email: '  Mia@Example.TEST ' })).toEqual({
			email: '  Mia@Example.TEST '
		});
		expect(ClaimRequestForm.parse({})).toEqual({ email: '' });
		expect(ClaimRequestForm.parse({ email: ['first@example.test', 'second@example.test'] })).toEqual(
			{ email: 'first@example.test' }
		);
		expect(ClaimRequestForm.parse({ email: 42 })).toEqual({ email: '' });
	});

	it('reads the change-email and verify forms the same way', () => {
		expect(ChangeEmailForm.parse({ email: ' a@b.co ' })).toEqual({ email: ' a@b.co ' });
		expect(VerifyEmailForm.parse({ token: 'tt', code: ' 2468 ' })).toEqual({
			token: 'tt',
			code: ' 2468 '
		});
		expect(VerifyEmailForm.parse({})).toEqual({ token: '', code: '' });
	});
});

describe('ForgotPasswordBody and ResetPasswordBody', () => {
	it('forgot keeps the raw address (its only check is truthiness)', () => {
		expect(ForgotPasswordBody.parse({ email: ' a@b.co ' })).toEqual({ email: ' a@b.co ' });
		expect(ForgotPasswordBody.parse({ email: 42 })).toEqual({ email: '' });
	});

	it('a destructured array/scalar reads as no field, a null body is the house 400', () => {
		expect(ForgotPasswordBody.parse([1, 2])).toEqual({ email: '' });
		expect(ForgotPasswordBody.parse('body')).toEqual({ email: '' });
		// Q-062 B: the legacy reader threw on a literal `null`; the answer is 400.
		expect(messageOf(ForgotPasswordBody, null)).toBe('Invalid JSON');
		expect(ResetPasswordBody.parse([1, 2])).toEqual({ token: '', password: '' });
		expect(ResetPasswordBody.parse('body')).toEqual({ token: '', password: '' });
	});

	it('reset never trims the token or the password', () => {
		expect(ResetPasswordBody.parse({ token: ' a.jwt ', password: ' long-enough ' })).toEqual({
			token: ' a.jwt ',
			password: ' long-enough '
		});
		expect(ResetPasswordBody.parse({ token: null, password: 7 })).toEqual({
			token: '',
			password: ''
		});
	});

	it('reset maps a null body to the house Invalid JSON (Q-062)', () => {
		expect(messageOf(ResetPasswordBody, null)).toBe('Invalid JSON');
	});
});

describe('response schemas', () => {
	it('MobileTokenResponse carries a masked email', () => {
		expect(
			MobileTokenResponse.parse({
				token: 'fp_x',
				user: { id: 'u1', firstName: 'Guest', lastName: '', email: null }
			})
		).toEqual({
			token: 'fp_x',
			user: { id: 'u1', firstName: 'Guest', lastName: '', email: null }
		});
		expect(
			MobileTokenResponse.safeParse({ token: 'fp_x', user: { id: 'u1' } }).success
		).toBe(false);
	});

	it('MobileSignupResponse pins the pending shape, taken or created', () => {
		const taken = {
			token: '',
			user: {
				id: '',
				firstName: 'Mia',
				lastName: 'Lopez',
				email: 'mia@example.test',
				emailVerified: false
			},
			emailVerification: 'pending'
		};
		expect(MobileSignupResponse.parse(taken)).toEqual(taken);
		expect(
			MobileSignupResponse.safeParse({ ...taken, emailVerification: 'done' }).success
		).toBe(false);
		expect(
			MobileSignupResponse.safeParse({
				...taken,
				user: { ...taken.user, emailVerified: true }
			}).success
		).toBe(false);
	});

	it('the small answers are exactly {sent:true} / {success:true}', () => {
		expect(SentResponse.parse({ sent: true })).toEqual({ sent: true });
		expect(SuccessResponse.parse({ success: true })).toEqual({ success: true });
		expect(SentResponse.safeParse({ sent: false }).success).toBe(false);
		expect(SuccessResponse.safeParse({ success: 'yes' }).success).toBe(false);
	});

	it('ChangeEmailResponse carries the one message', () => {
		expect(
			ChangeEmailResponse.parse({
				success: true,
				message: 'Verification email sent. Please check your inbox.'
			})
		).toEqual({ success: true, message: EMAIL_CHANGE_SENT_MESSAGE });
	});

	it('refusal bodies keep their extra key only where legacy sends it', () => {
		expect(WireErrorResponse.parse({ error: 'Unauthorized' })).toEqual({ error: 'Unauthorized' });
		expect(
			GuestClaimErrorResponse.parse({ error: 'guest', guestNeedsClaim: true })
		).toEqual({ error: 'guest', guestNeedsClaim: true });
		expect(GuestClaimErrorResponse.safeParse({ error: 'guest' }).success).toBe(false);
		expect(CodeErrorResponse.parse({ success: false, error: 'Unexpected error, please try again' }))
			.toEqual({ success: false, error: 'Unexpected error, please try again' });
	});
});
