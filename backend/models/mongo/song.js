const mongoose = require('mongoose');

const SongSchema = new mongoose.Schema({
    youtubeId: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    author: { type: String, required: true },
    channelId: { type: String, default: '' },
    image: { type: String, required: true },
    duration: { type: Number, default: 0 },
    lyrics: { type: String, default: "" },
    addedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Song', SongSchema);