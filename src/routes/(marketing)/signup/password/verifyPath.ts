// Shared by the password signup route (which issues the code email) and the
// resend route (which re-issues it): a single import, never a duplicated
// string. Lives outside +server.ts because SvelteKit route modules reject
// non-handler exports.
export const PASSWORD_VERIFY_CALLBACK_PATH = '/signup/password/verify';
