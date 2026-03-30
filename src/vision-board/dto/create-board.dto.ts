import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBoardDto {
    @ApiProperty({
        description: 'The name of the vision board',
        example: 'My Goals',
    })
    @IsString()
    @IsNotEmpty()
    name: string;
}
