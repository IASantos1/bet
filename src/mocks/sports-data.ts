import { generateRealisticOdds } from '../services/realisticOddsGenerator';
import type { League } from '../types/sports';

// Função para gerar jogos ao vivo (máximo 60) - Vários desportos
const generateLiveMatches = () => {
  const allLeagues = [
    // Futebol
    { name: 'Premier League', country: 'Inglaterra', sport: 'Futebol', teams: [
      ['Manchester United', 'Liverpool'], ['Arsenal', 'Chelsea'], ['Manchester City', 'Tottenham'],
      ['Newcastle', 'Aston Villa'], ['Brighton', 'West Ham']
    ]},
    { name: 'La Liga', country: 'Espanha', sport: 'Futebol', teams: [
      ['Real Madrid', 'Barcelona'], ['Atletico Madrid', 'Sevilla'], ['Real Sociedad', 'Athletic Bilbao']
    ]},
    { name: 'Serie A', country: 'Itália', sport: 'Futebol', teams: [
      ['Juventus', 'AC Milan'], ['Inter Milan', 'Napoli'], ['Roma', 'Lazio']
    ]},
    { name: 'Bundesliga', country: 'Alemanha', sport: 'Futebol', teams: [
      ['Bayern Munich', 'Borussia Dortmund'], ['RB Leipzig', 'Bayer Leverkusen']
    ]},
    { name: 'Ligue 1', country: 'França', sport: 'Futebol', teams: [
      ['PSG', 'Marseille'], ['Lyon', 'Monaco']
    ]},
    { name: 'Liga Portugal', country: 'Portugal', sport: 'Futebol', teams: [
      ['Benfica', 'Porto'], ['Sporting CP', 'Braga']
    ]},
    { name: 'Champions League', country: 'Europa', sport: 'Futebol', teams: [
      ['PSG', 'Manchester City'], ['Real Madrid', 'Bayern Munich']
    ]},
    { name: 'Saudi Pro League', country: 'Arábia Saudita', sport: 'Futebol', teams: [
      ['Al-Nassr', 'Al-Hilal'], ['Al-Ittihad', 'Al-Ahli']
    ]},
    { name: 'Brasileirão', country: 'Brasil', sport: 'Futebol', teams: [
      ['Flamengo', 'Palmeiras'], ['São Paulo', 'Corinthians'], ['Fluminense', 'Botafogo']
    ]},
    
    // AFL
    { name: 'AFL Premiership', country: 'Austrália', sport: 'AFL', teams: [
      ['Collingwood', 'Carlton'], ['Richmond', 'Essendon'], ['Geelong', 'Hawthorn']
    ]},
    
    // Basebol
    { name: 'MLB', country: 'EUA', sport: 'Basebol', teams: [
      ['New York Yankees', 'Boston Red Sox'], ['Los Angeles Dodgers', 'San Francisco Giants'],
      ['Chicago Cubs', 'St. Louis Cardinals']
    ]},
    { name: 'NPB', country: 'Japão', sport: 'Basebol', teams: [
      ['Yomiuri Giants', 'Hanshin Tigers'], ['SoftBank Hawks', 'Rakuten Eagles']
    ]},
    
    // Basquetebol
    { name: 'NBA', country: 'EUA', sport: 'Basquetebol', teams: [
      ['Lakers', 'Warriors'], ['Celtics', 'Heat'], ['Bucks', 'Nets'],
      ['76ers', 'Knicks'], ['Suns', 'Nuggets']
    ]},
    { name: 'EuroLeague', country: 'Europa', sport: 'Basquetebol', teams: [
      ['Real Madrid Basket', 'Barcelona Basket'], ['Olympiacos', 'Panathinaikos']
    ]},
    
    // Fórmula 1
    { name: 'F1 Championship', country: 'Mundial', sport: 'Fórmula 1', teams: [
      ['Max Verstappen', 'Lewis Hamilton'], ['Charles Leclerc', 'Carlos Sainz'],
      ['Lando Norris', 'Oscar Piastri']
    ]},
    
    // Handebol
    { name: 'EHF Champions League', country: 'Europa', sport: 'Handebol', teams: [
      ['Barcelona Andebol', 'Kiel'], ['PSG Andebol', 'Veszprém'], ['Magdeburg', 'Aalborg']
    ]},
    
    // Hóquei
    { name: 'NHL', country: 'EUA/Canadá', sport: 'Hóquei', teams: [
      ['Toronto Maple Leafs', 'Montreal Canadiens'], ['Boston Bruins', 'New York Rangers'],
      ['Edmonton Oilers', 'Calgary Flames']
    ]},
    
    // MMA
    { name: 'UFC', country: 'Mundial', sport: 'MMA', teams: [
      ['Jon Jones', 'Stipe Miocic'], ['Islam Makhachev', 'Charles Oliveira'],
      ['Alex Pereira', 'Jamahal Hill']
    ]},
    
    // NFL
    { name: 'NFL', country: 'EUA', sport: 'NFL', teams: [
      ['Kansas City Chiefs', 'San Francisco 49s'], ['Philadelphia Eagles', 'Dallas Cowboys'],
      ['Buffalo Bills', 'Miami Dolphins']
    ]},
    
    // Rúgbi
    { name: 'Six Nations', country: 'Europa', sport: 'Rúgbi', teams: [
      ['Inglaterra', 'França'], ['Irlanda', 'Escócia'], ['País de Gales', 'Itália']
    ]},
    { name: 'Super Rugby', country: 'Hemisfério Sul', sport: 'Rúgbi', teams: [
      ['Crusaders', 'Blues'], ['Hurricanes', 'Chiefs']
    ]},
    
    // Voleibol
    { name: 'Liga das Nações', country: 'Mundial', sport: 'Voleibol', teams: [
      ['Brasil', 'Polónia'], ['Itália', 'EUA'], ['França', 'Japão']
    ]},
    { name: 'Superliga Brasil', country: 'Brasil', sport: 'Voleibol', teams: [
      ['Sada Cruzeiro', 'Taubaté'], ['Minas', 'Sesi']
    ]},
  ];

  const matches: any[] = [];
  let id = 1;

  allLeagues.forEach(league => {
    league.teams.forEach(([home, away]) => {
      if (id <= 60) {
        const _hasDraw = ['Futebol', 'Hóquei', 'Handebol'].includes(league.sport);
        let homeScore, awayScore, time, elapsed;

        switch(league.sport) {
          case 'Basquetebol': {
            homeScore = Math.floor(Math.random() * 40) + 60;
            awayScore = Math.floor(Math.random() * 40) + 60;
            const quarter = Math.floor(Math.random() * 4) + 1;
            time = `Q${quarter} ${Math.floor(Math.random() * 12)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`;
            elapsed = quarter * 12 + Math.floor(Math.random() * 12);
            break;
          }
          case 'Basebol': {
            homeScore = Math.floor(Math.random() * 8);
            awayScore = Math.floor(Math.random() * 8);
            const inning = Math.floor(Math.random() * 9) + 1;
            time = `${inning}º Inning`;
            elapsed = inning * 10;
            break;
          }
          case 'Hóquei': {
            homeScore = Math.floor(Math.random() * 5);
            awayScore = Math.floor(Math.random() * 5);
            const period = Math.floor(Math.random() * 3) + 1;
            time = `P${period} ${Math.floor(Math.random() * 20)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`;
            elapsed = period * 20 + Math.floor(Math.random() * 20);
            break;
          }
          case 'NFL':
          case 'AFL': {
            homeScore = Math.floor(Math.random() * 35) + 7;
            awayScore = Math.floor(Math.random() * 35) + 7;
            const qtr = Math.floor(Math.random() * 4) + 1;
            time = `Q${qtr} ${Math.floor(Math.random() * 15)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`;
            elapsed = qtr * 15 + Math.floor(Math.random() * 15);
            break;
          }
          case 'MMA': {
            homeScore = 0;
            awayScore = 0;
            const round = Math.floor(Math.random() * 5) + 1;
            time = `Round ${round}`;
            elapsed = round * 5;
            break;
          }
          case 'Fórmula 1': {
            homeScore = Math.floor(Math.random() * 20) + 1;
            awayScore = Math.floor(Math.random() * 20) + 1;
            const lap = Math.floor(Math.random() * 50) + 10;
            time = `Volta ${lap}`;
            elapsed = lap;
            break;
          }
          case 'Voleibol': {
            homeScore = Math.floor(Math.random() * 3);
            awayScore = Math.floor(Math.random() * 3);
            const set = Math.floor(Math.random() * 5) + 1;
            time = `Set ${set}`;
            elapsed = set * 20;
            break;
          }
          case 'Handebol': {
            homeScore = Math.floor(Math.random() * 20) + 10;
            awayScore = Math.floor(Math.random() * 20) + 10;
            const half = Math.floor(Math.random() * 2) + 1;
            const minute = Math.floor(Math.random() * 30);
            time = `${half}º Tempo ${minute}'`;
            elapsed = (half - 1) * 30 + minute;
            break;
          }
          case 'Rúgbi': {
            homeScore = Math.floor(Math.random() * 30);
            awayScore = Math.floor(Math.random() * 30);
            const rugbyHalf = Math.floor(Math.random() * 2) + 1;
            const rugbyMin = Math.floor(Math.random() * 40);
            time = `${rugbyHalf}º Tempo ${rugbyMin}'`;
            elapsed = (rugbyHalf - 1) * 40 + rugbyMin;
            break;
          }
          default: { // Futebol
            homeScore = Math.floor(Math.random() * 4);
            awayScore = Math.floor(Math.random() * 4);
            const minute = Math.floor(Math.random() * 90) + 1;
            time = `${minute}'`;
            elapsed = minute;
          }
        }

        // 🎯 GERAR ODDS REALISTAS baseadas no contexto do jogo
        const realisticOdds = generateRealisticOdds({
          homeTeam: home,
          awayTeam: away,
          league: league.name,
          sport: league.sport,
          isLive: true,
          homeScore,
          awayScore,
          elapsed
        });

        matches.push({
          id: id++,
          sport: league.sport,
          league: league.name,
          homeTeam: home,
          awayTeam: away,
          homeScore,
          awayScore,
          time,
          status: 'AO VIVO',
          odds: realisticOdds
        });
      }
    });
  });

  return matches;
};

// Função para gerar jogos futuros (150 jogos) - Vários desportos
const generateUpcomingMatches = () => {
  const allSportsData = [
    // Futebol - Ligas Grandes e Médias
    { sport: 'Futebol', league: 'Premier League', teams: ['Manchester United', 'Liverpool', 'Arsenal', 'Chelsea', 'Manchester City', 'Tottenham', 'Newcastle', 'Aston Villa', 'Brighton', 'West Ham'] },
    { sport: 'Futebol', league: 'La Liga', teams: ['Real Madrid', 'Barcelona', 'Atletico Madrid', 'Sevilla', 'Real Sociedad', 'Athletic Bilbao', 'Villarreal', 'Valencia', 'Real Betis', 'Girona'] },
    { sport: 'Futebol', league: 'Serie A', teams: ['Juventus', 'AC Milan', 'Inter Milan', 'Napoli', 'Roma', 'Lazio', 'Atalanta', 'Fiorentina', 'Bologna', 'Torino'] },
    { sport: 'Futebol', league: 'Bundesliga', teams: ['Bayern Munich', 'Borussia Dortmund', 'RB Leipzig', 'Bayer Leverkusen', 'Eintracht Frankfurt', 'Wolfsburg', 'Freiburg', 'Stuttgart'] },
    { sport: 'Futebol', league: 'Liga Portugal', teams: ['Benfica', 'Porto', 'Sporting CP', 'Braga', 'Vitória SC', 'Boavista', 'Gil Vicente', 'Famalicão'] },
    { sport: 'Futebol', league: 'Ligue 1', teams: ['PSG', 'Marseille', 'Lyon', 'Monaco', 'Lille', 'Nice', 'Lens', 'Rennes'] },
    { sport: 'Futebol', league: 'Champions League', teams: ['PSG', 'Manchester City', 'Real Madrid', 'Bayern Munich', 'Barcelona', 'Inter Milan', 'Napoli', 'Benfica'] },
    { sport: 'Futebol', league: 'Brasileirão', teams: ['Flamengo', 'Palmeiras', 'São Paulo', 'Corinthians', 'Fluminense', 'Botafogo', 'Grêmio', 'Internacional'] },
    { sport: 'Futebol', league: 'Saudi Pro League', teams: ['Al-Nassr', 'Al-Hilal', 'Al-Ittihad', 'Al-Ahli', 'Al-Shabab', 'Al-Ettifaq'] },
    { sport: 'Futebol', league: 'Eredivisie', teams: ['Ajax', 'PSV', 'Feyenoord', 'AZ Alkmaar', 'Twente', 'Utrecht'] },
    { sport: 'Futebol', league: 'MLS', teams: ['Inter Miami', 'LA Galaxy', 'LAFC', 'Seattle Sounders', 'Atlanta United', 'New York Red Bulls'] },
    
    // AFL
    { sport: 'AFL', league: 'AFL Premiership', teams: ['Collingwood', 'Carlton', 'Richmond', 'Essendon', 'Geelong', 'Hawthorn', 'Melbourne', 'Brisbane Lions'] },
    
    // Basebol
    { sport: 'Basebol', league: 'MLB', teams: ['New York Yankees', 'Boston Red Sox', 'Los Angeles Dodgers', 'San Francisco Giants', 'Chicago Cubs', 'St. Louis Cardinals', 'Houston Astros', 'Atlanta Braves'] },
    { sport: 'Basebol', league: 'NPB', teams: ['Yomiuri Giants', 'Hanshin Tigers', 'SoftBank Hawks', 'Rakuten Eagles', 'Nippon-Ham Fighters', 'Orix Buffaloes'] },
    
    // Basquetebol
    { sport: 'Basquetebol', league: 'NBA', teams: ['Lakers', 'Warriors', 'Celtics', 'Heat', 'Bucks', 'Nets', '76ers', 'Knicks', 'Suns', 'Nuggets', 'Clippers', 'Mavericks'] },
    { sport: 'Basquetebol', league: 'EuroLeague', teams: ['Real Madrid Basket', 'Barcelona Basket', 'Olympiacos', 'Panathinaikos', 'Fenerbahce', 'Anadolu Efes'] },
    
    // Fórmula 1
    { sport: 'Fórmula 1', league: 'F1 Championship', teams: ['Max Verstappen', 'Lewis Hamilton', 'Charles Leclerc', 'Carlos Sainz', 'Lando Norris', 'Oscar Piastri', 'George Russell', 'Fernando Alonso'] },
    
    // Handebol
    { sport: 'Handebol', league: 'EHF Champions League', teams: ['Barcelona Andebol', 'Kiel', 'PSG Andebol', 'Veszprém', 'Magdeburg', 'Aalborg', 'Flensburg', 'Porto Andebol'] },
    
    // Hóquei
    { sport: 'Hóquei', league: 'NHL', teams: ['Toronto Maple Leafs', 'Montreal Canadiens', 'Boston Bruins', 'New York Rangers', 'Edmonton Oilers', 'Calgary Flames', 'Tampa Bay Lightning', 'Florida Panthers'] },
    
    // MMA
    { sport: 'MMA', league: 'UFC', teams: ['Jon Jones', 'Stipe Miocic', 'Islam Makhachev', 'Charles Oliveira', 'Alex Pereira', 'Jamahal Hill', 'Sean O\'Malley', 'Merab Dvalishvili'] },
    
    // NFL
    { sport: 'NFL', league: 'NFL', teams: ['Kansas City Chiefs', 'San Francisco 49s', 'Philadelphia Eagles', 'Dallas Cowboys', 'Buffalo Bills', 'Miami Dolphins', 'Detroit Lions', 'Baltimore Ravens'] },
    
    // Rúgbi
    { sport: 'Rúgbi', league: 'Six Nations', teams: ['Inglaterra', 'França', 'Irlanda', 'Escócia', 'País de Gales', 'Itália'] },
    { sport: 'Rúgbi', league: 'Super Rugby', teams: ['Crusaders', 'Blues', 'Hurricanes', 'Chiefs', 'Brumbies', 'Waratahs'] },
    
    // Voleibol
    { sport: 'Voleibol', league: 'Liga das Nações', teams: ['Brasil', 'Polónia', 'Itália', 'EUA', 'França', 'Japão', 'Argentina', 'Eslovénia'] },
    { sport: 'Voleibol', league: 'Superliga Brasil', teams: ['Sada Cruzeiro', 'Taubaté', 'Minas', 'Sesi', 'Praia Clube', 'Campinas'] },
  ];

  const matches: any[] = [];
  let id = 1;
  const baseDate = new Date();

  allSportsData.forEach(sportData => {
    const { sport, league, teams } = sportData;
    const _hasDraw = ['Futebol', 'Hóquei', 'Handebol', 'Rúgbi'].includes(sport);
    
    for (let i = 0; i < teams.length - 1 && id <= 150; i += 2) {
      const home = teams[i];
      const away = teams[i + 1];
      
      const matchDate = new Date(baseDate);
      matchDate.setDate(matchDate.getDate() + Math.floor(Math.random() * 14));
      const hours = Math.floor(Math.random() * 12) + 12;
      const minutes = Math.random() > 0.5 ? '00' : '30';
      matchDate.setHours(hours, parseInt(minutes));

      // 🎯 GERAR ODDS REALISTAS baseadas no contexto do jogo
      const realisticOdds = generateRealisticOdds({
        homeTeam: home,
        awayTeam: away,
        league,
        sport,
        isLive: false
      });

      matches.push({
        id: id++,
        sport,
        league,
        homeTeam: home,
        awayTeam: away,
        date: matchDate.toISOString().split('T')[0],
        time: `${hours}:${minutes}`,
        odds: realisticOdds
      });
    }
  });

  // Garantir que temos 150 jogos
  while (matches.length < 150) {
    const randomSport = allSportsData[Math.floor(Math.random() * allSportsData.length)];
    const { sport, league, teams } = randomSport;
    const _hasDraw = ['Futebol', 'Hóquei', 'Handebol', 'Rúgbi'].includes(sport);
    
    if (teams.length >= 2) {
      const homeIdx = Math.floor(Math.random() * teams.length);
      let awayIdx = Math.floor(Math.random() * teams.length);
      while (awayIdx === homeIdx) {
        awayIdx = Math.floor(Math.random() * teams.length);
      }
      
      const matchDate = new Date(baseDate);
      matchDate.setDate(matchDate.getDate() + Math.floor(Math.random() * 14));
      const hours = Math.floor(Math.random() * 12) + 12;
      const minutes = Math.random() > 0.5 ? '00' : '30';
      matchDate.setHours(hours, parseInt(minutes));

      // 🎯 GERAR ODDS REALISTAS
      const realisticOdds = generateRealisticOdds({
        homeTeam: teams[homeIdx],
        awayTeam: teams[awayIdx],
        league,
        sport,
        isLive: false
      });

      matches.push({
        id: matches.length + 1,
        sport,
        league,
        homeTeam: teams[homeIdx],
        awayTeam: teams[awayIdx],
        date: matchDate.toISOString().split('T')[0],
        time: `${hours}:${minutes}`,
        odds: realisticOdds
      });
    }
  }

  return matches.slice(0, 150);
};

export const liveMatches = generateLiveMatches();
export const upcomingMatches = generateUpcomingMatches();

export const featuredMatches = [
  {
    id: 1001,
    title: 'Clássico Ibérico',
    homeTeam: 'Real Madrid',
    awayTeam: 'Barcelona',
    league: 'La Liga',
    date: '2025-01-20',
    time: '21:00',
    image: 'https://readdy.ai/api/search-image?query=epic%20football%20stadium%20night%20match%20atmosphere%20with%20dramatic%20lighting%20and%20crowd%20silhouettes%20professional%20sports%20photography%20dark%20cinematic%20tones%20green%20pitch&width=600&height=300&seq=featured1&orientation=landscape',
    odds: generateRealisticOdds({
      homeTeam: 'Real Madrid',
      awayTeam: 'Barcelona',
      league: 'La Liga',
      sport: 'Futebol',
      isLive: false
    })
  },
  {
    id: 1002,
    title: 'Derby de Manchester',
    homeTeam: 'Manchester United',
    awayTeam: 'Manchester City',
    league: 'Premier League',
    date: '2025-01-22',
    time: '20:00',
    image: 'https://readdy.ai/api/search-image?query=intense%20football%20derby%20match%20atmosphere%20old%20trafford%20stadium%20night%20game%20dramatic%20red%20lighting%20professional%20sports%20photography%20cinematic&width=600&height=300&seq=featured2&orientation=landscape',
    odds: generateRealisticOdds({
      homeTeam: 'Manchester United',
      awayTeam: 'Manchester City',
      league: 'Premier League',
      sport: 'Futebol',
      isLive: false
    })
  },
  {
    id: 1003,
    title: 'Clássico Português',
    homeTeam: 'Benfica',
    awayTeam: 'Porto',
    league: 'Liga Portugal',
    date: '2025-01-25',
    time: '20:30',
    image: 'https://readdy.ai/api/search-image?query=portuguese%20football%20classic%20match%20estadio%20da%20luz%20stadium%20night%20atmosphere%20red%20and%20blue%20colors%20dramatic%20lighting%20professional%20sports%20photography&width=600&height=300&seq=featured3&orientation=landscape',
    odds: generateRealisticOdds({
      homeTeam: 'Benfica',
      awayTeam: 'Porto',
      league: 'Liga Portugal',
      sport: 'Futebol',
      isLive: false
    })
  },
];

export const promotions = [
  {
    id: 1,
    title: 'Bónus de Boas-Vindas',
    description: '100% até €200 no primeiro depósito',
    terms: 'Depósito mínimo €10. Rollover 5x.',
    validUntil: '2025-12-31',
    image: 'https://readdy.ai/api/search-image?query=modern%20vibrant%20sports%20betting%20welcome%20bonus%20promotional%20banner%20with%20golden%20coins%20and%20trophy%20on%20clean%20gradient%20background%20professional%20digital%20illustration%20high%20quality%20marketing%20design&width=800&height=400&seq=promo1&orientation=landscape'
  },
  {
    id: 2,
    title: 'Cashback Semanal',
    description: '10% de cashback em apostas perdidas',
    terms: 'Válido para apostas múltiplas com odds mínimas de 2.0.',
    validUntil: '2025-12-31',
    image: 'https://readdy.ai/api/search-image?query=sleek%20cashback%20promotion%20banner%20with%20percentage%20symbols%20and%20money%20return%20concept%20on%20smooth%20gradient%20background%20modern%20financial%20illustration%20professional%20marketing%20design&width=800&height=400&seq=promo2&orientation=landscape'
  },
  {
    id: 3,
    title: 'Aposta Grátis',
    description: '€10 em apostas grátis toda semana',
    terms: 'Faça 5 apostas de €20 ou mais durante a semana.',
    validUntil: '2025-12-31',
    image: 'https://readdy.ai/api/search-image?query=exciting%20free%20bet%20promotional%20banner%20with%20gift%20box%20and%20betting%20tickets%20on%20vibrant%20gradient%20background%20modern%20sports%20betting%20illustration%20professional%20design&width=800&height=400&seq=promo3&orientation=landscape'
  },
  {
    id: 4,
    title: 'Bónus de Recarga',
    description: '50% até €100 em depósitos adicionais',
    terms: 'Válido para o segundo e terceiro depósito.',
    validUntil: '2025-12-31',
    image: 'https://readdy.ai/api/search-image?query=premium%20reload%20bonus%20banner%20with%20stacked%20coins%20and%20reload%20symbol%20on%20elegant%20gradient%20background%20modern%20financial%20illustration%20professional%20marketing%20design&width=800&height=400&seq=promo4&orientation=landscape'
  }
];

export const userTransactions = [
  {
    id: 1,
    type: 'Depósito',
    amount: 100.00,
    method: 'Cartão de Crédito',
    status: 'Concluído',
    date: '2025-01-10 14:30'
  },
  {
    id: 2,
    type: 'Levantamento',
    amount: 250.00,
    method: 'Transferência Bancária',
    status: 'Processando',
    date: '2025-01-12 09:15'
  },
  {
    id: 3,
    type: 'Depósito',
    amount: 50.00,
    method: 'MBWay',
    status: 'Concluído',
    date: '2025-01-13 18:45'
  }
];

export const userBets = [
  {
    id: 1,
    matches: [
      { homeTeam: 'Manchester United', awayTeam: 'Liverpool', selection: 'Manchester United', odd: 2.15 }
    ],
    stake: 50.00,
    potentialWin: 107.50,
    status: 'Em Aberto',
    date: '2025-01-14 15:30',
    type: 'Simples'
  },
  {
    id: 2,
    matches: [
      { homeTeam: 'Real Madrid', awayTeam: 'Barcelona', selection: 'Empate', odd: 3.60 },
      { homeTeam: 'Bayern Munich', awayTeam: 'Borussia Dortmund', selection: 'Bayern Munich', odd: 1.45 }
    ],
    stake: 30.00,
    potentialWin: 156.60,
    status: 'Em Aberto',
    date: '2025-01-14 16:00',
    type: 'Múltipla'
  },
  {
    id: 3,
    matches: [
      { homeTeam: 'Arsenal', awayTeam: 'Chelsea', selection: 'Arsenal', odd: 2.10 }
    ],
    stake: 100.00,
    potentialWin: 210.00,
    status: 'Ganhou',
    date: '2025-01-13 20:00',
    type: 'Simples'
  },
  {
    id: 4,
    matches: [
      { homeTeam: 'Juventus', awayTeam: 'AC Milan', selection: 'AC Milan', odd: 3.10 }
    ],
    stake: 25.00,
    potentialWin: 77.50,
    status: 'Perdeu',
    date: '2025-01-12 19:30',
    type: 'Simples'
  }
];

export const mockLeagues: League[] = [
  // Futebol
  { name: 'Premier League', country: 'Inglaterra', sport: 'Futebol', teams: ['Manchester City', 'Arsenal', 'Liverpool', 'Chelsea', 'Manchester United', 'Tottenham', 'Newcastle', 'Brighton'] },
  { name: 'La Liga', country: 'Espanha', sport: 'Futebol', teams: ['Real Madrid', 'Barcelona', 'Atlético Madrid', 'Real Sociedad', 'Athletic Bilbao', 'Real Betis', 'Villarreal', 'Valencia'] },
  { name: 'Serie A', country: 'Itália', sport: 'Futebol', teams: ['Inter Milan', 'AC Milan', 'Juventus', 'Napoli', 'Roma', 'Lazio', 'Atalanta', 'Fiorentina'] },
  { name: 'Bundesliga', country: 'Alemanha', sport: 'Futebol', teams: ['Bayern Munich', 'Borussia Dortmund', 'RB Leipzig', 'Bayer Leverkusen', 'Union Berlin', 'Freiburg', 'Eintracht Frankfurt', 'Wolfsburg'] },
  { name: 'Ligue 1', country: 'França', sport: 'Futebol', teams: ['PSG', 'Monaco', 'Marseille', 'Lyon', 'Lille', 'Nice', 'Lens', 'Rennes'] },
  { name: 'Liga Portugal', country: 'Portugal', sport: 'Futebol', teams: ['Benfica', 'Porto', 'Sporting CP', 'Braga', 'Vitória Guimarães', 'Boavista', 'Rio Ave', 'Famalicão'] },
  { name: 'Champions League', country: 'Europa', sport: 'Futebol', teams: ['Manchester City', 'Real Madrid', 'Bayern Munich', 'PSG', 'Inter Milan', 'Barcelona', 'Arsenal', 'Atlético Madrid'] },
  { name: 'Europa League', country: 'Europa', sport: 'Futebol', teams: ['Liverpool', 'Roma', 'Bayer Leverkusen', 'Atalanta', 'Brighton', 'West Ham', 'Marseille', 'Villarreal'] },
  
  // Basquetebol
  { name: 'NBA', country: 'EUA', sport: 'Basquetebol', teams: ['Los Angeles Lakers', 'Boston Celtics', 'Golden State Warriors', 'Milwaukee Bucks', 'Phoenix Suns', 'Denver Nuggets', 'Miami Heat', 'Philadelphia 76ers'] },
  { name: 'Euroleague', country: 'Europa', sport: 'Basquetebol', teams: ['Real Madrid', 'Barcelona', 'Olympiacos', 'Fenerbahçe', 'Panathinaikos', 'CSKA Moscow', 'Maccabi Tel Aviv', 'Zalgiris'] },
  
  // Hóquei
  { name: 'NHL', country: 'EUA/Canadá', sport: 'Hóquei', teams: ['Toronto Maple Leafs', 'Boston Bruins', 'Tampa Bay Lightning', 'Colorado Avalanche', 'Vegas Golden Knights', 'Edmonton Oilers', 'Carolina Hurricanes', 'New York Rangers'] },
  
  // AFL
  { name: 'AFL', country: 'Austrália', sport: 'AFL', teams: ['Collingwood', 'Brisbane Lions', 'Carlton', 'Melbourne', 'Sydney Swans', 'Geelong Cats', 'Port Adelaide', 'Richmond'] },
  
  // Basebol
  { name: 'MLB', country: 'EUA', sport: 'Basebol', teams: ['New York Yankees', 'Los Angeles Dodgers', 'Boston Red Sox', 'Houston Astros', 'Atlanta Braves', 'San Francisco Giants', 'Chicago Cubs', 'St. Louis Cardinals'] },
  
  // Voleibol
  { name: 'Superliga', country: 'Brasil', sport: 'Voleibol', teams: ['Sada Cruzeiro', 'Itambé Minas', 'Sesi-SP', 'Vôlei Renata', 'Funvic Natal', 'Vedacit Vôlei', 'Goiás Vôlei', 'Apan Blumenau'] },
  
  // MMA
  { name: 'UFC', country: 'Internacional', sport: 'MMA', teams: ['Jon Jones', 'Islam Makhachev', 'Alexander Volkanovski', 'Leon Edwards', 'Israel Adesanya', 'Charles Oliveira', 'Kamaru Usman', 'Francis Ngannou'] },
  
  // Andebol
  { name: 'Liga Europeia', country: 'Europa', sport: 'Andebol', teams: ['Barcelona', 'PSG', 'Kiel', 'Veszprém', 'Kielce', 'Aalborg', 'Magdeburg', 'Montpellier'] },
  
  // Rugby
  { name: 'Six Nations', country: 'Europa', sport: 'Rugby', teams: ['Inglaterra', 'França', 'Irlanda', 'Escócia', 'País de Gales', 'Itália'] },
  
  // Fórmula 1
  { name: 'F1', country: 'Internacional', sport: 'F1', teams: ['Red Bull Racing', 'Mercedes', 'Ferrari', 'McLaren', 'Aston Martin', 'Alpine', 'Williams', 'Alfa Romeo'] },
];

 

export const mockTopCompetitions = [
  // Futebol
  { sport: 'Futebol', league: 'Premier League', teams: ['Manchester City', 'Arsenal', 'Liverpool', 'Chelsea', 'Manchester United', 'Tottenham', 'Newcastle', 'Brighton'] },
  { sport: 'Futebol', league: 'La Liga', teams: ['Real Madrid', 'Barcelona', 'Atlético Madrid', 'Real Sociedad', 'Athletic Bilbao', 'Real Betis', 'Villarreal', 'Valencia'] },
  { sport: 'Futebol', league: 'Serie A', teams: ['Inter Milan', 'AC Milan', 'Juventus', 'Napoli', 'Roma', 'Lazio', 'Atalanta', 'Fiorentina'] },
  { sport: 'Futebol', league: 'Bundesliga', teams: ['Bayern Munich', 'Borussia Dortmund', 'RB Leipzig', 'Bayer Leverkusen', 'Union Berlin', 'Freiburg', 'Eintracht Frankfurt', 'Wolfsburg'] },
  { sport: 'Futebol', league: 'Ligue 1', teams: ['PSG', 'Monaco', 'Marseille', 'Lyon', 'Lille', 'Nice', 'Lens', 'Rennes'] },
  { sport: 'Futebol', league: 'Liga Portugal', teams: ['Benfica', 'Porto', 'Sporting CP', 'Braga', 'Vitória Guimarães', 'Boavista', 'Rio Ave', 'Famalicão'] },
  { sport: 'Futebol', league: 'Champions League', teams: ['Manchester City', 'Real Madrid', 'Bayern Munich', 'PSG', 'Inter Milan', 'Barcelona', 'Arsenal', 'Atlético Madrid'] },
  
  // Basquetebol
  { sport: 'Basquetebol', league: 'NBA', teams: ['Los Angeles Lakers', 'Boston Celtics', 'Golden State Warriors', 'Milwaukee Bucks', 'Phoenix Suns', 'Denver Nuggets', 'Miami Heat', 'Philadelphia 76ers'] },
  { sport: 'Basquetebol', league: 'Euroleague', teams: ['Real Madrid', 'Barcelona', 'Olympiacos', 'Fenerbahçe', 'Panathinaikos', 'CSKA Moscow', 'Maccabi Tel Aviv', 'Zalgiris'] },
  
  // Hóquei
  { sport: 'Hóquei', league: 'NHL', teams: ['Toronto Maple Leafs', 'Boston Bruins', 'Tampa Bay Lightning', 'Colorado Avalanche', 'Vegas Golden Knights', 'Edmonton Oilers', 'Carolina Hurricanes', 'New York Rangers'] },
  
  // Basebol
  { sport: 'Basebol', league: 'MLB', teams: ['New York Yankees', 'Los Angeles Dodgers', 'Boston Red Sox', 'Houston Astros', 'Atlanta Braves', 'San Francisco Giants', 'Chicago Cubs', 'St. Louis Cardinals'] },
];
