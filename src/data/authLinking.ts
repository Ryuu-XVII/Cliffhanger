import * as Linking from 'expo-linking';

import { applyAuthUrl } from './auth';
import { toast } from '@/stores/toastStore';

/**
 * Catches an auth email link (confirmation, password reset, magic link) that
 * opens the app cold or brings it to the foreground, and turns it into a
 * session.
 *
 * This is a *different* path from the one Google/Apple sign-in use.
 * OAuth opens the link itself via `WebBrowser.openAuthSessionAsync`, so it
 * gets the redirect back as that call's own return value - no listener
 * needed. An email link is tapped from an entirely separate app (Mail,
 * Gmail), so the only way back in is the OS handing the app its own
 * `cliffhanger://auth-callback` URL scheme, which is what this listens for.
 *
 * Without this, `signUpWithEmail` creates the account, Supabase mails a
 * confirmation link, the user taps it - and nothing in the app was ever
 * listening, so the account exists, confirmed, with a session sitting in the
 * URL that gets silently dropped. The app stays on the guest identity forever
 * with no error to explain why.
 */
export function initAuthLinking(): () => void {
  const handle = (url: string | null) => {
    if (!url || !url.includes('auth-callback')) return;
    applyAuthUrl(url)
      .then((applied) => {
        if (applied) toast.success('Signed in');
      })
      .catch(() => {
        toast.error('That sign-in link did not work. Try again from the app.');
      });
  };

  // Cold start: the app was launched *by* tapping the link.
  void Linking.getInitialURL().then(handle);

  // Warm start: the app was already running or backgrounded.
  const subscription = Linking.addEventListener('url', ({ url }) => handle(url));
  return () => subscription.remove();
}
