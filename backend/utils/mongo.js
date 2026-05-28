const mongoose = require('mongoose');

let handlersAttached = false;

// isMongoConnected: чи активне з'єднання з MongoDB (readyState === 1)
function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

// attachMongoHandlers: лог підключення / відключення MongoDB
function attachMongoHandlers() {
  if (handlersAttached) return;
  handlersAttached = true;
  const conn = mongoose.connection;
  conn.on('connected', () => console.log('MongoDB Connected'));
  conn.on('disconnected', () => console.warn('MongoDB disconnected'));
  conn.on('error', (err) => console.error('MongoDB error:', err.message));
}

// connectMongo: підключення з retry — не блокує старт Express
async function connectMongo(uri) {
  if (!uri) {
        console.error('MongoDB: MONGO_URI не задано в .env');
        return false;
  }
  mongoose.set('bufferCommands', false);
  attachMongoHandlers();
  try {
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            connectTimeoutMS: 10000
        });
        return true;
  } catch (err) {
        console.error('MongoDB Connection Error:', err.message);
        console.error('Запустіть MongoDB (mongod) або перевірте MONGO_URI у .env');
        return false;
  }
}

module.exports = { isMongoConnected, connectMongo, attachMongoHandlers };
