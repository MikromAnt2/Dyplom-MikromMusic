/**
 * Таблиця 4.2 — гібридний зовнішній пошук (Double-Fetch)
 * TC-5 … TC-7
 */
jest.mock('../config/database', () => ({ sequelize: {} }));
jest.mock('../models/pg', () => ({
  Playlist: { findAll: jest.fn() },
  User: {}
}));

const {
  SEARCH_PAGE_SIZE,
  mapYoutubeSearchToTracks,
  parseIso8601Duration,
  dedupeTracksByYoutubeId
} = require('../services/searchLogic');
const searchModule = require('../routes/search');
const Song = require('../models/mongo/song');

jest.mock('../utils/persistentCache', () => {
  const mem = new Map();
  return {
    createPersistentCache: () => ({
      get: () => null,
      set: (k, v) => mem.set(k, v)
    })
  };
});

const { isValidMusicTrack, runInfiniteTracksSearch } = searchModule;

function makeSearchItem(id, title, channel = 'Imagine Dragons') {
  return {
    id: { videoId: id },
    snippet: {
      title,
      channelTitle: channel,
      channelId: 'UC_test'
    }
  };
}

function makeDurationItem(id, iso, views = '1000') {
  return {
    id,
    contentDetails: { duration: iso },
    statistics: { viewCount: views }
  };
}

describe('Гібридний зовнішній пошук (infiniteTracks)', () => {
  const originalFetch = searchModule.fetchFromYouTube;

  beforeEach(() => {
    jest.clearAllMocks();
    Song.findOneAndUpdate.mockResolvedValue({});
  });

  afterEach(() => {
    searchModule.fetchFromYouTube = originalFetch;
  });

  describe('TC-5: Зовнішній пошук (Double-Fetch)', () => {
    it('q="Imagine Dragons" — два запити (search + videos), views і duration у відповіді', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce({
          items: [
            makeSearchItem('vid1', 'Imagine Dragons - Believer'),
            makeSearchItem('vid2', 'Imagine Dragons - Radioactive')
          ],
          nextPageToken: 'TOKEN_ABC'
        })
        .mockResolvedValueOnce({
          items: [
            makeDurationItem('vid1', 'PT3M24S', '5000000'),
            makeDurationItem('vid2', 'PT3M7S', '8000000')
          ]
        });

      searchModule.fetchFromYouTube = fetchMock;

      const result = await runInfiniteTracksSearch({
        query: 'Imagine Dragons',
        channelId: '',
        pageToken: ''
      });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][0]).toContain('youtube/v3/search');
      expect(fetchMock.mock.calls[0][0]).toContain(encodeURIComponent('Imagine Dragons'));
      expect(fetchMock.mock.calls[1][0]).toContain('youtube/v3/videos');
      expect(fetchMock.mock.calls[1][0]).toContain('vid1');
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0].views).toBeGreaterThan(0);
      expect(result.items[0].duration).toBeGreaterThan(30);
      expect(result.nextPageToken).toBe('TOKEN_ABC');
      expect(Song.findOneAndUpdate).toHaveBeenCalled();
    });
  });

  describe('TC-6: Валідація фільтра тривалості', () => {
    it('відкидає відео коротші за 30 секунд (Shorts)', () => {
      const searchItems = [
        makeSearchItem('short1', 'Funny clip'),
        makeSearchItem('ok1', 'Imagine Dragons - Natural')
      ];
      const durationItems = [
        makeDurationItem('short1', 'PT15S'),
        makeDurationItem('ok1', 'PT3M10S')
      ];

      const { items } = mapYoutubeSearchToTracks(searchItems, durationItems, {
        minDuration: 30,
        isValidTrack: isValidMusicTrack
      });

      expect(items).toHaveLength(1);
      expect(items[0].youtubeId).toBe('ok1');
      expect(items[0].duration).toBeGreaterThan(30);
    });

    it('isValidMusicTrack відхиляє compilation/junk titles', () => {
      expect(isValidMusicTrack('Top 50 anime openings', 120)).toBe(false);
      expect(isValidMusicTrack('Imagine Dragons - Believer', 200)).toBe(true);
    });
  });

  describe('TC-7: Перевірка пагінації', () => {
    it('повертає не більше 15 записів на сторінку', () => {
      const many = Array.from({ length: 25 }, (_, i) =>
        makeSearchItem(`v${i}`, `Track ${i}`)
      );
      const durations = many.map((_, i) => makeDurationItem(`v${i}`, 'PT4M0S'));

      const { items } = mapYoutubeSearchToTracks(many, durations);
      expect(items.length).toBe(SEARCH_PAGE_SIZE);
      expect(items.length).toBeLessThanOrEqual(15);
    });

    it('nextPageToken передається в другий запит; сторінки без дублікатів id', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce({
          items: [makeSearchItem('page1only', 'Song page 1')],
          nextPageToken: 'NEXT_PAGE'
        })
        .mockResolvedValueOnce({
          items: [makeDurationItem('page1only', 'PT3M0S')]
        })
        .mockResolvedValueOnce({
          items: [makeSearchItem('page2only', 'Song page 2')],
          nextPageToken: null
        })
        .mockResolvedValueOnce({
          items: [makeDurationItem('page2only', 'PT3M30S')]
        });

      searchModule.fetchFromYouTube = fetchMock;

      const page1 = await runInfiniteTracksSearch({
        query: 'pagination test',
        pageToken: ''
      });
      const page2 = await runInfiniteTracksSearch({
        query: 'pagination test',
        pageToken: 'NEXT_PAGE'
      });

      expect(fetchMock.mock.calls[2][0]).toContain('pageToken=NEXT_PAGE');
      expect(page1.items[0].youtubeId).toBe('page1only');
      expect(page2.items[0].youtubeId).toBe('page2only');
      expect(page1.items[0].youtubeId).not.toBe(page2.items[0].youtubeId);
    });

    it('dedupeTracksByYoutubeId прибирає дублікати', () => {
      const list = [
        { youtubeId: 'a', title: '1' },
        { youtubeId: 'a', title: 'dup' },
        { youtubeId: 'b', title: '2' }
      ];
      expect(dedupeTracksByYoutubeId(list)).toHaveLength(2);
    });
  });

  describe('Додатково', () => {
    it('parseIso8601Duration: PT3M24S = 204 с', () => {
      expect(parseIso8601Duration('PT3M24S')).toBe(204);
    });
  });
});
