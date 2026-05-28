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

// Memory logging (Render 512MB debugging)
function formatMb(bytes) {
    return `${Math.round((Number(bytes) || 0) / 1024 / 1024)}MB`;
}
function logMem(tag) {
    try {
        const m = process.memoryUsage();
        console.log(
            `[mem] ${tag} rss=${formatMb(m.rss)} heapUsed=${formatMb(m.heapUsed)} heapTotal=${formatMb(m.heapTotal)} ext=${formatMb(m.external)}`
        );
    } catch (_) {}
}
const MEMLOG_ENABLED =
    String(process.env.MEMLOG || '').trim() === '1' ||
    String(process.env.MEMLOG || '').trim().toLowerCase() === 'true';
const MEMLOG_INTERVAL_MIN = Math.min(
    60,
    Math.max(1, parseInt(process.env.MEMLOG_INTERVAL_MIN || '5', 10) || 5)
);

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

if (MEMLOG_ENABLED) {
    logMem('boot');
    setInterval(() => logMem('interval'), MEMLOG_INTERVAL_MIN * 60 * 1000).unref?.();
    app.use((req, res, next) => {
        const url = req.originalUrl || req.url || '';
        const heavy =
            url.startsWith('/api/search') ||
            url.startsWith('/api/genre') ||
            url.startsWith('/api/artist-discography') ||
            url.startsWith('/api/recommendations');
        if (!heavy) return next();

        const started = Date.now();
        logMem(`> ${req.method} ${url}`);
        res.on('finish', () => {
            logMem(`< ${req.method} ${url} ${res.statusCode} ${Date.now() - started}ms`);
        });
        next();
    });
}

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
    console.log(`[web] serving frontend from: ${frontendDist}`);
    app.use(express.static(frontendDist));
    // SPA fallback (do not override API/auth routes)
    app.get(/^\/(?!api\/|auth\/).*/, (req, res) => {
        res.sendFile(indexHtml);
    });
} else {
    console.warn('[WARN] frontend/dist not found. Run `cd frontend && npm run build` for one-domain hosting.');
    console.warn(`[WARN] expected: ${indexHtml}`);
}

app.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));