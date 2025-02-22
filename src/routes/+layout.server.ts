// +page.server.ts
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
  return {
    pathname: event.url.pathname,
    isLoggedIn: !!event.locals.user,
    user: event.locals.user,
  };
};

