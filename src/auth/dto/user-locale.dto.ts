import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class UserLocationDto {
    @ApiPropertyOptional({
        description: 'ISO 3166-1 alpha-2 country code',
        example: 'US',
    })
    @IsOptional()
    @IsString()
    @Length(2, 2, { message: 'countryCode must be a 2-letter ISO code' })
    countryCode?: string;

    @ApiPropertyOptional({
        description: 'City name; timezone is resolved server-side from country + city',
        example: 'Chicago',
    })
    @IsOptional()
    @IsString()
    city?: string;
}
