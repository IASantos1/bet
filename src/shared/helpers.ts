import { ALL_COUNTRIES } from './countries';
import { ALLOWED_LEAGUES } from './leagues';

export const formatLeagueHeader = (rawInput: any) => {
  if (!rawInput) return { flag: '', country: '', league: '', flagUrl: '' };
  
  // Ensure string
    let raw = '';
    if (typeof rawInput === 'string') {
        raw = rawInput;
    } else if (rawInput?.league) {
        if (typeof rawInput.league === 'string') {
            raw = rawInput.league;
        } else if (typeof rawInput.league === 'object' && rawInput.league?.name) {
            raw = rawInput.league.name;
        } else {
            raw = '';
        }
    } else if (rawInput?.league_name) { // Add check for league_name
        raw = rawInput.league_name;
    } else if (rawInput?.name) {
        raw = rawInput.name;
    } else {
        // raw = String(rawInput); // CAUSES [object Object] if rawInput is the event object!
        raw = ''; 
    }

    raw = raw.replace(/^soccer\s*(?:-|:|\.)?\s*/i, '');
    raw = raw.replace(/^(tennis|basketball|baseball|volleyball|handball|rugby|mma|american\s*football|american-football|ice\s*hockey|ice-hockey|golf|formula1|cricket)\s*(?:-|:|\.)?\s*/i, '');
    
    // FIX: Clean up specific bad patterns like " - ó" (El Salvador issue)
    raw = raw.replace(/\s*[-·]\s*ó$/i, '');

    // Use provided country if available (Object mode from API)
  let explicitCountry = '';
  if (typeof rawInput === 'object' && rawInput.country) {
      explicitCountry = rawInput.country;
  }

  // 0. Whitelist/Normalization Check (Global Fix)
  // Check if raw matches a key in ALLOWED_LEAGUES
  if (ALLOWED_LEAGUES[raw]) {
      raw = ALLOWED_LEAGUES[raw];
  } else {
      // Check if raw matches a known clean name (value) in ALLOWED_LEAGUES
      // This is less likely but useful if data is partially clean
      // const isClean = Object.values(ALLOWED_LEAGUES).includes(raw);
      // if (isClean) raw = raw; // already clean
  }

  let flag = '';
  let country = '';
  let flagUrl = '';
  let leagueName = raw;

  // Mapa de slugs/termos para países
  // isCountryName: indica se o termo DEVE ser removido do início do nome da liga (ex: "germany", "alemanha")
  // Se for false, serve apenas para identificar a bandeira (ex: "bundesliga" identifica Alemanha, mas não deve ser removido se for o próprio nome da liga)
  const countryMap: Record<string, { flag: string; name: string; isCountryName?: boolean; flagUrl?: string }> = {};

  // FIX: Detect Welsh leagues and force Wales context
  // Prevents "Inglaterra" from being identified if the feed labels it incorrectly
  const lowerRaw = raw.toLowerCase();
  const welshLeagues = ['cymru', 'faw championship', 'welsh cup', 'welsh premier'];
  if (lowerRaw.includes('wales') || welshLeagues.some(l => lowerRaw.includes(l))) {
      raw = raw.replace(/inglaterra/gi, '')
               .replace(/england/gi, '')
               .replace(/united kingdom/gi, '')
               .trim();
  }

  // FIX: Remove "world-uefa" prefix to clean up Champions League etc.
    if (lowerRaw.includes('world-uefa')) {
        raw = raw.replace(/world-uefa[- ]*/gi, '');
    }

    // FIX: Explicitly handle Brasileirão to prevent regex corruption
    // This ensures "Brasileirão Série A" is always returned correctly regardless of aliases
    if (lowerRaw.includes('brasileirao') || lowerRaw.includes('brasileirão')) {
         let league = 'Brasileirão Série A';
         if (lowerRaw.includes('serie b') || lowerRaw.includes('série b')) league = 'Brasileirão Série B';
         if (lowerRaw.includes('serie c') || lowerRaw.includes('série c')) league = 'Brasileirão Série C';
         if (lowerRaw.includes('serie d') || lowerRaw.includes('série d')) league = 'Brasileirão Série D';
         if (lowerRaw.includes('paulista')) league = 'Campeonato Paulista';
         if (lowerRaw.includes('carioca')) league = 'Campeonato Carioca';
         
         return {
             flag: '🇧🇷',
             country: 'Brasil',
             league: league,
             flagUrl: 'https://flagcdn.com/br.svg'
         };
    }

    // Populate from ALL_COUNTRIES
  const normalizeKey = (s: string) => s.toLowerCase().trim();

  // Common English mappings (fallback)
  const englishAliases: Record<string, string> = {
      'england': 'Inglaterra',
      'germany': 'Alemanha',
      'spain': 'Espanha',
      'italy': 'Itália',
      'france': 'França',
      'portugal': 'Portugal',
      'netherlands': 'Países Baixos',
      'holland': 'Países Baixos',
      'dutch': 'Países Baixos',
      'belgium': 'Bélgica',
      'switzerland': 'Suíça',
      'swiss': 'Suíça',
      'brazil': 'Brasil',
      'argentina': 'Argentina',
      'usa': 'EUA',
      'united states': 'EUA',
      'japan': 'Japão',
      'china': 'China',
      'south korea': 'Coreia do Sul',
      'turkey': 'Turquia',
      'russia': 'Rússia',
      'ukraine': 'Ucrânia',
      'ethiopia': 'Etiópia',
      'morocco': 'Marrocos',
      'egypt': 'Egito',
      'south africa': 'África do Sul',
      'nigeria': 'Nigéria',
      'ghana': 'Gana',
      'cameroon': 'Camarões',
      'senegal': 'Senegal',
      'algeria': 'Argélia',
      'tunisia': 'Tunísia',
      'ivory coast': 'Costa do Marfim',
      'saudi arabia': 'Arábia Saudita',
      'iran': 'Irã',
      'uae': 'Emirados Árabes',
      'qatar': 'Catar',
      'australia': 'Austrália',
      'scotland': 'Escócia',
      'wales': 'País de Gales',
      'oman': 'Omã',
      'northern ireland': 'Irlanda do Norte',
      'jordan': 'Jordânia',
      'mauritania': 'Mauritânia',
      'mexico': 'México',
      'san marino': 'San Marino',
      'thailand': 'Tailândia',
      'indonesia': 'Indonésia',
      'azerbaijan': 'Azerbaijão',
      'romania': 'Roménia',
      'hungary': 'Hungria',
      'jamaica': 'Jamaica',
      'united-states': 'EUA',
    'bulgaria': 'Bulgária',
    'serbia': 'Sérvia',
    'croatia': 'Croácia',
    'sweden': 'Suécia',
    'norway': 'Noruega',
    'finland': 'Finlândia',
    'iceland': 'Islândia',
    'poland': 'Polônia',
    'uruguay': 'Uruguai',
    'colombia': 'Colômbia',
    'ecuador': 'Equador',
    'paraguay': 'Paraguai',
    'bolivia': 'Bolívia',
    'canada': 'Canadá',
    'new zealand': 'Nova Zelândia',
    'greece': 'Grécia',
    'cyprus': 'Chipre',
    'czech republic': 'República Checa',
    'czechia': 'República Checa',
    'bosnia': 'Bósnia e Herzegovina',
    'bosnia and herzegovina': 'Bósnia e Herzegovina',
    'montenegro': 'Montenegro',
    'macedonia': 'Macedônia do Norte',
    'north macedonia': 'Macedônia do Norte',
    'albania': 'Albânia',
    'estonia': 'Estônia',
    'latvia': 'Letônia',
    'lithuania': 'Lituânia',
    'belarus': 'Bielorrússia',
    'moldova': 'Moldávia',
    'georgia': 'Geórgia',
    'armenia': 'Armênia',
    'kazakhstan': 'Cazaquistão',
    'uzbekistan': 'Uzbequistão',
    'israel': 'Israel',
    'india': 'Índia',
    'singapore': 'Singapura',
    'malaysia': 'Malásia',
    'vietnam': 'Vietnã',
    'lebanon': 'Líbano',
    'kuwait': 'Kuwait',
    'bahrain': 'Bahrein',
    'panama': 'Panamá',
    'el salvador': 'El Salvador',
    'guatemala': 'Guatemala',
    'honduras': 'Honduras',
    'nicaragua': 'Nicarágua',
    'faroes': 'Ilhas Faroé',
    'faroe islands': 'Ilhas Faroé',
    'luxembourg': 'Luxemburgo',
    'andorra': 'Andorra',
    'malta': 'Malta',
    'gibraltar': 'Gibraltar',
    'kosovo': 'Kosovo'
  };

  ALL_COUNTRIES.forEach((c) => {
      const countryKey = normalizeKey(c.name);
      
      const entry = { flag: c.flag, name: c.name, isCountryName: true, flagUrl: c.flagUrl }; 
      
      countryMap[countryKey] = entry;

      for(const [eng, pt] of Object.entries(englishAliases)) {
          if (pt === c.name) {
              countryMap[eng] = entry;
          }
      }

      if (c.leagues) {
          c.leagues.forEach((l: string) => {
              const leagueKey = normalizeKey(l);
              countryMap[leagueKey] = { ...entry, isCountryName: false };
              
              if (l.includes('(')) {
                  const parts = l.split('(');
                  const mainName = normalizeKey(parts[0]);
                  const localName = normalizeKey(parts[1].replace(')', ''));
                  if (mainName) countryMap[mainName] = { ...entry, isCountryName: false };
                  if (localName) countryMap[localName] = { ...entry, isCountryName: false };
              }
          });
      }
  });

  // Manually ensure generic terms are mapped if missing
  // These are "global" or specific terms that might not be in the JSON as league names directly
  const extraMappings: Record<string, any> = {
      'premier-league': { flag: '🇬🇧', name: 'Inglaterra', isCountryName: false, flagUrl: 'https://flagcdn.com/gb-eng.svg' },
      'epl': { flag: '🇬🇧', name: 'Inglaterra', isCountryName: false, flagUrl: 'https://flagcdn.com/gb-eng.svg' },
      'championship': { flag: '🇬🇧', name: 'Inglaterra', isCountryName: false, flagUrl: 'https://flagcdn.com/gb-eng.svg' },
      'serie-a': { flag: '🇮🇹', name: 'Itália', isCountryName: false, flagUrl: 'https://flagcdn.com/it.svg' },
      'laliga': { flag: '🇪🇸', name: 'Espanha', isCountryName: false, flagUrl: 'https://flagcdn.com/es.svg' },
      'bundesliga': { flag: '🇩🇪', name: 'Alemanha', isCountryName: false, flagUrl: 'https://flagcdn.com/de.svg' },
      'ligue-1': { flag: '🇫🇷', name: 'França', isCountryName: false, flagUrl: 'https://flagcdn.com/fr.svg' },
      'superleague': { flag: '🇷🇺', name: 'Rússia', isCountryName: false, flagUrl: 'https://flagcdn.com/ru.svg' },
      'opap championship': { flag: '🇨🇾', name: 'Chipre', isCountryName: false, flagUrl: 'https://flagcdn.com/cy.svg' },
    'extraliga': { flag: '🇨🇿', name: 'República Checa', isCountryName: false, flagUrl: 'https://flagcdn.com/cz.svg' },
    'metal ligaen': { flag: '🇩🇰', name: 'Dinamarca', isCountryName: false, flagUrl: 'https://flagcdn.com/dk.svg' },
    'plusliga': { flag: '🇵🇱', name: 'Polônia', isCountryName: false, flagUrl: 'https://flagcdn.com/pl.svg' },
    'liga nationala': { flag: '🇷🇴', name: 'Romênia', isCountryName: false, flagUrl: 'https://flagcdn.com/ro.svg' },
    'a1': { flag: '🇬🇷', name: 'Grécia', isCountryName: false, flagUrl: 'https://flagcdn.com/gr.svg' },
    'ullh': { flag: '🇨🇿', name: 'República Checa', isCountryName: false, flagUrl: 'https://flagcdn.com/cz.svg' },
    'denmark': { flag: '🇩🇰', name: 'Dinamarca', isCountryName: true, flagUrl: 'https://flagcdn.com/dk.svg' },
    'kazakhstan': { flag: '🇰🇿', name: 'Cazaquistão', isCountryName: true, flagUrl: 'https://flagcdn.com/kz.svg' },
    'israel': { flag: '🇮🇱', name: 'Israel', isCountryName: true, flagUrl: 'https://flagcdn.com/il.svg' },
    'austria': { flag: '🇦🇹', name: 'Áustria', isCountryName: true, flagUrl: 'https://flagcdn.com/at.svg' },
    'russia': { flag: '🇷🇺', name: 'Rússia', isCountryName: true, flagUrl: 'https://flagcdn.com/ru.svg' },
    'poland': { flag: '🇵🇱', name: 'Polônia', isCountryName: true, flagUrl: 'https://flagcdn.com/pl.svg' },
    'cyprus': { flag: '🇨🇾', name: 'Chipre', isCountryName: true, flagUrl: 'https://flagcdn.com/cy.svg' },
    'czech republic': { flag: '🇨🇿', name: 'República Checa', isCountryName: true, flagUrl: 'https://flagcdn.com/cz.svg' },
    'czech-republic': { flag: '🇨🇿', name: 'República Checa', isCountryName: true, flagUrl: 'https://flagcdn.com/cz.svg' },
    'europe': { flag: '🇪🇺', name: 'Europa', isCountryName: true, flagUrl: 'https://flagcdn.com/eu.svg' },
    'world-uefa': { flag: '🇪🇺', name: 'UEFA', isCountryName: true, flagUrl: 'https://flagcdn.com/eu.svg' },
      'champions-league': { flag: '🇪🇺', name: 'UEFA', isCountryName: false, flagUrl: 'https://flagcdn.com/eu.svg' },
      'europa-league': { flag: '🇪🇺', name: 'UEFA', isCountryName: false, flagUrl: 'https://flagcdn.com/eu.svg' },
      'conference-league': { flag: '🇪🇺', name: 'UEFA', isCountryName: false, flagUrl: 'https://flagcdn.com/eu.svg' },
      'libertadores': { flag: '🌎', name: 'Libertadores', isCountryName: false, flagUrl: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f30e.svg' },
      'sudamericana': { flag: '🌎', name: 'Sul-Americana', isCountryName: false, flagUrl: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f30e.svg' },
      'brasileirao': { flag: '🇧🇷', name: 'Brasil', isCountryName: false, flagUrl: 'https://flagcdn.com/br.svg' },
      'serie-b': { flag: '🇧🇷', name: 'Brasil', isCountryName: false, flagUrl: 'https://flagcdn.com/br.svg' },
      'world-cup': { flag: '🌍', name: 'Mundo', isCountryName: false, flagUrl: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f30d.svg' },
      'big bash': { flag: '🇦🇺', name: 'Austrália', isCountryName: false, flagUrl: 'https://flagcdn.com/au.svg' },
      'big bash league': { flag: '🇦🇺', name: 'Austrália', isCountryName: false, flagUrl: 'https://flagcdn.com/au.svg' },
      'bbl': { flag: '🇦🇺', name: 'Austrália', isCountryName: false, flagUrl: 'https://flagcdn.com/au.svg' },
      'nba': { flag: '🇺🇸', name: 'EUA', isCountryName: false, flagUrl: 'https://flagcdn.com/us.svg' },
      'nhl': { flag: '🇺🇸', name: 'EUA', isCountryName: false, flagUrl: 'https://flagcdn.com/us.svg' },
      'nfl': { flag: '🇺🇸', name: 'EUA', isCountryName: false, flagUrl: 'https://flagcdn.com/us.svg' },
      'mlb': { flag: '🇺🇸', name: 'EUA', isCountryName: false, flagUrl: 'https://flagcdn.com/us.svg' },
      'ncaa': { flag: '🇺🇸', name: 'EUA', isCountryName: false, flagUrl: 'https://flagcdn.com/us.svg' },
      'ncaab': { flag: '🇺🇸', name: 'EUA', isCountryName: false, flagUrl: 'https://flagcdn.com/us.svg' },
      'ahl': { flag: '🇺🇸', name: 'EUA', isCountryName: false, flagUrl: 'https://flagcdn.com/us.svg' },
      'shl': { flag: '🇸🇪', name: 'Suécia', isCountryName: false, flagUrl: 'https://flagcdn.com/se.svg' },
      'mestis': { flag: '🇫🇮', name: 'Finlândia', isCountryName: false, flagUrl: 'https://flagcdn.com/fi.svg' },
      'liiga': { flag: '🇫🇮', name: 'Finlândia', isCountryName: false, flagUrl: 'https://flagcdn.com/fi.svg' },
      'nbl': { flag: '🇦🇺', name: 'Austrália', isCountryName: false, flagUrl: 'https://flagcdn.com/au.svg' },
      'international': { flag: '🌍', name: 'Internacional', isCountryName: true, flagUrl: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f30d.svg' },
      'friendly': { flag: '🌍', name: 'Amistoso', isCountryName: true, flagUrl: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f30d.svg' },
      'amistoso': { flag: '🌍', name: 'Amistoso', isCountryName: true, flagUrl: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f30d.svg' },
      'club friendlies': { flag: '🌍', name: 'Amistoso', isCountryName: true, flagUrl: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f30d.svg' },
      'international twenty20': { flag: '🌍', name: 'Internacional', isCountryName: true, flagUrl: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f30d.svg' }
  };
  
  Object.assign(countryMap, extraMappings);

  if (explicitCountry) {
        const norm = normalizeKey(explicitCountry);
        let entry: { flag: string; name: string; isCountryName?: boolean; flagUrl?: string } | undefined = countryMap[norm];
        if (!entry) {
            entry = Object.values(countryMap).find(v => normalizeKey(v.name) === norm);
        }
        if (entry) {
            flag = entry.flag;
            country = entry.name;
            flagUrl = entry.flagUrl || '';
        }
    }

  const parts = raw.split(/[-·–]/).map(p => p.trim());
  const foundCountry = parts.find(p => countryMap[normalizeKey(p)]);
  
  if (foundCountry) {
      const entry = countryMap[normalizeKey(foundCountry)];
      
      if (!flag) {
          flag = entry.flag;
          country = entry.name;
          flagUrl = entry.flagUrl || '';
      }

      if (entry.isCountryName) {
          // Remove country name from league string to avoid "England England Premier League"
          // Re-join remaining parts
          leagueName = parts.filter(p => normalizeKey(p) !== normalizeKey(foundCountry)).join(' - ');
      } else {
          // If the match was a league name (e.g. Bundesliga), keep it as the league name
          // but we still identified the country (Germany)
          leagueName = parts.join(' - ');
      }
  } else {
      for(const [key, val] of Object.entries(countryMap)) {
          // Allow matching hyphenated countries (e.g. "south-africa" matches "south africa")
          const keyParts = key.split(' ');
          const countryRegex = new RegExp('^' + keyParts.join('[- ]+') + '([- ]+|$)', 'i');

          if (normalizeKey(raw).startsWith(key) || countryRegex.test(raw)) {
              if (!flag) {
                  flag = val.flag;
                  country = val.name;
                  flagUrl = val.flagUrl || '';
              }
              if (val.isCountryName) {
                   // Remove country name from start
                   leagueName = raw.replace(countryRegex, '');
              }
              break;
          }
      }

      if (!flag) {
          const rawLower = normalizeKey(raw);
          const includesKeys = ['belgium', 'switzerland', 'swiss', 'epl', 'netherlands', 'dutch'];
          for (const k of includesKeys) {
              const entry = countryMap[k];
              if (entry && rawLower.includes(k)) {
                  flag = entry.flag;
                  country = entry.name;
                  flagUrl = entry.flagUrl || '';
                  break;
              }
          }
      }
  }

  // Clean up country name if it has "soccer" prefix
    if (country) {
        country = country.replace(/^soccer\s*(?:-|:|\.)?\s*/i, '');
    }

    // FALLBACK: Advanced Regex Matching (ported from EventCard logic)
    // ONLY apply this if sport is NOT known to be something else (like Hockey/Basketball)
    // or if it IS soccer.
    let sportContext = '';
    if (typeof rawInput === 'object' && (rawInput?.sport || rawInput?.sport_key)) {
        sportContext = String(rawInput.sport || rawInput.sport_key || '').toLowerCase();
    }
    
    // Check if we should skip soccer-specific inference
    const isNonSoccer = sportContext && 
        !sportContext.includes('soccer') && 
        !sportContext.includes('football') && 
        !sportContext.includes('futebol');

    if (!flag && !country && !isNonSoccer) {
        const n = normalizeKey(raw)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-');

      if (n.includes('international') || n.includes('friendly') || n.includes('amistoso')) {
          flag = '🌍';
          country = 'Internacional';
          flagUrl = 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f30d.svg';
      }

      const isFifa = /\bfifa\b|world[-\s]*cup/.test(n);
      const isUefa = /\buefa\b|champions[-\s]*league|europa[-\s]*league|conference[-\s]*league/.test(n);
      const isConmebol = /\bconmebol\b|copa[-\s]*libertadores|libertadores|sudamericana|recopa/.test(n);
      const isConcacaf = /\bconcacaf\b|champions[-\s]*cup|champions[-\s]*league|gold[-\s]*cup/.test(n);
      const isAfc = /\bafc\b|afc[-\s]*champions|asian[-\s]*cup/.test(n);
      const isCaf = /\bcaf\b|caf[-\s]*champions|africa[-\s]*cup/.test(n);

      let conf = '';
      let confFlag = '';
      let confUrl = '';

      if (isFifa) { conf = 'Mundo'; confFlag = '🌍'; confUrl = 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f30d.svg'; }
      else if (isUefa) { conf = 'UEFA'; confFlag = '🇪🇺'; confUrl = 'https://flagcdn.com/eu.svg'; }
      else if (isConmebol) { conf = 'América do Sul'; confFlag = '🌎'; confUrl = 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f30e.svg'; }
      else if (isConcacaf) { conf = 'CONCACAF'; confFlag = '🌎'; confUrl = 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f30e.svg'; }
      else if (isAfc) { conf = 'Ásia'; confFlag = '🌏'; confUrl = 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f30f.svg'; }
      else if (isCaf) { conf = 'África'; confFlag = '🌍'; confUrl = 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f30d.svg'; }

      const comp = (() => {
          if (/\bnba\b/.test(n)) return { name: 'EUA', flag: '🇺🇸', url: 'https://flagcdn.com/us.svg' };
          if (/euroleague/.test(n)) return { name: 'Europa', flag: '🇪🇺', url: 'https://flagcdn.com/eu.svg' };
          if (/\bncaa\b/.test(n)) return { name: 'EUA', flag: '🇺🇸', url: 'https://flagcdn.com/us.svg' };
          if (/\batp\b/.test(n)) return { name: 'ATP', flag: '🎾', url: '' };
          if (/\bwta\b/.test(n)) return { name: 'WTA', flag: '🎾', url: '' };
          if (/challenger/.test(n)) return { name: 'Challenger', flag: '🎾', url: '' };
          return null;
      })();

      const fallbackCountry = (() => {
          if (/liga[-\s]*portugal|primeira[-\s]*liga|taca[-\s]*da[-\s]*liga|allianz[-\s]*cup/.test(n)) return { name: 'Portugal', flag: '🇵🇹', url: 'https://flagcdn.com/pt.svg' };
          if (/la[-\s]*liga|laliga/.test(n)) return { name: 'Espanha', flag: '🇪🇸', url: 'https://flagcdn.com/es.svg' };
          if (/serie[-\s]*a(?![a-z])/.test(n) && !/br/.test(n)) return { name: 'Itália', flag: '🇮🇹', url: 'https://flagcdn.com/it.svg' };
          if (/bundesliga/.test(n)) return { name: 'Alemanha', flag: '🇩🇪', url: 'https://flagcdn.com/de.svg' };
          if (/ligue[-\s]*1/.test(n)) return { name: 'França', flag: '🇫🇷', url: 'https://flagcdn.com/fr.svg' };
          if (/premier[-\s]*league|championship/.test(n)) return { name: 'Inglaterra', flag: '🇬🇧', url: 'https://flagcdn.com/gb-eng.svg' };
          return null;
      })();

      if (fallbackCountry) {
          flag = fallbackCountry.flag;
          country = fallbackCountry.name;
          flagUrl = fallbackCountry.url;
      } else if (comp) {
          flag = comp.flag;
          country = comp.name;
          flagUrl = comp.url;
      } else if (conf) {
          flag = confFlag;
          country = conf;
          flagUrl = confUrl;
      }
  }

  // Final cleanup
  
  // Clean up duplicate country names (English or Portuguese) from the league name
  if (country) {
      const aliasesToRemove = Object.keys(englishAliases).filter(k => englishAliases[k] === country);
      aliasesToRemove.push(country); // Add Portuguese name
      
      if (country === 'Inglaterra') {
          aliasesToRemove.push('united kingdom');
      }

      aliasesToRemove.forEach(alias => {
          // Match alias with flexible separators (space or hyphen)
          // We anchor to the start to ensure we only remove prefixes
          // but if it's "Germany Germany 2 Bundesliga", we might need global?
          // The previous logic was just replace(regex, '').
          // Let's make it robust: match alias at start of string or following a separator
          const aliasRegexStr = `(^|[\\s\\-·–]+)${alias}([\\s\\-·–]+|$)`;
          const regex = new RegExp(aliasRegexStr, 'gi');
          leagueName = leagueName.replace(regex, ' ').trim();
      });
  }

  // Capitalize common acronyms
  const acronyms = ['NBA', 'NFL', 'NHL', 'MLB', 'UFC', 'AFL', 'NCAA'];
  acronyms.forEach(acr => {
      const regex = new RegExp(`\\b${acr}\\b`, 'gi');
      leagueName = leagueName.replace(regex, acr);
  });

  leagueName = leagueName
      .replace(new RegExp('(\\d{4})[-/](\\d{4})'), '') // remove years like 2023/2024
      .replace(/^[ -·–]+|[ -·–]+$/g, '') // remove leading/trailing separators
      .replace(/\s+/g, ' ')
      .trim();

  // If we ended up with the raw slug (no improvement), let's titleize it
  const finalName = leagueName || raw;
  const isSlug = /^[a-z0-9-]+$/.test(finalName);
  
  if (isSlug) {
      // "champions-league" -> "Champions League"
      // "premier-league" -> "Premier League"
      return { 
          flag, 
          country, 
          league: finalName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '), 
          flagUrl 
      };
  }

  return { flag, country, league: finalName, flagUrl };
};

export const abbreviateTeamName = (name: string) => {
    if (!name) return '';
    
    // 1. Specific Team Mappings (Most frequent/Longest)
    let clean = name
      // PT
      .replace(/Sporting CP/i, 'Sporting')
      .replace(/SL Benfica/i, 'Benfica')
      .replace(/FC Porto/i, 'Porto')
      .replace(/Vitoria Guimaraes/i, 'Vit. Guimarães')
      .replace(/Vitoria de Guimaraes/i, 'Vit. Guimarães')
      .replace(/Vitoria Setubal/i, 'Vit. Setúbal')
      .replace(/Pacos de Ferreira/i, 'P. Ferreira')
      .replace(/Belenenses SAD/i, 'Belenenses')
      .replace(/Boavista FC/i, 'Boavista')
      .replace(/Santa Clara/i, 'Santa Clara')
      .replace(/Gil Vicente/i, 'Gil Vicente')
      .replace(/Estoril Praia/i, 'Estoril')
      .replace(/Casa Pia AC/i, 'Casa Pia')
      
      // UK
      .replace(/Manchester United/i, 'Man Utd')
      .replace(/Manchester City/i, 'Man City')
      .replace(/Wolverhampton Wanderers/i, 'Wolves')
      .replace(/Wolverhampton/i, 'Wolves')
      .replace(/West Ham United/i, 'West Ham')
      .replace(/West Bromwich Albion/i, 'West Brom')
      .replace(/Tottenham Hotspur/i, 'Tottenham')
      .replace(/Nottingham Forest/i, 'Nottm Forest')
      .replace(/Brighton & Hove Albion/i, 'Brighton')
      .replace(/Sheffield United/i, 'Sheff Utd')
      .replace(/Sheffield Wednesday/i, 'Sheffield Wed')
      .replace(/Sheffield Wednesd\./i, 'Sheffield Wed')
      .replace(/Leeds United/i, 'Leeds')
      .replace(/Newcastle United/i, 'Newcastle')
      .replace(/Leicester City/i, 'Leicester')
      .replace(/Blackburn Rovers/i, 'Blackburn')
      .replace(/Queens Park Rangers/i, 'QPR')
      .replace(/Crystal Palace/i, 'C. Palace')

      // EU
      .replace(/Paris Saint-Germain/i, 'PSG')
      .replace(/Borussia Dortmund/i, 'Dortmund')
      .replace(/Borussia Moenchengladbach/i, 'Gladbach')
      .replace(/Bayer 04 Leverkusen/i, 'Leverkusen')
      .replace(/Bayer Leverkusen/i, 'Leverkusen')
      .replace(/Bayern Munchen/i, 'Bayern')
      .replace(/Bayern Munich/i, 'Bayern')
      .replace(/Internazionale/i, 'Inter')
      .replace(/Inter Milan/i, 'Inter')
      .replace(/AC Milan/i, 'Milan')
      .replace(/AS Roma/i, 'Roma')
      .replace(/Napoli/i, 'Napoli')
      .replace(/Juventus/i, 'Juve')
      .replace(/Real Madrid/i, 'Real Madrid')
      .replace(/Atletico Madrid/i, 'Atl. Madrid')
      .replace(/Real Sociedad/i, 'R. Sociedad')
      .replace(/Athletic Bilbao/i, 'Ath. Bilbao')
      .replace(/Rayo Vallecano/i, 'Rayo')
      .replace(/Celta de Vigo/i, 'Celta')
      .replace(/Real Betis/i, 'Betis')
      .replace(/Barcelona B[aà]squet/i, 'Barcelona')
      .replace(/Valencia Basket/i, 'Valencia')
      .replace(/Paris Basketball/i, 'Paris')
      .replace(/Pallacanestro Olimpia Milano/i, 'Olimpia Milano')
      .replace(/ASVEL Lyon Villeurbanne/i, 'ASVEL')
      .replace(/Virtus Segafredo Bologna/i, 'Virtus Bologna')
      .replace(/Dubai Basketball/i, 'Dubai')
      .replace(/KK Crvena zvezda/i, 'Crvena zvezda')
      .replace(/Saski Baskonia/i, 'Baskonia')
      .replace(/Maccabi Tel Aviv/i, 'Maccabi')

      // BR & LATAM
      .replace(/Vasco da Gama/i, 'Vasco')
      .replace(/Botafogo FR/i, 'Botafogo')
      .replace(/Flamengo/i, 'Flamengo')
      .replace(/Fluminense/i, 'Fluminense')
      .replace(/Sao Paulo/i, 'São Paulo')
      .replace(/Corinthians/i, 'Corinthians')
      .replace(/Palmeiras/i, 'Palmeiras')
      .replace(/Gremio/i, 'Grêmio')
      .replace(/Internacional/i, 'Inter')
      .replace(/Atletico Mineiro/i, 'Atl. Mineiro')
      .replace(/Atletico Paranaense/i, 'Athletico-PR')
      .replace(/Athletico Paranaense/i, 'Athletico-PR')
      .replace(/Red Bull Bragantino/i, 'Bragantino')
      .replace(/America Mineiro/i, 'América-MG')
      .replace(/Chapecoense/i, 'Chape')
      .replace(/Fortaleza EC/i, 'Fortaleza')
      .replace(/Ceara SC/i, 'Ceará')
      .replace(/Sport Recife/i, 'Sport')
      .replace(/Boca Juniors/i, 'Boca')
      .replace(/River Plate/i, 'River')

      // NBA
      .replace(/Atlanta Hawks/i, 'Hawks')
      .replace(/Boston Celtics/i, 'Celtics')
      .replace(/Brooklyn Nets/i, 'Nets')
      .replace(/Charlotte Hornets/i, 'Hornets')
      .replace(/Chicago Bulls/i, 'Bulls')
      .replace(/Cleveland Cavaliers/i, 'Cavaliers')
      .replace(/Dallas Mavericks/i, 'Mavericks')
      .replace(/Denver Nuggets/i, 'Nuggets')
      .replace(/Detroit Pistons/i, 'Pistons')
      .replace(/Golden State Warriors/i, 'Warriors')
      .replace(/Houston Rockets/i, 'Rockets')
      .replace(/Indiana Pacers/i, 'Pacers')
      .replace(/Los Angeles Clippers/i, 'Clippers')
      .replace(/Los Angeles Lakers/i, 'Lakers')
      .replace(/Memphis Grizzlies/i, 'Grizzlies')
      .replace(/Miami Heat/i, 'Heat')
      .replace(/Milwaukee Bucks/i, 'Bucks')
      .replace(/Minnesota Timberwolves/i, 'Timberwolves')
      .replace(/New Orleans Pelicans/i, 'Pelicans')
      .replace(/New York Knicks/i, 'Knicks')
      .replace(/Oklahoma City Thunder/i, 'Thunder')
      .replace(/Orlando Magic/i, 'Magic')
      .replace(/Philadelphia 76ers/i, '76ers')
      .replace(/Phoenix Suns/i, 'Suns')
      .replace(/Portland Trail Blazers/i, 'Blazers')
      .replace(/Sacramento Kings/i, 'Kings')
      .replace(/San Antonio Spurs/i, 'Spurs')
      .replace(/Toronto Raptors/i, 'Raptors')
      .replace(/Utah Jazz/i, 'Jazz')
      .replace(/Washington Wizards/i, 'Wizards')

      // NFL
      .replace(/Arizona Cardinals/i, 'Cardinals')
      .replace(/Atlanta Falcons/i, 'Falcons')
      .replace(/Baltimore Ravens/i, 'Ravens')
      .replace(/Buffalo Bills/i, 'Bills')
      .replace(/Carolina Panthers/i, 'Panthers')
      .replace(/Chicago Bears/i, 'Bears')
      .replace(/Cincinnati Bengals/i, 'Bengals')
      .replace(/Cleveland Browns/i, 'Browns')
      .replace(/Dallas Cowboys/i, 'Cowboys')
      .replace(/Denver Broncos/i, 'Broncos')
      .replace(/Detroit Lions/i, 'Lions')
      .replace(/Green Bay Packers/i, 'Packers')
      .replace(/Houston Texans/i, 'Texans')
      .replace(/Indianapolis Colts/i, 'Colts')
      .replace(/Jacksonville Jaguars/i, 'Jaguars')
      .replace(/Kansas City Chiefs/i, 'Chiefs')
      .replace(/Las Vegas Raiders/i, 'Raiders')
      .replace(/Los Angeles Chargers/i, 'Chargers')
      .replace(/Los Angeles Rams/i, 'Rams')
      .replace(/Miami Dolphins/i, 'Dolphins')
      .replace(/Minnesota Vikings/i, 'Vikings')
      .replace(/New England Patriots/i, 'Patriots')
      .replace(/New Orleans Saints/i, 'Saints')
      .replace(/New York Giants/i, 'Giants')
      .replace(/New York Jets/i, 'Jets')
      .replace(/Philadelphia Eagles/i, 'Eagles')
      .replace(/Pittsburgh Steelers/i, 'Steelers')
      .replace(/San Francisco 49ers/i, '49ers')
      .replace(/Seattle Seahawks/i, 'Seahawks')
      .replace(/Tampa Bay Buccaneers/i, 'Buccaneers')
      .replace(/Tennessee Titans/i, 'Titans')
      .replace(/Washington Commanders/i, 'Commanders')

      // MLB
      .replace(/Arizona Diamondbacks/i, 'D-backs')
      .replace(/Atlanta Braves/i, 'Braves')
      .replace(/Baltimore Orioles/i, 'Orioles')
      .replace(/Boston Red Sox/i, 'Red Sox')
      .replace(/Chicago White Sox/i, 'White Sox')
      .replace(/Chicago Cubs/i, 'Cubs')
      .replace(/Cincinnati Reds/i, 'Reds')
      .replace(/Cleveland Guardians/i, 'Guardians')
      .replace(/Colorado Rockies/i, 'Rockies')
      .replace(/Detroit Tigers/i, 'Tigers')
      .replace(/Houston Astros/i, 'Astros')
      .replace(/Kansas City Royals/i, 'Royals')
      .replace(/Los Angeles Angels/i, 'Angels')
      .replace(/Los Angeles Dodgers/i, 'Dodgers')
      .replace(/Miami Marlins/i, 'Marlins')
      .replace(/Milwaukee Brewers/i, 'Brewers')
      .replace(/Minnesota Twins/i, 'Twins')
      .replace(/New York Yankees/i, 'Yankees')
      .replace(/New York Mets/i, 'Mets')
      .replace(/Oakland Athletics/i, 'Athletics')
      .replace(/Philadelphia Phillies/i, 'Phillies')
      .replace(/Pittsburgh Pirates/i, 'Pirates')
      .replace(/San Diego Padres/i, 'Padres')
      .replace(/San Francisco Giants/i, 'Giants')
      .replace(/Seattle Mariners/i, 'Mariners')
      .replace(/St. Louis Cardinals/i, 'Cardinals')
      .replace(/Tampa Bay Rays/i, 'Rays')
      .replace(/Texas Rangers/i, 'Rangers')
      .replace(/Toronto Blue Jays/i, 'Blue Jays')
      .replace(/Washington Nationals/i, 'Nationals')

      // NHL
      .replace(/Anaheim Ducks/i, 'Ducks')
      .replace(/Arizona Coyotes/i, 'Coyotes')
      .replace(/Boston Bruins/i, 'Bruins')
      .replace(/Buffalo Sabres/i, 'Sabres')
      .replace(/Calgary Flames/i, 'Flames')
      .replace(/Carolina Hurricanes/i, 'Hurricanes')
      .replace(/Chicago Blackhawks/i, 'Blackhawks')
      .replace(/Colorado Avalanche/i, 'Avalanche')
      .replace(/Columbus Blue Jackets/i, 'Blue Jackets')
      .replace(/Dallas Stars/i, 'Stars')
      .replace(/Detroit Red Wings/i, 'Red Wings')
      .replace(/Edmonton Oilers/i, 'Oilers')
      .replace(/Florida Panthers/i, 'Panthers')
      .replace(/Los Angeles Kings/i, 'Kings')
      .replace(/Minnesota Wild/i, 'Wild')
      .replace(/Montreal Canadiens/i, 'Canadiens')
      .replace(/Nashville Predators/i, 'Predators')
      .replace(/New Jersey Devils/i, 'Devils')
      .replace(/New York Islanders/i, 'Islanders')
      .replace(/New York Rangers/i, 'Rangers')
      .replace(/Ottawa Senators/i, 'Senators')
      .replace(/Philadelphia Flyers/i, 'Flyers')
      .replace(/Pittsburgh Penguins/i, 'Penguins')
      .replace(/San Jose Sharks/i, 'Sharks')
      .replace(/Seattle Kraken/i, 'Kraken')
      .replace(/St. Louis Blues/i, 'Blues')
      .replace(/Tampa Bay Lightning/i, 'Lightning')
      .replace(/Toronto Maple Leafs/i, 'Maple Leafs')
      .replace(/Vancouver Canucks/i, 'Canucks')
      .replace(/Vegas Golden Knights/i, 'Golden Knights')
      .replace(/Washington Capitals/i, 'Capitals')
      .replace(/Winnipeg Jets/i, 'Jets')
      
      // NCAAB (College Basketball)
      .replace(/North Carolina Tar Heels/i, 'UNC')
      .replace(/North Carolina/i, 'UNC')
      .replace(/Duke Blue Devils/i, 'Duke')
      .replace(/Kentucky Wildcats/i, 'Kentucky')
      .replace(/Kansas Jayhawks/i, 'Kansas')
      .replace(/Michigan State Spartans/i, 'Michigan St')
      .replace(/Gonzaga Bulldogs/i, 'Gonzaga')
      .replace(/Villanova Wildcats/i, 'Villanova')
      .replace(/Virginia Cavaliers/i, 'Virginia')
      .replace(/Arizona Wildcats/i, 'Arizona')
      .replace(/UCLA Bruins/i, 'UCLA')
      .replace(/Connecticut Huskies/i, 'UConn')
      .replace(/UConn Huskies/i, 'UConn')
      .replace(/Purdue Boilermakers/i, 'Purdue')
      .replace(/Houston Cougars/i, 'Houston')
      .replace(/Alabama Crimson Tide/i, 'Alabama')
      .replace(/Tennessee Volunteers/i, 'Tennessee')
      .replace(/Marquette Golden Eagles/i, 'Marquette')
      .replace(/Texas Longhorns/i, 'Texas')
      .replace(/Baylor Bears/i, 'Baylor')
      .replace(/Creighton Bluejays/i, 'Creighton')
      .replace(/Florida Gators/i, 'Florida')
      .replace(/Illinois Fighting Illini/i, 'Illinois')
      .replace(/Auburn Tigers/i, 'Auburn')
      .replace(/San Diego State Aztecs/i, 'San Diego St')
      .replace(/Saint Mary's Gaels/i, 'St. Mary\'s')
      .replace(/Indiana Hoosiers/i, 'Indiana')
      .replace(/Maryland Terrapins/i, 'Maryland')
      .replace(/Arkansas Razorbacks/i, 'Arkansas')
      .replace(/West Virginia Mountaineers/i, 'West Virginia')
      .replace(/Iowa State Cyclones/i, 'Iowa St')
      .replace(/Xavier Musketeers/i, 'Xavier')
      .replace(/Providence Friars/i, 'Providence')
      .replace(/Wisconsin Badgers/i, 'Wisconsin')
      .replace(/Michigan Wolverines/i, 'Michigan')
      .replace(/Ohio State Buckeyes/i, 'Ohio St')
      .replace(/Florida State Seminoles/i, 'Florida St')
      .replace(/Louisville Cardinals/i, 'Louisville')
      .replace(/Syracuse Orange/i, 'Syracuse')
      .replace(/Notre Dame Fighting Irish/i, 'Notre Dame')
      .replace(/Georgetown Hoyas/i, 'Georgetown')
      .replace(/Butler Bulldogs/i, 'Butler')
      .replace(/Seton Hall Pirates/i, 'Seton Hall')
      .replace(/St. John's Red Storm/i, 'St. John\'s')
      .replace(/DePaul Blue Demons/i, 'DePaul')
      .replace(/Clemson Tigers/i, 'Clemson')
      .replace(/Pittsburgh Panthers/i, 'Pitt')
      .replace(/Wake Forest Demon Deacons/i, 'Wake Forest')
      .replace(/Miami Hurricanes/i, 'Miami (FL)')
      .replace(/Virginia Tech Hokies/i, 'Virginia Tech')
      .replace(/Georgia Tech Yellow Jackets/i, 'Georgia Tech')
      .replace(/NC State Wolfpack/i, 'NC State')
      .replace(/Boston College Eagles/i, 'Boston College')
      .replace(/Appalachian St Mountaineers/i, 'Appalachian St')
      .replace(/Old Dominion Monarchs/i, 'Old Dominion')
      .replace(/Canisius Golden Griffins/i, 'Canisius')
      .replace(/Mt\. St\. Mary's Mountaineers/i, 'Mt. St. Mary\'s')
      .replace(/Kent State Golden Flashes/i, 'Kent St')
      .replace(/Toledo Rockets/i, 'Toledo')
      .replace(/Minnesota Golden Gophers/i, 'Minnesota')
      .replace(/Oklahoma Sooners/i, 'Oklahoma')
      .replace(/Oklahoma State Cowboys/i, 'Oklahoma St')
      .replace(/Texas Tech Red Raiders/i, 'Texas Tech')
      .replace(/TCU Horned Frogs/i, 'TCU')
      .replace(/Kansas State Wildcats/i, 'Kansas St')
      .replace(/BYU Cougars/i, 'BYU')
      .replace(/Cincinnati Bearcats/i, 'Cincinnati')
      .replace(/UCF Knights/i, 'UCF')
      .replace(/LSU Tigers/i, 'LSU')
      .replace(/Ole Miss Rebels/i, 'Ole Miss')
      .replace(/Mississippi State Bulldogs/i, 'Mississippi St')
      .replace(/South Carolina Gamecocks/i, 'South Carolina')
      .replace(/Vanderbilt Commodores/i, 'Vanderbilt')
      .replace(/Missouri Tigers/i, 'Missouri')
      .replace(/Texas A&M Aggies/i, 'Texas A&M')
      .replace(/Oregon Ducks/i, 'Oregon')
      .replace(/USC Trojans/i, 'USC')
      .replace(/Washington Huskies/i, 'Washington')
      .replace(/Utah Utes/i, 'Utah')
      .replace(/Colorado Buffaloes/i, 'Colorado')
      .replace(/Bowling Green Falcons/i, 'Bowling Green')
      .replace(/Eastern Michigan Eagles/i, 'Eastern Michigan')
      .replace(/Miami \(OH\) RedHawks/i, 'Miami (OH)')
      .replace(/Buffalo Bulls/i, 'Buffalo')
      .replace(/Western Carolina Catamounts/i, 'Western Carolina')
      .replace(/Chattanooga Mocs/i, 'Chattanooga')
      
      // NBL / BBL (AUS/NZ)
      .replace(/Cairns Taipans/i, 'Taipans')
      .replace(/New Zealand Breakers/i, 'Breakers')
      .replace(/Melbourne Utd/i, 'Melbourne Utd')
      .replace(/Tasmania JackJumpers/i, 'JackJumpers')
      .replace(/Adelaide Strikers/i, 'Strikers')
      .replace(/Melbourne Renegades/i, 'Renegades');

    // 2. Generic Prefix/Suffix Removal
    const prefixes = ['FC', 'SC', 'AC', 'AS', 'RC', 'SV', 'VfB', 'VfL', 'EC', 'CD', 'CA', 'CS', 'CF', 'FK', 'JK', 'SK', 'OGC'];
    const suffixes = ['FC', 'SC', 'AC', 'AS', 'RC', 'SV', 'VfB', 'VfL', 'EC', 'CD', 'CA', 'CS', 'CF', 'FK', 'JK', 'SK'];
    
    // Remove from start (e.g. "FC Barcelona" -> "Barcelona")
    for (const p of prefixes) {
        if (clean.startsWith(p + ' ')) {
            clean = clean.substring(p.length + 1);
        }
    }
    
    // Remove from end (e.g. "Liverpool FC" -> "Liverpool")
    for (const s of suffixes) {
        if (clean.endsWith(' ' + s)) {
            clean = clean.substring(0, clean.length - s.length - 1);
        }
    }

    // 3. Common Word Replacements
    clean = clean
      .replace(/\s+United\s*/i, ' Utd') // "United" -> "Utd"
      .replace(/\s+City\s*/i, ' City') // Keep City usually
      .replace(/University/gi, 'Univ')
      .replace(/Association/gi, 'Assn')
      .replace(/Clube/gi, 'Cl')
      .replace(/Atletico/gi, 'Atl')
      .replace(/Athletic/gi, 'Ath')
      .replace(/Deportivo/gi, 'Dep')
      .replace(/Sporting/gi, 'Sp') // If not caught by specific map
      .replace(/Sociedade/gi, 'Soc')
      .replace(/Nacional/gi, 'Nac')
      .replace(/Internacional/gi, 'Inter')
      .replace(/Independiente/gi, 'Ind')
      .replace(/Universitario/gi, 'Univ')
      .replace(/Wanderers/gi, 'Wand')
      .replace(/Rovers/gi, 'Rov')
      .replace(/Juniors/gi, 'Jrs')
      .replace(/Reserves/gi, 'Res')
      .replace(/Youth/gi, 'U23')
      .replace(/Women/gi, 'W')
      .trim();
      
    // Generic truncation for very long names
    if (clean.length > 15) {
        clean = clean.substring(0, 15).trim() + '.';
    }
    
    return clean;
};

export const getSportFromLeague = (leagueName: string) => {
    const l = leagueName.toLowerCase();
    if (l.includes('concacaf')) return 'soccer'; // Force CONCACAF to Soccer
    if (l.includes('ncaa') || l.includes('ncaab') || l.includes('college')) return 'basketball';
    // FIX: Removed 'champions league' and 'super league' which are common in Soccer
    if (l.includes('nba') || l.includes('basket') || l.includes('euroleague') || l.includes('nbl') || l.includes('lnb') || l.includes('basketball champions league')) return 'basketball';
    if (l.includes('nfl') || l.includes('american football')) return 'american-football';
    if (l.includes('nhl') || l.includes('hockey') || l.includes('ice hockey') || l.includes('mestis') || l.includes('liiga') || l.includes('ahl') || l.includes('shl') || l.includes('khl') || l.includes('vhl') || l.includes('mhl') || l.includes('nmhl') || l.includes('extraliga') || l.includes('metal ligaen') || l.includes('ullh') || l === 'championship') return 'ice-hockey';
    if ((l.includes('kazakhstan') || l.includes('cazaquistão')) && l.includes('championship')) return 'ice-hockey';
    if (l.includes('cricket') || l.includes('big bash') || l.includes('bbl') || l.includes('twenty20') || l.includes('t20') || l.includes('odi') || l.includes('test match') || l.includes('ipl') || l.includes('icc')) return 'cricket';
    if (l.includes('tennis') || l.includes('atp') || l.includes('wta')) return 'tennis';
    if (l.includes('volleyball') || l.includes('volei') || l.includes('plusliga') || l.includes('superliga') || l.includes('superleague') || l.includes('opap') || (l.includes('bundesliga') && (l.includes('volley') || l.includes('volleyball'))) || l.includes('serie a2')) return 'volleyball';
    if (l.includes('handball') || l.includes('andebol') || l.includes('liga nationala') || l.includes('1. division')) return 'handball';
    if (l.includes('futsal')) return 'futsal';
    if (l.includes('mma') || l.includes('ufc')) return 'mma';
    if (l.includes('baseball') || l.includes('mlb')) return 'baseball';
    return 'soccer';
};

export const getSportIcon = (sport: string) => {
    const s = sport.toLowerCase();
    const map: Record<string, string> = {
        'soccer': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/26bd.svg',
        'basketball': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3c0.svg',
        'american-football': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3c8.svg',
        'american football': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3c8.svg',
        'ice-hockey': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3d2.svg',
        'ice hockey': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3d2.svg',
        'icehockey': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3d2.svg',
        'hockey': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3d2.svg',
        'tennis': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3be.svg',
        'volleyball': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3d0.svg',
        'handball': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f93e.svg',
        'futsal': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/26bd.svg',
        'mma': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f94a.svg',
        'baseball': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/26be.svg',
        'cricket': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3cf.svg',
        'rugby': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3c9.svg',
        'rugby_union': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3c9.svg',
        'rugby_league': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3c9.svg',
    };
    
    // Fuzzy match if direct lookup fails
    if (map[s]) return map[s];
    if (s.includes('rugby')) return map['rugby'];
    if (s.includes('hockey')) return map['ice-hockey'];
    if (s.includes('football') && s.includes('american')) return map['american-football'];
    
    return map['soccer'];
};

export const translateSelection = (selection: string) => {
    const s = String(selection || '').toLowerCase();
    if (s === 'home' || s === '1' || s === 'casa') return 'Casa';
    if (s === 'away' || s === '2' || s === 'fora') return 'Fora';
    if (s === 'draw' || s === 'x' || s === 'empate') return 'Empate';
    if (s.includes('over')) return s.replace('over', 'Mais de');
    if (s.includes('under')) return s.replace('under', 'Menos de');
    if (s.includes('goal')) return s.replace('goal', 'Golo').replace('goals', 'Golos');
    if (s.includes('both teams to score')) return 'Ambas Marcam';
    if (s.includes('yes')) return 'Sim';
    if (s.includes('no')) return 'Não';
    return selection;
};

export const labelOutcome = (market: string, name: string, homeTeam?: string, awayTeam?: string) => {
    const safeName = String(name || '');
    const m = String(market || '').toLowerCase();
    const n = safeName.toLowerCase();

    // Global translation for Home/Draw/Away (generic matches)
    if (n === 'home' || n === '1' || n === 'casa' || n === 'home team') return 'Casa';
    if (n === 'draw' || n === 'x' || n === 'empate' || n === 'tie') return 'Empate';
    if (n === 'away' || n === '2' || n === 'fora' || n === 'away team') return 'Fora';
    
    // Clean up team names for matching
    const hTeam = (homeTeam || '').toLowerCase();
    const aTeam = (awayTeam || '').toLowerCase();
    
    const isHome = (n === 'home' || n === '1' || (hTeam && n.includes(hTeam)));
    const isAway = (n === 'away' || n === '2' || (aTeam && n.includes(aTeam)));

    if (m.includes('h2h') || m === 'match_winner' || m === 'winner' || m.includes('1x2')) {
      if (isHome) return 'Casa';
      if (n.includes('draw') || n.includes('tie')) return 'Empate';
      if (isAway) return 'Fora';
    }
    
    if (m.includes('draw_no_bet') || m === 'dnb') {
      if (isHome) return 'Casa';
      if (isAway) return 'Fora';
    }
    
    // Ambas Marcam / BTTS
    if (m.includes('btts') || m.includes('ambas_marcam') || m.includes('both_teams_to_score') || m.includes('both teams to score')) {
      // Aggressive matching for "o/yes", "u/no", "yes", "no"
      if (n.includes('yes') || n.includes('sim') || n.includes('o/yes')) return 'Sim';
      if (n.includes('no') || n.includes('nao') || n.includes('não') || n.includes('u/no')) return 'Não';
    }
    
    if (m.includes('double_chance') || m.includes('double')) {
      if (n.includes('home_or_draw') || n.includes('1x') || (isHome && n.includes('draw'))) return '1X';
      if (n.includes('away_or_draw') || n.includes('x2') || (isAway && n.includes('draw'))) return 'X2';
      if (n.includes('home_or_away') || n.includes('12') || (isHome && isAway)) return '12';
    }
    
    if (m.includes('total')) {
      // Clean up specific messy patterns like "Over 2.5" -> "Acima de 2,5"
      let label = safeName.replace(/_/g, ' ')
                          .replace(/over/gi, 'Acima de')
                          .replace(/under/gi, 'Abaixo de')
                          .replace(/^o\//gi, 'Acima de ')
                          .replace(/^u\//gi, 'Abaixo de ');
      // Fix decimal point
      label = label.replace(/(\d+)\.(\d+)/g, '$1,$2');
      return label;
    }
    
    if (m.includes('cleansheet') || m.includes('win_to_nil') || m.includes('wintonil')) {
      if (isHome) return 'Casa';
      if (isAway) return 'Fora';
      if (n.includes('yes')) return 'Sim';
      if (n.includes('no')) return 'Não';
    }
    
    if (m.includes('firstteamtoscore') || m.includes('first_team_to_score') || m.includes('team_to_score_first') || m.includes('primeiro_a_marcar')) {
      if (isHome) return 'Casa';
      if (isAway) return 'Fora';
      if (n.includes('no goal') || n.includes('none') || n.includes('nenhum')) return 'Nenhum';
    }
    
    if (m.includes('penalty')) {
      if (n.includes('yes')) return 'Sim';
      if (n.includes('no')) return 'Não';
    }
    
    if (m.includes('handicap') || m.includes('spread')) {
        let label = safeName.replace(/_/g, ' ');
        if (hTeam) label = label.replace(new RegExp(homeTeam!, 'gi'), 'Casa'); // Case insensitive replacement
        if (aTeam) label = label.replace(new RegExp(awayTeam!, 'gi'), 'Fora');
        return label.replace(/home/gi, 'Casa').replace(/away/gi, 'Fora');
    }
    
    if (m.includes('correct_score') || m.includes('correct score') || m.includes('placar_exato')) {
       // Just ensure formatting is nice if needed, usually it's just "1:0"
       return safeName.replace(/\s+/g, '');
    }

    // Fallback cleanup
    return safeName.replace(/_/g, ' ');
};
