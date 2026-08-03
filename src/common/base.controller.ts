import { Controller } from '@nestjs/common';

@Controller()
export class BaseController {
  response({
    message,
    data,
    metaData,
  }: {
    message: string;
    data?: unknown;
    metaData?: Record<string, any>;
  }) {
    return {
      message: message,
      data,
      metaData,
    };
  }
}
