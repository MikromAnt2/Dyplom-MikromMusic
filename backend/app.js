require('dotenv').config({ path: '../.env' });
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const { connectMongo } = require('./utils/mongo');

const app = express();
const PORT = process.env.PORT || 3000;

const { sequelize } = require('./models/pg/index');

connectMongo(process.env.MONGO_URI).catch(() => {});
require('./models/pg/index');

const authRoutes = require('./routes/auth');
const playlistRoutes = require('./routes/playlists');
const { router: searchRoutes } = require('./routes/search');
const channelsRoutes = require('./routes/channels');
const userProfileRoutes = require('./routes/userProfile');
const genreRoutes = require('./routes/genre');
const recommendationsRoutes = require('./routes/recommendations');
const shareRoutes = require('./routes/share');
const streamRoutes = require('./routes/stream');
app.use(express.json({ limit: '10mb' }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'super_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(authRoutes);
app.use(playlistRoutes);
app.use(searchRoutes);
app.use(channelsRoutes);
app.use(userProfileRoutes);
app.use(genreRoutes);
app.use(recommendationsRoutes);
app.use(shareRoutes);
app.use(streamRoutes);

app.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));