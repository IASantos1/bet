import https from 'https';

const API_KEY = 'cbef02a7c902f0dfb7260b0b638fffa0';
const BASE_URL = 'https://v3.football.api-sports.io';

console.log("Iniciando verificação de ODDS PRÉ-JOGO...");

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: { 'x-apisports-key': API_KEY }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
    });
}

async function checkPrematchOdds() {
  try {
    console.log('--- 1. Buscando Próximos 10 Jogos (Fixtures) ---');
    const fixturesResponse = await fetchJson(`${BASE_URL}/fixtures?status=NS&next=10`);
    
    if (fixturesResponse.errors && Object.keys(fixturesResponse.errors).length > 0) {
        console.error("ERRO API:", JSON.stringify(fixturesResponse.errors));
        return;
    }

    const fixtures = fixturesResponse.response || [];
    console.log(`> Encontrados: ${fixtures.length} jogos futuros.`);

    if (fixtures.length === 0) return;

    console.log('\n--- 2. Verificando Odds Individuais ---');
    
    for (const item of fixtures) {
        const fixture = item.fixture;
        const teams = item.teams;
        
        const fixtureId = fixture.id;
        const matchName = `${teams.home.name} vs ${teams.away.name}`;
        
        process.stdout.write(`Checking ${fixtureId} (${matchName})... `);
        
        try {
            const oddsResponse = await fetchJson(`${BASE_URL}/odds?fixture=${fixtureId}`);
            
            if (oddsResponse.response && oddsResponse.response.length > 0) {
                const oddsData = oddsResponse.response[0];
                const bookmakers = oddsData.bookmakers ? oddsData.bookmakers.length : 0;
                console.log(`✅ OK (${bookmakers} bookmakers)`);
            } else {
                console.log(`❌ SEM ODDS`);
            }
        } catch (err) {
            console.log(`❌ ERRO: ${err.message}`);
        }
        
        // Small delay
        await new Promise(r => setTimeout(r, 200));
    }

  } catch (error) {
    console.error('Erro fatal:', error.message);
  }
}

checkPrematchOdds();
