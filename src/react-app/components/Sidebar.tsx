import { useEffect, useState } from 'react';
import { useApp } from '@/react-app/contexts/AppContext';
import { apiFetch } from '@/react-app/utils/api';
import { formatLeagueHeader, getSportFromLeague, getSportIcon } from '@/shared/helpers';
import { ALL_COUNTRIES } from '@/shared/countries';
import type { Event } from '@/shared/types';
import { Download, Smartphone } from 'lucide-react';

interface SidebarSection { 
  title: string; 
  items: string[]; 
} 

const topCompetitions: SidebarSection = {
  title: 'Top Competições',
  items: [
    'Top - Futebol Europeu',
    'Liga de Portugal',
    'Espanha - La Liga',
    'França - Ligue 1',
    'Itália - Serie A',
    'Brasil - Série A',
    'Ténis',
    'Seleções Amigáveis',
    'Copa do Mundo',
  ],
};

const sports: SidebarSection = { 
  title: 'Desportos', 
  items: [ 
    'Futebol', 
    'Basquetebol', 
    'Ténis',
    'Críquete',
    'Futebol Americano', 
    'Handebol', 
    'MMA', 
    'Fórmula 1', 
    'Hóquei', 
    'Rúgbi', 
    'Voleibol', 
    'Beisebol',
    'Golfe',
    'Corridas de Cavalos',
    'AFL', 
  ], 
}; 

export function Sidebar({ dynamicTopItems }: { dynamicTopItems?: (string | Event)[] }) {
  const { darkMode, selectedCategory, setSelectedCategory, isOperator, showAdminPanel, setShowAdminPanel } = useApp();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['Top Competições', 'Desportos'])
  );
  const [expandedSports, setExpandedSports] = useState<Set<string>>(new Set());
  const [expandedCountry, setExpandedCountry] = useState<Set<string>>(new Set());
  const [apiSports, setApiSports] = useState<string[]>([]);
  
  useEffect(() => {
    let timeoutId: any;

    const loadSports = async () => {
      try {
        const j = await apiFetch<string[]>('/api/sports', { cache: 'no-store' });
        const arr = Array.isArray(j) ? j.map((s: any) => {
          if (typeof s === 'object' && s !== null) return '';
          return String(s || '').trim();
        }).filter(s => s && s !== '[object Object]') : [];
        setApiSports(arr);
      } catch { /* ignore */ }
    };
    loadSports();

    return () => {
      clearTimeout(timeoutId);
    };
  }, []);
  const staticSportsData: Record<string, { label: string; token: string; flag?: string; flagUrl?: string; leagues: { label: string; token: string }[] }[]> = {
    'Basquetebol': [
      { label: 'EUA', token: 'usa', flag: '🇺🇸', flagUrl: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1fa-1f1f8.svg', leagues: [{ label: 'NBA', token: 'basketball|usa|nba' }, { label: 'NCAA', token: 'basketball|usa|ncaa' }] },
      { label: 'Europa', token: 'europe', flag: '🇪🇺', flagUrl: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1ea-1f1fa.svg', leagues: [{ label: 'Euroleague', token: 'basketball|europe|euroleague' }] }
    ],
    'Futebol Americano': [
      { label: 'EUA', token: 'usa', flag: '🇺🇸', flagUrl: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1fa-1f1f8.svg', leagues: [{ label: 'NFL', token: 'american-football|usa|nfl' }, { label: 'NCAA', token: 'american-football|usa|ncaa' }] }
    ],
    'Hóquei': [
      { label: 'EUA', token: 'usa', flag: '🇺🇸', flagUrl: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1fa-1f1f8.svg', leagues: [{ label: 'NHL', token: 'ice-hockey|usa|nhl' }, { label: 'AHL', token: 'ice-hockey|usa|ahl' }] },
      { label: 'Suécia', token: 'sweden', flag: '🇸🇪', flagUrl: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1f8-1f1ea.svg', leagues: [{ label: 'SHL', token: 'ice-hockey|sweden|shl' }] }
    ],
    'MMA': [
      { label: 'Internacional', token: 'world', flag: '🌐', flagUrl: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f30d.svg', leagues: [{ label: 'UFC', token: 'mma|world|ufc' }, { label: 'Bellator', token: 'mma|world|bellator' }] }
    ],
    'Rúgbi': [
      { label: 'França', token: 'france', flag: '🇫🇷', flagUrl: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1eb-1f1f7.svg', leagues: [{ label: 'Top 14', token: 'rugby|france|top14' }] },
      { label: 'Inglaterra', token: 'england', flag: '🇬🇧', flagUrl: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1ec-1f1e7.svg', leagues: [{ label: 'Premiership', token: 'rugby|england|premiership' }] },
      { label: 'EUA', token: 'usa', flag: '🇺🇸', flagUrl: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1fa-1f1f8.svg', leagues: [{ label: 'MLR', token: 'rugby|usa|mlr' }] }
    ],
    'Handebol': [
      { label: 'França', token: 'france', flag: '🇫🇷', flagUrl: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1eb-1f1f7.svg', leagues: [{ label: 'LNH', token: 'handball|france|lnh' }] },
      { label: 'Espanha', token: 'spain', flag: '🇪🇸', flagUrl: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1ea-1f1f8.svg', leagues: [{ label: 'Liga ASOBAL', token: 'handball|spain|asobal' }] },
      { label: 'Alemanha', token: 'germany', flag: '🇩🇪', flagUrl: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1e9-1f1ea.svg', leagues: [{ label: 'Bundesliga', token: 'handball|germany|bundesliga' }] }
    ],
    'Voleibol': [
      { label: 'Brasil', token: 'brazil', flag: '🇧🇷', flagUrl: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1e7-1f1f7.svg', leagues: [{ label: 'Superliga', token: 'volleyball|brazil|superliga' }] },
      { label: 'Itália', token: 'italy', flag: '🇮🇹', flagUrl: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1ee-1f1f9.svg', leagues: [{ label: 'Serie A1', token: 'volleyball|italy|a1' }] }
    ],
    'Beisebol': [
      { label: 'EUA', token: 'usa', flag: '🇺🇸', flagUrl: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1fa-1f1f8.svg', leagues: [{ label: 'MLB', token: 'baseball|usa|mlb' }] }
    ],
    'Ténis': [
      { label: 'Internacional', token: 'world', flag: '🌐', flagUrl: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f30d.svg', leagues: [
        { label: 'ATP', token: 'tennis|world|atp' },
        { label: 'WTA', token: 'tennis|world|wta' },
        { label: 'Challenger', token: 'tennis|world|challenger' }
      ]}
    ],
    'Fórmula 1': [
      { label: 'Mundo', token: 'world', flag: '🌐', flagUrl: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f30d.svg', leagues: [
        { label: 'Grandes Prémios', token: 'formula-1|world|f1' }
      ]}
    ],
    'AFL': [
      { label: 'Austrália', token: 'australia', flag: '🇦🇺', flagUrl: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1e6-1f1fa.svg', leagues: [
        { label: 'AFL', token: 'afl|australia|afl' }
      ]}
    ]
  };



  const topEmojiUrl: Record<string, string> = {
    'top-europe': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f30d.svg',
    'england-premier-league': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f451.svg',
    'england-championship': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3c5.svg',
    'uefa-champions': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3c6.svg',
    'uefa-europa': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f31f.svg',
    'uefa-euro': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1ea-1f1fa.svg',
    'uefa-nations': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f91d.svg',
    'uefa-conference': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3df.svg',
    'uefa-super-cup': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3c6.svg',
    'uefa-youth-league': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3c3.svg',
    'womens-euro': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f31f.svg',
    'womens-champions-league': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3c6.svg',
    'uefa-futsal-champions-league': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/26bd.svg',
    'uefa-futsal-euro': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/26bd.svg',
    'international-friendlies': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f91d.svg',
    'world-cup': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3c6.svg',
    'womens-world-cup': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3c6.svg',
    'club-world-cup': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3c6.svg',
    'club-world-cup-2025': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3c6.svg',
    'intercontinental-cup': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f310.svg',
    'fifa-futsal-world-cup': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/26bd.svg',
    'beach-soccer-world-cup': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3d6.svg',
    'portugal': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1f5-1f1f9.svg',
    'spain': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1ea-1f1f8.svg',
    'france': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1eb-1f1f7.svg',
    'italy': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1ee-1f1f9.svg',
    'brazil': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1e7-1f1f7.svg',
  };

  const renderTopIcon = (token: string) => {
    const url = topEmojiUrl[token] || 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f31f.svg';
    return <img src={url} alt="" aria-hidden={true} width={20} height={20} style={{ display: 'inline-block', verticalAlign: 'middle' }} />;
  };

  const sportEmojiUrl: Record<string, string> = {
    'Futebol': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/26bd.svg',
    'Basquetebol': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3c0.svg',
    'NBA': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3c0.svg',
    'Hóquei': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3d2.svg',
    'Handebol': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f93e.svg',
    'Fórmula 1': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3ce.svg',
    'Futebol Americano': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3c8.svg',
    'NFL': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3c8.svg',
    'Rúgbi': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3c9.svg',
    'Voleibol': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3d0.svg',
    'MMA': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f94a.svg',
    'Beisebol': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/26be.svg',
    'Ténis': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3be.svg',
    'AFL': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3c8.svg',
    'Críquete': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3cf.svg',
    'Golfe': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/26f3.svg',
    'Corridas de Cavalos': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3c7.svg',
  };

  const sportIconUrl = (name: string) => {
    return sportEmojiUrl[name] || sportEmojiUrl['Futebol'];
  };

  const renderSportIcon = (name: string) => {
    const url = sportEmojiUrl[name];
    return url ? (
      <img src={url} alt="" aria-hidden={true} width={20} height={20} style={{ display: 'inline-block', verticalAlign: 'middle' }} />
    ) : null;
  };



  const toggleSection = (title: string) => { 
    setExpandedSections(prev => { 
      const newSet = new Set(prev); 
      if (newSet.has(title)) { 
        newSet.delete(title); 
      } else { 
        newSet.add(title); 
      } 
      return newSet; 
    }); 
  }; 

  const renderSection = (section: SidebarSection) => {
    const isExpanded = section.title === 'Top Competições' ? true : expandedSections.has(section.title);
    const normalize = (s: string) => s.normalize('NFKC').trim().toLowerCase();
    
    // Lista de itens que devem ser ocultados do nível superior porque já estão organizados dentro dos desportos/países
    const HIDDEN_LEAGUES = new Set([
      'bundesliga', '2. bundesliga',
      'epl', 'premier league', 'championship',
      'la liga', 'segunda división',
      'ligue 1', 'ligue 2',
      'serie a', 'serie b',
      'primeira liga', 'liga portugal', 'liga portugal 2',
      'nba', 'ncaab', 'ncaa', 'euroleague',
      'nfl', 'ncaaf',
      'nhl', 'ahl',
      'mlb',
      'ufc', 'bellator',
      'atp', 'wta', 'challenger',
      'formula 1', 'f1',
      'motogp', 'moto2', 'moto3',
      'futsal',
      'volleyball',
      'handball',
      'rugby',
      'snooker',
      'darts',
      'tennis',
      'ice hockey',
      'american football',
      'basketball',
      'soccer',
      'football'
    ]);

    const normalizedBaseSports = new Set((sports.items || []).map(s => normalize(s)));
    const uniqueApiSports = (apiSports || []).filter(s => {
      const n = normalize(s);
      return !normalizedBaseSports.has(n) && !HIDDEN_LEAGUES.has(n);
    });
    
    const displaySports = Array.from(new Set([...(sports.items || []), ...uniqueApiSports]))
      .filter(Boolean)
      .sort((a,b)=>a.localeCompare(b,'pt-PT'));

    return (
      <div key={section.title} className="mb-5">
        {section.title === 'Top Competições' ? (
          <div
            className={`w-full flex items-center justify-between p-3 rounded-lg ${
              darkMode ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'
            }`}
          >
            <span className="font-semibold text-sm flex items-center gap-2">
              <img src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3c6.svg" alt="" aria-hidden={true} width={20} height={20} style={{ display: 'inline-block', verticalAlign: 'middle' }} />
              {section.title}
            </span>
          </div>
        ) : (
          <button
            onClick={() => toggleSection(section.title)}
            className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
              darkMode
                ? 'bg-gray-800 hover:bg-gray-750 text-white'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
            }`}
          >
            <span className="font-semibold text-sm flex items-center gap-2">
              <img src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3df.svg" alt="" aria-hidden={true} width={20} height={20} style={{ display: 'inline-block', verticalAlign: 'middle' }} />
              {section.title}
            </span>
            {isExpanded ? (
              <img src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f53d.svg" alt="" aria-hidden={true} width={20} height={20} style={{ display: 'inline-block', verticalAlign: 'middle' }} />
            ) : (
              <img src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/25b6.svg" alt="" aria-hidden={true} width={20} height={20} style={{ display: 'inline-block', verticalAlign: 'middle' }} />
            )}
          </button>
        )}

      {isExpanded && (
        <div className="mt-3 space-y-2">
          {(() => {
            const hasDynamic = dynamicTopItems && dynamicTopItems.length > 0;
            const base = (section.title === 'Top Competições' && hasDynamic
              ? dynamicTopItems
              : section.items);
            
            const filtered = base.filter((i) => {
                if (typeof i !== 'string') return true;
                return i !== 'Todos os Desportos' && !(section.title === 'Top Competições' && !hasDynamic && displaySports.some((s) => normalize(s) === normalize(i)));
            });

            const itemsToRender = (section.title === 'Desportos' ? displaySports : filtered)
              .filter(i => i);
            
            return itemsToRender.map((item, idx) => {
            const itemLabel = typeof item === 'string' ? item : item.league;
            const tokenTop =
              itemLabel === 'Top - Futebol Europeu' ? 'top-europe' :
              itemLabel === 'Liga de Portugal' ? 'portugal' :
              itemLabel === 'Espanha - La Liga' ? 'spain' :
              itemLabel === 'França - Ligue 1' ? 'france' :
              itemLabel === 'Itália - Serie A' ? 'italy' :
                itemLabel === 'Brasil - Série A' ? 'brazil' :
                itemLabel === 'Premier League' ? 'england-premier-league' :
                itemLabel === 'Championship' ? 'england-championship' :
                /* removed explicit league shortcuts from Top Competições */
                itemLabel === 'UEFA Champions League' ? 'uefa-champions' :
                itemLabel === 'UEFA Europa League' ? 'uefa-europa' :
                itemLabel === 'Seleções Amigáveis' ? 'international-friendlies' :
                itemLabel === 'Copa do Mundo' ? 'world-cup' : '';
              const tokenSport =
                itemLabel === 'Futebol' ? 'soccer-all' :
                itemLabel === 'Basquetebol' ? 'basketball' :
                itemLabel === 'NBA' ? 'nba' :
                itemLabel === 'Críquete' ? 'cricket' :
                itemLabel === 'Futebol Americano' ? 'american-football' :
                itemLabel === 'NFL' ? 'nfl' :
                itemLabel === 'Handebol' ? 'handball' :
                itemLabel === 'MMA' ? 'mma' :
                itemLabel === 'Fórmula 1' ? 'formula-1' :
                itemLabel === 'Hóquei' ? 'ice-hockey' :
                itemLabel === 'Rúgbi' ? 'rugby' :
                itemLabel === 'Voleibol' ? 'volleyball' :
                itemLabel === 'Beisebol' ? 'baseball' :
                itemLabel === 'Golfe' ? 'golf' :
                itemLabel === 'Corridas de Cavalos' ? 'horse-racing' :
                itemLabel === 'AFL' ? 'afl' : 
                itemLabel === 'Ténis' ? 'tennis' : '';
              
              let token = section.title === 'Top Competições' ? (tokenTop || tokenSport) : tokenSport;

              if (!token && typeof item !== 'string' && section.title === 'Top Competições') {
                 const s = (item.sport || 'soccer').toLowerCase();
                 const c = (item.country || 'world').toLowerCase().trim().replace(/\s+/g, '-');
                 const l = (item.league).toLowerCase().trim().replace(/\s+/g, '-');
                 token = `${s}|${c}|${l}`;
              }

              const active = selectedCategory === token;
              if (section.title === 'Top Competições') {
                const { flag, country, league, flagUrl } = formatLeagueHeader(item);
                const hasFormat = flag && country;
                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedCategory(token || null)}
                    className={`w-full text-left px-4 py-2 rounded-lg text-sm transition-colors ${
                      darkMode
                        ? `${active ? 'bg-red-600 text-white' : 'hover:bg-gray-800 text-gray-300 hover:text-white'}`
                        : `${active ? 'bg-red-600 text-white' : 'hover:bg-gray-100 text-gray-700 hover:text-gray-900'}`
                    }`}
                  >
                    <span className="inline-flex items-center gap-3">
                      {hasFormat ? (
                        <div className="relative w-5 h-5 flex-shrink-0">
                            <img src={getSportIcon(getSportFromLeague(itemLabel))} alt="" className="w-full h-full object-contain p-0.5 opacity-90" />
                            <span className={`absolute -bottom-1 -right-1 flex items-center justify-center w-2.5 h-2.5 rounded-full shadow-sm border ${darkMode ? 'border-gray-800 bg-gray-700' : 'border-white bg-white'} overflow-hidden`}>
                               {flagUrl ? <img src={flagUrl} alt={country} className="w-full h-full object-cover" /> : <span className="text-[6px]">{flag}</span>}
                            </span>
                        </div>
                      ) : (
                        <span className={`flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full shadow-sm text-sm ${darkMode ? 'bg-gray-700' : 'bg-white'} overflow-hidden`}>
                          {tokenTop ? renderTopIcon(token) : renderSportIcon(itemLabel)}
                        </span>
                      )}
                      <span>
                        {hasFormat 
                          ? <span>{country} {league ? '-' : ''} {league}</span> 
                          : itemLabel
                        }
                      </span>
                    </span>
                  </button>
                );
              }
            if (section.title === 'Desportos') {
              const sportName = item as string;
              const isExpandedSport = expandedSports.has(sportName);
              
              let structure: { label: string; token: string; flag?: string; flagUrl?: string; leagues: { label: string; token: string }[] }[] = [];
              
              if (sportName === 'Futebol') {
                const ALLOWED_COUNTRIES = [
                    'Brasil', 'Inglaterra', 'Espanha', 'Itália', 'França', 'Alemanha', 'Argentina', 
                    'Portugal', 'Bélgica', 'Holanda', 'Países Baixos', 'Escócia', 'Turquia', 'Suíça', 
                    'Grécia', 'Dinamarca', 'México', 'Japão', 'Estados Unidos', 'EUA', 'Uruguai', 'Colômbia',
                    'Internacional', 'Mundo'
                ];

                structure = ALL_COUNTRIES
                  .filter((c: any) => c.leagues && c.leagues.length > 0 && ALLOWED_COUNTRIES.includes(c.name))
                  .map((c: any) => ({
                    label: c.name,
                    token: c.name.toLowerCase().replace(/\s+/g, '-'),
                    flag: c.flag,
                    flagUrl: c.flagUrl,
                    leagues: (c.leagues || []).map((l: string) => ({
                      label: l,
                      token: `soccer|${c.name.toLowerCase().replace(/\s+/g, '-')}|${l.toLowerCase().replace(/\s+/g, '-')}`
                    }))
                  }))
                  .sort((a: any, b: any) => a.label.localeCompare(b.label, 'pt-PT'));
              } else {
                structure = staticSportsData[sportName] || [];
              }

              return (
                <div key={idx} className="space-y-2">
                  <button
                    onClick={() => {
                      setExpandedSports(prev => {
                        const s = new Set(prev);
                        if (s.has(sportName)) s.delete(sportName); else s.add(sportName);
                        return s;
                      });
                    }}
                    className={`w-full text-left px-4 py-2 rounded-lg text-sm transition-colors ${
                      darkMode
                        ? `${isExpandedSport ? 'bg-red-600 text-white' : 'hover:bg-gray-800 text-gray-300 hover:text-white'}`
                        : `${isExpandedSport ? 'bg-red-600 text-white' : 'hover:bg-gray-100 text-gray-700 hover:text-gray-900'}`
                    } ${isExpandedSport ? 'border-l-4 border-red-600' : 'border-l-4 border-transparent'}`}
                  >
                  <span className="inline-flex items-center gap-3">
                    {renderSportIcon(sportName)}
                    <span>{sportName}</span>
                  </span>
                  </button>
                  {isExpandedSport && (
                    <div className="pl-3 space-y-1">
                      {structure.map((country) => {
                        const countryKey = `${sportName}-${country.label}`;
                        const isExpandedC = expandedCountry.has(countryKey);
                        return (
                          <div key={country.label}>
                            <button
                              onClick={() => {
                                setExpandedCountry(prev => {
                                  const s = new Set(prev);
                                  if (s.has(countryKey)) s.delete(countryKey); else s.add(countryKey);
                                  return s;
                                });
                              }}
                              className={`w-full text-left px-3 py-1 rounded-lg text-sm ${darkMode ? 'hover:bg-gray-800 text-gray-300 hover:text-white' : 'hover:bg-gray-100 text-gray-700 hover:text-gray-900'}`}
                            >
                              <span className="inline-flex items-center gap-2">
                                {(() => {
                                  const flag = country.flagUrl || country.flag || '🌐';
                                  const isUrl = flag.startsWith('http');
                                  return (
                                    <span className="flex-shrink-0 w-5 h-5 rounded-full overflow-hidden flex items-center justify-center bg-gray-100 shadow-sm text-sm">
                                      {isUrl ? <img src={flag} alt={country.label} className="w-full h-full object-cover" /> : flag}
                                    </span>
                                  );
                                })()}
                                <span>{country.label}</span>
                              </span>
                            </button>
                            {isExpandedC && (
                              <div className="pl-3 space-y-1">
                                {country.leagues.map((league: any) => {
                                    const isActiveL = selectedCategory === league.token;
                                    return (
                                    <button
                                      key={league.token}
                                      onClick={() => setSelectedCategory(league.token)}
                                      className={`w-full text-left px-3 py-1 rounded-lg text-xs ${darkMode ? `${isActiveL ? 'text-red-400 font-bold' : 'hover:bg-gray-800 text-gray-300 hover:text-white'}` : `${isActiveL ? 'text-red-600 font-bold' : 'hover:bg-gray-100 text-gray-700 hover:text-gray-900'}`}`}
                                    >
                                      <span className="inline-flex items-center gap-2">
                                        <img src={sportIconUrl(sportName)} className="w-3 h-3 object-contain opacity-80" />
                                        <span>{league.label}</span>
                                      </span>
                                    </button>
                                )})}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {sportName === 'Futebol' && (() => {
                        const fifaExpanded = expandedSports.has('FIFA');
                        const uefaExpanded = expandedSports.has('UEFA');
                        const fifaList: Array<{ label: string; token: string }> = [
                          { label: 'Copa do Mundo FIFA', token: 'world-cup' },
                          { label: 'Copa do Mundo Feminina', token: 'womens-world-cup' },
                          { label: 'FIFA Club World Cup', token: 'club-world-cup' },
                          { label: 'FIFA Club World Cup 2025', token: 'club-world-cup-2025' },
                          { label: 'FIFA Intercontinental Cup', token: 'intercontinental-cup' },
                          { label: 'FIFA Futsal World Cup', token: 'fifa-futsal-world-cup' },
                          { label: 'FIFA Beach Soccer World Cup', token: 'beach-soccer-world-cup' },
                        ];
                        const uefaList: Array<{ label: string; token: string }> = [
                          { label: 'UEFA Euro', token: 'uefa-euro' },
                          { label: 'UEFA Nations League', token: 'uefa-nations' },
                          { label: 'UEFA Champions League', token: 'uefa-champions' },
                          { label: 'UEFA Europa League', token: 'uefa-europa' },
                          { label: 'UEFA Europa Conference League', token: 'uefa-conference' },
                          { label: 'UEFA Super Cup', token: 'uefa-super-cup' },
                          { label: 'UEFA Youth League', token: 'uefa-youth-league' },
                          { label: 'UEFA Women’s Euro', token: 'womens-euro' },
                          { label: 'UEFA Women’s Champions League', token: 'womens-champions-league' },
                          { label: 'UEFA Futsal Champions League', token: 'uefa-futsal-champions-league' },
                          { label: 'UEFA Futsal Euro', token: 'uefa-futsal-euro' },
                        ];
                        return (
                          <div className="mt-2 space-y-2">
                            <div>
                              <button
                                onClick={() => {
                                  setExpandedSports(prev => {
                                    const s = new Set(prev);
                                    if (s.has('FIFA')) s.delete('FIFA'); else s.add('FIFA');
                                    return s;
                                  });
                                }}
                                className={`w-full text-left px-4 py-2 rounded-lg text-sm transition-colors ${
                                  darkMode
                                    ? `${fifaExpanded ? 'bg-red-600 text-white' : 'hover:bg-gray-800 text-gray-300 hover:text-white'}`
                                    : `${fifaExpanded ? 'bg-red-600 text-white' : 'hover:bg-gray-100 text-gray-700 hover:text-gray-900'}`
                                } ${fifaExpanded ? 'border-l-4 border-red-600' : 'border-l-4 border-transparent'}`}
                              >
                                <span className="inline-flex items-center gap-3">
                                  <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#0EA5E9"/><path d="M2 12h20M12 2v20" stroke="#fff" strokeWidth="2"/></svg>
                                  <span>FIFA</span>
                                </span>
                              </button>
                              {fifaExpanded && (
                                <div className="pl-3 space-y-1">
                                  {fifaList.map((it) => (
                                    <button
                                      key={it.token}
                                      onClick={() => setSelectedCategory(it.token)}
                                      className={`w-full text-left px-3 py-1 rounded-lg text-xs ${darkMode ? 'hover:bg-gray-800 text-gray-300 hover:text-white' : 'hover:bg-gray-100 text-gray-700 hover:text-gray-900'}`}
                                    >
                                      {it.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div>
                              <button
                                onClick={() => {
                                  setExpandedSports(prev => {
                                    const s = new Set(prev);
                                    if (s.has('UEFA')) s.delete('UEFA'); else s.add('UEFA');
                                    return s;
                                  });
                                }}
                                className={`w-full text-left px-4 py-2 rounded-lg text-sm transition-colors ${
                                  darkMode
                                    ? `${uefaExpanded ? 'bg-red-600 text-white' : 'hover:bg-gray-800 text-gray-300 hover:text-white'}`
                                    : `${uefaExpanded ? 'bg-red-600 text-white' : 'hover:bg-gray-100 text-gray-700 hover:text-gray-900'}`
                                } ${uefaExpanded ? 'border-l-4 border-red-600' : 'border-l-4 border-transparent'}`}
                              >
                                <span className="inline-flex items-center gap-3">
                                  <img src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f1ea-1f1fa.svg" alt="" width={20} height={20} style={{ display: 'inline-block', verticalAlign: 'middle' }} />
                                  <span>UEFA</span>
                                </span>
                              </button>
                              {uefaExpanded && (
                                <div className="pl-3 space-y-1">
                                  {uefaList.map((it) => (
                                    <button
                                      key={it.token}
                                      onClick={() => setSelectedCategory(it.token)}
                                      className={`w-full text-left px-3 py-1 rounded-lg text-xs ${darkMode ? 'hover:bg-gray-800 text-gray-300 hover:text-white' : 'hover:bg-gray-100 text-gray-700 hover:text-gray-900'}`}
                                    >
                                      {it.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            }
            if (section.title !== 'Desportos' && section.title !== 'Top Competições') {
              const label = typeof item === 'string' ? item : (item.league || 'Unknown');
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedCategory(token || null)}
                  className={`w-full text-left px-4 py-2 rounded-lg text-sm transition-colors ${
                    darkMode
                      ? `${active ? 'bg-red-600 text-white' : 'hover:bg-gray-800 text-gray-300 hover:text-white'}`
                      : `${active ? 'bg-red-600 text-white' : 'hover:bg-gray-100 text-gray-700 hover:text-gray-900'}`
                  }`}
                >
                  {label}
                </button>
              );
            }
            return null;
            });
          })()}
        </div>
      )}
      </div>
    );
  };
 
  return (
    <aside className={`flex flex-col h-full ${darkMode ? 'bg-[#1a1a1a] text-white' : 'bg-white text-gray-900'} border-r border-gray-200 dark:border-gray-800 transition-colors duration-300`}>
      <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar">
        {/* removed odds status badge */}
        {renderSection(topCompetitions)} 
        {renderSection(sports)} 
        {isOperator && (
          <div className="mt-5 space-y-2">
            <button
              onClick={() => setShowAdminPanel(!showAdminPanel)}
              className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
                darkMode
                  ? 'bg-gray-800 hover:bg-gray-750 text-white'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
              }`}
            >
              <span className="font-semibold text-sm flex items-center gap-2">
                <img src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/2699.svg" alt="" aria-hidden={true} width={20} height={20} style={{ display: 'inline-block', verticalAlign: 'middle' }} />
                Admin
              </span>
              {showAdminPanel ? (
                <img src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f53d.svg" alt="" aria-hidden={true} width={20} height={20} style={{ display: 'inline-block', verticalAlign: 'middle' }} />
              ) : (
                <img src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/25b6.svg" alt="" aria-hidden={true} width={20} height={20} style={{ display: 'inline-block', verticalAlign: 'middle' }} />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Download App Button */}
      <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-800 p-4">
        <button className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white py-3 px-4 rounded-xl shadow-lg flex items-center justify-center gap-3 transition-all transform hover:scale-[1.02] active:scale-[0.98]">
          <Smartphone className="w-5 h-5" />
          <div className="flex flex-col items-start">
            <span className="text-xs opacity-90 font-medium">Disponível para Android</span>
            <span className="text-sm font-bold leading-none">Baixar Aplicativo</span>
          </div>
          <Download className="w-4 h-4 ml-auto opacity-80" />
        </button>
      </div>
    </aside>
  );
}
