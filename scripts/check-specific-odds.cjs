const https = require('https');

const API_KEY = 'cbef02a7c902f0dfb7260b0b638fffa0';
const HOST = 'v3.football.api-sports.io';

const TARGET_MATCHES = [
  { home: 'Sporting CP', away: 'FC Porto' },
  { home: 'CS Constantine', away: 'JSM Bejaia' },
  { home: 'CR Belouizdad', away: 'MC Alger' },
  { home: 'Sarmiento Junin', away: 'Estudiantes de Rio Cuarto' },
  { home: 'Independiente Petrolero', away: 'Guabirá' },
  { home: 'Atletico Torque', away: 'Defensor Sporting' },
  { home: 'Huracan', away: 'Belgrano Cordoba' },
  { home: 'Central Cordoba', away: 'Canuelas' },
  { home: 'Náutico RR', away: 'Progresso' },
  { home: 'Bagatelle', away: 'Pride of Gall Hill' },
  { home: 'CRB', away: 'Porto BA' },
  { home: 'Argentino de Merlo', away: 'Flandria' },
  { home: 'San Martín Burzaco', away: 'Ituzaingó' },
  { home: 'Talleres Remedios', away: 'Deportivo Armenio' },
  { home: 'Atletico Tucuman', away: 'Racing Club' },
  { home: 'Cobresal', away: 'A. Italiano' },
  { home: 'Puerto Cabello', away: 'Monagas SC' },
  { home: 'Figueirense', away: 'Azuriz' },
  { home: 'Barcelona SC', away: 'Botafogo' },
  { home: 'Cañoneros Marina', away: 'Héroes de Zaci' },
  { home: 'Pachuca', away: 'Necaxa' },
  { home: 'Santos Laguna', away: 'Cruz Azul' },
  { home: 'Ellerton', away: 'Paradise' },
  { home: 'LD Alajuelense', away: 'CS Cartagines' },
  { home: 'Comunicaciones', away: 'Malacateco' },
  { home: 'Alianza Atletico', away: 'Deportivo Garcilaso' },
  { home: 'Atletico San Luis', away: 'Mazatlán' },
  { home: 'U.N.A.M. - Pumas', away: 'Toluca' },
  { home: 'Macarthur', away: 'Central Coast Mariners' },
  { home: 'South Melbourne', away: 'Solomon Kings' },
  { home: 'Thitsar Arman', away: 'I.S.P.E' },
  { home: 'Hantharwady United', away: 'Yangon United' },
  { home: 'Sagamihara', away: 'Thespakusatsu Gunma' },
  { home: 'FC Seoul', away: 'Vissel Kobe' },
  { home: 'Gamba Osaka', away: 'Ratchaburi' }
];

function fetchJson(path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: HOST,
            path: path,
            method: 'GET',
            headers: {
                'x-apisports-key': API_KEY
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed);
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.end();
    });
}

function normalize(str) {
    return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

async function run() {
    console.log("Iniciando verificação...");

    // 1. Fetch Fixtures (Next 50 should cover immediate interest, maybe 99)
    // Using live=all and next=99 to cover both
    console.log("Buscando jogos (Live + Next 50)...");
    
    // We'll fetch 'next=50' fixtures.
    const fixturesPath = '/fixtures?next=99'; 
    const fixturesData = await fetchJson(fixturesPath);

    if (fixturesData.errors && Object.keys(fixturesData.errors).length > 0) {
        console.error("Erro na API de Fixtures:", fixturesData.errors);
        return;
    }

    const fixtures = fixturesData.response || [];
    console.log(`Encontrados ${fixtures.length} jogos futuros.`);

    for (const target of TARGET_MATCHES) {
        const targetHome = normalize(target.home);
        const targetAway = normalize(target.away);

        const match = fixtures.find(f => {
            const h = normalize(f.teams.home.name);
            const a = normalize(f.teams.away.name);
            // Loose matching
            return (h.includes(targetHome) || targetHome.includes(h)) && 
                   (a.includes(targetAway) || targetAway.includes(a));
        });

        if (!match) {
            console.log(`[?] ${target.home} x ${target.away}: Não encontrado na lista de próximos 99 jogos.`);
            continue;
        }

        // Check odds for this fixture
        // The endpoint is /odds?fixture=ID
        try {
            const oddsData = await fetchJson(`/odds?fixture=${match.fixture.id}`);
            if (oddsData.response && oddsData.response.length > 0) {
                const bookmakers = oddsData.response[0].bookmakers;
                const hasOdds = bookmakers && bookmakers.length > 0;
                if (hasOdds) {
                    const bookie = bookmakers[0];
                    console.log(`[OK] ${target.home} x ${target.away} (ID: ${match.fixture.id}): Tem odds! (${bookie.bets.length} mercados via ${bookie.name})`);
                } else {
                    console.log(`[X] ${target.home} x ${target.away} (ID: ${match.fixture.id}): Sem odds disponíveis.`);
                }
            } else {
                console.log(`[X] ${target.home} x ${target.away} (ID: ${match.fixture.id}): Resposta de odds vazia.`);
            }
        } catch (err) {
            console.error(`Erro ao buscar odds para ${target.home} x ${target.away}:`, err.message);
        }
    }
}

run();
