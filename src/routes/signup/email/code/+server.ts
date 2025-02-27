import type { RequestHandler } from './$types';
import { generateId } from "lucia";
import { getUrl } from '$lib/utils/getUrl';
import { lucia } from '$lib/server/auth';
import { accounts, users } from '$lib/server/db/schema';
import { db } from '$lib/server/db/';
import { eq } from 'drizzle-orm';
import { deleteCode, deleteDeadCodes, getCode } from '$lib/server/db/actions/codes';
import { createUser } from '$lib/server/db/actions/users';
import { createAccount } from '$lib/server/db/actions/accounts';

export const POST: RequestHandler = async function(event) {
  const siteUrl = getUrl();
  const redirectUrl = new URL(siteUrl + "/signup")
  redirectUrl.searchParams.set('error', 'The code incorrect. Please try again');
  const code = (await event.request.json()).code
  console.warn("DEBUGPRINT[1]: +server.ts:14: code=", code)

  await deleteDeadCodes()

  const codeToCheck = await getCode(code)
  if (!codeToCheck) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unexpected error, please try again' }),
      { status: 500 }
    );
  }

  try {
    const { firstName, lastName, email } = codeToCheck
    if (!email || !lastName || !firstName) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unexpected error, please try again' }),
        { status: 500 }
      );
    }

    const userAccount = await db.select().from(accounts).where(eq(accounts.providerAccountId, email))
    if (userAccount.length !== 0) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: siteUrl + "/calendar/"
        }
      })
    }

    let user = await createUser({
      id: generateId(15),
      firstName,
      lastName,
      email,
      emailVerified: true,
      picture: "",
      phonenumber: "",
      phonenumberVerified: false,
      roles: [],
    })

    await createAccount({
      provider: 'email',
      userId: user.id,
      providerAccountId: email
    });

    const session = await lucia.createSession(user.id, {});
    const sessionCookie = lucia.createSessionCookie(session.id);

    let headers = new Headers();
    headers.append('Set-Cookie', sessionCookie.serialize());

    let result = new Response(null, {
      status: 200,
      headers
    });

    await deleteCode(code)

    return result;
  } catch (error) {
    console.log(error);
    return new Response(
      JSON.stringify({ success: false, error: 'Unexpected error, please try again' }),
      { status: 500 }
    );
  }
};
