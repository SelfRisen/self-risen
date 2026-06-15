import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export class UpdateUserDto {
    @ApiPropertyOptional({ example: 'Jane Doe' })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({ example: 'jane_risen' })
    @IsOptional()
    @IsString()
    username?: string;

    @ApiPropertyOptional({
        description: 'ISO 3166-1 alpha-2 country code; timezone is derived server-side',
        example: 'US',
    })
    @IsOptional()
    @IsString()
    @Length(2, 2, { message: 'countryCode must be a 2-letter ISO code' })
    countryCode?: string;

    @ApiPropertyOptional({
        enum: ['Sage', 'Phoenix', 'River', 'Quinn', 'Alex', 'Robin'],
        description: 'Default TTS voice persona',
        example: 'Sage',
    })
    @IsOptional()
    @IsString()
    @IsIn(['Sage', 'Phoenix', 'River', 'Quinn', 'Alex', 'Robin'])
    ttsVoicePreference?: string;
}
