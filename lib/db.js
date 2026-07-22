import mongoose from 'mongoose';

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export async function connectDB() {
  const MONGODB_URI = process.env.MONGODB_URI;

  if (!MONGODB_URI) {
    throw new Error('Please define the MONGODB_URI environment variable');
  }

  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  if (cached.conn && mongoose.connection.readyState === 1) return cached.conn;

  // Reset stale cache if connection dropped
  if (cached.conn && mongoose.connection.readyState !== 1) {
    cached.conn = null;
    cached.promise = null;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 10000, // 10s to find a server
        socketTimeoutMS: 45000,          // 45s socket idle timeout
        connectTimeoutMS: 10000,         // 10s connection timeout
        maxPoolSize: 10,                 // max concurrent connections
        retryWrites: true,
      })
      .then((m) => m)
      .catch((err) => {
        // Clear cached promise on failure so next request retries
        cached.promise = null;
        throw err;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    throw err;
  }

  return cached.conn;
}

export default connectDB;
