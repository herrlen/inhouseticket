/** /login/link with the verify URL's query (token, callbackURL, errorCallbackURL). */
export function magicLinkConfirmUrl(verifyUrl: string): string {
  const verify = new URL(verifyUrl);
  const confirm = new URL("/login/link", verify.origin);
  confirm.search = verify.search;
  return confirm.toString();
}
