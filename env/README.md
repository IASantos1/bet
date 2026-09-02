Dados esportivos (odds) sao fornecidos pela PulseScore (api.pulsescore.net).

Defina a variavel de ambiente PULSESCORE_API_KEY com a chave `x-secret` fornecida pela PulseScore.
Sem essa variavel, `/api/events/by-sport` e as demais rotas de eventos continuam a responder, mas
sem dados (sportsApisEnabled: false).

Nao e necessario configurar chaves de GoalServe, SportsAPI Pro, The Odds API ou API-Football neste
projeto — essas integracoes foram removidas.
