import { Controller } from '@nestjs/common';

@Controller()
export class BaseController {
  async response({
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
