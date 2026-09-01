/**
 * What an email is already registered with, and what to tell someone whose
 * sign-in just failed.
 *
 * Social sign-in here does not go through a Firebase provider: the token is
 * verified against the provider directly and a custom token is minted, so
 * Firebase only ever holds a bare user record. That is why the provider is
 * recorded on our own user, and why Firebase's own view is only a fallback for
 * accounts created before it was.
 */
export type AuthProvider = 'EMAIL' | 'GOOGLE' | 'APPLE' | 'FACEBOOK';

export interface ExistingAccount {
  /** The recorded provider, when we have one. */
  provider: AuthProvider | null;
  /** Whether Firebase holds a password for this email. */
  hasPassword: boolean;
}

const PROVIDER_LABELS: Record<Exclude<AuthProvider, 'EMAIL'>, string> = {
  GOOGLE: 'Google',
  APPLE: 'Apple',
  FACEBOOK: 'Facebook',
};

/**
 * True when the account cannot be signed into with a password, so offering
 * "check your password" would send the user in circles.
 */
export const needsSocialSignIn = (account: ExistingAccount): boolean =>
  !account.hasPassword && account.provider !== 'EMAIL';

/** Why the sign-in failed, in words the user can act on. */
export const signInFailureMessage = (
  account: ExistingAccount | null,
): string => {
  if (!account) {
    return "There's no account for this email address. Please sign up to continue.";
  }

  if (needsSocialSignIn(account)) {
    const label =
      account.provider && account.provider !== 'EMAIL'
        ? PROVIDER_LABELS[account.provider]
        : null;

    return label
      ? `This email is registered through ${label}. Tap "Continue with ${label}" to sign in.`
      : 'This email is registered through a social sign-in. Please use the Google or Apple button to sign in.';
  }

  return 'Incorrect password. Please try again, or reset it if you have forgotten it.';
};

/** Why the sign-up failed, in words the user can act on. */
export const signUpConflictMessage = (account: ExistingAccount): string => {
  if (needsSocialSignIn(account)) {
    const label =
      account.provider && account.provider !== 'EMAIL'
        ? PROVIDER_LABELS[account.provider]
        : null;

    return label
      ? `This email is already registered through ${label}. Tap "Continue with ${label}" to sign in.`
      : 'This email is already registered through a social sign-in. Please use the Google or Apple button to sign in.';
  }

  return 'This email is already registered. Please log in, or reset your password if you have forgotten it.';
};
