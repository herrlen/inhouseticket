// Links between the sign-in and the registration page that keep where the person wanted to go
// (`next`, e.g. an invitation or a connector login). Pure – used by client components.

const withNext = (path: string, next: string) => (next === "/start" ? path : `${path}?next=${encodeURIComponent(next)}`);

export const loginHref = (next: string) => withNext("/login", next);
export const registerHref = (next: string) => withNext("/register", next);
