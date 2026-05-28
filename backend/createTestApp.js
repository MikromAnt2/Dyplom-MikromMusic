const express = require('express');
const session = require('express-session');

// createTestApp: мінімальний Express для інтеграційних тестів (без listen)
function createTestApp(options = {}) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(
    session({
      secret: 'jest-test-secret',
      resave: false,
      saveUninitialized: true
    })
  );

  app.use((req, _res, next) => {
    if (typeof req.isAuthenticated !== 'function') {
      req.isAuthenticated = () => false;
    }
    next();
  });

  if (options.authenticated) {
    app.use((req, _res, next) => {
      req.session.userId = options.userId || 'test-user-uuid';
      req.user = { id: req.session.userId };
      req.isAuthenticated = () => true;
      next();
    });
  }

  const { router: searchRoutes } = require('./routes/search');
  const recommendationsRoutes = require('./routes/recommendations');
  const genreRoutes = require('./routes/genre');
  const playlistRoutes = require('./routes/playlists');
  const streamRoutes = require('./routes/stream');

  app.use(searchRoutes);
  app.use(recommendationsRoutes);
  app.use(genreRoutes);
  app.use(streamRoutes);
  if (options.mountPlaylists !== false) {
    app.use(playlistRoutes);
  }

  return app;
}

module.exports = { createTestApp };
