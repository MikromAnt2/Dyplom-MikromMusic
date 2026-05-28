const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Artist = sequelize.define('Artist', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    channelId: { type: DataTypes.STRING, unique: true, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    image: { type: DataTypes.STRING },
    subscriberCount: { type: DataTypes.INTEGER, defaultValue: 0 }
});

module.exports = Artist;