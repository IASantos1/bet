
import mongoose from 'mongoose';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/bet62';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const WORKER_URL = 'http://127.0.0.1:8787/api/dev/clear-all-events';

async function clearAll() {
    console.log('🚀 Starting Full Data Cleanup...');

    // 1. Clear MongoDB
    try {
        console.log(`\n📦 Clearing MongoDB (${MONGO_URI})...`);
        await mongoose.connect(MONGO_URI);
        if (mongoose.connection.db) {
            const collections = await mongoose.connection.db.collections();
            for (const col of collections) {
                // Skip system collections
                if (col.collectionName.startsWith('system.')) continue;
                
                const count = await col.countDocuments();
                if (count > 0) {
                    await col.deleteMany({});
                    console.log(`   - Cleared ${col.collectionName}: ${count} docs`);
                }
            }
        }
        await mongoose.disconnect();
        console.log('✅ MongoDB cleared.');
    } catch (e) {
        console.error('❌ MongoDB Error:', e);
    }

    // 2. Clear Redis
    try {
        console.log(`\n🔴 Clearing Redis (${REDIS_URL})...`);
        const redis = new Redis(REDIS_URL);
        await redis.flushall();
        await redis.quit();
        console.log('✅ Redis cleared.');
    } catch (e) {
        console.error('❌ Redis Error:', e);
    }

    // 3. Clear D1 (via Worker)
    try {
        console.log(`\n🌩️ Clearing D1 (via Worker API)...`);
        // We need to handle the case where fetch might not be available in older Node envs, 
        // but 'tsx' uses Node 18+ usually so it should be fine.
        const res = await fetch(WORKER_URL, { 
            method: 'POST',
            headers: {
                'Authorization': 'Bearer dev-admin-token' // Assuming auth is needed or bypassed in dev
            }
        });
        
        if (res.ok) {
            const json = await res.json();
            console.log('✅ D1 cleared:', json);
        } else {
            console.error('❌ D1 Error:', res.status, res.statusText, await res.text());
        }
    } catch (e) {
        console.error('❌ D1 Connection Error (Worker might be down):', e);
        console.log('   -> Ensure "npm run worker" is running in a separate terminal.');
    }

    console.log('\n✨ Full Cleanup Finished!');
}

clearAll();
