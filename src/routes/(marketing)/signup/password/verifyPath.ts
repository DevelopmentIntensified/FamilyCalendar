// Shared by the password signup route (which issues the code email) and the
// resend route (which re-issues it): a single import, never a duplicated
// string. Lives outside +server.ts because SvelteKit route modules reject
// non-handler exports. Defined beside the shared sign-up logic (#292 G12).
export { PASSWORD_VERIFY_CALLBACK_PATH } from '$lib/server/services/passwordSignup';
