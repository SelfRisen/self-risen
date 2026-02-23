import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { DatabaseProvider } from 'src/database/database.provider';
import { BaseService } from 'src/common';
import { StorageService, FileType } from 'src/common/storage/storage.service';
import { StaterVideosService } from 'src/stater-videos/stater-videos.service';
import { AddVisionDto } from './dto';
import { ReflectionSessionStatus, Prisma } from '@prisma/client';

const visionInclude = {
    reflectionSession: {
        include: {
            category: {
                select: {
                    id: true,
                    name: true,
                },
            },
        },
    },
    visionSound: {
        select: {
            id: true,
            soundUrl: true,
            name: true,
            fileSize: true,
            mimeType: true,
            order: true,
        },
    },
} as const;

type VisionWithReflectionSession = Prisma.VisionGetPayload<{
    include: typeof visionInclude;
}>;

type VisionResponse = {
    id: string;
    reflectionSessionId: string | null;
    imageUrl: string | null;
    order: number | null;
    createdAt: Date;
    updatedAt: Date;
    affirmation: string | null;
    reflectionSession: {
        id: string;
        prompt: string;
        category: {
            id: string;
            name: string;
        };
    } | null;
    visionSoundId: string | null;
    visionSound: {
        id: string;
        soundUrl: string;
        name: string | null;
        fileSize: number | null;
        mimeType: string | null;
        order: number | null;
    } | null;
};

@Injectable()
export class VisionBoardService extends BaseService {
    private readonly logger = new Logger(VisionBoardService.name);

    constructor(
        private prisma: DatabaseProvider,
        private storageService: StorageService,
        private staterVideosService: StaterVideosService,
    ) {
        super();
    }

    async addVision(
        firebaseId: string,
        visionBoardId: string,
        reflectionSessionId?: string,
        imageFile?: Express.Multer.File,
    ) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        // Validate that visionBoardId is provided
        if (!visionBoardId) {
            return this.HandleError(
                new BadRequestException('visionBoardId is required'),
            );
        }

        // Validate that at least one parameter is provided
        if (!reflectionSessionId && !imageFile) {
            return this.HandleError(
                new BadRequestException('Either reflectionSessionId or imageFile must be provided'),
            );
        }

        // Verify vision board exists and belongs to user
        const visionBoard = await this.prisma.visionBoard.findFirst({
            where: {
                id: visionBoardId,
                userId: user.id,
            },
        });
        if (!visionBoard) {
            return this.HandleError(new NotFoundException('Vision board not found'));
        }

        let reflectionSession: {
            id: string;
            status: ReflectionSessionStatus;
            selectedAffirmationText: string | null;
            prompt: string;
            category: {
                id: string;
                name: string;
            };
            reflectionSound: { id: string; soundUrl: string; name: string | null; fileSize: number | null; mimeType: string | null } | null;
        } | null = null;
        
        if (reflectionSessionId) {
            const foundSession = await this.prisma.reflectionSession.findFirst({
                where: {
                    id: reflectionSessionId,
                    userId: user.id,
                },
                include: {
                    category: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                    reflectionSound: true,
                },
            });

            if (!foundSession) {
                return this.HandleError(new NotFoundException('Reflection session not found'));
            }

            if (foundSession.status !== ReflectionSessionStatus.AFFIRMATION_GENERATED) {
                return this.HandleError(
                    new BadRequestException('Reflection session must be in AFFIRMATION_GENERATED status to add to vision board'),
                );
            }

            // Check if already added to vision board
            const existingItem = await this.prisma.vision.findUnique({
                where: { reflectionSessionId },
            });

            if (existingItem) {
                return this.HandleError(
                    new BadRequestException('This reflection session is already in the vision board'),
                );
            }

            reflectionSession = foundSession;
        }

        let imageUrl: string | undefined;
        if (imageFile) {
            try {
                const uploadResult = await this.storageService.uploadFile(
                    imageFile,
                    FileType.IMAGE,
                    user.id,
                    'vision-board/images',
                );
                imageUrl = uploadResult.url;
            } catch (error) {
                return this.HandleError(
                    new BadRequestException(`Failed to upload image: ${error.message}`),
                );
            }
        }

        const maxOrderItem = await this.prisma.vision.findFirst({
            where: { visionBoardId: visionBoard.id },
            orderBy: { order: 'desc' },
        });

        const order = maxOrderItem ? (maxOrderItem.order || 0) + 1 : 1;

        // Create vision
        const createData: Prisma.VisionCreateInput = {
            visionBoard: {
                connect: { id: visionBoard.id },
            },
            order,
        };
        if (reflectionSessionId) {
            createData.reflectionSession = {
                connect: { id: reflectionSessionId },
            };
            if (reflectionSession?.reflectionSound) {
                const rs = reflectionSession.reflectionSound;
                const maxSoundOrder = await this.prisma.visionSound.findFirst({
                    orderBy: { order: 'desc' },
                });
                const newOrder = maxSoundOrder ? (maxSoundOrder.order ?? 0) + 1 : 1;
                const newVisionSound = await this.prisma.visionSound.create({
                    data: {
                        soundUrl: rs.soundUrl,
                        name: rs.name,
                        fileSize: rs.fileSize,
                        mimeType: rs.mimeType,
                        order: newOrder,
                    },
                });
                createData.visionSound = { connect: { id: newVisionSound.id } };
            }
        }
        if (imageUrl) {
            createData.imageUrl = imageUrl;
        }

        const visionItem = await this.prisma.vision.create({
            data: createData,
            include: visionInclude,
        });

        // Update reflection session to mark it as a vision
        if (reflectionSessionId) {
            await this.prisma.reflectionSession.update({
                where: { id: reflectionSessionId },
                data: { isVision: true },
            });
        }

        // Use already fetched reflection session data if available, otherwise use from visionItem
        if (reflectionSession && visionItem.reflectionSession) {
            // Use the already fetched data
            visionItem.reflectionSession = {
                ...visionItem.reflectionSession,
                selectedAffirmationText: reflectionSession.selectedAffirmationText,
                prompt: reflectionSession.prompt,
                category: reflectionSession.category,
            } as any;
        }

        return this.Results(this.mapVisionToResponse(visionItem));
    }

    async addVisionToGlobalBoard(
        firebaseId: string,
        visionId: string,
    ) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }
        
        // Verify vision board exists and belongs to user
        const visionBoard = await this.prisma.visionBoard.findFirst({
            where: {
                userId: user.id,
                isGloabal: true,
            },
        });
        if (!visionBoard) {
            return this.HandleError(new NotFoundException('Vision board not found'));
        }
        
        const maxOrderItem = await this.prisma.vision.findFirst({
            where: { visionBoardId: visionBoard.id },
            orderBy: { order: 'desc' },
        });
    
        const order = maxOrderItem ? (maxOrderItem.order || 0) + 1 : 1;

        const sourceVision = await this.prisma.vision.findFirst({
            where: {
                id: visionId,
                visionBoard: { userId: user.id },
            },
        });
        if (!sourceVision) {
            return this.HandleError(new NotFoundException('Vision not found'));
        }

        const visionItem = await this.prisma.vision.create({
            data: {
                visionBoard: { connect: { id: visionBoard.id } },
                order,
                ...(sourceVision.imageUrl && { imageUrl: sourceVision.imageUrl }),
                ...(sourceVision.visionSoundId && {
                    visionSound: { connect: { id: sourceVision.visionSoundId } },
                }),
            },
            include: visionInclude,
        });

        return this.Results(this.mapVisionToResponse(visionItem));
    }

    /**
     * Get all visions for user's vision board (paginated)
     */
    async getAllVisions(
        firebaseId: string,
        page: number = 1,
        limit: number = 10,
        visionBoardId?: string,
    ) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const pageNumber = Math.max(1, Math.floor(page));
        const pageSize = Math.max(1, Math.min(100, Math.floor(limit)));
        const skip = (pageNumber - 1) * pageSize;

        // Build where clause - filter directly on nested relation to avoid extra query
        const where: Prisma.VisionWhereInput = {
            visionBoard: {
                userId: user.id,
                ...(visionBoardId ? { id: visionBoardId } : {}),
            },
        };
        
        const totalCount = await this.prisma.vision.count({ where });

        const items = await this.prisma.vision.findMany({
            where,
            orderBy: { order: 'asc' },
            skip,
            take: pageSize,
            include: visionInclude,
        });

        const totalPages = Math.ceil(totalCount / pageSize);

        // Format response
        const data = items.map((item) => this.mapVisionToResponse(item));

        return this.Results({
            visions: data,
            pagination: {
                page: pageNumber,
                limit: pageSize,
                total: totalCount,
                totalPages,
                hasNextPage: pageNumber < totalPages,
                hasPreviousPage: pageNumber > 1,
            },
        });
    }

    /**
     * Get single vision by ID
     */
    async getVisionById(firebaseId: string, visionId: string) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const visionItem = await this.prisma.vision.findFirst({
            where: {
                id: visionId,
                visionBoard: {
                    userId: user.id,
                },
            },
            include: visionInclude,
        });

        if (!visionItem) {
            return this.HandleError(new NotFoundException('Vision not found'));
        }

        return this.Results(this.mapVisionToResponse(visionItem));
    }

    /**
     * Update a vision (image and/or reflection session)
     */
    async updateVision(
        firebaseId: string,
        visionId: string,
        reflectionSessionId?: string,
        imageFile?: Express.Multer.File,
        visionSoundId?: string | null,
    ) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        // Validate that at least one parameter is provided
        const hasReflectionSession = reflectionSessionId !== undefined;
        const hasImage = imageFile !== undefined && imageFile !== null;
        const hasBackgroundSound = visionSoundId !== undefined;
        if (!hasReflectionSession && !hasImage && !hasBackgroundSound) {
            return this.HandleError(
                new BadRequestException('At least one of reflectionSessionId, imageFile, or visionSoundId must be provided'),
            );
        }

        const visionItem = await this.prisma.vision.findFirst({
            where: {
                id: visionId,
                visionBoard: {
                    userId: user.id,
                },
            },
            include: visionInclude,
        });

        if (!visionItem) {
            return this.HandleError(new NotFoundException('Vision not found'));
        }

        if (reflectionSessionId) {
            const foundSession = await this.prisma.reflectionSession.findFirst({
                where: {
                    id: reflectionSessionId,
                    userId: user.id,
                },
            });

            if (!foundSession) {
                return this.HandleError(new NotFoundException('Reflection session not found'));
            }

            if (foundSession.status !== ReflectionSessionStatus.AFFIRMATION_GENERATED) {
                return this.HandleError(
                    new BadRequestException('Reflection session must be in AFFIRMATION_GENERATED status to link to vision board'),
                );
            }

            // Check if already linked to another vision
            const existingItem = await this.prisma.vision.findUnique({
                where: { reflectionSessionId },
            });

            if (existingItem && existingItem.id !== visionId) {
                return this.HandleError(
                    new BadRequestException('This reflection session is already linked to another vision'),
                );
            }
        }

        // Upload new image if provided and delete old image
        let imageUrl: string | undefined;
        const oldImageUrl = visionItem.imageUrl;
        
        if (imageFile) {
            try {
                const uploadResult = await this.storageService.uploadFile(
                    imageFile,
                    FileType.IMAGE,
                    user.id,
                    'vision-board/images',
                );
                imageUrl = uploadResult.url;

                // Delete old image if it exists
                if (oldImageUrl) {
                    try {
                        const oldImagePath = this.extractFilePathFromUrl(oldImageUrl);
                        if (oldImagePath) {
                            await this.storageService.deleteFile(oldImagePath);
                        }
                    } catch (error) {
                        // Log error but don't fail the update if deletion fails
                        this.logger.warn(`Failed to delete old image: ${oldImageUrl}`, error);
                    }
                }
            } catch (error) {
                return this.HandleError(
                    new BadRequestException(`Failed to upload image: ${error.message}`),
                );
            }
        }

        // Prepare update data
        const updateData: Prisma.VisionUpdateInput = {};
        if (imageUrl !== undefined) {
            updateData.imageUrl = imageUrl;
        }
        if (reflectionSessionId !== undefined) {
            updateData.reflectionSession = reflectionSessionId
                ? { connect: { id: reflectionSessionId } }
                : { disconnect: true };
        }
        if (visionSoundId !== undefined) {
            if (visionSoundId != null && visionSoundId !== '') {
                const sound = await this.prisma.visionSound.findUnique({
                    where: { id: visionSoundId },
                });
                if (!sound) {
                    return this.HandleError(new NotFoundException('Sound not found'));
                }
                updateData.visionSound = { connect: { id: visionSoundId } };
            } else {
                updateData.visionSound = { disconnect: true };
            }
        }

        // Update vision
        const updatedItem = await this.prisma.vision.update({
            where: { id: visionId },
            data: updateData,
            include: visionInclude,
        });

        // Update isVision flags for reflection sessions
        if (reflectionSessionId !== undefined) {
            // If unlinking old reflection session, set isVision to false
            if (visionItem.reflectionSessionId && visionItem.reflectionSessionId !== reflectionSessionId) {
                await this.prisma.reflectionSession.update({
                    where: { id: visionItem.reflectionSessionId },
                    data: { isVision: false },
                });
            }

            // If linking to new reflection session, set isVision to true
            if (reflectionSessionId) {
                await this.prisma.reflectionSession.update({
                    where: { id: reflectionSessionId },
                    data: { isVision: true },
                });
            }
        }

        return this.Results(this.mapVisionToResponse(updatedItem));
    }

    /**
     * Remove vision from board
     */
    async removeVision(firebaseId: string, visionId: string) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const visionItem = await this.prisma.vision.findFirst({
            where: {
                id: visionId,
                visionBoard: {
                    userId: user.id,
                },
            },
        });

        if (!visionItem) {
            return this.HandleError(new NotFoundException('Vision not found'));
        }

        // Delete associated image if it exists
        if (visionItem.imageUrl) {
            try {
                const imagePath = this.extractFilePathFromUrl(visionItem.imageUrl);
                if (imagePath) {
                    await this.storageService.deleteFile(imagePath);
                }
            } catch (error) {
                // Log error but don't fail the deletion if image deletion fails
                this.logger.warn(`Failed to delete image for vision ${visionId}: ${visionItem.imageUrl}`, error);
            }
        }

        // Update reflection session to mark it as no longer a vision
        if (visionItem.reflectionSessionId) {
            await this.prisma.reflectionSession.update({
                where: { id: visionItem.reflectionSessionId },
                data: { isVision: false },
            });
        }

        await this.prisma.vision.delete({
            where: { id: visionId },
        });

        return this.Results(null);
    }
    
    async uploadSound(firebaseId: string, soundFiles: Express.Multer.File[]) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        if (!soundFiles || soundFiles.length === 0) {
            return this.HandleError(new BadRequestException('At least one audio file is required'));
        }

        // Get the current max order for this user's sound files
        const maxOrderFile = await this.prisma.visionSound.findFirst({
            orderBy: { order: 'desc' },
        });

        let currentOrder = maxOrderFile ? (maxOrderFile.order || 0) : 0;

        const uploadedFiles: Array<{
            id: string;
            soundUrl: string;
            name: string | null;
            fileSize: number | null;
            mimeType: string | null;
            order: number | null;
            createdAt: Date;
            updatedAt: Date;
        }> = [];

        // Upload each file and save to database
        for (const soundFile of soundFiles) {
            try {
                // Upload file to storage
                const uploadResult = await this.storageService.uploadFile(
                    soundFile,
                    FileType.AUDIO,
                    user.id,
                    'vision-board/sounds',
                );

                currentOrder += 1;

                // Save file record to database
                const soundFileRecord = await this.prisma.visionSound.create({
                    data: {
                        soundUrl: uploadResult.url,
                        name: soundFile.originalname,
                        fileSize: soundFile.size,
                        mimeType: soundFile.mimetype,
                        order: currentOrder,
                    },
                });

                uploadedFiles.push({
                    id: soundFileRecord.id,
                    soundUrl: soundFileRecord.soundUrl,
                    name: soundFileRecord.name,
                    fileSize: soundFileRecord.fileSize,
                    mimeType: soundFileRecord.mimeType,
                    order: soundFileRecord.order,
                    createdAt: soundFileRecord.createdAt,
                    updatedAt: soundFileRecord.updatedAt,
                });
            } catch (error) {
                this.logger.error(`Failed to upload sound file ${soundFile.originalname}: ${error.message}`);
                // Continue with other files even if one fails
                // You might want to handle this differently based on requirements
            }
        }

        if (uploadedFiles.length === 0) {
            return this.HandleError(
                new BadRequestException('Failed to upload any audio files'),
            );
        }

        return this.Results({
            uploaded: uploadedFiles.length,
            files: uploadedFiles,
        });
    }

    /**
     * Get all sounds (catalog used for both visions and reflections).
     */
    async getSounds(firebaseId: string) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const soundFiles = await this.prisma.visionSound.findMany({
            orderBy: { order: 'asc' },
        });

        const files = soundFiles.map((file) => ({
            id: file.id,
            soundUrl: file.soundUrl,
            name: file.name,
            fileSize: file.fileSize,
            mimeType: file.mimeType,
            order: file.order,
            createdAt: file.createdAt,
            updatedAt: file.updatedAt,
        }));

        return this.Results({
            count: files.length,
            files,
        });
    }

    /**
     * Get sounds in the context of a vision: all sounds plus the vision's selected background sound.
     */
    async getSoundsForVision(firebaseId: string, visionId: string) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const vision = await this.prisma.vision.findFirst({
            where: {
                id: visionId,
                visionBoard: { userId: user.id },
            },
            include: {
                visionSound: {
                    select: {
                        id: true,
                        soundUrl: true,
                        name: true,
                        fileSize: true,
                        mimeType: true,
                        order: true,
                    },
                },
            },
        });

        if (!vision) {
            return this.HandleError(new NotFoundException('Vision not found'));
        }

        const allSounds = await this.prisma.visionSound.findMany({
            orderBy: { order: 'asc' },
        });

        const files = allSounds.map((file) => ({
            id: file.id,
            soundUrl: file.soundUrl,
            name: file.name,
            fileSize: file.fileSize,
            mimeType: file.mimeType,
            order: file.order,
            createdAt: file.createdAt,
            updatedAt: file.updatedAt,
        }));

        return this.Results({
            visionSound: vision.visionSound ?? null,
            sounds: files,
            count: files.length,
        });
    }

    /**
     * Set a vision's background sound by name from the stater-videos music list.
     * Resolves the name to a URL, finds or creates a VisionSound, and links it to the vision.
     */
    async setVisionBackgroundSoundByName(firebaseId: string, visionId: string, name: string) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const vision = await this.prisma.vision.findFirst({
            where: {
                id: visionId,
                visionBoard: { userId: user.id },
            },
        });
        if (!vision) {
            return this.HandleError(new NotFoundException('Vision not found'));
        }

        const music = this.staterVideosService.getMusicByName(name);
        if (!music) {
            return this.HandleError(new NotFoundException('Sound not found'));
        }

        let visionSound = await this.prisma.visionSound.findFirst({
            where: { name: music.name },
        });
        if (!visionSound) {
            const maxSoundOrder = await this.prisma.visionSound.findFirst({
                orderBy: { order: 'desc' },
            });
            const newOrder = maxSoundOrder ? (maxSoundOrder.order ?? 0) + 1 : 1;
            visionSound = await this.prisma.visionSound.create({
                data: {
                    soundUrl: music.url,
                    name: music.name,
                    fileSize: null,
                    mimeType: null,
                    order: newOrder,
                },
            });
        }

        const updated = await this.prisma.vision.update({
            where: { id: visionId },
            data: { visionSound: { connect: { id: visionSound.id } } },
            include: visionInclude,
        });

        return this.Results(this.mapVisionToResponse(updated));
    }

    /**
     * Get all vision boards for a user
     */
    async getAllVisionBoards(firebaseId: string) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const visionBoards = await this.prisma.visionBoard.findMany({
            where: { userId: user.id },
            include: {
                category: {
                    select: {
                        id: true,
                        name: true,
                        order: true,
                    },
                },
                _count: {
                    select: {
                        visions: true,
                    },
                },
            },
            orderBy: {
                category: {
                    order: 'asc',
                },
            },
        });

        const boards = visionBoards.map((board) => ({
            id: board.id,
            categoryId: board.categoryId,
            category: board.category,
            visionCount: board._count.visions,
            isGlobal: board.isGloabal,
            createdAt: board.createdAt,
            updatedAt: board.updatedAt,
        }));

        return this.Results({
            count: boards.length,
            boards,
        });
    }

    /**
     * Reorder a vision within its vision board
     */
    async reorderVision(firebaseId: string, visionId: string, newOrder: number) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const vision = await this.prisma.vision.findFirst({
            where: {
                id: visionId,
                visionBoard: { userId: user.id },
            },
        });

        if (!vision) {
            return this.HandleError(new NotFoundException('Vision not found'));
        }

        const currentOrder = vision.order ?? 0;

        if (currentOrder === newOrder) {
            return this.Results({ vision });
        }

        // Get all visions in the same board
        const visions = await this.prisma.vision.findMany({
            where: { visionBoardId: vision.visionBoardId },
            orderBy: { order: 'asc' },
        });

        // Reorder: shift items between old and new position
        const updates: Promise<any>[] = [];

        if (newOrder > currentOrder) {
            // Moving down: shift items up
            for (const v of visions) {
                const vOrder = v.order ?? 0;
                if (v.id === visionId) {
                    updates.push(
                        this.prisma.vision.update({
                            where: { id: v.id },
                            data: { order: newOrder },
                        }),
                    );
                } else if (vOrder > currentOrder && vOrder <= newOrder) {
                    updates.push(
                        this.prisma.vision.update({
                            where: { id: v.id },
                            data: { order: vOrder - 1 },
                        }),
                    );
                }
            }
        } else {
            // Moving up: shift items down
            for (const v of visions) {
                const vOrder = v.order ?? 0;
                if (v.id === visionId) {
                    updates.push(
                        this.prisma.vision.update({
                            where: { id: v.id },
                            data: { order: newOrder },
                        }),
                    );
                } else if (vOrder >= newOrder && vOrder < currentOrder) {
                    updates.push(
                        this.prisma.vision.update({
                            where: { id: v.id },
                            data: { order: vOrder + 1 },
                        }),
                    );
                }
            }
        }

        await Promise.all(updates);

        // Return updated list
        const updatedVisions = await this.prisma.vision.findMany({
            where: { visionBoardId: vision.visionBoardId },
            orderBy: { order: 'asc' },
            select: { id: true, order: true },
        });

        return this.Results({
            visions: updatedVisions,
        });
    }

    /**
     * Reorder a sound
     */
    async reorderSound(firebaseId: string, soundId: string, newOrder: number) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const sound = await this.prisma.visionSound.findUnique({
            where: { id: soundId },
        });

        if (!sound) {
            return this.HandleError(new NotFoundException('Sound not found'));
        }

        const currentOrder = sound.order ?? 0;

        if (currentOrder === newOrder) {
            return this.Results({ sound });
        }

        // Get all sounds
        const sounds = await this.prisma.visionSound.findMany({
            orderBy: { order: 'asc' },
        });

        // Reorder: shift items between old and new position
        const updates: Promise<any>[] = [];

        if (newOrder > currentOrder) {
            // Moving down: shift items up
            for (const s of sounds) {
                const sOrder = s.order ?? 0;
                if (s.id === soundId) {
                    updates.push(
                        this.prisma.visionSound.update({
                            where: { id: s.id },
                            data: { order: newOrder },
                        }),
                    );
                } else if (sOrder > currentOrder && sOrder <= newOrder) {
                    updates.push(
                        this.prisma.visionSound.update({
                            where: { id: s.id },
                            data: { order: sOrder - 1 },
                        }),
                    );
                }
            }
        } else {
            // Moving up: shift items down
            for (const s of sounds) {
                const sOrder = s.order ?? 0;
                if (s.id === soundId) {
                    updates.push(
                        this.prisma.visionSound.update({
                            where: { id: s.id },
                            data: { order: newOrder },
                        }),
                    );
                } else if (sOrder >= newOrder && sOrder < currentOrder) {
                    updates.push(
                        this.prisma.visionSound.update({
                            where: { id: s.id },
                            data: { order: sOrder + 1 },
                        }),
                    );
                }
            }
        }

        await Promise.all(updates);

        // Return updated list
        const updatedSounds = await this.prisma.visionSound.findMany({
            orderBy: { order: 'asc' },
            select: { id: true, order: true, name: true },
        });

        return this.Results({
            sounds: updatedSounds,
        });
    }

    private mapVisionToResponse(vision: VisionWithReflectionSession): VisionResponse {
        const response: VisionResponse = {
            id: vision.id,
            reflectionSessionId: vision.reflectionSessionId,
            imageUrl: vision.imageUrl,
            order: vision.order,
            createdAt: vision.createdAt,
            updatedAt: vision.updatedAt,
            affirmation: null,
            reflectionSession: null,
            visionSoundId: vision.visionSoundId ?? null,
            visionSound: vision.visionSound ?? null,
        };

        if (vision.reflectionSession) {
            response.affirmation = vision.reflectionSession.selectedAffirmationText;
            response.reflectionSession = {
                id: vision.reflectionSession.id,
                prompt: vision.reflectionSession.prompt,
                category: vision.reflectionSession.category,
            };
        }

        return response;
    }

    private extractFilePathFromUrl(url: string): string | null {
        try {
            // For Supabase: URL format is typically https://[project].supabase.co/storage/v1/object/public/[bucket]/[path]
            // For Firebase: URL format is typically https://firebasestorage.googleapis.com/v0/b/[bucket]/o/[path]?alt=media
            const urlObj = new URL(url);
            
            // Supabase pattern
            if (urlObj.pathname.includes('/storage/v1/object/public/')) {
                const parts = urlObj.pathname.split('/storage/v1/object/public/');
                if (parts.length > 1) {
                    return decodeURIComponent(parts[1]);
                }
            }
            
            // Firebase pattern
            if (urlObj.hostname.includes('firebasestorage.googleapis.com')) {
                const match = urlObj.pathname.match(/\/o\/(.+?)\?/);
                if (match && match[1]) {
                    return decodeURIComponent(match[1].replace(/%2F/g, '/'));
                }
            }
            
            // Fallback: try to extract from pathname
            const pathParts = urlObj.pathname.split('/');
            if (pathParts.length > 1) {
                return pathParts.slice(1).join('/');
            }
            
            return null;
        } catch (error) {
            this.logger.warn(`Failed to extract file path from URL: ${url}`, error);
            return null;
        }
    }

    private async getUserByFirebaseId(firebaseId: string) {
        return this.prisma.user.findUnique({
            where: { firebaseId },
        });
    }
}