import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { DatabaseProvider } from '../../database/database.provider';
import { INotificationService } from '../../notifications/interfaces/notification.interface';
import { EmailService } from '../../common/email/email.service';
import { NotificationChannelTypeEnum, NotificationStatusEnum } from '../../notifications/enums/notification.enum';
import * as otpUtil from '../utils/otp.util';

// Mock firebase-admin
const mockFirebaseAuth = {
  createUser: jest.fn(),
  deleteUser: jest.fn(),
  getUser: jest.fn(),
  getUserByEmail: jest.fn(),
  updateUser: jest.fn(),
  verifyIdToken: jest.fn(),
  revokeRefreshTokens: jest.fn(),
  createCustomToken: jest.fn(),
};

jest.mock('firebase-admin', () => ({
  auth: jest.fn(() => mockFirebaseAuth),
}));

// Mock logger
jest.mock('../../common', () => {
  const originalModule = jest.requireActual('../../common');
  return {
    ...originalModule,
    logger: {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    },
    config: {
      FIREBASE_API_KEY: 'test-firebase-api-key',
    },
  };
});

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('AuthService', () => {
  let service: AuthService;
  let mockPrisma: any;
  let mockNotificationService: any;
  let mockEmailService: any;

  const mockUser = {
    id: 'user-123',
    firebaseId: 'firebase-uid-123',
    email: 'test@example.com',
    name: 'Test User',
    username: null,
    avatar: null,
    lastLoggedInAt: new Date(),
    lastLoggedOutAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    mockPrisma = {
      user: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      passwordResetOtp: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    mockNotificationService = {
      notifyExternalUser: jest.fn(),
    };

    mockEmailService = {
      sendPasswordResetConfirmation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: DatabaseProvider, useValue: mockPrisma },
        { provide: INotificationService, useValue: mockNotificationService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('signUp', () => {
    const signUpPayload = {
      name: 'Test User',
      email: 'test@example.com',
      password: 'Password123!',
      countryCode: 'US',
    };

    it('should successfully create a new user', async () => {
      const firebaseUser = { uid: 'firebase-uid-123' };
      mockFirebaseAuth.createUser.mockResolvedValue(firebaseUser);
      mockPrisma.user.create.mockResolvedValue(mockUser);

      const result = await service.signUp(signUpPayload);

      expect(result.isError).toBe(false);
      expect(result.data).toEqual({
        user: mockUser,
        firebaseId: firebaseUser.uid,
      });
      expect(mockFirebaseAuth.createUser).toHaveBeenCalledWith({
        email: signUpPayload.email,
        password: signUpPayload.password,
        displayName: signUpPayload.name,
      });
    });

    it('should derive timezone from country code on signup', async () => {
      const firebaseUser = { uid: 'firebase-uid-123' };
      mockFirebaseAuth.createUser.mockResolvedValue(firebaseUser);
      mockPrisma.user.create.mockResolvedValue(mockUser);

      await service.signUp(signUpPayload);

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            timezone: 'America/New_York',
            countryCode: 'US',
            locationUpdatedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should derive Mexico timezone from country code on signup', async () => {
      const firebaseUser = { uid: 'firebase-uid-123' };
      mockFirebaseAuth.createUser.mockResolvedValue(firebaseUser);
      mockPrisma.user.create.mockResolvedValue(mockUser);

      await service.signUp({ ...signUpPayload, countryCode: 'MX' });

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            timezone: 'America/Mexico_City',
            countryCode: 'MX',
            locationUpdatedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should return error when email already exists in Firebase', async () => {
      mockFirebaseAuth.createUser.mockRejectedValue({ code: 'auth/email-already-exists' });

      const result = await service.signUp(signUpPayload);

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(ConflictException);
    });

    it('should return error for invalid email', async () => {
      mockFirebaseAuth.createUser.mockRejectedValue({ code: 'auth/invalid-email' });

      const result = await service.signUp(signUpPayload);

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(ConflictException);
    });

    it('should return error for weak password', async () => {
      mockFirebaseAuth.createUser.mockRejectedValue({ code: 'auth/weak-password' });

      const result = await service.signUp(signUpPayload);

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(ConflictException);
    });

    it('should rollback Firebase user if database creation fails', async () => {
      const firebaseUser = { uid: 'firebase-uid-123' };
      mockFirebaseAuth.createUser.mockResolvedValue(firebaseUser);
      mockPrisma.user.create.mockRejectedValue(new Error('Database error'));

      await service.signUp(signUpPayload);

      expect(mockFirebaseAuth.deleteUser).toHaveBeenCalledWith(firebaseUser.uid);
    });
  });

  describe('setUserName', () => {
    it('should successfully update username', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      const updatedUser = { ...mockUser, username: 'newusername' };
      mockPrisma.user.update.mockResolvedValue(updatedUser);

      const result = await service.setUserName('firebase-uid-123', { username: 'newusername' });

      expect(result.isError).toBe(false);
      expect(result.data?.username).toBe('newusername');
    });

    it('should return error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.setUserName('nonexistent-firebase-id', { username: 'newusername' });

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });
  });

  describe('login', () => {
    const loginPayload = {
      email: 'test@example.com',
      password: 'Password123!',
    };

    it('should successfully login a user', async () => {
      const mockIdToken = 'mock-id-token';
      const mockRefreshToken = 'mock-refresh-token';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          idToken: mockIdToken,
          refreshToken: mockRefreshToken,
        }),
      });

      mockFirebaseAuth.verifyIdToken.mockResolvedValue({ uid: 'firebase-uid-123' });
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue(mockUser);

      const result = await service.login(loginPayload);

      expect(result.isError).toBe(false);
      expect(result.data).toEqual({
        accessToken: mockIdToken,
        refreshToken: mockRefreshToken,
      });
    });

    it('should return error for invalid credentials', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: 'INVALID_PASSWORD' },
        }),
      });

      const result = await service.login(loginPayload);

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(UnauthorizedException);
    });

    it('should return error for disabled user', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: 'USER_DISABLED' },
        }),
      });

      const result = await service.login(loginPayload);

      expect(result.isError).toBe(true);
      expect(result.errMessage).toContain('disabled');
    });

    it('should return error when user profile not found in database', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          idToken: 'mock-id-token',
          refreshToken: 'mock-refresh-token',
        }),
      });

      mockFirebaseAuth.verifyIdToken.mockResolvedValue({ uid: 'firebase-uid-123' });
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.login(loginPayload);

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(UnauthorizedException);
    });

    it('should return error when ID token verification fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          idToken: 'mock-id-token',
          refreshToken: 'mock-refresh-token',
        }),
      });

      mockFirebaseAuth.verifyIdToken.mockRejectedValue(new Error('Token verification failed'));

      const result = await service.login(loginPayload);

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refreshToken', () => {
    const refreshPayload = { refreshToken: 'valid-refresh-token' };

    it('should successfully refresh tokens', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id_token: 'new-id-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }),
      });

      mockFirebaseAuth.verifyIdToken.mockResolvedValue({ uid: 'firebase-uid-123' });
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.refreshToken(refreshPayload);

      expect(result.isError).toBe(false);
      expect(result.data).toEqual({
        accessToken: 'new-id-token',
        refreshToken: 'new-refresh-token',
        expiresIn: 3600,
      });
    });

    it('should return error for expired refresh token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'TOKEN_EXPIRED',
        }),
      });

      const result = await service.refreshToken(refreshPayload);

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(UnauthorizedException);
    });

    it('should return error for invalid refresh token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'INVALID_REFRESH_TOKEN',
        }),
      });

      const result = await service.refreshToken(refreshPayload);

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(UnauthorizedException);
    });

    it('should return error when user not found after token refresh', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id_token: 'new-id-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }),
      });

      mockFirebaseAuth.verifyIdToken.mockResolvedValue({ uid: 'firebase-uid-123' });
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.refreshToken(refreshPayload);

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should successfully logout a user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue(mockUser);
      mockFirebaseAuth.revokeRefreshTokens.mockResolvedValue(undefined);

      const result = await service.logout('firebase-uid-123');

      expect(result.isError).toBe(false);
      expect(result.data).toBeNull();
      expect(mockFirebaseAuth.revokeRefreshTokens).toHaveBeenCalledWith('firebase-uid-123');
    });

    it('should return error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.logout('nonexistent-firebase-id');

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('forgotPassword', () => {
    const forgotPasswordPayload = { email: 'test@example.com' };

    it('should successfully send password reset OTP', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockFirebaseAuth.getUserByEmail.mockResolvedValue({ uid: 'firebase-uid-123' });
      mockPrisma.passwordResetOtp.findFirst.mockResolvedValue(null);
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);
      mockNotificationService.notifyExternalUser.mockResolvedValue([
        { channel: { type: NotificationChannelTypeEnum.EMAIL }, status: NotificationStatusEnum.QUEUED },
      ]);

      jest.spyOn(otpUtil, 'generateOtp').mockReturnValue('1234');
      jest.spyOn(otpUtil, 'hashOtp').mockReturnValue('hashed-otp');

      const result = await service.forgotPassword(forgotPasswordPayload);

      expect(result.isError).toBe(false);
      expect(mockNotificationService.notifyExternalUser).toHaveBeenCalled();
    });

    it('should return success even when user not found (security)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword(forgotPasswordPayload);

      expect(result.isError).toBe(false);
      expect(result.data?.message).toContain('If an account with that email exists');
    });

    it('should return error for rate limiting', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockFirebaseAuth.getUserByEmail.mockResolvedValue({ uid: 'firebase-uid-123' });
      mockPrisma.passwordResetOtp.findFirst.mockResolvedValue({
        id: 'otp-id',
        email: 'test@example.com',
        createdAt: new Date(), // Recent OTP
      });

      const result = await service.forgotPassword(forgotPasswordPayload);

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(ConflictException);
    });

    it('should handle email sending failure', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockFirebaseAuth.getUserByEmail.mockResolvedValue({ uid: 'firebase-uid-123' });
      mockPrisma.passwordResetOtp.findFirst.mockResolvedValue(null);
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);
      mockNotificationService.notifyExternalUser.mockResolvedValue([
        { channel: { type: NotificationChannelTypeEnum.EMAIL }, status: NotificationStatusEnum.FAILED, error: 'SMTP error' },
      ]);
      mockPrisma.passwordResetOtp.updateMany.mockResolvedValue({ count: 1 });

      jest.spyOn(otpUtil, 'generateOtp').mockReturnValue('1234');
      jest.spyOn(otpUtil, 'hashOtp').mockReturnValue('hashed-otp');

      const result = await service.forgotPassword(forgotPasswordPayload);

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(ConflictException);
    });
  });

  describe('changePassword', () => {
    const changePasswordPayload = {
      oldPassword: 'OldPassword123!',
      newPassword: 'NewPassword123!',
    };

    it('should successfully change password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockFirebaseAuth.getUser.mockResolvedValue({ email: 'test@example.com' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ idToken: 'token' }),
      });
      mockFirebaseAuth.updateUser.mockResolvedValue({});
      mockFirebaseAuth.revokeRefreshTokens.mockResolvedValue(undefined);

      const result = await service.changePassword('firebase-uid-123', changePasswordPayload);

      expect(result.isError).toBe(false);
      expect(mockFirebaseAuth.updateUser).toHaveBeenCalledWith('firebase-uid-123', {
        password: changePasswordPayload.newPassword,
      });
    });

    it('should return error when old password is incorrect', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockFirebaseAuth.getUser.mockResolvedValue({ email: 'test@example.com' });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: 'INVALID_PASSWORD' } }),
      });

      const result = await service.changePassword('firebase-uid-123', changePasswordPayload);

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(UnauthorizedException);
    });

    it('should return error when old and new passwords are the same', async () => {
      const result = await service.changePassword('firebase-uid-123', {
        oldPassword: 'SamePassword123!',
        newPassword: 'SamePassword123!',
      });

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(ConflictException);
    });

    it('should return error for weak new password', async () => {
      const result = await service.changePassword('firebase-uid-123', {
        oldPassword: 'OldPassword123!',
        newPassword: 'weak',
      });

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(ConflictException);
    });

    it('should return error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.changePassword('nonexistent-firebase-id', changePasswordPayload);

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });
  });

  describe('verifyPasswordResetOtp', () => {
    const verifyOtpPayload = {
      email: 'test@example.com',
      otp: '1234',
    };

    it('should successfully verify OTP', async () => {
      const mockOtpRecord = {
        id: 'otp-id',
        email: 'test@example.com',
        otp: 'hashed-otp',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        isUsed: false,
      };

      mockPrisma.passwordResetOtp.findFirst.mockResolvedValue(mockOtpRecord);
      mockPrisma.passwordResetOtp.update.mockResolvedValue({});
      jest.spyOn(otpUtil, 'verifyOtp').mockReturnValue(true);

      const result = await service.verifyPasswordResetOtp(verifyOtpPayload);

      expect(result.isError).toBe(false);
      expect(result.data?.message).toBe('OTP verified successfully');
    });

    it('should return error for invalid OTP', async () => {
      const mockOtpRecord = {
        id: 'otp-id',
        email: 'test@example.com',
        otp: 'hashed-otp',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        isUsed: false,
      };

      mockPrisma.passwordResetOtp.findFirst.mockResolvedValue(mockOtpRecord);
      jest.spyOn(otpUtil, 'verifyOtp').mockReturnValue(false);

      const result = await service.verifyPasswordResetOtp(verifyOtpPayload);

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(UnauthorizedException);
    });

    it('should return error for expired OTP', async () => {
      mockPrisma.passwordResetOtp.findFirst.mockResolvedValue(null);

      const result = await service.verifyPasswordResetOtp(verifyOtpPayload);

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('resetPassword', () => {
    const resetPasswordPayload = {
      email: 'test@example.com',
      newPassword: 'NewPassword123!',
    };

    it('should successfully reset password', async () => {
      const mockOtpRecord = {
        id: 'otp-id',
        email: 'test@example.com',
        otp: 'hashed-otp',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        isUsed: false,
        verifiedAt: new Date(),
      };

      mockPrisma.passwordResetOtp.findFirst.mockResolvedValue(mockOtpRecord);
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockFirebaseAuth.getUserByEmail.mockResolvedValue({ uid: 'firebase-uid-123' });
      mockFirebaseAuth.updateUser.mockResolvedValue({});
      mockPrisma.passwordResetOtp.update.mockResolvedValue({});
      mockFirebaseAuth.revokeRefreshTokens.mockResolvedValue(undefined);
      mockEmailService.sendPasswordResetConfirmation.mockResolvedValue(undefined);

      const result = await service.resetPassword(resetPasswordPayload);

      expect(result.isError).toBe(false);
      expect(result.data?.message).toBe('Password reset successfully');
      expect(mockFirebaseAuth.updateUser).toHaveBeenCalledWith('firebase-uid-123', {
        password: resetPasswordPayload.newPassword,
      });
    });

    it('should return error when OTP not verified', async () => {
      mockPrisma.passwordResetOtp.findFirst.mockResolvedValue(null);

      const result = await service.resetPassword(resetPasswordPayload);

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(UnauthorizedException);
    });

    it('should return error for weak password', async () => {
      const result = await service.resetPassword({
        email: 'test@example.com',
        newPassword: 'weak',
      });

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(ConflictException);
    });

    it('should return error when user not found in database', async () => {
      const mockOtpRecord = {
        id: 'otp-id',
        email: 'test@example.com',
        otp: 'hashed-otp',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        isUsed: false,
        verifiedAt: new Date(),
      };

      mockPrisma.passwordResetOtp.findFirst.mockResolvedValue(mockOtpRecord);
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.resetPassword(resetPasswordPayload);

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('should return error when Firebase user not found', async () => {
      const mockOtpRecord = {
        id: 'otp-id',
        email: 'test@example.com',
        otp: 'hashed-otp',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        isUsed: false,
        verifiedAt: new Date(),
      };

      mockPrisma.passwordResetOtp.findFirst.mockResolvedValue(mockOtpRecord);
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockFirebaseAuth.getUserByEmail.mockRejectedValue({ code: 'auth/user-not-found' });

      const result = await service.resetPassword(resetPasswordPayload);

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });
  });

  describe('signInWithGoogle', () => {
    const googleSignInPayload = { idToken: 'google-id-token' };

    it('should successfully sign in existing user with Google', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            sub: 'google-user-id',
            email: 'test@example.com',
            name: 'Test User',
            picture: 'https://example.com/avatar.jpg',
            email_verified: 'true',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            idToken: 'firebase-id-token',
            refreshToken: 'firebase-refresh-token',
          }),
        });

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue(mockUser);
      mockFirebaseAuth.createCustomToken.mockResolvedValue('custom-token');

      const result = await service.signInWithGoogle(googleSignInPayload);

      expect(result.isError).toBe(false);
      expect(result.data).toEqual({
        accessToken: 'firebase-id-token',
        refreshToken: 'firebase-refresh-token',
      });
    });

    it('should create new user when signing in with Google for first time', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            sub: 'google-user-id',
            email: 'newuser@example.com',
            name: 'New User',
            picture: 'https://example.com/avatar.jpg',
            email_verified: 'true',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            idToken: 'firebase-id-token',
            refreshToken: 'firebase-refresh-token',
          }),
        });

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockFirebaseAuth.createUser.mockResolvedValue({ uid: 'new-firebase-uid' });
      mockPrisma.user.create.mockResolvedValue({ ...mockUser, email: 'newuser@example.com' });
      mockFirebaseAuth.createCustomToken.mockResolvedValue('custom-token');

      const result = await service.signInWithGoogle(googleSignInPayload);

      expect(result.isError).toBe(false);
      expect(mockFirebaseAuth.createUser).toHaveBeenCalled();
      expect(mockPrisma.user.create).toHaveBeenCalled();
    });

    it('should return error for invalid Google token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Unauthorized',
      });

      const result = await service.signInWithGoogle(googleSignInPayload);

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(UnauthorizedException);
    });

    it('should return error when token info is incomplete', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sub: 'google-user-id',
          // Missing email
        }),
      });

      const result = await service.signInWithGoogle(googleSignInPayload);

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(UnauthorizedException);
    });

    it('should handle Firebase user already exists during Google sign-in', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            sub: 'google-user-id',
            email: 'existing@example.com',
            name: 'Existing User',
            email_verified: 'true',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            idToken: 'firebase-id-token',
            refreshToken: 'firebase-refresh-token',
          }),
        });

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockFirebaseAuth.createUser.mockRejectedValue({ code: 'auth/email-already-exists' });
      mockFirebaseAuth.getUserByEmail.mockResolvedValue({ uid: 'existing-firebase-uid' });
      mockPrisma.user.create.mockResolvedValue({ ...mockUser, email: 'existing@example.com' });
      mockFirebaseAuth.createCustomToken.mockResolvedValue('custom-token');

      const result = await service.signInWithGoogle(googleSignInPayload);

      expect(result.isError).toBe(false);
      expect(mockFirebaseAuth.getUserByEmail).toHaveBeenCalledWith('existing@example.com');
    });
  });

  describe('signInWithFacebook', () => {
    const facebookSignInPayload = { accessToken: 'facebook-access-token' };

    it('should successfully sign in existing user with Facebook', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'facebook-user-id',
            email: 'test@example.com',
            name: 'Test User',
            picture: { data: { url: 'https://example.com/avatar.jpg' } },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            idToken: 'firebase-id-token',
            refreshToken: 'firebase-refresh-token',
          }),
        });

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue(mockUser);
      mockFirebaseAuth.createCustomToken.mockResolvedValue('custom-token');

      const result = await service.signInWithFacebook(facebookSignInPayload);

      expect(result.isError).toBe(false);
      expect(result.data).toEqual({
        accessToken: 'firebase-id-token',
        refreshToken: 'firebase-refresh-token',
      });
    });

    it('should create new user when signing in with Facebook for first time', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'facebook-user-id',
            email: 'newuser@example.com',
            name: 'New User',
            picture: { data: { url: 'https://example.com/avatar.jpg' } },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            idToken: 'firebase-id-token',
            refreshToken: 'firebase-refresh-token',
          }),
        });

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockFirebaseAuth.createUser.mockResolvedValue({ uid: 'new-firebase-uid' });
      mockPrisma.user.create.mockResolvedValue({ ...mockUser, email: 'newuser@example.com' });
      mockFirebaseAuth.createCustomToken.mockResolvedValue('custom-token');

      const result = await service.signInWithFacebook(facebookSignInPayload);

      expect(result.isError).toBe(false);
      expect(mockFirebaseAuth.createUser).toHaveBeenCalled();
      expect(mockPrisma.user.create).toHaveBeenCalled();
    });

    it('should return error for invalid Facebook token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: 'Invalid token' } }),
      });

      const result = await service.signInWithFacebook(facebookSignInPayload);

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(UnauthorizedException);
    });

    it('should return error when Facebook user has no email', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'facebook-user-id',
          name: 'Test User',
          // Missing email
        }),
      });

      const result = await service.signInWithFacebook(facebookSignInPayload);

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(UnauthorizedException);
    });

    it('should handle Firebase user already exists during Facebook sign-in', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'facebook-user-id',
            email: 'existing@example.com',
            name: 'Existing User',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            idToken: 'firebase-id-token',
            refreshToken: 'firebase-refresh-token',
          }),
        });

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockFirebaseAuth.createUser.mockRejectedValue({ code: 'auth/email-already-exists' });
      mockFirebaseAuth.getUserByEmail.mockResolvedValue({ uid: 'existing-firebase-uid' });
      mockPrisma.user.create.mockResolvedValue({ ...mockUser, email: 'existing@example.com' });
      mockFirebaseAuth.createCustomToken.mockResolvedValue('custom-token');

      const result = await service.signInWithFacebook(facebookSignInPayload);

      expect(result.isError).toBe(false);
      expect(mockFirebaseAuth.getUserByEmail).toHaveBeenCalledWith('existing@example.com');
    });
  });

  describe('validatePasswordStrength (via changePassword)', () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    });

    it('should reject password shorter than 8 characters', async () => {
      const result = await service.changePassword('firebase-uid-123', {
        oldPassword: 'OldPassword123!',
        newPassword: 'Short1!',
      });

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(ConflictException);
    });

    it('should reject password without letters', async () => {
      const result = await service.changePassword('firebase-uid-123', {
        oldPassword: 'OldPassword123!',
        newPassword: '12345678!',
      });

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(ConflictException);
    });

    it('should reject password without numbers or special characters', async () => {
      const result = await service.changePassword('firebase-uid-123', {
        oldPassword: 'OldPassword123!',
        newPassword: 'OnlyLetters',
      });

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(ConflictException);
    });

    it('should accept valid password with letters, numbers, and special characters', async () => {
      mockFirebaseAuth.getUser.mockResolvedValue({ email: 'test@example.com' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ idToken: 'token' }),
      });
      mockFirebaseAuth.updateUser.mockResolvedValue({});
      mockFirebaseAuth.revokeRefreshTokens.mockResolvedValue(undefined);

      const result = await service.changePassword('firebase-uid-123', {
        oldPassword: 'OldPassword123!',
        newPassword: 'ValidPass123!',
      });

      expect(result.isError).toBe(false);
    });
  });
});
