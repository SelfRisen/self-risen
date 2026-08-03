import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { DatabaseProvider } from 'src/database/database.provider';
import { BaseService } from 'src/common';
import { StorageService, FileType } from 'src/common/storage/storage.service';
import { CreateJournalDto, UpdateJournalDto } from './dto';

@Injectable()
export class JournalService extends BaseService {
  private readonly logger = new Logger(JournalService.name);

  constructor(
    private prisma: DatabaseProvider,
    private storageService: StorageService,
  ) {
    super();
  }

  private async getUserByFirebaseId(firebaseId: string) {
    return this.prisma.user.findUnique({
      where: { firebaseId },
    });
  }

  /**
   * Create a new journal entry
   */
  async createJournal(
    firebaseId: string,
    dto: CreateJournalDto,
    imageFile?: Express.Multer.File,
  ) {
    const user = await this.getUserByFirebaseId(firebaseId);
    if (!user) {
      return this.HandleError(new NotFoundException('User not found'));
    }

    let imageUrl: string | undefined;
    if (imageFile) {
      try {
        const uploadResult = await this.storageService.uploadFile(
          imageFile,
          FileType.IMAGE,
          user.id,
          'journal/images',
        );
        imageUrl = uploadResult.url;
      } catch (error) {
        return this.HandleError(
          new BadRequestException(`Failed to upload image: ${error.message}`),
        );
      }
    }

    const journalData: any = {
      userId: user.id,
      title: dto.title,
      text: dto.text,
      date: dto.date ? new Date(dto.date) : new Date(),
    };

    if (imageUrl) {
      journalData.imageUrl = imageUrl;
    }

    const journal = await this.prisma.journal.create({
      data: journalData,
    });

    return this.Results(journal);
  }

  /**
   * Get all journal entries for a user (paginated)
   */
  async getAllJournals(
    firebaseId: string,
    page: number = 1,
    limit: number = 10,
    search?: string,
  ) {
    const user = await this.getUserByFirebaseId(firebaseId);
    if (!user) {
      return this.HandleError(new NotFoundException('User not found'));
    }

    const pageNumber = Math.max(1, Math.floor(page));
    const pageSize = Math.max(1, Math.min(100, Math.floor(limit)));
    const skip = (pageNumber - 1) * pageSize;

    const whereClause: any = { userId: user.id };

    if (search && search.trim()) {
      whereClause.title = {
        contains: search.trim(),
        mode: 'insensitive',
      };
    }

    const totalCount = await this.prisma.journal.count({
      where: whereClause,
    });

    const journals = await this.prisma.journal.findMany({
      where: whereClause,
      orderBy: { date: 'desc' },
      skip,
      take: pageSize,
    });

    const totalPages = Math.ceil(totalCount / pageSize);

    return this.Results({
      journals,
      pagination: {
        page: pageNumber,
        limit: pageSize,
        totalCount,
        totalPages,
        hasNextPage: pageNumber < totalPages,
        hasPreviousPage: pageNumber > 1,
      },
    });
  }

  /**
   * Get a single journal entry by ID
   */
  async getJournalById(firebaseId: string, journalId: string) {
    const user = await this.getUserByFirebaseId(firebaseId);
    if (!user) {
      return this.HandleError(new NotFoundException('User not found'));
    }

    const journal = await this.prisma.journal.findFirst({
      where: {
        id: journalId,
        userId: user.id,
      },
    });

    if (!journal) {
      return this.HandleError(new NotFoundException('Journal entry not found'));
    }

    return this.Results(journal);
  }

  /**
   * Update a journal entry
   */
  async updateJournal(
    firebaseId: string,
    journalId: string,
    dto: UpdateJournalDto,
    imageFile?: Express.Multer.File,
  ) {
    const user = await this.getUserByFirebaseId(firebaseId);
    if (!user) {
      return this.HandleError(new NotFoundException('User not found'));
    }

    const existingJournal = await this.prisma.journal.findFirst({
      where: {
        id: journalId,
        userId: user.id,
      },
    });

    if (!existingJournal) {
      return this.HandleError(new NotFoundException('Journal entry not found'));
    }

    const updateData: any = {};

    if (
      dto.title !== undefined &&
      dto.title !== null &&
      dto.title.trim() !== ''
    ) {
      updateData.title = dto.title.trim();
    }

    if (dto.text !== undefined && dto.text !== null && dto.text.trim() !== '') {
      updateData.text = dto.text.trim();
    }

    if (
      dto.date !== undefined &&
      dto.date !== null &&
      typeof dto.date === 'string' &&
      dto.date.trim() !== ''
    ) {
      updateData.date = new Date(dto.date);
    }

    if (imageFile) {
      try {
        const uploadResult = await this.storageService.uploadFile(
          imageFile,
          FileType.IMAGE,
          user.id,
          'journal/images',
        );
        updateData.imageUrl = uploadResult.url;
      } catch (error) {
        return this.HandleError(
          new BadRequestException(`Failed to upload image: ${error.message}`),
        );
      }
    }

    const updatedJournal = await this.prisma.journal.update({
      where: { id: journalId },
      data: updateData,
    });

    return this.Results(updatedJournal);
  }

  /**
   * Delete a journal entry
   */
  async deleteJournal(firebaseId: string, journalId: string) {
    const user = await this.getUserByFirebaseId(firebaseId);
    if (!user) {
      return this.HandleError(new NotFoundException('User not found'));
    }

    const existingJournal = await this.prisma.journal.findFirst({
      where: {
        id: journalId,
        userId: user.id,
      },
    });

    if (!existingJournal) {
      return this.HandleError(new NotFoundException('Journal entry not found'));
    }

    await this.prisma.journal.delete({
      where: { id: journalId },
    });

    return this.Results({ message: 'Journal entry deleted successfully' });
  }
}
