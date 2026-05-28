/**
 * Таблиця 4.1 — кешування метаданих треків (MongoDB + YouTube API)
 * TC-1 … TC-4
 */
const Song = require('../models/mongo/song');
const {
  resolveTrackMetadata,
  isMetadataComplete,
  needsMetadataUpdate,
  saveTrackToMongo
} = require('../services/songCache');

describe('Кешування метаданих треків (MongoDB)', () => {
  const mockFetch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('TC-1: Пошук нового треку', () => {
    it('виконує запит до YouTube API та зберігає метадані в MongoDB', async () => {
      Song.findOne.mockResolvedValue(null);
      Song.findOneAndUpdate.mockResolvedValue({
        youtubeId: 'newVideo1',
        title: 'Believer',
        author: 'Imagine Dragons',
        image: 'https://i.ytimg.com/vi/newVideo1/mqdefault.jpg',
        duration: 204,
        toObject: () => ({
          youtubeId: 'newVideo1',
          title: 'Believer',
          author: 'Imagine Dragons',
          duration: 204
        })
      });

      mockFetch.mockResolvedValue({
        items: [
          {
            id: 'newVideo1',
            snippet: {
              title: 'Believer',
              channelTitle: 'Imagine Dragons',
              channelId: 'UC_123'
            },
            contentDetails: { duration: 'PT3M24S' },
            statistics: { viewCount: '1000000' }
          }
        ]
      });

      const result = await resolveTrackMetadata('newVideo1', mockFetch);

      expect(Song.findOne).toHaveBeenCalledWith({ youtubeId: 'newVideo1' });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(Song.findOneAndUpdate).toHaveBeenCalledWith(
        { youtubeId: 'newVideo1' },
        expect.objectContaining({
          title: 'Believer',
          author: 'Imagine Dragons',
          duration: 204
        }),
        expect.objectContaining({ upsert: true })
      );
      expect(result.source).toBe('api');
      expect(result.youtubeApiUsed).toBe(true);
      expect(result.track.title).toBe('Believer');
    });
  });

  describe('TC-2: Повторний пошук', () => {
    it('повертає дані з MongoDB без повторного API-запиту', async () => {
      const existing = {
        youtubeId: 'cached1',
        title: 'Radioactive',
        author: 'Imagine Dragons',
        image: 'https://i.ytimg.com/vi/cached1/mqdefault.jpg',
        duration: 187,
        toObject() {
          return this;
        }
      };
      Song.findOne.mockResolvedValue(existing);

      const result = await resolveTrackMetadata('cached1', mockFetch);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(Song.findOneAndUpdate).not.toHaveBeenCalled();
      expect(result.source).toBe('mongo');
      expect(result.youtubeApiUsed).toBe(false);
      expect(result.track.youtubeId).toBe('cached1');
    });
  });

  describe('TC-3: Часткова відсутність даних', () => {
    it('оновлює неповний запис через API та доповнює кеш', async () => {
      const partial = {
        youtubeId: 'partial1',
        title: 'Thunder',
        author: 'Imagine Dragons',
        image: 'https://i.ytimg.com/vi/partial1/mqdefault.jpg',
        duration: 0,
        toObject() {
          return this;
        }
      };
      Song.findOne.mockResolvedValue(partial);
      expect(needsMetadataUpdate(partial)).toBe(true);
      expect(isMetadataComplete(partial)).toBe(false);

      mockFetch.mockResolvedValue({
        items: [
          {
            id: 'partial1',
            snippet: {
              title: 'Thunder',
              channelTitle: 'Imagine Dragons',
              channelId: 'UC_123'
            },
            contentDetails: { duration: 'PT3M7S' },
            statistics: { viewCount: '500000' }
          }
        ]
      });

      Song.findOneAndUpdate.mockResolvedValue({
        ...partial,
        duration: 187,
        toObject() {
          return { ...partial, duration: 187 };
        }
      });

      const result = await resolveTrackMetadata('partial1', mockFetch);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(Song.findOneAndUpdate).toHaveBeenCalled();
      expect(result.youtubeApiUsed).toBe(true);
      expect(result.wasPartial).toBe(true);
      expect(result.source).toBe('mongo+api');
    });
  });

  describe('TC-4: Недоступність зовнішнього API', () => {
    it('використовує раніше збережені локальні дані MongoDB', async () => {
      const stale = {
        youtubeId: 'fallback1',
        title: 'Demons',
        author: 'Imagine Dragons',
        image: 'https://i.ytimg.com/vi/fallback1/mqdefault.jpg',
        duration: 0,
        toObject() {
          return this;
        }
      };
      Song.findOne.mockResolvedValue(stale);
      mockFetch.mockRejectedValue(new Error('All YouTube API keys quota exhausted'));

      const result = await resolveTrackMetadata('fallback1', mockFetch);

      expect(result.source).toBe('mongo-fallback');
      expect(result.youtubeApiUsed).toBe(false);
      expect(result.track.title).toBe('Demons');
      expect(result.apiError).toBeDefined();
    });

    it('кидає помилку, якщо немає ні API, ні локального кешу', async () => {
      Song.findOne.mockResolvedValue(null);
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(resolveTrackMetadata('missing1', mockFetch)).rejects.toThrow('Network error');
    });
  });

  describe('Додатково: saveTrackToMongo', () => {
    it('не зберігає запис без youtubeId', async () => {
      const r = await saveTrackToMongo({ title: 'No id' });
      expect(r).toBeNull();
      expect(Song.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });
});
