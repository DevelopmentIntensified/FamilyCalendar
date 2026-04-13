import { getUser, updateUser } from '$lib/server/db/actions/users';
import { lucia } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { sessions } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	const userId = event.locals.user.id;
	const user = await getUser(userId);

	return {
		user: {
			id: user!.id,
			email: user!.email,
			firstName: user!.firstName,
			lastName: user!.lastName,
			emailVerified: user!.emailVerified,
			createdAt: user!.createdAt
		}
	};
};

export const actions: Actions = {
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
		const formData = await request.formData();

		const email = formData.get('email') as string;

		if (!email || !email.includes('@')) {
			return fail(400, { success: false, message: 'Valid email is required' });
		}

		try {
			await updateUser(userId, { email, emailVerified: false });
			return { success: true, message: 'Email updated. Please verify your new email address.' };
		} catch (error) {
			console.error('Failed to update email:', error);
			return fail(500, { success: false, message: 'Failed to update email' });
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

		try {
			await lucia.invalidateSession(locals.session!.id);
			
			await db.delete(sessions).where(eq(sessions.userId, userId));
			
			const { deleteUser } = await import('$lib/server/db/actions/users');
			await deleteUser(userId);

			return redirect(302, '/');
		} catch (error) {
			console.error('Failed to delete account:', error);
			return fail(500, { success: false, message: 'Failed to delete account' });
		}
	}
};
