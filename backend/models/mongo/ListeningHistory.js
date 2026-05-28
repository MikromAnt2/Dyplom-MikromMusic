const mongoose = require('mongoose');

const ListeningHistorySchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    youtubeId: { type: String, required: true },
    playedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ListeningHistory', ListeningHistorySchema);