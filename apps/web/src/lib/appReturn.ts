/** Only the mobile app's own URL schemes may receive results from the bridge pages. */
const APP_SCHEMES = ['smartcart:', 'exp:', 'exps:'];

/** The app's return URL from the query string, or null when missing or not one of the app's schemes. */
export function safeAppReturnUrl(raw: string | null): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return APP_SCHEMES.includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

/** Sends the browser back to the app with the given query values. */
export function returnToApp(returnUrl: URL, values: Record<string, string>): void {
  const target = new URL(returnUrl.toString());
  for (const [key, value] of Object.entries(values)) target.searchParams.set(key, value);
  window.location.replace(target.toString());
}
