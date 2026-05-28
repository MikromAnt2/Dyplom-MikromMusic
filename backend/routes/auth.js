const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const { User, LikedSong } = require('../models/pg');

// serializeUser: зберігає user.id у сесії passport
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// deserializeUser: завантажує користувача з БД за id сесії
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findByPk(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

// GoogleStrategy callback: знаходить або створює користувача за Google profile
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ where: { googleId: profile.id } });
        if (!user) {
            user = await User.create({
                googleId: profile.id,
                displayName: profile.displayName,
                email: profile.emails[0].value,
                avatar: profile.photos[0].value
            });
        }
        return done(null, user);
    } catch (err) {
        return done(err, null);
    }
}));

router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/' }),
    (req, res) => {
        req.session.userId = req.user.id;
        res.redirect('/');
    }
);

router.post('/api/register', async (req, res) => {
    try {
        const email = req.body.email.trim().toLowerCase();
        const { displayName, password } = req.body;

        let user = await User.findOne({ where: { email } });
        if (user) {
            return res.status(400).json({ error: 'Користувач з таким email вже існує' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        user = await User.create({
            displayName,
            email,
            passwordHash: hashedPassword
        });

        req.login(user, (err) => {
            if (err) return res.status(500).json({ error: 'Помилка авторизації' });
            req.session.userId = user.id;
            const userObj = user.toJSON();
            userObj.likedSongs = [];
            delete userObj.passwordHash;
            res.json({ message: 'Реєстрація успішна', user: userObj });
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

router.post('/api/login', async (req, res) => {
    try {
        const email = req.body.email.trim().toLowerCase();
        const { password } = req.body;

        const user = await User.findOne({
            where: { email },
            include: [{ model: LikedSong, as: 'likedSongs' }]
        });

        if (!user || !user.passwordHash) {
            return res.status(400).json({ error: 'Невірний email або пароль' });
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) return res.status(400).json({ error: 'Невірний email або пароль' });

        req.session.userId = user.id;

        const userObj = user.toJSON();
        userObj.likedSongs = userObj.likedSongs ? userObj.likedSongs.map(s => s.youtubeId) : [];
        delete userObj.passwordHash;

        res.json({ message: 'Вхід успішний', user: userObj });
    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

router.post('/api/logout', (req, res) => {
    req.session.userId = null;
    req.logout((err) => {
        if (err) return res.status(500).json({ error: 'Помилка при виході' });
        res.json({ message: 'Вийшли успішно' });
    });
});

router.get('/api/current_user', async (req, res) => {
    try {
        if (req.session.userId) {
            const user = await User.findByPk(req.session.userId, {
                include: [{ model: LikedSong, as: 'likedSongs' }]
            });
            if (!user) return res.json(null);

            const userObj = user.toJSON();
            userObj.likedSongs = userObj.likedSongs ? userObj.likedSongs.map(s => s.youtubeId) : [];
            delete userObj.passwordHash;
            return res.json(userObj);
        } else if (req.isAuthenticated()) {
            req.session.userId = req.user.id;
            return res.json(req.user);
        }
        res.json(null);
    } catch (err) {
        res.json(null);
    }
});

module.exports = router;