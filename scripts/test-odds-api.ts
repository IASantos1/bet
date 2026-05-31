import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Carregar .env manualmente
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');

let apiKey = process.env.ODDS_API_KEY || process.env.VITE_ODDS_API_KEY;

if (!apiKey && fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(/ODDS_API_KEY=["']?([^"'\n]+)["']?/);
    if (match) apiKey = match[1];
}

const BASE_URL = 'https://api.odds-api.io/v3';

console.log('--- DIAGNÓSTICO ODDS-API.IO ---');
console.log(`API Key carregada: ${apiKey ? apiKey.substring(0, 5) + '...' + apiKey.substring(apiKey.length - 4) : 'NENHUMA'}`);
console.log(`Base URL: ${BASE_URL}`);

async function runTests() {
  // 1. Testar /sports (Público segundo docs?)
  console.log('\n1. Testando /sports (verificar URL base)...');
  try {
    const res = await axios.get(`${BASE_URL}/sports`);
    console.log('✅ /sports SUCESSO! Status:', res.status);
    console.log('   Esportes encontrados:', Array.isArray(res.data) ? res.data.length : 'N/A');
    if (Array.isArray(res.data) && res.data.length > 0) console.log('   Exemplo:', JSON.stringify(res.data[0]));
  } catch (err: any) {
    console.error('❌ /sports FALHOU:', err.message);
    if (err.response) console.error('   Response:', JSON.stringify(err.response.data));
  }

  // 2. Testar /events (Autenticado)
  console.log('\n2. Testando /events (verificar API Key)...');
  if (!apiKey) {
    console.log('⚠️ Pular teste de events (sem chave).');
    return;
  }

  try {
    const res = await axios.get(`${BASE_URL}/events`, {
      params: {
        apiKey: apiKey,
        sport: 'football',
        limit: 5
      }
    });
    console.log('✅ /events SUCESSO! Status:', res.status);
    console.log('   Eventos encontrados:', Array.isArray(res.data) ? res.data.length : 'N/A');
    
    if (Array.isArray(res.data) && res.data.length > 0) {
        console.log('   Exemplo Evento:', JSON.stringify(res.data[0]));
        const eventId = res.data[0].id;
        
        // 3. Testar /odds para um evento específico
        console.log(`\n3. Testando /odds para evento ID ${eventId}...`);
        try {
            const resOdds = await axios.get(`${BASE_URL}/odds`, {
                params: {
                    apiKey: apiKey,
                    eventId: eventId,
                    bookmakers: 'Bet365,Pinnacle'
                }
            });
            console.log('✅ /odds SUCESSO! Status:', resOdds.status);
            console.log('   Dados:', JSON.stringify(resOdds.data).substring(0, 200) + '...');
        } catch (errOdds: any) {
             console.error('❌ /odds FALHOU:', errOdds.message);
             if (errOdds.response) console.error('   Response:', JSON.stringify(errOdds.response.data));
        }
    }
  } catch (err: any) {
    console.error('❌ /events FALHOU:', err.message);
    if (err.response) console.error('   Response:', JSON.stringify(err.response.data));
  }
}

runTests();
