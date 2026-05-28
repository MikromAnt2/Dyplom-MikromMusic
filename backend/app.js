require('dotenv').config({ path: '../.env' });
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const { connectMongo } = require('./utils/mongo');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

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

// Render/інші reverse-proxy хости: потрібно для коректних secure cookies
app.set('trust proxy', 1);

app.use(express.json({ limit: '10mb' }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'super_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24,
        httpOnly: true,
        sameSite: 'lax',
        secure: isProd
    }
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

// Serve frontend build (one-domain deploy).
// Build frontend: `cd frontend && npm run build`
const frontendDist = path.resolve(__dirname, '..', 'frontend', 'dist');
const indexHtml = path.join(frontendDist, 'index.html');
if (fs.existsSync(indexHtml)) {
    app.use(express.static(frontendDist));
    // SPA fallback (do not override API/auth routes)
    app.get(/^\/(?!api\/|auth\/).*/, (req, res) => {
        res.sendFile(indexHtml);
    });
} else {
    console.warn('[WARN] frontend/dist not found. Run `cd frontend && npm run build` for one-domain hosting.');
}

app.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));