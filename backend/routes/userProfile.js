const express = require('express');
const router = express.Router();

const { User, LikedSong } = require('../models/pg');
const Song = require('../models/mongo/song');
const ListeningHistory = require('../models/mongo/ListeningHistory');
const InteractionLog = require('../models/mongo/InteractionLog');

// isAuthenticated: перевіряє сесію — session.userId або passport
const isAuthenticated = (req, res, next) => {
    if (req.session.userId || req.isAuthenticated()) return next();
    res.status(401).json({ error: 'Не авторизовано' });
};

// getUserId: ID поточного користувача — з сесії або passport
const getUserId = (req) => req.session.userId || req.user.id;

router.post('/api/like', isAuthenticated, async (req, res) => {
    const { song } = req.body;
    try {
        await Song.findOneAndUpdate(
            { youtubeId: song.youtubeId },
            {
                title: song.title,
                author: song.author,
                image: song.image,
                duration: song.duration || 0,
                ...(song.channelId ? { channelId: song.channelId } : {})
            },
            { upsert: true, setDefaultsOnInsert: true }
        );

        const userId = getUserId(req);

        const existingLike = await LikedSong.findOne({ where: { userId, youtubeId: song.youtubeId } });
        if (existingLike) {
            await existingLike.destroy();
            await InteractionLog.create({ userId: String(userId), youtubeId: song.youtubeId, action: 'unlike' });
        } else {
            await LikedSong.create({ userId, youtubeId: song.youtubeId });
            await InteractionLog.create({ userId: String(userId), youtubeId: song.youtubeId, action: 'like' });
        }

        const allLikes = await LikedSong.findAll({ where: { userId } });
        res.json({ likedSongs: allLikes.map(l => l.youtubeId) });
    } catch (err) {
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

router.get('/api/songs/liked', isAuthenticated, async (req, res) => {
    try {
        const userId = getUserId(req);
        const likes = await LikedSong.findAll({ where: { userId } });
        const youtubeIds = likes.map(l => l.youtubeId);

        const songs = await Song.find({ youtubeId: { $in: youtubeIds } });
        res.json(songs);
    } catch (err) {
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

router.post('/api/history', isAuthenticated, async (req, res) => {
    const { song } = req.body;
    const youtubeId = song?.youtubeId && String(song.youtubeId).trim();
    if (!youtubeId) {
        return res.status(400).json({ error: 'youtubeId is required' });
    }
    try {
        const userId = String(getUserId(req));
        await Song.findOneAndUpdate(
            { youtubeId },
            {
                title: song.title || 'Без назви',
                author: song.author || '',
                image: song.image,
                duration: song.duration || 0,
                ...(song.channelId ? { channelId: song.channelId } : {})
            },
            { upsert: true, setDefaultsOnInsert: true, returnDocument: 'after' }
        );

        await ListeningHistory.deleteMany({ userId, youtubeId });

        await ListeningHistory.create({ userId, youtubeId, playedAt: new Date() });
        await InteractionLog.create({ userId, youtubeId, action: 'play', listenDurationSeconds: song.listenDurationSeconds || 0 });

        res.json({ message: 'Додано до історії' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Помилка збереження історії' });
    }
});

router.get('/api/history', isAuthenticated, async (req, res) => {
    try {
        const userId = String(getUserId(req));

        const history = await ListeningHistory.find({ userId }).sort({ playedAt: -1 });
        const youtubeIds = history.map(h => h.youtubeId).filter((id) => id && typeof id === 'string');

        const songs = await Song.find({ youtubeId: { $in: youtubeIds } });
        const songMap = {};
        songs.forEach(s => songMap[s.youtubeId] = s);

        const result = history.map(h => {
            const songInfo = songMap[h.youtubeId];
            return songInfo ? { ...songInfo.toObject(), playedAt: h.playedAt } : null;
        }).filter(item => item !== null);

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

router.get('/api/history/top-played', isAuthenticated, async (req, res) => {
    try {
        const userId = String(getUserId(req));
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 50);

        const rows = await InteractionLog.aggregate([
            { $match: { userId, action: 'play' } },
            {
                $group: {
                    _id: '$youtubeId',
                    playCount: { $sum: 1 },
                    lastPlayed: { $max: '$createdAt' }
                }
            },
            { $sort: { playCount: -1, lastPlayed: -1 } },
            { $limit: limit }
        ]);

        const youtubeIds = rows.map(r => r._id).filter(Boolean);
        if (!youtubeIds.length) return res.json([]);

        const songs = await Song.find({ youtubeId: { $in: youtubeIds } });
        const songMap = {};
        songs.forEach(s => { songMap[s.youtubeId] = s; });

        const result = rows.map((r) => {
            const songInfo = songMap[r._id];
            if (!songInfo) return null;
            return {
                ...songInfo.toObject(),
                playCount: r.playCount,
                lastPlayed: r.lastPlayed
            };
        }).filter(Boolean);

        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

router.put('/api/user/profile', isAuthenticated, async (req, res) => {
    try {
        const userId = getUserId(req);
        const { displayName, email, avatar } = req.body;

        const user = await User.findByPk(userId);

        if (email && email !== user.email) {
            const existing = await User.findOne({ where: { email } });
            if (existing) return res.status(400).json({ error: 'Цей email вже використовується' });
            user.email = email;
        }

        if (displayName) user.displayName = displayName;
        if (avatar) user.avatar = avatar;

        await user.save();

        const likes = await LikedSong.findAll({ where: { userId } });
        const userObj = user.toJSON();
        userObj.likedSongs = likes.map(l => l.youtubeId);
        delete userObj.passwordHash;

        res.json(userObj);
    } catch (err) {
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

module.exports = router;