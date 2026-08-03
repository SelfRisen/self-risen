import {
  Controller,
  Post,
  Body,
  Patch,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  SignUp,
  ResetPasswordDto,
  SetUserNameDto,
  LoginDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ChangePasswordDto,
  VerifyPasswordResetOtpDto,
  GoogleSignInDto,
  AppleSignInDto,
  FacebookSignInDto,
} from './dto';
import { BaseController, FirebaseUser } from 'src/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { auth } from 'firebase-admin';
import { FirebaseGuard } from '@alpha018/nestjs-firebase-auth';

@ApiTags('Auth')
@Controller('auth')
export class AuthController extends BaseController {
  constructor(private readonly authService: AuthService) {
    super();
  }

  @Post('signup')
  async signUp(@Body() form: SignUp) {
    const user = await this.authService.signUp(form);

    if (user.isError) throw user.error;

    return this.response({
      message: 'Account Created',
      data: user.data,
    });
  }

  @Post('login')
  @ApiOperation({ summary: 'Login with email and password' })
  async login(@Body() form: LoginDto) {
    const result = await this.authService.login(form);
    if (result.isError) throw result.error;

    return this.response({
      message: 'Login successful',
      data: result.data,
    });
  }

  @Post('refresh-token')
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  async refreshToken(@Body() form: RefreshTokenDto) {
    const result = await this.authService.refreshToken(form);
    if (result.isError) throw result.error;

    return this.response({
      message: 'Token refreshed successfully',
      data: result.data,
    });
  }

  @Patch('set-username')
  @ApiBearerAuth('firebase')
  @ApiOperation({ summary: 'Set username for user' })
  @UseGuards(FirebaseGuard)
  async setUserName(
    @FirebaseUser() user: auth.DecodedIdToken,
    @Body() form: SetUserNameDto,
  ) {
    const result = await this.authService.setUserName(user.uid, form);
    if (result.isError) throw result.error;
    return this.response({
      message: 'Username Set',
      data: result.data,
    });
  }

  @Patch('logout')
  @ApiBearerAuth('firebase')
  @ApiOperation({ summary: 'Logout user' })
  @UseGuards(FirebaseGuard)
  async logout(@FirebaseUser() user: auth.DecodedIdToken) {
    const logout = await this.authService.logout(user.uid);
    if (logout.isError) throw logout.error;
    return this.response({
      message: 'Logout Successful',
      data: logout.data,
    });
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request password reset OTP via email' })
  async forgotPassword(@Body() form: ForgotPasswordDto) {
    const result = await this.authService.forgotPassword(form);
    if (result.isError) throw result.error;

    return this.response({
      message:
        'If an account with that email exists, a password reset OTP has been sent.',
      data: result.data,
    });
  }

  @Post('verify-password-reset-otp')
  @ApiOperation({ summary: 'Verify password reset OTP code' })
  async verifyPasswordResetOtp(@Body() form: VerifyPasswordResetOtpDto) {
    const result = await this.authService.verifyPasswordResetOtp(form);
    if (result.isError) throw result.error;

    return this.response({
      message: 'OTP verified successfully',
      data: result.data,
    });
  }

  @Patch('change-password')
  @ApiBearerAuth('firebase')
  @ApiOperation({ summary: 'Change password for authenticated user' })
  @UseGuards(FirebaseGuard)
  async changePassword(
    @FirebaseUser() user: auth.DecodedIdToken,
    @Body() form: ChangePasswordDto,
  ) {
    const result = await this.authService.changePassword(user.uid, form);
    if (result.isError) throw result.error;

    return this.response({
      message: 'Password changed successfully',
      data: result.data,
    });
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password after OTP has been verified' })
  async resetPassword(@Body() form: ResetPasswordDto) {
    const result = await this.authService.resetPassword(form);
    if (result.isError) throw result.error;

    return this.response({
      message: 'Password reset successfully',
      data: result.data,
    });
  }

  @Post('signin/google')
  @ApiOperation({
    summary: 'Sign in with Google using Google ID token (Google OAuth)',
  })
  async signInWithGoogle(@Body() form: GoogleSignInDto) {
    const result = await this.authService.signInWithGoogle(form);
    if (result.isError) throw result.error;

    return this.response({
      message: 'Google sign-in successful',
      data: result.data,
    });
  }

  @Post('signin/facebook')
  @ApiOperation({
    summary:
      'Sign in with Facebook using a Facebook access token (Facebook Login)',
  })
  async signInWithFacebook(@Body() form: FacebookSignInDto) {
    const result = await this.authService.signInWithFacebook(form);
    if (result.isError) throw result.error;

    return this.response({
      message: 'Facebook sign-in successful',
      data: result.data,
    });
  }

  @Post('signin/apple')
  @ApiOperation({
    summary: 'Sign in with Apple using Apple identity token (Apple Sign-In)',
  })
  async signInWithApple(@Body() form: AppleSignInDto) {
    const result = await this.authService.signInWithApple(form);
    if (result.isError) throw result.error;

    return this.response({
      message: 'Apple sign-in successful',
      data: result.data,
    });
  }
}
