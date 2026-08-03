import { IsNotEmpty, IsString } from 'class-validator';

export class SetUserNameDto {
  @IsString()
  @IsNotEmpty()
  username: string;
}
