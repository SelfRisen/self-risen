export type ServiceResponse<T> =
  | {
      isError: true;
      errMessage: string;
      error: Error;
      data?: never;
    }
  | {
      isError: false;
      data: T;
      error?: never;
      errMessage?: never;
    };
