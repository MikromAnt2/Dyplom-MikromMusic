/**
 * Інтеграційні HTTP-тести API (система в цілому, з моками БД/API).
 */
const request = require('supertest');
const { createTestApp } = require('../createTestApp');
const searchModule = require('../routes/search');

jest.mock('../services/recommendation', () => ({
  buildHomeBlocks: jest.fn(),
  buildGuestHome: jest.fn(),
  buildPublicFeed: jest.fn().mockResolvedValue([
    { youtubeId: 'pub1', title: 'Hit', author: 'Artist', image: 'http://img', duration: 200 }
  ]),
  buildSmartQueue: jest.fn(),
  buildUserProfile: jest.fn().mockResolvedValue({ subscribedArtists: [], exclude: new Set() }),
  getHomeCache: jest.fn().mockResolvedValue(null),
  setHomeCache: jest.fn(),
  invalidateHomeCache: jest.fn()
}));

jest.mock('../services/recommendation/homeBlocks', () => ({
  enrichMissingHomeBlocks: jest.fn(async (blocks) => blocks)
}));

describe('API — системні інтеграційні тести', () => {
  const originalYtFetch = searchModule.fetchFromYouTube;

  afterEach(() => {
    searchModule.fetchFromYouTube = originalYtFetch;
    jest.clearAllMocks();
  });

  describe('Пошук', () => {
    it('GET /api/search/infiniteTracks без q і channelId → 400', async () => {
      const app = createTestApp();
      const res = await request(app).get('/api/search/infiniteTracks');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/required/i);
    });

    it('GET /api/search/infiniteTracks з q → 200 і структура items', async () => {
      searchModule.fetchFromYouTube = jest
        .fn()
        .mockResolvedValueOnce({
          items: [
            {
              id: { videoId: 'api_vid1' },
              snippet: { title: 'Song A', channelTitle: 'Band', channelId: 'UCxxxxxxxxxxx' }
            }
          ],
          nextPageToken: null
        })
        .mockResolvedValueOnce({
          items: [
            {
              id: 'api_vid1',
              contentDetails: { duration: 'PT4M0S' },
              statistics: { viewCount: '1000' }
            }
          ]
        });

      const app = createTestApp();
      const res = await request(app).get('/api/search/infiniteTracks').query({ q: 'test music' });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
      if (res.body.items.length) {
        expect(res.body.items[0]).toHaveProperty('youtubeId');
        expect(res.body.items[0]).toHaveProperty('duration');
      }
    });

    it('GET /api/search/site-playlists без q → порожній масив', async () => {
      const app = createTestApp();
      const res = await request(app).get('/api/search/site-playlists');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('Рекомендації', () => {
    it('GET /api/recommendations/public → items і meta', async () => {
      const app = createTestApp();
      const res = await request(app)
        .get('/api/recommendations/public')
        .query({ q: 'rock', limit: 5 });
      expect(res.status).toBe(200);
      expect(res.body.meta.mode).toBe('public');
      expect(res.body.items.length).toBeGreaterThan(0);
    });

    it('GET /api/recommendations/home-full без авторизації → 401', async () => {
      const app = createTestApp();
      const res = await request(app).get('/api/recommendations/home-full');
      expect(res.status).toBe(401);
    });

    it('GET /api/recommendations/home-guest → blocks і mode guest', async () => {
      const rec = require('../services/recommendation');
      rec.buildGuestHome.mockResolvedValueOnce({
        blocks: { trendingNow: [{ youtubeId: 'g1', title: 'T', author: 'A', image: 'i', duration: 180 }] },
        meta: { mode: 'guest' }
      });
      const app = createTestApp();
      const res = await request(app).get('/api/recommendations/home-guest');
      expect(res.status).toBe(200);
      expect(res.body.mode).toBe('guest');
      expect(res.body.blocks).toBeDefined();
    });
  });

  describe('Жанри', () => {
    it('GET /api/genre/unknown-slug → порожні дані', async () => {
      const app = createTestApp({ mountPlaylists: false });
      const res = await request(app).get('/api/genre/unknown-slug-xyz');
      expect(res.status).toBe(200);
      expect(res.body.topTracks).toEqual([]);
      expect(res.body.meta).toBeNull();
    });
  });

  describe('Плейлисти (авторизація)', () => {
    it('POST /api/playlists без сесії → 401', async () => {
      const app = createTestApp();
      const res = await request(app)
        .post('/api/playlists')
        .send({ name: 'Test PL' });
      expect(res.status).toBe(401);
    });
  });
});
