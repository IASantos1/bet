import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/bet62';

async function clearMongo() {
  try {
    console.log(`🔗 Connecting to MongoDB at ${MONGO_URI}...`);
    await mongoose.connect(MONGO_URI);

    console.log('✅ Connected to MongoDB.');

    if (!mongoose.connection.db) {
      throw new Error('MongoDB database connection is not established.');
    }
    const collections = await mongoose.connection.db.collections();

    // Clean Games
    const gamesCollection = collections.find(c => c.collectionName.toLowerCase() === 'games');
    if (gamesCollection) {
      const gamesResult = await gamesCollection.deleteMany({});
      console.log(`🗑 Deleted ${gamesResult.deletedCount} games from MongoDB.`);
    } else {
      console.log('⚠ Games collection not found.');
    }

    // Clean Markets
    const marketsCollection = collections.find(c => c.collectionName.toLowerCase() === 'markets');
    if (marketsCollection) {
      const marketsResult = await marketsCollection.deleteMany({});
      console.log(`🗑 Deleted ${marketsResult.deletedCount} markets from MongoDB.`);
    } else {
      console.log('⚠ Markets collection not found.');
    }

    console.log('✅ MongoDB cleanup complete.');
  } catch (error) {
    console.error('❌ Error clearing MongoDB:', error);
  } finally {
    if (mongoose.connection.readyState) {
      await mongoose.disconnect();
      console.log('🔌 Disconnected from MongoDB.');
    }
  }
}

clearMongo();
