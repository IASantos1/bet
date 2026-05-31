import Redis from 'ioredis';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from the root .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function clearRedis() {
  const redis = new Redis(REDIS_URL);
  
  try {
    console.log(`Connecting to Redis at ${REDIS_URL}...`);
    await redis.flushall();
    console.log('Redis FLUSHALL executed successfully.');
  } catch (error) {
    console.error('Error clearing Redis:', error);
  } finally {
    redis.disconnect();
    console.log('Disconnected from Redis.');
  }
}

clearRedis();
