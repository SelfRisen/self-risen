import { Injectable, NotFoundException } from '@nestjs/common';
import { BaseService } from 'src/common';
import { DatabaseProvider } from 'src/database/database.provider';



@Injectable()
export class StaterVideosService extends BaseService {
    constructor(private prisma: DatabaseProvider) {
        super();
    }

    async getFileUrls() {
        const light = [
            {
                url: 'https://lstprxumviehmvbebcub.supabase.co/storage/v1/object/public/uploads/videos/starters/t7D57nFbnSPlFRuZw4uZqIuJL2Y2/60fda64b-d84a-4b8f-b160-2cf95ef1fa3b-1768767978757.mp4',
                name: 'bright-glow'
            },
            {
                url: 'https://lstprxumviehmvbebcub.supabase.co/storage/v1/object/sign/uploads/videos/starters/t7D57nFbnSPlFRuZw4uZqIuJL2Y2/2576579a-74d7-4c20-b666-02ce10c8cfee-1768769720552.mp4?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8zMmE2ZWM2Zi1iZDNjLTRmY2YtYTVmYS1hNjVhZDVmM2E4ODEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1cGxvYWRzL3ZpZGVvcy9zdGFydGVycy90N0Q1N25GYm5TUGxGUnVadzR1WnFJdUpMMlkyLzI1NzY1NzlhLTc0ZDctNGMyMC1iNjY2LTAyY2UxMGM4Y2ZlZS0xNzY4NzY5NzIwNTUyLm1wNCIsImlhdCI6MTc2ODc2OTcyNSwiZXhwIjoxODAwMzA1NzI1fQ.IRpDuf2WqjoEaXl6oHYy3GP5aAGqlya0JP8UbCH8BdQ',
                name: 'golden-waves'
            },
            {
                url: 'https://lstprxumviehmvbebcub.supabase.co/storage/v1/object/public/uploads/videos/starters/t7D57nFbnSPlFRuZw4uZqIuJL2Y2/a21d4816-c61d-4f7a-a0e5-9e9d94b2f9a5-1768769492174.mp4',
                name: 'golden-sun'
            },
            {
                url: 'https://lstprxumviehmvbebcub.supabase.co/storage/v1/object/public/uploads/videos/starters/t7D57nFbnSPlFRuZw4uZqIuJL2Y2/78a8efd8-a10c-4b48-a309-832b46ffa034-1768768252248.mp4',
                name: 'ocean-view'
            },
            {
                url: 'https://lstprxumviehmvbebcub.supabase.co/storage/v1/object/public/uploads/videos/starters/t7D57nFbnSPlFRuZw4uZqIuJL2Y2/a8efb95b-b8d8-4372-bf2e-732cccb343b6-1768768401303.mp4',
                name: 'sun'
            }
        ];

        const dark = [
            {
                url: 'https://lstprxumviehmvbebcub.supabase.co/storage/v1/object/public/uploads/videos/starters/t7D57nFbnSPlFRuZw4uZqIuJL2Y2/8daaae55-05bd-41f9-8516-6878cbc4ba61-1768767385079.mp4',
                name: 'Axis'
            },
            {
                url: 'https://lstprxumviehmvbebcub.supabase.co/storage/v1/object/public/uploads/videos/starters/t7D57nFbnSPlFRuZw4uZqIuJL2Y2/25efc70c-850c-49e7-976f-38dc71c30d16-1768767809604.mp4',
                name: 'mystic-forest'
            },
            {
                url: 'https://lstprxumviehmvbebcub.supabase.co/storage/v1/object/sign/uploads/videos/starters/t7D57nFbnSPlFRuZw4uZqIuJL2Y2/383c2d28-28ad-48c2-8cd1-20dae48d4bd9-1768770299191.mp4?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8zMmE2ZWM2Zi1iZDNjLTRmY2YtYTVmYS1hNjVhZDVmM2E4ODEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1cGxvYWRzL3ZpZGVvcy9zdGFydGVycy90N0Q1N25GYm5TUGxGUnVadzR1WnFJdUpMMlkyLzM4M2MyZDI4LTI4YWQtNDhjMi04Y2QxLTIwZGFlNDhkNGJkOS0xNzY4NzcwMjk5MTkxLm1wNCIsImlhdCI6MTc2ODc3MDMzNCwiZXhwIjoxODAwMzA2MzM0fQ.giYQ6rJmexqpNeKMnsiX2WUziCUdQn-yYCl6pAeLr1Y',
                name: 'high-sea'
            },
            {
                url: 'https://lstprxumviehmvbebcub.supabase.co/storage/v1/object/sign/uploads/videos/starters/t7D57nFbnSPlFRuZw4uZqIuJL2Y2/383c2d28-28ad-48c2-8cd1-20dae48d4bd9-1768770299191.mp4?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8zMmE2ZWM2Zi1iZDNjLTRmY2YtYTVmYS1hNjVhZDVmM2E4ODEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1cGxvYWRzL3ZpZGVvcy9zdGFydGVycy90N0Q1N25GYm5TUGxGUnVadzR1WnFJdUpMMlkyLzM4M2MyZDI4LTI4YWQtNDhjMi04Y2QxLTIwZGFlNDhkNGJkOS0xNzY4NzcwMjk5MTkxLm1wNCIsImlhdCI6MTc2ODc3MDMzNCwiZXhwIjoxODAwMzA2MzM0fQ.giYQ6rJmexqpNeKMnsiX2WUziCUdQn-yYCl6pAeLr1Y',
                name: 'ice'
            },
            {
                url: 'https://lstprxumviehmvbebcub.supabase.co/storage/v1/object/public/uploads/videos/starters/t7D57nFbnSPlFRuZw4uZqIuJL2Y2/035f30f3-6693-4951-b6be-f391d55916a4-1768767627923.mp4',
                name: 'space-odyssey'
            }
        ];

        return this.Results({ light, dark });
    }

    private getMusicList(): Array<{ url: string; name: string }> {
        return [
            {
                url: 'https://lstprxumviehmvbebcub.supabase.co/storage/v1/object/public/uploads/Starters/Over_the_Horizon.m4a',
                name: 'bright-glow',
            },
        ];
    }

    async getMusicUrls() {
        return this.Results(this.getMusicList());
    }

    /**
     * Returns the music entry for the given name, or null if not found.
     */
    getMusicByName(name: string): { url: string; name: string } | null {
        const list = this.getMusicList();
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
