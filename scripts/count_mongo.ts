import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/bet62';

async function countGames() {
  try {
    console.log(`Connecting to MongoDB at ${MONGO_URI}...`);
    await mongoose.connect(MONGO_URI);
    console.log('Connected.');

    if (!mongoose.connection.db) {
        throw new Error('Database connection failed');
    }

    const collections = await mongoose.connection.db.collections();
    const gamesCollection = collections.find(c => c.collectionName === 'games');

    if (gamesCollection) {
      const count = await gamesCollection.countDocuments();
      console.log(`Total games in MongoDB: ${count}`);
      
      if (count > 0) {
          const sample = await gamesCollection.findOne({});
          console.log('Sample game:', JSON.stringify(sample, null, 2));
      }
    } else {
      console.log('Games collection not found.');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

countGames();
