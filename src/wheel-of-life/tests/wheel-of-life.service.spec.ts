import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { WheelOfLifeService } from '../wheel-of-life.service';
import { DatabaseProvider } from '../../database/database.provider';

jest.mock('../../common', () => {
  const originalModule = jest.requireActual('../../common');
  return {
    ...originalModule,
    logger: {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    },
  };
});

describe('WheelOfLifeService', () => {
  let service: WheelOfLifeService;
  let mockPrisma: any;

  const mockUser = {
    id: 'user-123',
    firebaseId: 'firebase-uid-123',
    email: 'test@example.com',
    name: 'Test User',
  };

  const mockWheel = {
    id: 'wheel-123',
    userId: 'user-123',
    categories: [
      {
        id: 'cat-1',
        name: 'Health & Well-being',
        order: 0,
        wheelId: 'wheel-123',
      },
      { id: 'cat-2', name: 'Relationships', order: 1, wheelId: 'wheel-123' },
      { id: 'cat-3', name: 'Career / Work', order: 2, wheelId: 'wheel-123' },
    ],
  };

  const mockCategory = {
    id: 'cat-1',
    name: 'Health & Well-being',
    order: 0,
    wheelId: 'wheel-123',
  };

  const mockAssessment = {
    id: 'assessment-123',
    wheelId: 'wheel-123',
    scores: { 'cat-1': 8, 'cat-2': 6, 'cat-3': 7 },
    strongestArea: 'cat-1',
    weakestArea: 'cat-2',
    imbalanceScore: 0.8,
    createdAt: new Date(),
  };

  const mockFocus = {
    id: 'focus-123',
    wheelId: 'wheel-123',
    categoryId: 'cat-1',
    isActive: true,
    createdAt: new Date(),
    category: { id: 'cat-1', name: 'Health & Well-being' },
    wheelAssessment: null,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
      wheelOfLife: {
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      wheelCategory: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      wheelAssessment: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      wheelFocus: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      visionBoard: {
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WheelOfLifeService,
        { provide: DatabaseProvider, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<WheelOfLifeService>(WheelOfLifeService);
  });

  describe('getOrCreateWheel', () => {
    it('should return existing wheel if user has one', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        wheelOfLife: mockWheel,
      });

      const result = await service.getOrCreateWheel('firebase-uid-123');

      expect(result.isError).toBe(false);
      expect(result.data).toEqual(mockWheel);
    });

    it('should create new wheel with default categories if user has none', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        wheelOfLife: null,
      });
      mockPrisma.wheelOfLife.create.mockResolvedValue(mockWheel);

      const result = await service.getOrCreateWheel('firebase-uid-123');

      expect(result.isError).toBe(false);
      expect(mockPrisma.wheelOfLife.create).toHaveBeenCalled();
    });

    it('should return error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.getOrCreateWheel('nonexistent-firebase-id');

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateCategory', () => {
    it('should successfully update a category', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.wheelCategory.findFirst.mockResolvedValue(mockCategory);
      mockPrisma.wheelCategory.update.mockResolvedValue({
        ...mockCategory,
        name: 'Updated Name',
      });

      const result = await service.updateCategory('firebase-uid-123', 'cat-1', {
        name: 'Updated Name',
      });

      expect(result.isError).toBe(false);
      expect(result.data?.name).toBe('Updated Name');
    });

    it('should return error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.updateCategory(
        'nonexistent-firebase-id',
        'cat-1',
        { name: 'Updated Name' },
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('should return error when category not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.wheelCategory.findFirst.mockResolvedValue(null);

      const result = await service.updateCategory(
        'firebase-uid-123',
        'nonexistent-cat',
        { name: 'Updated Name' },
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });
  });

  describe('addCategory', () => {
    it('should successfully add a new category', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.wheelOfLife.findUnique.mockResolvedValue(mockWheel);
      mockPrisma.wheelCategory.findFirst.mockResolvedValue({ order: 2 });
      mockPrisma.wheelCategory.create.mockResolvedValue({
        id: 'new-cat',
        name: 'New Category',
        order: 3,
        wheelId: 'wheel-123',
      });

      const result = await service.addCategory('firebase-uid-123', {
        name: 'New Category',
      });

      expect(result.isError).toBe(false);
      expect(result.data?.name).toBe('New Category');
    });

    it('should return error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.addCategory('nonexistent-firebase-id', {
        name: 'New Category',
      });

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('should return error when wheel not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.wheelOfLife.findUnique.mockResolvedValue(null);

      const result = await service.addCategory('firebase-uid-123', {
        name: 'New Category',
      });

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });
  });

  describe('deleteCategory', () => {
    it('should successfully delete a category', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.wheelCategory.findFirst.mockResolvedValue(mockCategory);
      mockPrisma.wheelCategory.delete.mockResolvedValue(mockCategory);

      const result = await service.deleteCategory('firebase-uid-123', 'cat-1');

      expect(result.isError).toBe(false);
      expect(result.data).toBeNull();
    });

    it('should return error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.deleteCategory(
        'nonexistent-firebase-id',
        'cat-1',
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('should return error when category not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.wheelCategory.findFirst.mockResolvedValue(null);

      const result = await service.deleteCategory(
        'firebase-uid-123',
        'nonexistent-cat',
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateScores', () => {
    it('should successfully update scores and create assessment', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.wheelOfLife.findUnique.mockResolvedValue(mockWheel);
      mockPrisma.wheelCategory.findMany.mockResolvedValue(mockWheel.categories);
      mockPrisma.wheelAssessment.findFirst.mockResolvedValue(null);
      mockPrisma.wheelAssessment.create.mockResolvedValue(mockAssessment);

      const result = await service.updateScores('firebase-uid-123', {
        scores: { 'cat-1': 8, 'cat-2': 6, 'cat-3': 7 },
      });

      expect(result.isError).toBe(false);
      expect(result.data?.assessment).toBeDefined();
      expect(result.data?.breakdown).toBeDefined();
    });

    it('should update existing assessment if one exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.wheelOfLife.findUnique.mockResolvedValue(mockWheel);
      mockPrisma.wheelCategory.findMany.mockResolvedValue(mockWheel.categories);
      mockPrisma.wheelAssessment.findFirst.mockResolvedValue(mockAssessment);
      mockPrisma.wheelAssessment.update.mockResolvedValue(mockAssessment);

      const result = await service.updateScores('firebase-uid-123', {
        scores: { 'cat-1': 9, 'cat-2': 7, 'cat-3': 8 },
      });

      expect(result.isError).toBe(false);
      expect(mockPrisma.wheelAssessment.update).toHaveBeenCalled();
    });

    it('should return error for invalid category ID', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.wheelOfLife.findUnique.mockResolvedValue(mockWheel);
      mockPrisma.wheelCategory.findMany.mockResolvedValue(mockWheel.categories);

      const result = await service.updateScores('firebase-uid-123', {
        scores: { 'invalid-cat': 8 },
      });

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(BadRequestException);
    });

    it('should return error for score above maximum', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.wheelOfLife.findUnique.mockResolvedValue(mockWheel);
      mockPrisma.wheelCategory.findMany.mockResolvedValue(mockWheel.categories);

      const result = await service.updateScores('firebase-uid-123', {
        scores: { 'cat-1': 11 },
      });

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(BadRequestException);
    });

    it('should return error for score below minimum', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.wheelOfLife.findUnique.mockResolvedValue(mockWheel);
      mockPrisma.wheelCategory.findMany.mockResolvedValue(mockWheel.categories);

      const result = await service.updateScores('firebase-uid-123', {
        scores: { 'cat-1': 0 },
      });

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(BadRequestException);
    });
  });

  describe('getAssessmentBreakdown', () => {
    it('should return assessment breakdown', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.wheelOfLife.findUnique.mockResolvedValue(mockWheel);
      mockPrisma.wheelAssessment.findFirst.mockResolvedValue({
        ...mockAssessment,
        wheel: mockWheel,
      });

      const result = await service.getAssessmentBreakdown('firebase-uid-123');

      expect(result.isError).toBe(false);
      expect(result.data?.strongestArea).toBeDefined();
      expect(result.data?.weakestArea).toBeDefined();
    });

    it('should return error when no assessment found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.wheelOfLife.findUnique.mockResolvedValue(mockWheel);
      mockPrisma.wheelAssessment.findFirst.mockResolvedValue(null);

      const result = await service.getAssessmentBreakdown('firebase-uid-123');

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });
  });

  describe('getAssessmentHistory', () => {
    it('should return assessment history', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.wheelOfLife.findUnique.mockResolvedValue(mockWheel);
      mockPrisma.wheelAssessment.findMany.mockResolvedValue([mockAssessment]);

      const result = await service.getAssessmentHistory('firebase-uid-123');

      expect(result.isError).toBe(false);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should return error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.getAssessmentHistory(
        'nonexistent-firebase-id',
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });
  });

  describe('chooseFocus', () => {
    it('should successfully create a focus', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.wheelOfLife.findUnique.mockResolvedValue(mockWheel);
      mockPrisma.wheelCategory.findFirst.mockResolvedValue(mockCategory);
      mockPrisma.wheelFocus.findFirst.mockResolvedValue(null);
      mockPrisma.wheelFocus.create.mockResolvedValue(mockFocus);

      const result = await service.chooseFocus('firebase-uid-123', {
        categoryId: 'cat-1',
      });

      expect(result.isError).toBe(false);
      expect(result.data?.focus).toBeDefined();
    });

    it('should return error when category not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.wheelOfLife.findUnique.mockResolvedValue(mockWheel);
      mockPrisma.wheelCategory.findFirst.mockResolvedValue(null);

      const result = await service.chooseFocus('firebase-uid-123', {
        categoryId: 'nonexistent-cat',
      });

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('should return error when active focus already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.wheelOfLife.findUnique.mockResolvedValue(mockWheel);
      mockPrisma.wheelCategory.findFirst.mockResolvedValue(mockCategory);
      mockPrisma.wheelFocus.findFirst.mockResolvedValue(mockFocus);

      const result = await service.chooseFocus('firebase-uid-123', {
        categoryId: 'cat-1',
      });

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(BadRequestException);
    });
  });

  describe('getFocuses', () => {
    it('should return all focuses', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.wheelOfLife.findUnique.mockResolvedValue(mockWheel);
      mockPrisma.wheelFocus.findMany.mockResolvedValue([mockFocus]);

      const result = await service.getFocuses('firebase-uid-123');

      expect(result.isError).toBe(false);
      expect(result.data?.focuses).toBeDefined();
      expect(result.data?.activeCount).toBe(1);
    });

    it('should filter by active status when specified', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.wheelOfLife.findUnique.mockResolvedValue(mockWheel);
      mockPrisma.wheelFocus.findMany.mockResolvedValue([mockFocus]);

      await service.getFocuses('firebase-uid-123', true);

      expect(mockPrisma.wheelFocus.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        }),
      );
    });
  });

  describe('deleteFocus', () => {
    it('should successfully delete a focus', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.wheelOfLife.findUnique.mockResolvedValue(mockWheel);
      mockPrisma.wheelFocus.findFirst.mockResolvedValue(mockFocus);
      mockPrisma.wheelFocus.delete.mockResolvedValue(mockFocus);

      const result = await service.deleteFocus('firebase-uid-123', 'focus-123');

      expect(result.isError).toBe(false);
      expect(result.data).toBeNull();
    });

    it('should return error when focus not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.wheelOfLife.findUnique.mockResolvedValue(mockWheel);
      mockPrisma.wheelFocus.findFirst.mockResolvedValue(null);

      const result = await service.deleteFocus(
        'firebase-uid-123',
        'nonexistent-focus',
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });
  });
});
