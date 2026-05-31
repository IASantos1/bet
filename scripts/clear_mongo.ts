
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from the root .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/bet62';

async function clearMongo() {
  try {
    console.log(`Connecting to MongoDB at ${MONGO_URI}...`);
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB.');

    // Get the Games collection
    if (!mongoose.connection.db) {
      throw new Error('MongoDB database connection is not established.');
    }
    const collections = await mongoose.connection.db.collections();
    const gamesCollection = collections.find(c => c.collectionName === 'games');

    if (gamesCollection) {
      const result = await gamesCollection.deleteMany({});
      console.log(`Deleted ${result.deletedCount} games from MongoDB.`);
    } else {
      console.log('Games collection not found.');
    }
    
    // Also clear Markets if they exist
    const marketsCollection = collections.find(c => c.collectionName === 'markets');
    if (marketsCollection) {
      const result = await marketsCollection.deleteMany({});
      console.log(`Deleted ${result.deletedCount} markets from MongoDB.`);
    }

    console.log('MongoDB cleanup complete.');
  } catch (error) {
    console.error('Error clearing MongoDB:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

clearMongo();
