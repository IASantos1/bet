import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar variáveis de ambiente manualmente (sem dotenv)
const envPath = path.resolve(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = envContent.split('\n').reduce((acc, line) => {
  const [key, value] = line.split('=');
  if (key && value) {
    const cleanKey = key.trim();
    let cleanValue = value.trim();
    if (cleanValue.startsWith('"') && cleanValue.endsWith('"')) {
      cleanValue = cleanValue.slice(1, -1);
    }
    acc[cleanKey] = cleanValue;
  }
  return acc;
}, {} as Record<string, string>);

const API_KEY = envVars.ODDS_API_KEY || envVars.VITE_ODDS_API_KEY;
const BASE_URL = 'https://api.odds-api.io/v3';

async function testOddsApiIo() {
  console.log('🧪 Iniciando teste da Odds-API.io...');
  
  if (!API_KEY) {
    console.error('❌ ERRO: ODDS_API_KEY não encontrada no arquivo .env');
    process.exit(1);
  }

  // Mascarar a chave para exibição
  const maskedKey = API_KEY;
  console.log(`🔑 Usando API Key: ${maskedKey}`);

  try {
    // Testar endpoint de events (futebol)
    const url = `${BASE_URL}/events`;
    console.log(`📡 Requisitando: ${url}?sport=football&apiKey=...`);

    const response = await axios.get(url, {
      params: {
        apiKey: API_KEY,
        sport: 'football'
      },
      validateStatus: () => true // Não jogar erro em 4xx/5xx para podermos logar o status
    });

    console.log(`📊 Status Code: ${response.status} ${response.statusText}`);

    if (response.status === 200) {
      const data = response.data;
      const events = Array.isArray(data) ? data : (data.data || []);
      
      console.log('✅ SUCESSO! A API respondeu corretamente.');
      console.log(`📦 Eventos encontrados: ${events.length}`);
      
      if (events.length > 0) {
        const firstEvent = events[0];
        console.log('\n📝 RAW JSON do Primeiro Evento:');
        console.log(JSON.stringify(firstEvent, null, 2));

        console.log('\n📝 Exemplo de Evento:');
        console.log(`   ID: ${firstEvent.id}`);
        // Tenta pegar os nomes do objeto aninhado ou direto
        const homeName = firstEvent.home_team?.name || firstEvent.home_team || firstEvent.homeTeam || 'N/A';
        const awayName = firstEvent.away_team?.name || firstEvent.away_team || firstEvent.awayTeam || 'N/A';
        const leagueName = firstEvent.league?.name || firstEvent.league || 'N/A';
        const date = firstEvent.start_at || firstEvent.commence_time || 'N/A';
        
        console.log(`   Jogo: ${homeName} vs ${awayName}`);
        console.log(`   Liga: ${leagueName}`);
        console.log(`   Data: ${date}`);
        
        // Check for odds in nested structure
        const odds = firstEvent.odds || firstEvent.bookmakers || [];
        
        if (odds && odds.length > 0) {
           console.log(`   💰 Odds disponíveis: Sim (${odds.length} mercados/bookmakers)`);
           
           // Listar bookmakers se disponível
           const bookmakers = new Set();
           odds.forEach((o: any) => {
             if (o.bookmaker) bookmakers.add(o.bookmaker);
             if (o.title) bookmakers.add(o.title);
             if (o.key) bookmakers.add(o.key);
           });
           console.log('   📚 Bookmakers encontrados:', Array.from(bookmakers).join(', '));

           // Try to find match winner
           const matchWinner = odds.find((m: any) => 
             m.market_name === 'Match Winner' || m.market_name === '1x2' || m.key === 'h2h'
           );
           
           if (matchWinner) {
             const values = matchWinner.values || matchWinner.outcomes || matchWinner.odds;
             console.log('   🎲 Match Winner:', JSON.stringify(values));
           }
        } else {
           console.log('   ⚠️ Sem odds neste evento (pode ser normal dependendo do plano/evento)');
        }
      }
    } else {
      console.error('❌ FALHA NA REQUISIÇÃO');
      console.error('Resposta:', JSON.stringify(response.data, null, 2));
      
      if (response.status === 401) {
        console.error('🚫 Erro 401: Chave de API inválida ou não autorizada.');
      } else if (response.status === 429) {
        console.error('⏳ Erro 429: Limite de requisições excedido.');
      }
    }

  } catch (error: any) {
    console.error('❌ ERRO DE CONEXÃO:', error.message);
    if (error.response) {
      console.error('Detalhes:', error.response.data);
    }
  }
}

testOddsApiIo();
