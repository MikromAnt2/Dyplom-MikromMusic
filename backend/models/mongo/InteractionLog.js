const mongoose = require('mongoose');

const InteractionLogSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    youtubeId: { type: String, required: true },
    action: {
        type: String,
        enum: ['play', 'skip', 'like', 'unlike', 'add_to_playlist'],
        required: true
    },
    listenDurationSeconds: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('InteractionLog', InteractionLogSchema);