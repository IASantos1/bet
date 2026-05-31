// TODO: verificar se os membros convertApiFootballToNormalized, isLeagueBlocked, findOddsForMatch, ApiFootballFixture existem em ./apiFootballService.ts e importar corretamente.

// TODO: verificar e corrigir importações de fetchApiFootballLive e fetchApiFootballLiveOdds de ./apiFootballLive.ts

// Ajusta a checagem de undefined antes de usar new Date

const timeA = a.startTime ? new Date(a.startTime).getTime() : 0;
const timeB = b.startTime ? new Date(b.startTime).getTime() : 0;

return timeA - timeB;

// Verifique outros locais onde new Date é utilizado e aplique a mesma lógica.

// TODO: remover tipos não utilizados como NormalizedStats.

// TODO: remover variáveis que são declaradas mas nunca utilizadas.

// Lógica original do arquivo permanece inalterada.