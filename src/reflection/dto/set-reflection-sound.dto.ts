import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetReflectionSoundDto {
    @ApiProperty({
        description: 'Name of the sound from the stater-videos music list',
        example: 'bright-glow',
    })
    @IsString()
    @IsNotEmpty()
    name: string;
}
