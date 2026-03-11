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
        } | null;
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

        // Fetch vision board and optionally reflection session in parallel
        const [visionBoard, foundSession] = await Promise.all([
            this.prisma.visionBoard.findFirst({
                where: {
                    id: visionBoardId,
                    userId: user.id,
                },
            }),
            reflectionSessionId
                ? this.prisma.reflectionSession.findFirst({
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
                })
                : Promise.resolve(null),
        ]);

        if (!visionBoard) {
            return this.HandleError(new NotFoundException('Vision board not found'));
        }

        let reflectionSession: {
            id: string;
            status: ReflectionSessionStatus;
            selectedAffirmationText: string | null;
            prompt: string | null;
            category: {
                id: string;
                name: string;
            } | null;
            reflectionSound: { id: string; soundUrl: string; name: string | null; fileSize: number | null; mimeType: string | null } | null;
        } | null = null;

        if (reflectionSessionId) {
            if (!foundSession) {
                return this.HandleError(new NotFoundException('Reflection session not found'));
            }
            if (foundSession.status !== ReflectionSessionStatus.AFFIRMATION_GENERATED) {
                return this.HandleError(
                    new BadRequestException('Reflection session must be in AFFIRMATION_GENERATED status to add to vision board'),
                );
            }
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

        // Create vision (and visionSound in same tx when needed to avoid order race)
        const visionItem = await this.prisma.$transaction(async (tx) => {
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
                    const newVisionSound = await this.createVisionSoundWithNextOrder(tx, {
                        soundUrl: rs.soundUrl,
                        name: rs.name,
                        fileSize: rs.fileSize,
                        mimeType: rs.mimeType,
                    });
                    createData.visionSound = { connect: { id: newVisionSound.id } };
                }
            }
            if (imageUrl) {
                createData.imageUrl = imageUrl;
            }
            return tx.vision.create({
                data: createData,
                include: visionInclude,
            });
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

        const [visionBoard, sourceVision] = await Promise.all([
            this.prisma.visionBoard.findFirst({
                where: {
                    userId: user.id,
                    isGloabal: true,
                },
            }),
            this.prisma.vision.findFirst({
                where: {
                    id: visionId,
                    visionBoard: { userId: user.id },
                },
            }),
        ]);

        if (!visionBoard) {
            return this.HandleError(new NotFoundException('Vision board not found'));
        }
        if (!sourceVision) {
            return this.HandleError(new NotFoundException('Vision not found'));
        }

        const maxOrderItem = await this.prisma.vision.findFirst({
            where: { visionBoardId: visionBoard.id },
            orderBy: { order: 'desc' },
        });
        const order = maxOrderItem ? (maxOrderItem.order || 0) + 1 : 1;

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
     * Get all visions for user's vision board (paginated).
     * When includeTotalCount is false, skips the count query for faster responses (e.g. "next page").
     */
    async getAllVisions(
        firebaseId: string,
        page: number = 1,
        limit: number = 10,
        visionBoardId?: string,
        includeTotalCount: boolean = true,
    ) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const pageNumber = Math.max(1, Math.floor(page));
        const pageSize = Math.max(1, Math.min(100, Math.floor(limit)));
        const skip = (pageNumber - 1) * pageSize;

        const where: Prisma.VisionWhereInput = {
            visionBoard: {
                userId: user.id,
                ...(visionBoardId ? { id: visionBoardId } : {}),
            },
        };

        const [items, totalCount] = await Promise.all([
            this.prisma.vision.findMany({
                where,
                orderBy: { order: 'asc' },
                skip,
                take: pageSize,
                include: visionInclude,
            }),
            includeTotalCount ? this.prisma.vision.count({ where }) : Promise.resolve(null),
        ]);

        const total = totalCount ?? null;
        const totalPages = total != null ? Math.ceil(total / pageSize) : null;

        const data = items.map((item) => this.mapVisionToResponse(item));

        return this.Results({
            visions: data,
            pagination: {
                page: pageNumber,
                limit: pageSize,
                total,
                totalPages,
                hasNextPage: totalPages != null ? pageNumber < totalPages : items.length === pageSize,
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
            const [foundSession, existingItem] = await Promise.all([
                this.prisma.reflectionSession.findFirst({
                    where: {
                        id: reflectionSessionId,
                        userId: user.id,
                    },
                }),
                this.prisma.vision.findUnique({
                    where: { reflectionSessionId },
                }),
            ]);

            if (!foundSession) {
                return this.HandleError(new NotFoundException('Reflection session not found'));
            }
            if (foundSession.status !== ReflectionSessionStatus.AFFIRMATION_GENERATED) {
                return this.HandleError(
                    new BadRequestException('Reflection session must be in AFFIRMATION_GENERATED status to link to vision board'),
                );
            }
            if (existingItem && existingItem.id !== visionId) {
                return this.HandleError(
                    new BadRequestException('This reflection session is already linked to another vision'),
                );
            }
        }

        // Run image upload and sound lookup in parallel when both are needed
        const oldImageUrl = visionItem.imageUrl;
        const [uploadResult, sound] = await Promise.all([
            imageFile
                ? this.storageService
                    .uploadFile(imageFile, FileType.IMAGE, user.id, 'vision-board/images')
                    .then((r) => r.url)
                    .catch((error) => {
                        throw new BadRequestException(`Failed to upload image: ${error.message}`);
                    })
                : Promise.resolve(undefined),
            visionSoundId !== undefined && visionSoundId != null && visionSoundId !== ''
                ? this.prisma.visionSound.findUnique({ where: { id: visionSoundId } })
                : Promise.resolve(null),
        ]);

        const imageUrl = uploadResult;

        if (imageFile && imageUrl && oldImageUrl) {
            try {
                const oldImagePath = this.extractFilePathFromUrl(oldImageUrl);
                if (oldImagePath) {
                    await this.storageService.deleteFile(oldImagePath);
                }
            } catch (error) {
                this.logger.warn(`Failed to delete old image: ${oldImageUrl}`, error);
            }
        }

        if (visionSoundId !== undefined && visionSoundId != null && visionSoundId !== '' && !sound) {
            return this.HandleError(new NotFoundException('Sound not found'));
        }

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

        // Upload all files in parallel
        const uploadResults = await Promise.allSettled(
            soundFiles.map((file) =>
                this.storageService.uploadFile(
                    file,
                    FileType.AUDIO,
                    user.id,
                    'vision-board/sounds',
                ),
            ),
        );

        const successfulUploads: Array<{ url: string; file: Express.Multer.File }> = [];
        uploadResults.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                successfulUploads.push({ url: result.value.url, file: soundFiles[index] });
            } else {
                this.logger.error(
                    `Failed to upload sound file ${soundFiles[index]?.originalname}: ${result.reason?.message}`,
                );
            }
        });

        if (successfulUploads.length === 0) {
            return this.HandleError(
                new BadRequestException('Failed to upload any audio files'),
            );
        }

        // Create all records in a single transaction with correct order (avoids race conditions)
        const uploadedFiles = await this.prisma.$transaction(async (tx) => {
            const maxRow = await tx.visionSound.findFirst({
                orderBy: { order: 'desc' },
                select: { order: true },
            });
            let nextOrder = maxRow?.order != null ? maxRow.order + 1 : 1;
            const created: Array<{
                id: string;
                soundUrl: string;
                name: string | null;
                fileSize: number | null;
                mimeType: string | null;
                order: number | null;
                createdAt: Date;
                updatedAt: Date;
            }> = [];
            for (const { url, file } of successfulUploads) {
                const record = await tx.visionSound.create({
                    data: {
                        soundUrl: url,
                        name: file.originalname,
                        fileSize: file.size,
                        mimeType: file.mimetype,
                        order: nextOrder,
                    },
                });
                nextOrder += 1;
                created.push({
                    id: record.id,
                    soundUrl: record.soundUrl,
                    name: record.name,
                    fileSize: record.fileSize,
                    mimeType: record.mimeType,
                    order: record.order,
                    createdAt: record.createdAt,
                    updatedAt: record.updatedAt,
                });
            }
            return created;
        });

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
     * Fetches vision and sounds in parallel.
     */
    async getSoundsForVision(firebaseId: string, visionId: string) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const [vision, soundFiles] = await Promise.all([
            this.prisma.vision.findFirst({
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
            }),
            this.prisma.visionSound.findMany({
                orderBy: { order: 'asc' },
            }),
        ]);

        if (!vision) {
            return this.HandleError(new NotFoundException('Vision not found'));
        }

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
            visionSound: vision.visionSound ?? null,
            sounds: files,
            count: files.length,
        });
    }

    /**
     * Set a vision's background sound by name from the stater-videos sound list.
     * Resolves the name to a URL, finds or creates a VisionSound, and links it to the vision.
     */
    async setVisionBackgroundSoundByName(firebaseId: string, visionId: string, name: string) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const sound = this.staterVideosService.getSoundByName(name);
        if (!sound) {
            return this.HandleError(new NotFoundException('Sound not found'));
        }

        const [vision, visionSoundExisting] = await Promise.all([
            this.prisma.vision.findFirst({
                where: {
                    id: visionId,
                    visionBoard: { userId: user.id },
                },
            }),
            this.prisma.visionSound.findFirst({
                where: { name: sound.name },
            }),
        ]);

        if (!vision) {
            return this.HandleError(new NotFoundException('Vision not found'));
        }

        const visionSound = visionSoundExisting
            ? visionSoundExisting
            : await this.prisma.$transaction(async (tx) =>
                this.createVisionSoundWithNextOrder(tx, {
                    soundUrl: sound.url,
                    name: sound.name,
                    fileSize: null,
                    mimeType: null,
                }),
            );

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
     * Create a vision board for a specific Wheel of Life category.
     * If the category already has a vision board, returns the existing one.
     */
    async createVisionBoard(firebaseId: string, categoryId: string) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const category = await this.prisma.wheelCategory.findFirst({
            where: {
                id: categoryId,
                wheel: { userId: user.id },
            },
            include: { visionBoard: true },
        });

        if (!category) {
            return this.HandleError(new NotFoundException('Category not found or does not belong to user'));
        }

        if (category.visionBoard) {
            const existing = await this.prisma.visionBoard.findUnique({
                where: { id: category.visionBoard.id },
                include: {
                    category: {
                        select: { id: true, name: true, order: true },
                    },
                    _count: { select: { visions: true } },
                },
            });
            if (existing) {
                return this.Results({
                    board: {
                        id: existing.id,
                        categoryId: existing.categoryId,
                        category: existing.category,
                        visionCount: existing._count.visions,
                        isGlobal: existing.isGloabal,
                        createdAt: existing.createdAt,
                        updatedAt: existing.updatedAt,
                    },
                    created: false,
                });
            }
        }

        const board = await this.prisma.visionBoard.create({
            data: {
                userId: user.id,
                categoryId: category.id,
            },
            include: {
                category: {
                    select: { id: true, name: true, order: true },
                },
                _count: { select: { visions: true } },
            },
        });

        return this.Results({
            board: {
                id: board.id,
                categoryId: board.categoryId,
                category: board.category,
                visionCount: board._count.visions,
                isGlobal: board.isGloabal,
                createdAt: board.createdAt,
                updatedAt: board.updatedAt,
            },
            created: true,
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

        const visions = await this.prisma.vision.findMany({
            where: { visionBoardId: vision.visionBoardId },
            orderBy: { order: 'asc' },
        });

        const updatedVisions = await this.prisma.$transaction(async (tx) => {
            if (newOrder > currentOrder) {
                for (const v of visions) {
                    const vOrder = v.order ?? 0;
                    if (v.id === visionId) {
                        await tx.vision.update({
                            where: { id: v.id },
                            data: { order: newOrder },
                        });
                    } else if (vOrder > currentOrder && vOrder <= newOrder) {
                        await tx.vision.update({
                            where: { id: v.id },
                            data: { order: vOrder - 1 },
                        });
                    }
                }
            } else {
                for (const v of visions) {
                    const vOrder = v.order ?? 0;
                    if (v.id === visionId) {
                        await tx.vision.update({
                            where: { id: v.id },
                            data: { order: newOrder },
                        });
                    } else if (vOrder >= newOrder && vOrder < currentOrder) {
                        await tx.vision.update({
                            where: { id: v.id },
                            data: { order: vOrder + 1 },
                        });
                    }
                }
            }
            return tx.vision.findMany({
                where: { visionBoardId: vision.visionBoardId },
                orderBy: { order: 'asc' },
                select: { id: true, order: true },
            });
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

        const orderMin = Math.min(currentOrder, newOrder);
        const orderMax = Math.max(currentOrder, newOrder);

        const sounds = await this.prisma.visionSound.findMany({
            where: {
                order: { gte: orderMin, lte: orderMax },
            },
            orderBy: { order: 'asc' },
        });

        const updatedSounds = await this.prisma.$transaction(async (tx) => {
            if (newOrder > currentOrder) {
                for (const s of sounds) {
                    const sOrder = s.order ?? 0;
                    if (s.id === soundId) {
                        await tx.visionSound.update({
                            where: { id: s.id },
                            data: { order: newOrder },
                        });
                    } else if (sOrder > currentOrder && sOrder <= newOrder) {
                        await tx.visionSound.update({
                            where: { id: s.id },
                            data: { order: sOrder - 1 },
                        });
                    }
                }
            } else {
                for (const s of sounds) {
                    const sOrder = s.order ?? 0;
                    if (s.id === soundId) {
                        await tx.visionSound.update({
                            where: { id: s.id },
                            data: { order: newOrder },
                        });
                    } else if (sOrder >= newOrder && sOrder < currentOrder) {
                        await tx.visionSound.update({
                            where: { id: s.id },
                            data: { order: sOrder + 1 },
                        });
                    }
                }
            }
            return tx.visionSound.findMany({
                orderBy: { order: 'asc' },
                select: { id: true, order: true, name: true },
            });
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
                prompt: vision.reflectionSession.prompt ?? '',
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

    /**
     * Get the next order value for VisionSound and create a record in a single transaction to avoid race conditions.
     */
    private async createVisionSoundWithNextOrder(
        tx: Parameters<Parameters<DatabaseProvider['$transaction']>[0]>[0],
        data: Prisma.VisionSoundCreateInput,
    ) {
        const maxRow = await tx.visionSound.findFirst({
            orderBy: { order: 'desc' },
            select: { order: true },
        });
        const newOrder = maxRow?.order != null ? maxRow.order + 1 : 1;
        return tx.visionSound.create({
            data: { ...data, order: newOrder },
        });
    }
}
