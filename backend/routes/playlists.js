const express = require('express');
const { Op } = require('sequelize');
const router = express.Router();
const { Playlist, PlaylistTrack, User } = require('../models/pg');
const Song = require('../models/mongo/song');
const { isMongoConnected } = require('../utils/mongo');

// isAuthenticated: перевіряє сесію користувача — session.userId або passport
const isAuthenticated = (req, res, next) => {
    if (req.session.userId || req.isAuthenticated()) return next();
    res.status(401).json({ error: 'Не авторизовано' });
};

const {
    mergePlaylistWithMongoSongs,
    collectYoutubeIdsFromPlaylists
} = require('../services/playlistMerge');

// populateMongoSongs: доповнює плейлисти метаданими треків — з MongoDB за youtubeId
async function populateMongoSongs(playlists) {
    const youtubeIds = collectYoutubeIdsFromPlaylists(playlists);
    if (!isMongoConnected() || !youtubeIds.size) {
        return mergePlaylistWithMongoSongs(playlists, []);
    }
    const mongoSongs = await Song.find({ youtubeId: { $in: Array.from(youtubeIds) } });
    return mergePlaylistWithMongoSongs(playlists, mongoSongs);
}

router.post('/api/playlists', isAuthenticated, async (req, res) => {
    try {
        const { name, description, isPublic, initialTrack } = req.body;
        const userId = req.session.userId || req.user.id;

        let coverImage = "https://via.placeholder.com/200/181818/ffffff?text=Playlist";
        const tracksToProcess = Array.isArray(initialTrack) ? initialTrack : (initialTrack ? [initialTrack] : []);

        for (const trackData of tracksToProcess) {
            if (trackData && trackData.youtubeId) {
                await Song.findOneAndUpdate(
                    { youtubeId: trackData.youtubeId },
                    { title: trackData.title, author: trackData.author, image: trackData.image, duration: trackData.duration || 0 },
                    { upsert: true, setDefaultsOnInsert: true }
                );
            }
        }

        if (tracksToProcess.length > 0 && tracksToProcess[0].image) coverImage = tracksToProcess[0].image;

        const newPlaylist = await Playlist.create({
            name, description, isPublic, ownerId: userId, coverImage
        });

        if (tracksToProcess.length > 0) {
            const trackRecords = tracksToProcess.map(t => ({
                playlistId: newPlaylist.id,
                youtubeId: t.youtubeId
            }));
            await PlaylistTrack.bulkCreate(trackRecords);
        }

        res.status(201).json(newPlaylist);
    } catch (err) {
        console.error("Create Playlist Error:", err);
        res.status(500).json({ error: 'Помилка створення плейлиста' });
    }
});

router.get('/api/playlists/me', async (req, res) => {
    const userId = req.session.userId || (req.user ? req.user.id : null);
    if (!userId) return res.json([]);

    try {
        const playlists = await Playlist.findAll({
            where: { ownerId: userId },
            order: [['createdAt', 'DESC']],
            include: [
                { model: User, as: 'owner', attributes: ['displayName'] },
                { model: PlaylistTrack, as: 'tracks' }
            ]
        });

        const mappedPlaylists = await populateMongoSongs(playlists);
        res.json(mappedPlaylists);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

router.get('/api/playlists/community', async (req, res) => {
    try {
        const userId = req.session?.userId || req.user?.id;
        if (process.env.DEBUG_COMMUNITY === '1') {
            console.log("Запит спільноти. ID юзера:", userId || "Неавторизований");
        }

        const whereClause = { isPublic: true };

        if (userId) {
            whereClause.ownerId = { [Op.ne]: userId };
        }

        let publicPlaylists = await Playlist.findAll({
            where: whereClause,
            order: [['createdAt', 'DESC']],
            limit: 15,
            include: [
                { model: User, as: 'owner', attributes: ['displayName'] },
                { model: PlaylistTrack, as: 'tracks' }
            ]
        });

        if (publicPlaylists.length === 0) {
            publicPlaylists = await Playlist.findAll({
                where: { isPublic: true },
                order: [['createdAt', 'DESC']],
                limit: 15,
                include: [
                    { model: User, as: 'owner', attributes: ['displayName'] },
                    { model: PlaylistTrack, as: 'tracks' }
                ]
            });
        }

        const mapped = await populateMongoSongs(publicPlaylists);
        res.json(mapped);
    } catch (err) {
        console.error("Community Playlists Error:", err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});
router.post('/api/playlists/:id/add', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId || req.user.id;
        const playlist = await Playlist.findByPk(req.params.id);

        if (!playlist) return res.status(404).json({ error: 'Плейлист не знайдено' });
        if (playlist.ownerId !== userId) return res.status(403).json({ error: 'Немає доступу' });

        const track = req.body;

        await Song.findOneAndUpdate(
            { youtubeId: track.youtubeId },
            { title: track.title, author: track.author, image: track.image, duration: track.duration || 0 },
            { upsert: true, setDefaultsOnInsert: true }
        );

        const exists = await PlaylistTrack.findOne({ where: { playlistId: playlist.id, youtubeId: track.youtubeId } });
        if (exists) return res.status(400).json({ error: 'Пісня вже є у плейлисті' });

        await PlaylistTrack.create({ playlistId: playlist.id, youtubeId: track.youtubeId });

        const trackCount = await PlaylistTrack.count({ where: { playlistId: playlist.id } });
        if (trackCount === 1) {
            playlist.coverImage = track.image;
            await playlist.save();
        }

        res.json({ message: "Додано" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

router.post('/api/playlists/:id/add-bulk', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId || req.user.id;
        const playlist = await Playlist.findByPk(req.params.id);

        if (!playlist) return res.status(404).json({ error: 'Плейлист не знайдено' });
        if (playlist.ownerId !== userId) return res.status(403).json({ error: 'Немає доступу' });

        const { tracks } = req.body;
        if (!tracks || !Array.isArray(tracks)) return res.status(400).json({ error: 'Потрібен масив треків' });

        for (const t of tracks) {
            await Song.findOneAndUpdate(
                { youtubeId: t.youtubeId },
                { title: t.title, author: t.author, image: t.image, duration: t.duration || 0 },
                { upsert: true, setDefaultsOnInsert: true }
            );
        }

        const existingTracks = await PlaylistTrack.findAll({ where: { playlistId: playlist.id } });
        const existingIds = new Set(existingTracks.map(t => t.youtubeId));

        const newTracks = tracks.filter(t => !existingIds.has(t.youtubeId));

        if (newTracks.length > 0) {
            await PlaylistTrack.bulkCreate(newTracks.map(t => ({ playlistId: playlist.id, youtubeId: t.youtubeId })));

            if (existingTracks.length === 0) {
                playlist.coverImage = newTracks[0].image;
                await playlist.save();
            }
        }

        res.json({ message: `Успішно додано ${newTracks.length} треків` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

router.get('/api/playlists/:id/add-suggestions', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId || req.user.id;
        const playlist = await Playlist.findByPk(req.params.id, {
            include: [
                { model: User, as: 'owner', attributes: ['displayName'] },
                { model: PlaylistTrack, as: 'tracks' }
            ]
        });

        if (!playlist) return res.status(404).json([]);
        if (playlist.ownerId !== userId) return res.status(403).json([]);

        const [mapped] = await populateMongoSongs([playlist]);
        const tracks = mapped?.tracks || [];
        const { buildPlaylistAddSuggestions } = require('../services/playlistSuggestions');
        const suggestions = await buildPlaylistAddSuggestions(tracks, { userId: String(userId) });
        res.json(suggestions);
    } catch (err) {
        console.error('Playlist add-suggestions error:', err);
        res.json([]);
    }
});

router.get('/api/playlists/:id', async (req, res) => {
    try {
        const playlist = await Playlist.findByPk(req.params.id, {
            include: [
                { model: User, as: 'owner', attributes: ['id', 'displayName'] },
                { model: PlaylistTrack, as: 'tracks' }
            ]
        });

        if (!playlist) return res.status(404).json({ error: 'Плейлист не знайдено' });

        const [mappedPlaylist] = await populateMongoSongs([playlist]);
        mappedPlaylist.owner = mappedPlaylist.owner.id;
        res.json(mappedPlaylist);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

router.put('/api/playlists/:id', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId || req.user.id;
        const playlist = await Playlist.findByPk(req.params.id);

        if (!playlist) return res.status(404).json({ error: 'Плейлист не знайдено' });
        if (playlist.ownerId !== userId) return res.status(403).json({ error: 'Немає доступу' });

        const { name, description, isPublic } = req.body;
        if (name !== undefined) playlist.name = name;
        if (description !== undefined) playlist.description = description;
        if (isPublic !== undefined) playlist.isPublic = isPublic;

        await playlist.save();
        res.json(playlist);
    } catch (err) {
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

router.delete('/api/playlists/:id/tracks', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId || req.user.id;
        const playlist = await Playlist.findByPk(req.params.id);

        if (!playlist) return res.status(404).json({ error: 'Плейлист не знайдено' });
        if (playlist.ownerId !== userId) return res.status(403).json({ error: 'Немає доступу' });

        const { youtubeIds } = req.body;
        await PlaylistTrack.destroy({
            where: { playlistId: playlist.id, youtubeId: youtubeIds }
        });

        const remainingTrack = await PlaylistTrack.findOne({ where: { playlistId: playlist.id }, order: [['addedAt', 'ASC']] });
        if (remainingTrack) {
            const songData = await Song.findOne({ youtubeId: remainingTrack.youtubeId });
            playlist.coverImage = songData ? songData.image : "https://via.placeholder.com/200/181818/ffffff?text=Playlist";
        } else {
            playlist.coverImage = "https://via.placeholder.com/200/181818/ffffff?text=Playlist";
        }
        await playlist.save();

        res.json({ message: "Видалено" });
    } catch (err) {
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

router.delete('/api/playlists/:id', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId || req.user.id;
        const playlist = await Playlist.findByPk(req.params.id);

        if (!playlist) return res.status(404).json({ error: 'Плейлист не знайдено' });
        if (playlist.ownerId !== userId) return res.status(403).json({ error: 'Немає доступу' });

        await PlaylistTrack.destroy({ where: { playlistId: playlist.id } });
        await playlist.destroy();

        res.json({ message: 'Плейлист видалено' });
    } catch (err) {
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

module.exports = router;