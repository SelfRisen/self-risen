import {
  needsSocialSignIn,
  signInFailureMessage,
  signUpConflictMessage,
} from '../account-lookup';

describe('account messages', () => {
  const google = { provider: 'GOOGLE' as const, hasPassword: false };
  const email = { provider: 'EMAIL' as const, hasPassword: true };
  const legacySocial = { provider: null, hasPassword: false };

  describe('signInFailureMessage', () => {
    it('sends someone with no account to sign up', () => {
      expect(signInFailureMessage(null)).toContain('no account for this email');
      expect(signInFailureMessage(null)).toContain('sign up');
    });

    it('names the provider when the account has no password', () => {
      // Signed up with Google, now trying email and password.
      const message = signInFailureMessage(google);
      expect(message).toContain('Google');
      expect(message).not.toContain('password');
    });

    it('talks about the password only when there is one', () => {
      expect(signInFailureMessage(email)).toContain('password');
    });

    it('still steers an account recorded before providers were kept', () => {
      const message = signInFailureMessage(legacySocial);
      expect(message).toContain('social sign-in');
      expect(message).not.toContain('undefined');
    });
  });

  describe('signUpConflictMessage', () => {
    it('points a Google account at the Google button', () => {
      expect(signUpConflictMessage(google)).toContain('Continue with Google');
    });

    it('points an email account at logging in', () => {
      const message = signUpConflictMessage(email);
      expect(message).toContain('log in');
      expect(message).toContain('reset your password');
    });
  });

  describe('needsSocialSignIn', () => {
    it('is false once a password exists, whatever the provider says', () => {
      // An account that started as Google and later set a password can use it.
      expect(needsSocialSignIn({ provider: 'GOOGLE', hasPassword: true })).toBe(
        false,
      );
    });

    it('is false for an email account', () => {
      expect(needsSocialSignIn(email)).toBe(false);
    });

    it('is true for a social account with no password', () => {
      expect(needsSocialSignIn(google)).toBe(true);
    });
  });
});
