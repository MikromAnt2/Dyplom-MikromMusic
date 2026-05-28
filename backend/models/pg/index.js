const sequelize = require('../../config/database');
const User = require('./User');
const Playlist = require('./Playlist');
const Artist = require('./Artist');
const { DataTypes } = require('sequelize');

User.hasMany(Playlist, { foreignKey: 'ownerId', as: 'playlists' });
Playlist.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });

const Subscription = sequelize.define('Subscription', {
    subscribedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
});
User.belongsToMany(Artist, { through: Subscription, as: 'subscribedArtists' });
Artist.belongsToMany(User, { through: Subscription, as: 'followers' });

const LikedSong = sequelize.define('LikedSong', {
    youtubeId: { type: DataTypes.STRING, allowNull: false }
});
User.hasMany(LikedSong, { foreignKey: 'userId', as: 'likedSongs' });

const PlaylistTrack = sequelize.define('PlaylistTrack', {
    youtubeId: { type: DataTypes.STRING, allowNull: false },
    addedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
});
Playlist.hasMany(PlaylistTrack, { foreignKey: 'playlistId', as: 'tracks' });

sequelize.sync({ alter: true }).then(() => {
    console.log("PostgreSQL Tables Synced!");
}).catch(err => console.log("PG Sync Error:", err));

module.exports = { User, Playlist, Artist, LikedSong, PlaylistTrack, sequelize };