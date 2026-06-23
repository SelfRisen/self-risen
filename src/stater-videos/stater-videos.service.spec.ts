import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StaterVideosService } from './stater-videos.service';
import { DatabaseProvider } from '../database/database.provider';
import { TextToSpeechService } from 'src/reflection/services/text-to-speech.service';

describe('StaterVideosService', () => {
  let service: StaterVideosService;
  let mockPrisma: { user: { findUnique: jest.Mock } };
  let mockTts: { generateAffirmationAudio: jest.Mock; getPersonaMetadata: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      user: { findUnique: jest.fn() },
    };
    mockTts = {
      generateAffirmationAudio: jest.fn(),
      getPersonaMetadata: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaterVideosService,
        { provide: DatabaseProvider, useValue: mockPrisma },
        { provide: TextToSpeechService, useValue: mockTts },
      ],
    }).compile();

    service = module.get<StaterVideosService>(StaterVideosService);
  });

  describe('getSoundByName', () => {
    it('should return music entry when name exists', () => {
      const result = service.getSoundByName('Ambient Piano');

      expect(result).not.toBeNull();
      expect(result).toEqual(
        expect.objectContaining({
          name: 'Ambient Piano',
          url: expect.any(String),
        }),
      );
    });

    it('should return null when name does not exist', () => {
      const result = service.getSoundByName('unknown-track');

      expect(result).toBeNull();
    });
  });

  describe('generatePersonaTts', () => {
    const dto = { text: 'I am capable', voice: 'Sage' };

    it('should return audio URL and persona details on success', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockTts.getPersonaMetadata.mockReturnValue({
        name: 'Sage',
        displayName: 'Sage (Empathetic Mentor)',
      });
      mockTts.generateAffirmationAudio.mockResolvedValue('https://audio.test/sage.mp3');

      const result = await service.generatePersonaTts('firebase-uid', dto);

      expect(result.isError).toBe(false);
      expect(result.data).toEqual({
        audioUrl: 'https://audio.test/sage.mp3',
        voice: 'Sage',
        displayName: 'Sage (Empathetic Mentor)',
      });
      expect(mockTts.generateAffirmationAudio).toHaveBeenCalledWith(
        'I am capable',
        'user-1',
        'Sage',
      );
    });

    it('should return not found when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.generatePersonaTts('firebase-uid', dto);

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('should return bad request when TTS generation fails', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockTts.getPersonaMetadata.mockReturnValue({ name: 'Sage', displayName: 'Sage' });
      mockTts.generateAffirmationAudio.mockResolvedValue(null);

      const result = await service.generatePersonaTts('firebase-uid', dto);

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(BadRequestException);
    });
  });
});
