import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BaseService } from 'src/common';
import { DatabaseProvider } from 'src/database/database.provider';
import { TextToSpeechService } from 'src/reflection/services/text-to-speech.service';
import { GeneratePersonaTtsDto } from './dto';

@Injectable()
export class StaterVideosService extends BaseService {
    constructor(
        private prisma: DatabaseProvider,
        private textToSpeechService: TextToSpeechService,
    ) {
        super();
    }

    async generatePersonaTts(firebaseId: string, dto: GeneratePersonaTtsDto) {
        const user = await this.prisma.user.findUnique({
            where: { firebaseId },
            select: { id: true },
        });

        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const persona = this.textToSpeechService.getPersonaMetadata(dto.voice);
        if (!persona) {
            return this.HandleError(new BadRequestException(`Unknown voice persona: ${dto.voice}`));
        }

        const audioUrl = await this.textToSpeechService.generateAffirmationAudio(
            dto.text.trim(),
            user.id,
            dto.voice,
        );

        if (!audioUrl) {
            return this.HandleError(
                new BadRequestException('Failed to generate TTS audio. Please try again.'),
            );
        }

        return this.Results({
            audioUrl,
            voice: persona.name,
            displayName: persona.displayName,
        });
    }

    async getFileUrls() {
        const light = [
            // {
            //     url: 'https://lstprxumviehmvbebcub.supabase.co/storage/v1/object/public/uploads/videos/starters/t7D57nFbnSPlFRuZw4uZqIuJL2Y2/60fda64b-d84a-4b8f-b160-2cf95ef1fa3b-1768767978757.mp4',
            //     name: 'bright-glow'
            // },
            {
                url: 'https://satyfurcysfjxwfhcizv.supabase.co/storage/v1/object/public/uploads/videos/starters/OrUQsjFHWOdTMmDzuD71Fl6AVgA3/832d2098-11fe-40d6-a514-f25eb36a5c31-1775146711989.mp4',
                name: 'golden-waves'
            },
            {
                url: 'https://satyfurcysfjxwfhcizv.supabase.co/storage/v1/object/public/uploads/videos/starters/OrUQsjFHWOdTMmDzuD71Fl6AVgA3/e7c06a04-7426-4d61-a0eb-3ee6e728cdfa-1775147474510.mp4',
                name: 'golden-sun'
            },
            {
                url: 'https://lstprxumviehmvbebcub.supabase.co/storage/v1/object/public/uploads/videos/starters/t7D57nFbnSPlFRuZw4uZqIuJL2Y2/78a8efd8-a10c-4b48-a309-832b46ffa034-1768768252248.mp4',
                name: 'ocean-view'
            },
            // {
            //     url: 'https://lstprxumviehmvbebcub.supabase.co/storage/v1/object/public/uploads/videos/starters/t7D57nFbnSPlFRuZw4uZqIuJL2Y2/a8efb95b-b8d8-4372-bf2e-732cccb343b6-1768768401303.mp4',
            //     name: 'sun'
            // }
        ];

        const dark = [
            {
                url: 'https://satyfurcysfjxwfhcizv.supabase.co/storage/v1/object/public/uploads/videos/starters/OrUQsjFHWOdTMmDzuD71Fl6AVgA3/b65073de-3d15-4db7-b5d4-4e15a884c238-1775150837039.mp4',
                name: 'Axis'
            },
            {
                url: 'https://satyfurcysfjxwfhcizv.supabase.co/storage/v1/object/public/uploads/videos/starters/OrUQsjFHWOdTMmDzuD71Fl6AVgA3/0d9876c0-69a2-462b-a9f5-ecb257d16359-1775147923266.mp4',
                name: 'mystic-forest'
            },
            {
                url: 'https://satyfurcysfjxwfhcizv.supabase.co/storage/v1/object/public/uploads/videos/starters/OrUQsjFHWOdTMmDzuD71Fl6AVgA3/912eba84-76e0-4cf8-b805-fb6999cb48a2-1775146277440.mp4',
                name: 'high-sea'
            },
            {
                url: 'https://satyfurcysfjxwfhcizv.supabase.co/storage/v1/object/public/uploads/videos/starters/OrUQsjFHWOdTMmDzuD71Fl6AVgA3/123e3b0c-ebe6-4997-b77b-ffe7ac44fce7-1775147688657.mp4',
                name: 'ice'
            },
            {
                url: 'https://satyfurcysfjxwfhcizv.supabase.co/storage/v1/object/public/uploads/videos/starters/OrUQsjFHWOdTMmDzuD71Fl6AVgA3/bf8317cd-a8a2-40d7-a402-7a1d4ef67138-1775146979127.mp4',
                name: 'space-odyssey'
            }
        ];

        return this.Results({ light, dark });
    }

    private getSoundList(): Array<{ url: string; name: string; description: string }> {
        return [
            {
                url: 'https://esatcoinkzhgaebrtajt.supabase.co/storage/v1/object/public/uploads/Background%20Sounds/1.%20Ambient%20Piano%20-%20Main%20version.mp3',
                name: 'Ambient Piano',
                description: 'Soft solo piano for calm, reflective sessions.',
            },
            {
                url: 'https://esatcoinkzhgaebrtajt.supabase.co/storage/v1/object/public/uploads/Background%20Sounds/meditation.mp3',
                name: 'meditation',
                description: 'Gentle ambient meditation bed with piano.',
            },
            {
                url: 'https://esatcoinkzhgaebrtajt.supabase.co/storage/v1/object/public/uploads/Background%20Sounds/meditation%20(not%20piano).mp3',
                name: 'meditation - No Piano',
                description: 'Gentle ambient meditation bed without piano.',
            },
            {
                url: 'https://esatcoinkzhgaebrtajt.supabase.co/storage/v1/object/public/uploads/Background%20Sounds/Ambient%20Uplifting.mp3',
                name: 'Ambient Uplifting',
                description: 'Bright, uplifting ambient pad for positive affirmations.',
            },
            {
                url: 'https://esatcoinkzhgaebrtajt.supabase.co/storage/v1/object/public/uploads/Background%20Sounds/Inspiring%20Dreamy%20Happy%20Adventure%20Pop%20(short%20version).wav',
                name: 'Inspiring Dreamy Happy Adventure Pop',
                description: 'Dreamy, upbeat pop instrumental for energizing sessions.',
            },
            {
                url: 'https://esatcoinkzhgaebrtajt.supabase.co/storage/v1/object/public/uploads/Background%20Sounds/main%20track%20with%20out%20Fx.mp3',
                name: 'main track',
                description: 'Neutral ambient bed, no effects.',
            },
            {
                url: 'https://esatcoinkzhgaebrtajt.supabase.co/storage/v1/object/public/uploads/Background%20Sounds/Theta%20Meditation(mp3).mp3',
                name: 'Theta Meditation',
                description: 'Theta-range meditation tone for deep focus and calm.',
            },
            // {
            //     url: 'https://lstprxumviehmvbebcub.supabase.co/storage/v1/object/sign/uploads/audios/background/od5qaWAnXdfHIgLuGC8qxaqRLrm1/308e98ba-fba5-4139-9ae3-e3249b50f04b-1772203838226.wav?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8zMmE2ZWM2Zi1iZDNjLTRmY2YtYTVmYS1hNjVhZDVmM2E4ODEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1cGxvYWRzL2F1ZGlvcy9iYWNrZ3JvdW5kL29kNXFhV0FuWGRmSElnTHVHQzhxeGFxUkxybTEvMzA4ZTk4YmEtZmJhNS00MTM5LTlhZTMtZTMyNDliNTBmMDRiLTE3NzIyMDM4MzgyMjYud2F2IiwiaWF0IjoxNzcyMjA0MDQzLCJleHAiOjE4MDM3NDAwNDN9.5lJzmF8cM2Dv3hmjGnUyhb_dlMaQ-yl1fdkEcL6367Y',
            //     name: 'Tribal Ceremony',
            //     description: 'Rhythmic tribal percussion bed.',
            // },
            {
                url: 'https://esatcoinkzhgaebrtajt.supabase.co/storage/v1/object/public/uploads/Background%20Sounds/Cinematic%20Piano%20-%20Long.mp3',
                name: 'Cinematic Piano',
                description: 'Sweeping cinematic piano, full-length version.',
            },
            {
                url: 'https://esatcoinkzhgaebrtajt.supabase.co/storage/v1/object/public/uploads/Background%20Sounds/Cinematic%20Piano%20-%20Short.mp3',
                name: 'Cinematic Piano - Short',
                description: 'Sweeping cinematic piano, short loopable version.',
            },
        ];
    }

    async getMusicUrls() {
        return this.Results(this.getSoundList());
    }

    async getPersonaDemo() {
        const demos =[{
            name: 'Sage',
            url: 'https://esatcoinkzhgaebrtajt.supabase.co/storage/v1/object/public/uploads/audios/affirmations/ai-generated/75f75644-8a30-4a6c-848e-d29f4496eccd/2ed41165-2528-4843-9e53-ded110b488cc-1782199955353.mp3',
        },
        {
            name: 'Phoenix',
            url: 'https://esatcoinkzhgaebrtajt.supabase.co/storage/v1/object/public/uploads/audios/affirmations/ai-generated/75f75644-8a30-4a6c-848e-d29f4496eccd/6edac4a3-c666-4cd6-8f63-43d1be67c306-1782200208968.mp3'
        },
        {
            name: 'River',
            url: 'https://esatcoinkzhgaebrtajt.supabase.co/storage/v1/object/public/uploads/audios/affirmations/ai-generated/75f75644-8a30-4a6c-848e-d29f4496eccd/ace3bfaf-b301-4ac4-aea1-df2f4747e9b1-1782200294670.mp3'
        },
        {
            name: 'Quinn',
            url: 'https://esatcoinkzhgaebrtajt.supabase.co/storage/v1/object/public/uploads/audios/affirmations/ai-generated/75f75644-8a30-4a6c-848e-d29f4496eccd/934baa24-9537-45b4-bacf-febfdfb68d03-1782200330101.mp3'
        },
        {
            name: 'Alex',
            url: 'https://esatcoinkzhgaebrtajt.supabase.co/storage/v1/object/public/uploads/audios/affirmations/ai-generated/75f75644-8a30-4a6c-848e-d29f4496eccd/cfe33353-0881-48f9-a541-8d28804de6d0-1782200546366.mp3'
        },
        {
            name: 'Robin',
            url: 'https://esatcoinkzhgaebrtajt.supabase.co/storage/v1/object/public/uploads/audios/affirmations/ai-generated/75f75644-8a30-4a6c-848e-d29f4496eccd/0b7ddc6a-edfb-41d7-8e5d-bd9803642f84-1782200653076.mp3'
        }
    ];
    }

    /**
     * Returns the music entry for the given name, or null if not found.
     */
    getSoundByName(name: string): { url: string; name: string; description: string } | null {
        const list = this.getSoundList();
        return list.find((item) => item.name === name) ?? null;
    }

    // async getAllSessions(
    //     page: number = 1,
    //     limit: number = 10,
    // ) {
    //     const pageNumber = Math.max(1, Math.floor(page));
    //     const pageSize = Math.max(1, Math.min(100, Math.floor(limit)));
    //     const skip = (pageNumber - 1) * pageSize;

    //     const whereClause = { userId: '51c20a08-c95e-4673-854a-8ed327997681' };

    //     const totalCount = await this.prisma.reflectionSession.count({
    //         where: whereClause,
    //     });

    //     const sessions = await this.prisma.reflectionSession.findMany({
    //         where: whereClause,
    //         orderBy: { createdAt: 'desc' },
    //         skip,
    //         take: pageSize,
    //         include: {
    //             category: {
    //                 select: {
    //                     id: true,
    //                     name: true,
    //                 },
    //             },
    //         },
    //     });

    //     const totalPages = Math.ceil(totalCount / pageSize);

    //     return this.Results({
    //         data: sessions,
    //         pagination: {
    //             page: pageNumber,
    //             limit: pageSize,
    //             total: totalCount,
    //             totalPages,
    //             hasNextPage: pageNumber < totalPages,
    //             hasPreviousPage: pageNumber > 1,
    //         },
    //     });
    // }

    // private async getUserByFirebaseId(firebaseId: string) {
    //     return this.prisma.user.findUnique({
    //         where: { firebaseId },
    //     });
    // }
}
