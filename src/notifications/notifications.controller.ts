import {
  Controller,
  Post,
  Delete,
  Body,
  UseGuards,
  Get,
  Patch,
  Param,
  Query,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import {
  RegisterPushTokenDto,
  RemovePushTokenDto,
  SendNotificationDto,
  SendBulkNotificationDto,
  CreateManualNotificationDto,
} from './dto';
import { BaseController, FirebaseUser } from 'src/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { auth } from 'firebase-admin';
import { FirebaseGuard } from '@alpha018/nestjs-firebase-auth';

@ApiTags('Notifications')
@ApiBearerAuth('firebase')
@Controller('notifications')
export class NotificationsController extends BaseController {
  constructor(private readonly notificationsService: NotificationsService) {
    super();
  }

  @Post('register-token')
  @ApiOperation({ summary: 'Register push token for push notifications (Expo)' })
  @UseGuards(FirebaseGuard)
  async registerToken(
    @FirebaseUser() user: auth.DecodedIdToken,
    @Body() form: RegisterPushTokenDto
  ) {
    const result = await this.notificationsService.registerPushToken(
      user.uid,
      form
    );
    if (result.isError) throw result.error;

    return this.response({
      message: 'Push token registered',
      data: result.data,
    });
  }

  @Delete('remove-token')
  @ApiOperation({ summary: 'Remove push device token' })
  @UseGuards(FirebaseGuard)
  async removeToken(
    @FirebaseUser() user: auth.DecodedIdToken,
    @Body() form: RemovePushTokenDto
  ) {
    const result = await this.notificationsService.removePushToken(
      user.uid,
      form
    );
    if (result.isError) throw result.error;

    return this.response({
      message: 'Push token removed',
      data: result.data,
    });
  }

  @Get('my-tokens')
  @ApiOperation({ summary: 'Get all registered push tokens for current user' })
  @UseGuards(FirebaseGuard)
  async getMyTokens(@FirebaseUser() user: auth.DecodedIdToken) {
    const result = await this.notificationsService.getUserTokens(user.uid);
    if (result.isError) throw result.error;

    return this.response({
      message: 'Tokens retrieved',
      data: result.data,
    });
  }

  @Get()
  @ApiOperation({ summary: 'Get user notifications with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'perPage', required: false, type: Number, description: 'Items per page (default: 10, max: 100)' })
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean, description: 'Filter to show only unread notifications (default: false)' })
  @UseGuards(FirebaseGuard)
  async getNotifications(
    @FirebaseUser() user: auth.DecodedIdToken,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    const pageNumber = Math.max(1, parseInt(String(page || '1'), 10) || 1);
    const perPageNumber = Math.min(100, Math.max(1, parseInt(String(perPage || '10'), 10) || 10));
    const unreadOnlyFlag = unreadOnly === 'true';

    const result = await this.notificationsService.getUserNotifications(
      user.uid,
      pageNumber,
      perPageNumber,
      unreadOnlyFlag,
    );
    if (result.isError) throw result.error;

    return this.response({
      message: 'Notifications retrieved',
      data: result.data,
    });
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count for current user' })
  @UseGuards(FirebaseGuard)
  async getUnreadCount(@FirebaseUser() user: auth.DecodedIdToken) {
    const result = await this.notificationsService.countUnreadNotifications(user.uid);
    if (result.isError) throw result.error;

    return this.response({
      message: 'Unread count retrieved',
      data: result.data,
    });
  }

  @Patch(':notificationId/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiParam({ name: 'notificationId', description: 'Notification ID' })
  @UseGuards(FirebaseGuard)
  async markNotificationAsRead(
    @FirebaseUser() user: auth.DecodedIdToken,
    @Param('notificationId') notificationId: string,
  ) {
    const result = await this.notificationsService.markNotificationAsRead(
      user.uid,
      notificationId,
    );
    if (result.isError) throw result.error;

    return this.response({
      message: 'Notification marked as read',
      data: result.data,
    });
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read for current user' })
  @UseGuards(FirebaseGuard)
  async markAllNotificationsAsRead(@FirebaseUser() user: auth.DecodedIdToken) {
    const result = await this.notificationsService.markAllNotificationsAsRead(user.uid);
    if (result.isError) throw result.error;

    return this.response({
      message: 'All notifications marked as read',
      data: result.data,
    });
  }

  @Post('manual')
  @ApiOperation({ summary: 'Manually create and send a notification to a user' })
  @UseGuards(FirebaseGuard)
  async createManualNotification(@Body() form: CreateManualNotificationDto) {
    const result = await this.notificationsService.createManualNotification(form);
    if (result.isError) throw result.error;

    return this.response({
      message: 'Notification created',
      data: result.data,
    });
  }

  //add delete notification endpoint to delete a notification by id 



  /**
   * @deprecated Use notifyUser() from INotificationService instead
   */
  // @Post('send')
  // @ApiOperation({ summary: 'Send notification to a specific user' })
  // @UseGuards(FirebaseGuard)
  // async sendNotification(@Body() form: SendNotificationDto) {
  //   const result = await this.notificationsService.sendNotification(form);
  //   if (result.isError) throw result.error;

  //   return this.response({
  //     message: 'Notification sent',
  //     data: result.data,
  //   });
  // }

  /**
   * @deprecated Use notifyBulkUsers() from INotificationService instead
   */
  // @Post('send-bulk')
  // @ApiOperation({ summary: 'Send notification to multiple users' })
  // @UseGuards(FirebaseGuard)
  // async sendBulkNotification(@Body() form: SendBulkNotificationDto) {
  //   const result = await this.notificationsService.sendBulkNotification(form);
  //   if (result.isError) throw result.error;

  //   return this.response({
  //     message: 'Bulk notification sent',
  //     data: result.data,
  //   });
  // }
}
