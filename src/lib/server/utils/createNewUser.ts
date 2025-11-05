import { createAccount } from '../db/actions/accounts';
import { createUser } from '../db/actions/users';
import { generateId } from 'lucia';
import { createUserSettings } from '../db/actions/userSettings';
import { randHex } from '@ngneat/falso';
import { createCalendar } from '../db/actions/calendar';

export const createNewUser = async function (firstName: string, lastName: string, email: string) {
	let user = await createUser({
		id: generateId(15),
		firstName,
		lastName,
		email,
		emailVerified: true,
		picture: '',
		phonenumber: '',
		phonenumberVerified: false,
		roles: []
	});

	await createAccount({
		provider: 'email',
		userId: user.id,
		providerAccountId: email
	});

	await createUserSettings({
		userId: user.id,
		color: randHex()
	});

	await createCalendar({
		ownerId: user.id
	});

	return user;
};
