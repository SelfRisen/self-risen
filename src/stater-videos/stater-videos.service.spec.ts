import { Test, TestingModule } from '@nestjs/testing';
import { StaterVideosService } from './stater-videos.service';
import { DatabaseProvider } from '../database/database.provider';

describe('StaterVideosService', () => {
  let service: StaterVideosService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaterVideosService,
        { provide: DatabaseProvider, useValue: {} },
      ],
    }).compile();

    service = module.get<StaterVideosService>(StaterVideosService);
  });

  describe('getMusicByName', () => {
    it('should return music entry when name exists', () => {
      const result = service.getMusicByName('bright-glow');

      expect(result).not.toBeNull();
      expect(result).toEqual(
        expect.objectContaining({
          name: 'bright-glow',
          url: expect.any(String),
        }),
      );
    });

    it('should return null when name does not exist', () => {
      const result = service.getMusicByName('unknown-track');

      expect(result).toBeNull();
    });
  });
});
