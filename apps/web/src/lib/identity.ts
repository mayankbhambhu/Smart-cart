import { loadScript } from './scripts';

/** Google Identity Services (https://developers.google.com/identity/gsi/web). */
interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (response: { credential: string }) => void;
    ux_mode?: 'popup' | 'redirect';
    auto_select?: boolean;
    itp_support?: boolean;
    cancel_on_tap_outside?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type?: 'standard' | 'icon';
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
      shape?: 'rectangular' | 'pill' | 'circle' | 'square';
      logo_alignment?: 'left' | 'center';
      width?: number;
    },
  ): void;
}

/** Sign in with Apple JS (https://developer.apple.com/documentation/sign_in_with_apple/sign_in_with_apple_js). */
interface AppleIdAuth {
  init(config: { clientId: string; scope: string; redirectURI: string; state?: string; nonce?: string; usePopup: boolean }): void;
  signIn(): Promise<{
    authorization: { code: string; id_token: string; state?: string };
    user?: { email?: string; name?: { firstName?: string; lastName?: string } };
  }>;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
    AppleID?: { auth: AppleIdAuth };
  }
}

export async function loadGoogleIdentity(): Promise<GoogleAccountsId> {
  await loadScript('https://accounts.google.com/gsi/client');
  const id = window.google?.accounts?.id;
  if (!id) throw new Error('Google sign-in did not load');
  return id;
}

export class SignInCancelled extends Error {
  constructor() {
    super('Sign-in was cancelled');
    this.name = 'SignInCancelled';
  }
}

/**
 * Opens Apple's sign-in popup. The nonce is passed to Apple as is and sent
 * to the API with the identity token, which checks they match.
 */
export async function signInWithAppleWeb(
  serviceId: string,
  redirectUri: string,
): Promise<{ idToken: string; nonce: string; name?: string }> {
  await loadScript('https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js');
  const auth = window.AppleID?.auth;
  if (!auth) throw new Error('Sign in with Apple did not load');
  const nonce = crypto.randomUUID();
  auth.init({ clientId: serviceId, scope: 'name email', redirectURI: redirectUri, state: crypto.randomUUID(), nonce, usePopup: true });
  try {
    const response = await auth.signIn();
    // Apple shares the name only on the very first sign-in.
    const name = [response.user?.name?.firstName, response.user?.name?.lastName].filter(Boolean).join(' ');
    return { idToken: response.authorization.id_token, nonce, name: name.length >= 2 ? name : undefined };
  } catch (error) {
    if (
      (error as { error?: string })?.error === 'popup_closed_by_user' ||
      (error as { error?: string })?.error === 'user_cancelled_authorize'
    ) {
      throw new SignInCancelled();
    }
    throw error instanceof Error ? error : new Error('Sign in with Apple failed');
  }
}
