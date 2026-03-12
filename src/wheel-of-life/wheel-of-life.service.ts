import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseProvider } from 'src/database/database.provider';
import { BaseService } from 'src/common';
import {
    UpdateCategoryDto,
    AddCategoryDto,
    UpdateScoresDto,
    ChooseFocusDto,
    AssessmentBreakdown,
    UpdateFocusDto,
    FocusResponse,
    FocusListResponse,
} from './dto';

@Injectable()
export class WheelOfLifeService extends BaseService {
    private readonly DEFAULT_CATEGORIES = [
        'Health & Well-being',
        'Relationships & Intimacy',
        'Career & Work',
        'Finances',
        'Spirituality',
        'Personal Growth',
        'Leisure & Fun',
        'Community Service',
    ];

    constructor(private prisma: DatabaseProvider) {
        super();
    }

    async getOrCreateWheel(firebaseId: string) {
        const user = await this.prisma.user.findUnique({
            where: { firebaseId },
            include: {
                wheelOfLife: {
                    include: {
                        categories: {
                            include: {
                                focuses: {
                                    include: {
                                        wheelAssessment: true,
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        // If wheel exists, return it
        if (user.wheelOfLife) {
            return this.Results(user.wheelOfLife);
        }

        // Create wheel with default categories
        const wheel = await this.prisma.wheelOfLife.create({
            data: {
                userId: user.id,
                categories: {
                    create: this.DEFAULT_CATEGORIES.map((name, index) => ({
                        name,
                        order: index,
                        // visionBoard: {
                        //     create: {
                        //         userId: user.id,
                        //     },
                        // },
                    })),
                },
            },
            include: { categories: { orderBy: { order: 'asc' } } },
        });

        const globalBoard = await this.prisma.visionBoard.create({
            data: {
                userId: user.id,
                isGloabal: true,
            }
        })

        return this.Results(wheel);
    }

    async updateCategory(
        firebaseId: string,
        categoryId: string,
        payload: UpdateCategoryDto,
    ) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const category = await this.prisma.wheelCategory.findFirst({
            where: {
                id: categoryId,
                wheel: { userId: user.id },
            },
        });

        if (!category) {
            return this.HandleError(new NotFoundException('Category not found'));
        }

        const updated = await this.prisma.wheelCategory.update({
            where: { id: categoryId },
            data: payload,
        });

        return this.Results(updated);
    }

    async addCategory(firebaseId: string, payload: AddCategoryDto) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const wheel = await this.getWheelByUserId(user.id);
        if (!wheel) {
            return this.HandleError(new NotFoundException('Wheel not found'));
        }

        // Get max order to append at end
        const maxOrderCategory = await this.prisma.wheelCategory.findFirst({
            where: { wheelId: wheel.id },
            orderBy: { order: 'desc' },
            select: { order: true },
        });

        const category = await this.prisma.wheelCategory.create({
            data: {
                wheelId: wheel.id,
                name: payload.name,
                order: payload.order ?? (maxOrderCategory?.order ?? -1) + 1,
                visionBoard: {
                    create: {
                        userId: user.id,
                    },
                },
            },
        });

        return this.Results(category);
    }

    async deleteCategory(firebaseId: string, categoryId: string) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const category = await this.prisma.wheelCategory.findFirst({
            where: {
                id: categoryId,
                wheel: { userId: user.id },
            },
        });

        if (!category) {
            return this.HandleError(new NotFoundException('Category not found'));
        }

        await this.prisma.wheelCategory.delete({
            where: { id: categoryId },
        });

        return this.Results(null);
    }

    async updateScores(firebaseId: string, payload: UpdateScoresDto) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const wheel = await this.getWheelByUserId(user.id);
        if (!wheel) {
            return this.HandleError(new NotFoundException('Wheel not found'));
        }

        // Validate all category IDs exist and scores are 1-10
        const categories = await this.prisma.wheelCategory.findMany({
            where: { wheelId: wheel.id },
        });

        for (const [categoryId, score] of Object.entries(payload.scores)) {
            if (!categories.find((c) => c.id === categoryId)) {
                return this.HandleError(
                    new BadRequestException(`Category ${categoryId} not found`),
                );
            }
            if (score < 1 || score > 10) {
                return this.HandleError(
                    new BadRequestException('Scores must be between 1 and 10'),
                );
            }
        }

        // Calculate breakdown
        const breakdown = this.calculateBreakdown(
            categories,
            payload.scores,
        );

        // Create or update latest assessment
        const latestAssessment = await this.prisma.wheelAssessment.findFirst({
            where: { wheelId: wheel.id },
            orderBy: { createdAt: 'desc' },
        });

        const assessment = latestAssessment
            ? await this.prisma.wheelAssessment.update({
                where: { id: latestAssessment.id },
                data: {
                    scores: payload.scores,
                    strongestArea: breakdown.strongestArea.categoryId,
                    weakestArea: breakdown.weakestArea.categoryId,
                    imbalanceScore: breakdown.imbalanceScore,
                },
            })
            : await this.prisma.wheelAssessment.create({
                data: {
                    wheelId: wheel.id,
                    scores: payload.scores,
                    strongestArea: breakdown.strongestArea.categoryId,
                    weakestArea: breakdown.weakestArea.categoryId,
                    imbalanceScore: breakdown.imbalanceScore,
                },
            });

        return this.Results({
            assessment,
            breakdown,
        });

    }

    async getAssessmentBreakdown(firebaseId: string) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const wheel = await this.getWheelByUserId(user.id);
        if (!wheel) {
            return this.HandleError(new NotFoundException('Wheel not found'));
        }

        const assessment = await this.prisma.wheelAssessment.findFirst({
            where: { wheelId: wheel.id },
            orderBy: { createdAt: 'desc' },
            include: { wheel: { include: { categories: true } } },
        });

        if (!assessment) {
            return this.HandleError(
                new NotFoundException('No assessment found. Please complete your scores first.'),
            );
        }

        const categories = assessment.wheel.categories;
        const scores = assessment.scores as Record<string, number>;
        const breakdown = this.calculateBreakdown(categories, scores);

        return this.Results(breakdown);
    }

    async getAssessmentHistory(firebaseId: string) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const wheel = await this.getWheelByUserId(user.id);
        if (!wheel) {
            return this.HandleError(new NotFoundException('Wheel not found'));
        }

        const assessments = await this.prisma.wheelAssessment.findMany({
            where: { wheelId: wheel.id },
            orderBy: { createdAt: 'desc' },
            include: {
                wheel: {
                    include: {
                        categories: {
                            include: {
                                focuses: true,
                            },
                        },
                    },
                },
            },
        });

        return this.Results(assessments);
    }

    async chooseFocus(firebaseId: string, payload: ChooseFocusDto) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const wheel = await this.getWheelByUserId(user.id);
        if (!wheel) {
            return this.HandleError(new NotFoundException('Wheel not found'));
        }

        // Validate category belongs to user's wheel
        const category = await this.prisma.wheelCategory.findFirst({
            where: {
                id: payload.categoryId,
                wheelId: wheel.id,
            },
        });

        if (!category) {
            return this.HandleError(new NotFoundException('Category not found'));
        }

        const existingFocus = await this.prisma.wheelFocus.findFirst({
            where: {
                categoryId: payload.categoryId,
                wheelId: wheel.id,
                isActive: true,
            },
        });

        if (existingFocus) {
            return this.HandleError(new BadRequestException('Focus already exists'));
        }


        // Create new focus record
        const focus = await this.prisma.wheelFocus.create({
            data: {
                wheelId: wheel.id,
                categoryId: payload.categoryId,
                isActive: true,
            },
            include: {
                category: true,
                wheelAssessment: true,
            },
        });

        return this.Results({
            focus: this.mapFocusToResponse(focus),
        });
    }

    async getFocuses(firebaseId: string, activeOnly?: boolean) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const wheel = await this.getWheelByUserId(user.id);
        if (!wheel) {
            return this.HandleError(new NotFoundException('Wheel not found'));
        }

        const where: any = { wheelId: wheel.id };
        if (activeOnly !== undefined) {
            where.isActive = activeOnly;
        }

        const focuses = await this.prisma.wheelFocus.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                category: true,
                wheelAssessment: true,
            },
        });

        // const focusResponses = focuses.map((focus) => this.mapFocusToResponse(focus));
        const activeCount = focuses.filter((f) => f.isActive).length;
        const completedCount = focuses.filter((f) => f.completedAt).length;

        return this.Results({
            focuses,
            activeCount,
            completedCount,
        });
    }

    async deleteFocus(firebaseId: string, focusId: string) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const wheel = await this.getWheelByUserId(user.id);
        if (!wheel) {
            return this.HandleError(new NotFoundException('Wheel not found'));
        }

        // Validate focus belongs to user's wheel
        const focus = await this.prisma.wheelFocus.findFirst({
            where: {
                id: focusId,
                wheelId: wheel.id,
            },
        });

        if (!focus) {
            return this.HandleError(new NotFoundException('Focus not found'));
        }

        await this.prisma.wheelFocus.delete({
            where: { id: focusId },
        });

        return this.Results(null);
    }


    // Helper methods
    private async getUserByFirebaseId(firebaseId: string) {
        return this.prisma.user.findUnique({
            where: { firebaseId },
        });
    }

    private async getWheelByUserId(userId: string) {
        return this.prisma.wheelOfLife.findUnique({
            where: { userId },
            include: { categories: true },
        });
    }

    private calculateBreakdown(
        categories: Array<{ id: string; name: string }>,
        scores: Record<string, number>,
    ): AssessmentBreakdown {
        const insights = categories.map((cat) => ({
            categoryId: cat.id,
            categoryName: cat.name,
            score: scores[cat.id] || 0,
            isStrongest: false,
            isWeakest: false,
        }));

        // Find strongest and weakest
        const sorted = [...insights].sort((a, b) => b.score - a.score);
        const strongest = sorted[0];
        const weakest = sorted[sorted.length - 1];

        strongest.isStrongest = true;
        weakest.isWeakest = true;

        // Calculate imbalance score (standard deviation normalized to 0-1)
        const scoreValues = Object.values(scores);
        const mean = scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length;
        const variance =
            scoreValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
            scoreValues.length;
        const stdDev = Math.sqrt(variance);
        // Normalize: 0 stdDev = 1 (balanced), higher stdDev = lower score
        const imbalanceScore = Math.max(0, 1 - stdDev / 5); // Assuming max stdDev ~5

        return {
            strongestArea: {
                categoryId: strongest.categoryId,
                categoryName: strongest.categoryName,
                score: strongest.score,
            },
            weakestArea: {
                categoryId: weakest.categoryId,
                categoryName: weakest.categoryName,
                score: weakest.score,
            },
            imbalanceScore,
            categoryInsights: insights,
            averageScore: mean,
        };
    }
    
    private mapFocusToResponse(focus: any): FocusResponse {
        return {
            id: focus.id,
            wheelId: focus.wheelId,
            categoryId: focus.categoryId,
            categoryName: focus.category.name,
            assessmentId: focus.assessmentId || undefined,
            isActive: focus.isActive,
            startedAt: focus.startedAt,
            completedAt: focus.completedAt || undefined,
            createdAt: focus.createdAt,
            updatedAt: focus.updatedAt,
        };
    }

}

