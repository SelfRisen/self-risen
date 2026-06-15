import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';
import { UserLocationDto } from './user-locale.dto';

export class SignUp extends UserLocationDto {
    @ApiProperty({ required: true })
    @IsNotEmpty()
    @IsString()
    name: string;

    @ApiProperty({ required: true })
    @IsNotEmpty()
    @IsEmail()
    email: string;

    @ApiProperty({ required: true })
    @IsNotEmpty()
    @IsString()
    password: string;

    @ApiProperty({
        required: true,
        description: 'ISO 3166-1 alpha-2 country code; server derives timezone',
        example: 'US',
    })
    @IsNotEmpty()
    @IsString()
    @Length(2, 2, { message: 'countryCode must be a 2-letter ISO code' })
    declare countryCode: string;
}
