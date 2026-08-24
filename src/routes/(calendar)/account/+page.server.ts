import { getUser, updateUser } from '$lib/server/db/actions/users';
import { getUserSettings, updateUserSettings } from '$lib/server/db/actions/userSettings';
import { lucia } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { sessions, calendars, families, familyMembers, userAdConsent } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { sendEmail } from '$lib/utils/sendEmail';
import { NOREPLYEMAIL, EMAILSECRET } from '$env/static/private';
import { getUrl } from '$lib/utils/getUrl';
import { createJWT } from 'oslo/jwt';
import { TimeSpan } from 'lucia';
import { generateRandomString, type RandomReader } from '@oslojs/crypto/random';
import { createCode, deleteCodesByEmail } from '$lib/server/db/actions/codes';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	const userId = event.locals.user.id;
	const user = await getUser(userId);
	const userSettings = await getUserSettings(userId);

	const userCals = await db.select().from(calendars).where(eq(calendars.ownerId, userId));
	const calendarList: { id: string; name: string; color?: string }[] = userCals.map(c => ({
		id: c.id,
		name: 'Personal Calendar',
		color: userSettings?.color || undefined
	}));

	const [member] = await db.select().from(familyMembers).where(eq(familyMembers.userId, userId));
	if (member) {
		const familyCals = await db.select().from(calendars).where(eq(calendars.familyId, member.familyId));
		const [family] = await db.select().from(families).where(eq(families.id, member.familyId));
		for (const fc of familyCals) {
			calendarList.push({ id: fc.id, name: family?.name || 'Family Calendar' });
		}
	}

	const [adConsentRow] = await db
		.select()
		.from(userAdConsent)
		.where(eq(userAdConsent.userId, userId));

	return {
		user: {
			id: user!.id,
			email: user!.email,
			firstName: user!.firstName,
			lastName: user!.lastName,
			emailVerified: user!.emailVerified,
			createdAt: user!.createdAt
		},
		userSettings: userSettings ?? {
			weekStart: 'sunday',
			timeZone: 'UTC',
			color: '#3b82f6',
			defaultView: 'dayView',
			defaultCalendarId: null,
			syncEventsToFamilyCalendar: false
		},
		adConsent: adConsentRow ?? {
			showAdsAsEvents: true,
			showAdMarkers: true,
			personalizedAds: true
		},
		calendars: calendarList
	};
};

export const actions: Actions = {
	saveCalendarSettings: async ({ request, locals }) => {
		const userId = locals.user.id;
		const formData = await request.formData();

		const weekStart = formData.get('weekStart') as string;
		const timeZone = formData.get('timeZone') as string;
		const color = formData.get('color') as string;
		const defaultView = formData.get('defaultView') as string;
		const defaultCalendarId = (formData.get('defaultCalendarId') as string) || null;
		const syncEventsToFamilyCalendar = formData.get('syncEventsToFamilyCalendar') === 'on';
		const autoParseEventDetails = formData.get('autoParseEventDetails') === 'true';

		try {
			const existingSettings = await getUserSettings(userId);

			if (!existingSettings) {
				const { createUserSettings } = await import('$lib/server/db/actions/userSettings');
				await createUserSettings({
					userId,
					weekStart,
					timeZone,
					color,
					defaultView,
					defaultCalendarId,
					syncEventsToFamilyCalendar,
					autoParseEventDetails
				});
			} else {
				await updateUserSettings(userId, {
					weekStart,
					timeZone,
					color,
					defaultView,
					defaultCalendarId,
					syncEventsToFamilyCalendar,
					autoParseEventDetails
				});
			}

			return { success: true, message: 'Calendar settings saved successfully' };
		} catch (error) {
			console.error('Failed to save calendar settings:', error);
			return fail(500, { success: false, message: 'Failed to save calendar settings' });
		}
	},

	// UI is disabled; no-op preserves existing ad consent.
	saveAds: async () => {
		return { success: true };
	},

	updateProfile: async ({ request, locals }) => {
		const userId = locals.user.id;
		const formData = await request.formData();

		const firstName = formData.get('firstName') as string;
		const lastName = formData.get('lastName') as string;

		if (!firstName || !lastName) {
			return fail(400, { success: false, message: 'First name and last name are required' });
		}

		try {
			await updateUser(userId, { firstName, lastName });
			return { success: true, message: 'Profile updated successfully' };
		} catch (error) {
			console.error('Failed to update profile:', error);
			return fail(500, { success: false, message: 'Failed to update profile' });
		}
	},

	updateEmail: async ({ request, locals }) => {
		const userId = locals.user.id;
		const currentUser = await getUser(userId);
		const formData = await request.formData();

		if (!currentUser) {
			return fail(401, { success: false, message: 'Not signed in' });
		}

		// Anonymous Accounts have no email yet — they claim their first
		// email via the magic-link save flow, not the change-email flow.
		if (!currentUser.email) {
			return fail(400, {
				success: false,
				message: "You're using a guest calendar — add your first email from the Save-your-calendar banner instead.",
				guestNeedsClaim: true
			});
		}

		const email = formData.get('email') as string;

		if (!email || !email.includes('@')) {
			return fail(400, { success: false, message: 'Valid email is required' });
		}

		if (email === currentUser?.email) {
			return fail(400, { success: false, message: 'New email must be different from current email' });
		}

		try {
			const random: RandomReader = {
				read(bytes) {
					crypto.getRandomValues(bytes);
				}
			};
			const nums = '0123456789';
			const code = generateRandomString(random, nums, 8);

			const secret = new TextEncoder().encode(EMAILSECRET);
			const token = await createJWT(
				'HS256',
				secret,
				{ code, pendingEmail: email },
				{
					headers: { alg: 'HS256', typ: 'JWT' },
					expiresIn: new TimeSpan(15, 'm')
				}
			);

			const verifyUrl = new URL(getUrl());
			verifyUrl.pathname = '/account/verify-email';
			verifyUrl.searchParams.set('token', token);

			await sendEmail({
				to: email,
				from: NOREPLYEMAIL,
				subject: 'Family Planz Email Change Verification',
				html: `<h1>Your verification code is: ${code}</h1>
<p>Or click this link to verify: <a href="${verifyUrl.toString()}">Verify Email</a></p>`
			});

			await deleteCodesByEmail(currentUser!.email);
			await createCode({
				code,
				expiresAt: new Date(Date.now() + 60 * 1000 * 15),
				email: currentUser!.email,
				firstName: currentUser!.firstName,
				lastName: currentUser!.lastName,
				type: 'email_change',
				pendingEmail: email
			});

			return { success: true, message: 'Verification email sent. Please check your inbox.' };
		} catch (error) {
			console.error('Failed to update email:', error);
			return fail(500, { success: false, message: 'Failed to send verification email' });
		}
	},

	logoutAllDevices: async ({ locals, cookies }) => {
		const userId = locals.user.id;
		const currentSessionId = locals.session?.id;

		try {
			const allSessions = await db
				.select()
				.from(sessions)
				.where(eq(sessions.userId, userId));

			for (const session of allSessions) {
				if (session.id !== currentSessionId) {
					await lucia.invalidateSession(session.id);
				}
			}

			return { success: true, message: 'Logged out from all other devices' };
		} catch (error) {
			console.error('Failed to logout from all devices:', error);
			return fail(500, { success: false, message: 'Failed to logout from all devices' });
		}
	},

	deleteAccount: async ({ request, locals }) => {
		const userId = locals.user.id;
		const formData = await request.formData();

		const confirmation = formData.get('confirmation') as string;

		if (confirmation !== userId) {
			return fail(400, { success: false, message: 'Confirmation does not match' });
		}

		await lucia.invalidateSession(locals.session!.id);
		
		await db.delete(sessions).where(eq(sessions.userId, userId));
		
		const { deleteUser } = await import('$lib/server/db/actions/users');
		await deleteUser(userId);

		return redirect(302, '/');
	}
};
