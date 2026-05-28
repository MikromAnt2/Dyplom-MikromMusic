const mongoose = require('mongoose');

const HomeCacheSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    blocks: { type: Object, default: {} },
    meta: { type: Object, default: {} },
    recommendations: { type: Array, default: [] },
    newReleases: { type: Array, default: [] },
    soundtracks: { type: Array, default: [] },
    albumsForYou: { type: Array, default: [] },
    schemaVersion: { type: Number, default: 1 },
    updatedAt: { type: Number, default: Date.now }
});

module.exports = mongoose.model('HomeCache', HomeCacheSchema);