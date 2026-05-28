/** Глобальні моки — ізольовані тести без реальної БД та YouTube Innertube */

jest.mock('../config/database', () => ({
  sequelize: { authenticate: jest.fn(), sync: jest.fn() }
}));

jest.mock('../models/pg', () => ({
  Playlist: {
    findAll: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    findByPk: jest.fn()
  },
  PlaylistTrack: { bulkCreate: jest.fn(), findAll: jest.fn() },
  User: { findByPk: jest.fn(), findOrCreate: jest.fn() },
  Artist: { findOrCreate: jest.fn() },
  LikedSong: { findAll: jest.fn().mockResolvedValue([]) },
  Subscription: {}
}));

jest.mock('../models/mongo/song', () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  findOneAndUpdate: jest.fn()
}));

jest.mock('youtubei.js', () => ({
  Innertube: {
    create: jest.fn().mockResolvedValue({
      music: { search: jest.fn().mockResolvedValue({}) },
      getChannel: jest.fn(),
      actions: { execute: jest.fn() }
    })
  }
}));

process.env.YT_API_KEY = 'test-key-for-jest';
process.env.POSTGRES_URI = 'postgres://test:test@localhost:5432/test_db';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/test_mikrom';
