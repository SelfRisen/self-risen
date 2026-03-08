import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { User } from '@prisma/client';
import { BaseService, config, logger } from 'src/common';
import { DatabaseProvider } from 'src/database/database.provider';
import {
  SignUp,
  SetUserNameDto,
  LoginDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ChangePasswordDto,
  ResetPasswordDto,
  VerifyPasswordResetOtpDto,
  GoogleSignInDto,
  AppleSignInDto
} from './dto';
import { auth } from 'firebase-admin';
import { INotificationService } from 'src/notifications/interfaces/notification.interface';
import { NotificationTypeEnum, NotificationChannelTypeEnum, NotificationStatusEnum } from 'src/notifications/enums/notification.enum';
import { generateOtp, hashOtp, verifyOtp } from './utils/otp.util';
import { randomUUID } from 'crypto';
import { jwtVerify, createRemoteJWKSet } from 'jose';

@Injectable()
export class AuthService extends BaseService {
  constructor(
    private prisma: DatabaseProvider,
    private notificationService: INotificationService,
  ) {
    super();
  }

  async signUp(payload: SignUp) {
    const { name, email, password } = payload;

    let firebaseUser: auth.UserRecord;
    try {
      firebaseUser = await auth().createUser({
        email,
        password,
        displayName: name,
      });
    } catch (error) {
      if (error.code === 'auth/email-already-exists') {
        logger.error(`User with email ${email} already exists`);
        return this.HandleError(
          new ConflictException('User with this email already exists')
        );
      }
      if (error.code === 'auth/invalid-email') {
        logger.error(`Invalid email address: ${email}`);
        return this.HandleError(
          new ConflictException('Invalid email address')
        );
      }
      if (error.code === 'auth/weak-password') {
        logger.error(`Weak password detected for email: ${email}`);
        return this.HandleError(
          new ConflictException('Password is too weak. Please use a password with at least 6 characters.')
        );
      }
      return this.HandleError(error);
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          firebaseId: firebaseUser.uid,
          email,
          name,
          lastLoggedInAt: new Date()
        }
      });

      return this.Results({
        user,
        firebaseId: firebaseUser.uid
      });
    } catch (error) {
      try {
        await auth().deleteUser(firebaseUser.uid);
      } catch (deleteError) {
        logger.error(`Failed to rollback Firebase user ${firebaseUser.uid}: ${deleteError.message || deleteError}`);
      }
      return this.HandleError(error);
    }
  }

  async setUserName(firebaseId: string, payload: SetUserNameDto) {
    const { username } = payload;
    const user = await this.prisma.user.findUnique({
      where: { firebaseId }
    });
    if (!user) {
      return this.HandleError(
        new NotFoundException('User not found')
      );
    }
    const userwithusername = await this.prisma.user.update({
      where: { id: user.id },
      data: { username }
    });
    return this.Results(userwithusername);
  }

  async login(payload: LoginDto) {
    const { email, password } = payload;
    const firebaseWebApiKey = config.FIREBASE_API_KEY;
    try {
      const response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseWebApiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            password,
            returnSecureToken: true,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        logger.error(`Firebase authentication failed: ${JSON.stringify(data)}`);

        if (data.error?.message === 'INVALID_PASSWORD' || data.error?.message === 'EMAIL_NOT_FOUND') {
          return this.HandleError(
            new UnauthorizedException('Invalid email or password')
          );
        }

        if (data.error?.message === 'USER_DISABLED') {
          return this.HandleError(
            new UnauthorizedException('User account has been disabled')
          );
        }

        return this.HandleError(
          new UnauthorizedException(data.error?.message || 'Authentication failed')
        );
      }

      // Verify the ID token using Admin SDK
      let verifiedUser: auth.DecodedIdToken;
      try {
        verifiedUser = await auth().verifyIdToken(data.idToken, true);
      } catch (error) {
        logger.error(`Failed to verify ID token: ${error.message || error}`);
        return this.HandleError(
          // new UnauthorizedException('Failed to verify authentication token')
          new UnauthorizedException('User not found')
        );
      }

      const user = await this.prisma.user.findUnique({
        where: { firebaseId: verifiedUser.uid }
      });

      if (!user) {
        return this.HandleError(
          new UnauthorizedException('User not found')
        );
      }

      // Update last logged in time
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          lastLoggedInAt: new Date()
        }
      });

      return this.Results({
        accessToken: data.idToken,
        refreshToken: data.refreshToken,
      });
    } catch (error) {
      logger.error(`Login2 error: ${error.message || error}`);
      return this.HandleError(
        new UnauthorizedException('Authentication failed. Please try again.')
      );
    }
  }

  async signInWithGoogle(payload: GoogleSignInDto) {
    const { idToken } = payload;

    try {
      // Verify Google ID token with Google's tokeninfo endpoint
      const tokenInfoResponse = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
      );

      if (!tokenInfoResponse.ok) {
        logger.error(`Google token verification failed: ${tokenInfoResponse.statusText}`);
        return this.HandleError(
          new UnauthorizedException('Invalid Google ID token')
        );
      }

      const tokenInfo = await tokenInfoResponse.json();

      // Validate token info
      if (!tokenInfo.email || !tokenInfo.sub) {
        logger.error(`Invalid Google token info: ${JSON.stringify(tokenInfo)}`);
        return this.HandleError(
          new UnauthorizedException('Invalid Google token information')
        );
      }

      // Extract user information from Google token
      const googleUserId = tokenInfo.sub; // Google user ID
      const email = tokenInfo.email;
      const name = tokenInfo.name || email.split('@')[0];
      const picture = tokenInfo.picture || null;

      // Check if user exists in database by email (since we don't have Firebase UID yet)
      let user = await this.prisma.user.findUnique({
        where: { email }
      });

      let firebaseUid: string;
      try {
        const result = await this.createOrGetOAuthUser({
          email,
          name,
          existingUser: user,
          avatar: picture,
          emailVerified: tokenInfo.email_verified === 'true'
        });
        user = result.user;
        firebaseUid = result.firebaseUid;
      } catch (error) {
        return this.HandleError(error);
      }

      // Generate Firebase tokens for API authentication
      const customToken = await auth().createCustomToken(firebaseUid);

      // Exchange custom token for ID token and refresh token
      const firebaseWebApiKey = config.FIREBASE_API_KEY;
      const tokenResponse = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${firebaseWebApiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token: customToken,
            returnSecureToken: true,
          }),
        }
      );

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok) {
        logger.error(`Failed to exchange custom token: ${JSON.stringify(tokenData)}`);
        return this.HandleError(
          new UnauthorizedException('Failed to generate authentication tokens')
        );
      }

      return this.Results({
        accessToken: tokenData.idToken,
        refreshToken: tokenData.refreshToken,
      });
    } catch (error) {
      logger.error(`Google sign-in error: ${error.message || error}`);
      return this.HandleError(
        new UnauthorizedException('Google sign-in failed. Please try again.')
      );
    }
  }

  async signInWithApple(payload: AppleSignInDto) {
    const { idToken } = payload;

    try {
      // Create JWKS client for Apple's public keys
      const appleJWKS = createRemoteJWKSet(
        new URL('https://appleid.apple.com/auth/keys')
      );

      // Verify Apple identity token
      let verifiedToken;
      try {
        verifiedToken = await jwtVerify(idToken, appleJWKS, {
          issuer: 'https://appleid.apple.com',
          audience: config.APPLE_CLIENT_ID,
        });
      } catch (error) {
        logger.error(`Apple token verification failed: ${error.message || error}`);
        return this.HandleError(
          new UnauthorizedException('Invalid Apple ID token')
        );
      }

      const tokenPayload = verifiedToken.payload;

      // Validate required claims
      if (!tokenPayload.sub) {
        logger.error(`Invalid Apple token payload: missing sub`);
        return this.HandleError(
          new UnauthorizedException('Invalid Apple token information')
        );
      }

      // Extract user information from Apple token
      const appleUserId = tokenPayload.sub; // Apple user ID
      const email = tokenPayload.email as string | undefined;
      const emailVerified = tokenPayload.email_verified === true || tokenPayload.email_verified === 'true';

      // Name is only provided on first sign-in, may be in tokenPayload.name or null
      let name: string | undefined;
      if (tokenPayload.name) {
        // If name is an object (first sign-in), extract first and last name
        if (typeof tokenPayload.name === 'object') {
          const nameObj = tokenPayload.name as { firstName?: string; lastName?: string };
          name = [nameObj.firstName, nameObj.lastName].filter(Boolean).join(' ') || undefined;
        } else if (typeof tokenPayload.name === 'string') {
          name = tokenPayload.name;
        }
      }

      // Email is required for user creation
      if (!email) {
        logger.error(`Apple token missing email: ${JSON.stringify(tokenPayload)}`);
        return this.HandleError(
          new UnauthorizedException('Email is required for Apple sign-in')
        );
      }

      // Check if user exists in database by email
      let user = await this.prisma.user.findUnique({
        where: { email }
      });

      let firebaseUid: string;
      try {
        const result = await this.createOrGetOAuthUser({
          email,
          name: name || email.split('@')[0],
          existingUser: user,
          emailVerified
        });
        user = result.user;
        firebaseUid = result.firebaseUid;
      } catch (error) {
        return this.HandleError(error);
      }

      // Generate Firebase tokens for API authentication
      const customToken = await auth().createCustomToken(firebaseUid);

      // Exchange custom token for ID token and refresh token
      const firebaseWebApiKey = config.FIREBASE_API_KEY;
      const tokenResponse = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${firebaseWebApiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token: customToken,
            returnSecureToken: true,
          }),
        }
      );

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok) {
        logger.error(`Failed to exchange custom token: ${JSON.stringify(tokenData)}`);
        return this.HandleError(
          new UnauthorizedException('Failed to generate authentication tokens')
        );
      }

      return this.Results({
        accessToken: tokenData.idToken,
        refreshToken: tokenData.refreshToken,
      });
    } catch (error) {
      logger.error(`Apple sign-in error: ${error.message || error}`);
      return this.HandleError(
        new UnauthorizedException('Apple sign-in failed. Please try again.')
      );
    }
  }

  async refreshToken(payload: RefreshTokenDto) {
    const { refreshToken } = payload;
    const firebaseWebApiKey = config.FIREBASE_API_KEY;

    try {
      const response = await fetch(
        `https://securetoken.googleapis.com/v1/token?key=${firebaseWebApiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
          }).toString(),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        logger.error(`Firebase token refresh failed: ${JSON.stringify(data)}`);

        if (data.error === 'TOKEN_EXPIRED' || data.error === 'INVALID_REFRESH_TOKEN') {
          return this.HandleError(
            new UnauthorizedException('Refresh token is invalid or expired. Please log in again.')
          );
        }

        return this.HandleError(
          new UnauthorizedException(data.error?.message || 'Token refresh failed')
        );
      }

      let verifiedUser: auth.DecodedIdToken;
      try {
        verifiedUser = await auth().verifyIdToken(data.id_token, true);
      } catch (error) {
        logger.error(`Failed to verify refreshed ID token: ${error.message || error}`);
        return this.HandleError(
          new UnauthorizedException('Failed to verify refreshed authentication token')
        );
      }

      // Find user in database to ensure they still exist
      const user = await this.prisma.user.findUnique({
        where: { firebaseId: verifiedUser.uid }
      });

      if (!user) {
        return this.HandleError(
          new UnauthorizedException('User profile not found')
        );
      }

      return this.Results({
        accessToken: data.id_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
      });
    } catch (error) {
      logger.error(`RefreshToken error: ${error.message || error}`);
      return this.HandleError(
        new UnauthorizedException('Token refresh failed. Please try again.')
      );
    }
  }

  async logout(firebaseId: string) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseId }
    });
    if (!user) {
      return this.HandleError(
        new UnauthorizedException('User not found')
      );
    }

    await auth().revokeRefreshTokens(firebaseId);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoggedOutAt: new Date() }
    });

    return this.Results(null);
  }

  async forgotPassword(payload: ForgotPasswordDto) {
    const { email } = payload;

    try {
      const user = await this.prisma.user.findUnique({
        where: { email }
      });

      if (!user) {
        logger.warn(`Password reset requested for non-existent email: ${email}`);
        return this.Results({
          message: 'If an account with that email exists, a password reset OTP has been sent.'
        });
      }

      let firebaseUser: auth.UserRecord;
      try {
        firebaseUser = await auth().getUserByEmail(email);
      } catch (error) {
        if (error.code === 'auth/user-not-found') {
          logger.warn(`Firebase user not found for email: ${email}`);
          return this.Results({
            message: 'If an account with that email exists, a password reset OTP has been sent.'
          });
        }
        throw error;
      }

      // Check rate limiting: if an OTP was created for this email within the last 5 minutes
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const recentOtp = await this.prisma.passwordResetOtp.findFirst({
        where: {
          email,
          createdAt: {
            gte: fiveMinutesAgo
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      if (recentOtp) {
        logger.warn(`Password reset OTP requested too soon for email: ${email}`);
        return this.HandleError(
          new ConflictException('Please wait 5 minutes before requesting another OTP.')
        );
      }

      // Generate 4-digit OTP
      const otp = generateOtp();
      const hashedOtp = hashOtp(otp);

      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await this.prisma.$transaction([
        this.prisma.passwordResetOtp.updateMany({
          where: {
            email,
            isUsed: false
          },
          data: {
            isUsed: true
          }
        }),
        this.prisma.passwordResetOtp.create({
          data: {
            email,
            otp: hashedOtp,
            expiresAt,
            isUsed: false
          }
        })
      ]);

      // Send OTP via email
      try {
        const requestId = `pwd-reset-${email}-${Date.now()}-${randomUUID()}`;
        const results = await this.notificationService.notifyExternalUser({
          email,
          type: NotificationTypeEnum.PASSWORD_RESET_OTP,
          requestId,
          channels: [{ type: NotificationChannelTypeEnum.EMAIL }],
          metadata: {
            title: 'Password Reset OTP',
            body: `Your password reset OTP is: ${otp}`,
            otp,
            email,
          },
        });

        // Check if notification was queued successfully
        const emailResult = results.find(
          (r) => r.channel.type === NotificationChannelTypeEnum.EMAIL
        );

        if (!emailResult || emailResult.status === NotificationStatusEnum.FAILED) {
          throw new Error(
            emailResult?.error || 'Failed to queue password reset email'
          );
        }

        logger.log(`Password reset OTP sent to email: ${email}`);
      } catch (emailError) {
        logger.error(`Failed to send password reset OTP email: ${emailError.message || emailError}`);
        // Mark the OTP as used since user can't receive it
        await this.prisma.passwordResetOtp.updateMany({
          where: {
            email,
            otp: hashedOtp,
            isUsed: false
          },
          data: {
            isUsed: true
          }
        });
        return this.HandleError(
          new ConflictException('Failed to send password reset email. Please try again later.')
        );
      }

      return this.Results(null);
    } catch (error) {
      logger.error(`Forgot password error: ${error.message || error}`);
      // Return generic message even on error for security
      return this.Results({
        message: 'If an account with that email exists, a password reset OTP has been sent.'
      });
    }
  }

  async changePassword(firebaseId: string, payload: ChangePasswordDto) {
    const { oldPassword, newPassword } = payload;

    try {
      // Validate password strength
      if (!this.validatePasswordStrength(newPassword)) {
        return this.HandleError(
          new ConflictException('Password must be at least 8 characters long and contain a mix of letters, numbers, and special characters.')
        );
      }

      // Check if new password is different from old password
      if (oldPassword === newPassword) {
        return this.HandleError(
          new ConflictException('New password must be different from the current password')
        );
      }

      // Find user by firebaseId
      const user = await this.prisma.user.findUnique({
        where: { firebaseId }
      });

      if (!user) {
        return this.HandleError(
          new NotFoundException('User not found')
        );
      }

      // Get Firebase user
      const firebaseUser = await auth().getUser(firebaseId);

      if (!firebaseUser.email) {
        return this.HandleError(
          new UnauthorizedException('User email not found')
        );
      }

      // Verify old password by attempting to sign in with it
      const firebaseWebApiKey = config.FIREBASE_API_KEY;
      const verifyResponse = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseWebApiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: firebaseUser.email,
            password: oldPassword,
            returnSecureToken: true,
          }),
        }
      );

      const verifyData = await verifyResponse.json();

      if (!verifyResponse.ok) {
        if (verifyData.error?.message === 'INVALID_PASSWORD' || verifyData.error?.message === 'EMAIL_NOT_FOUND') {
          return this.HandleError(
            new UnauthorizedException('Current password is incorrect')
          );
        }
        if (verifyData.error?.message === 'USER_DISABLED') {
          return this.HandleError(
            new UnauthorizedException('User account has been disabled')
          );
        }
        return this.HandleError(
          new UnauthorizedException(verifyData.error?.message || 'Failed to verify current password')
        );
      }

      // Old password is correct, now update to new password
      try {
        await auth().updateUser(firebaseId, {
          password: newPassword
        });
      } catch (error) {
        if (error.code === 'auth/weak-password') {
          return this.HandleError(
            new ConflictException('Password is too weak. Please use a password with at least 6 characters.')
          );
        }
        return this.HandleError(error);
      }

      // Revoke all refresh tokens for security
      await auth().revokeRefreshTokens(firebaseId);

      logger.log(`Password changed successfully for user: ${firebaseId}`);
      return this.Results(null);
    } catch (error) {
      logger.error(`Change password error: ${error.message || error}`);
      return this.HandleError(
        new UnauthorizedException('Failed to change password. Please try again.')
      );
    }
  }

  private validatePasswordStrength(password: string): boolean {
    // Minimum 8 characters
    if (password.length < 8) {
      return false;
    }

    // Maximum 128 characters (Firebase limit)
    if (password.length > 128) {
      return false;
    }

    // Check for at least one letter
    if (!/[a-zA-Z]/.test(password)) {
      return false;
    }

    // Check for at least one number or special character
    if (!/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      return false;
    }

    return true;
  }

  async verifyPasswordResetOtp(payload: VerifyPasswordResetOtpDto) {
    const { email, otp } = payload;

    try {
      // Find valid OTP record
      const otpRecord = await this.prisma.passwordResetOtp.findFirst({
        where: {
          email,
          isUsed: false,
          expiresAt: {
            gt: new Date() // Not expired
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      if (!otpRecord) {
        return this.HandleError(
          new UnauthorizedException('Invalid or expired OTP. Please request a new one.')
        );
      }

      // Verify OTP matches
      if (!verifyOtp(otp, otpRecord.otp)) {
        logger.warn(`Invalid OTP provided for email: ${email}`);
        return this.HandleError(
          new UnauthorizedException('Invalid OTP. Please check and try again.')
        );
      }

      // Mark OTP as verified (but not used yet)
      await this.prisma.passwordResetOtp.update({
        where: { id: otpRecord.id },
        data: { verifiedAt: new Date() }
      });

      return this.Results({
        message: 'OTP verified successfully',
        email: email
      });
    } catch (error) {
      logger.error(`Verify OTP error: ${error.message || error}`);
      return this.HandleError(
        new UnauthorizedException('Failed to verify OTP. Please try again.')
      );
    }
  }

  async resetPassword(payload: ResetPasswordDto) {
    const { email, newPassword } = payload;

    try {
      // Validate password strength
      if (!this.validatePasswordStrength(newPassword)) {
        return this.HandleError(
          new ConflictException('Password must be at least 8 characters long and contain a mix of letters, numbers, and special characters.')
        );
      }

      // Find verified (but not used) OTP record
      const otpRecord = await this.prisma.passwordResetOtp.findFirst({
        where: {
          email,
          isUsed: false,
          verifiedAt: {
            not: null // Must be verified
          },
          expiresAt: {
            gt: new Date() // Not expired
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      if (!otpRecord) {
        return this.HandleError(
          new UnauthorizedException('OTP not verified or expired. Please verify the OTP first.')
        );
      }

      // Find user in database
      const user = await this.prisma.user.findUnique({
        where: { email }
      });

      if (!user) {
        logger.warn(`Password reset attempted for non-existent user: ${email}`);
        return this.HandleError(
          new NotFoundException('User not found')
        );
      }

      // Get Firebase user by email
      let firebaseUser: auth.UserRecord;
      try {
        firebaseUser = await auth().getUserByEmail(email);
      } catch (error) {
        if (error.code === 'auth/user-not-found') {
          return this.HandleError(
            new NotFoundException('Firebase user not found')
          );
        }
        throw error;
      }

      // Update password using Firebase Admin SDK
      try {
        await auth().updateUser(firebaseUser.uid, {
          password: newPassword
        });
      } catch (error) {
        if (error.code === 'auth/weak-password') {
          return this.HandleError(
            new ConflictException('Password is too weak. Please use a password with at least 6 characters.')
          );
        }
        return this.HandleError(error);
      }

      // Mark OTP as used (single-use enforcement)
      await this.prisma.passwordResetOtp.update({
        where: { id: otpRecord.id },
        data: { isUsed: true }
      });

      // Revoke all refresh tokens for security
      try {
        await auth().revokeRefreshTokens(firebaseUser.uid);
      } catch (error) {
        logger.error(`Failed to revoke refresh tokens after password reset: ${error.message || error}`);
        // Don't fail the request if token revocation fails
      }

      // Send confirmation email to notify user of password change
      try {
        const requestId = `pwd-reset-confirm-${user.id}-${Date.now()}-${randomUUID()}`;
        const results = await this.notificationService.notifyExternalUser({
          email,
          type: NotificationTypeEnum.PASSWORD_RESET_CONFIRMATION,
          requestId,
          channels: [{ type: NotificationChannelTypeEnum.EMAIL }],
          metadata: {
            title: 'Password Changed Successfully',
            name: user.name,
          },
        });
        const emailResult = results.find(
          (r) => r.channel.type === NotificationChannelTypeEnum.EMAIL
        );
        if (emailResult?.status === NotificationStatusEnum.FAILED) {
          logger.error(`Failed to send password reset confirmation: ${emailResult.error}`);
        }
      } catch (emailError) {
        logger.error(`Failed to send password reset confirmation email: ${emailError.message || emailError}`);
        // Don't fail the request if email fails
      }

      logger.log(`Password reset successfully for user: ${email}`);
      return this.Results({
        message: 'Password reset successfully',
        email: email
      });
    } catch (error) {
      logger.error(`Reset password error: ${error.message || error}`);
      return this.HandleError(
        new UnauthorizedException('Failed to reset password. Please try again.')
      );
    }
  }

  /**
   * Ensures a user exists for OAuth (Google/Apple): creates Firebase + DB user if missing,
   * or updates lastLoggedInAt if user exists. Handles auth/email-already-exists and P2002.
   */
  private async createOrGetOAuthUser(params: {
    email: string;
    name: string;
    existingUser: User | null;
    avatar?: string | null;
    emailVerified?: boolean;
  }): Promise<{ user: User; firebaseUid: string }> {
    const { email, name, existingUser, avatar, emailVerified } = params;

    if (existingUser) {
      const firebaseUid = existingUser.firebaseId;
      const user = await this.prisma.user.update({
        where: { id: existingUser.id },
        data: { lastLoggedInAt: new Date() }
      });
      return { user, firebaseUid };
    }

    let firebaseUid: string;
    try {
      const firebaseUser = await auth().createUser({
        email,
        displayName: name,
        ...(avatar !== undefined && { photoURL: avatar ?? undefined }),
        ...(emailVerified !== undefined && { emailVerified })
      });
      firebaseUid = firebaseUser.uid;
    } catch (error) {
      if (error.code === 'auth/email-already-exists') {
        const firebaseUser = await auth().getUserByEmail(email);
        firebaseUid = firebaseUser.uid;
      } else {
        logger.error(`Failed to create Firebase user: ${error.message || error}`);
        throw new UnauthorizedException('Failed to create user account');
      }
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          firebaseId: firebaseUid,
          email,
          name,
          ...(avatar !== undefined && { avatar }),
          lastLoggedInAt: new Date()
        }
      });
      return { user, firebaseUid };
    } catch (error) {
      if (error.code === 'P2002') {
        const user = await this.prisma.user.findUnique({
          where: { email }
        });
        if (!user) {
          throw new ConflictException('Failed to create user account');
        }
        return { user, firebaseUid: user.firebaseId };
      }
      throw error;
    }
  }
}