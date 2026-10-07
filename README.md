# Bet62

Plataforma de apostas desportivas com contas de utilizador, carteira, apostas simples e múltiplas,
liquidação automática e painel de administração. Visual escuro vermelho/preto, responsivo (desktop,
tablet e telemóvel) e instalável como PWA.

## Requisitos

- Node.js **22.13 ou superior** (usa o SQLite embutido do Node — não é preciso instalar base de dados).

## Executar

```bash
npm install
npm start          # http://localhost:8080
npm run dev        # reinicia sozinho ao editar o servidor
npm test           # testes da API (registo, carteira, apostas, liquidação, levantamentos…)
```

No primeiro arranque é criada a base de dados em `data/classicbet.db`, com eventos de exemplo e um
administrador de desenvolvimento: **admin@classicbet.local / admin12345**. Em produção defina
`ADMIN_EMAIL` e `ADMIN_PASSWORD` (ver `.env.example`).

## O que funciona

| Área | Funcionalidades |
| --- | --- |
| Conta | Registo com verificação de idade (18+), login/logout, sessões seguras (cookie httpOnly), dados pessoais, alteração de palavra-passe |
| Carteira | Saldo, depósitos, pedidos de levantamento por IBAN, extrato de movimentos com saldo após cada operação |
| Desporto | Eventos pré-jogo e ao vivo por desporto e competição, pesquisa, resultados, odds atualizadas a cada 5 s |
| Boletim | Simples (uma aposta por seleção) e múltipla, valores rápidos, retorno potencial, aviso e confirmação quando as odds mudam |
| Apostas | Validação no servidor (odds atuais, mercado aberto, limites, saldo), histórico com estado de cada seleção |
| Liquidação | Ao lançar o resultado final, as apostas são decididas e os prémios creditados; eventos cancelados anulam e reembolsam |
| Jogo responsável | Autoexclusão (24 h a 1 ano) que bloqueia apostas e depósitos |
| Administração | Criar eventos, editar odds, iniciar ao vivo, atualizar marcador, suspender mercados, destacar, lançar resultado, cancelar; aprovar/rejeitar levantamentos; ver apostas, utilizadores e receita |

## Jogos e odds reais (futebol)

A plataforma importa futebol real de [sports.bzzoiro.com](https://sports.bzzoiro.com) (API v2, gratuita,
30+ ligas). Registe-se para obter um token e defina-o antes de arrancar:

```bash
BZZOIRO_API_TOKEN=o-seu-token npm start
```

Com o token definido, o servidor deixa de criar eventos de exemplo e passa a:

| Sincronização | Intervalo | O que faz |
| --- | --- | --- |
| Jogos e odds | 10 min | Importa os jogos dos próximos `BZZOIRO_DAYS` dias. As odds de consenso 1X2 chegam numa só chamada ao feed `/odds/`, pedindo depois só o que mudou (`updated_after`); jogos ainda sem preço caem para `/events/{id}/odds/`, respeitando o `next_update_at` de cada um |
| Ao vivo | 30 s | Atualiza marcador e minuto e entrega ao WebSocket os jogos com cobertura (`live_websocket`) |
| WebSocket | tempo real | Odds em jogo (consenso ~30 s e, com `BZZOIRO_LIVE_BOOKMAKER`, as da casa escolhida — `odds_book`) e marcador (addon pago). A odd só abre o mercado quando já difere da de antes do jogo / do último golo e bate com o placar; parada mais de `LIVE_ODDS_STALE_SECONDS` (600 s) fecha. Cada golo fecha o mercado até chegar uma odd nova; sem odd ao vivo recente (`LIVE_ODDS_MAX_AGE_SECONDS`, 180 s) não se aceitam apostas em jogo. Sem o addon, os jogos em curso ficam só com marcador |
| Resultados | 2 min | Quando o jogo termina, grava o resultado do tempo regulamentar e liquida as apostas; jogos cancelados/abandonados são anulados e reembolsados; adiados ficam suspensos até terem nova data |

Com uma chave Football Unlimited o feed `/odds/` traz o preço de cada casa de apostas: a plataforma usa
a média entre elas (numa chave gratuita, o consenso do próprio fornecedor).

Jogos importados só aparecem aos jogadores depois de terem odds. Os escudos dos clubes vêm do proxy de imagens do fornecedor (sem token); quando não há escudo, mostram-se as iniciais. O estado do feed (última execução,
erros, eventos importados) e um botão **Sincronizar agora** estão em *Administração → Dados ao vivo*.
Os eventos criados manualmente no painel continuam a funcionar em paralelo.

## Ténis (ATP/WTA)

Com o mesmo `BZZOIRO_API_TOKEN` e o **Sports Addon** ativo na conta, o ténis é importado da Tennis
API (`/tennis/api/v2/`):

- Encontros dos próximos `TENNIS_DAYS` dias (3) com a odd de vencedor (pré-jogo), bandeiras dos
  jogadores e torneio/ronda. Em jogo mostra os sets e os parciais; o mercado fecha no início.
- Liquidação pelo vencedor: walkover e cancelamentos anulam as apostas; desistência antes do fim do
  1.º set anula; desistência depois disso dá a vitória a quem passa.
- Na página do encontro: estatísticas por set (ases, duplas faltas, serviço…), confrontos diretos e
  forma recente, previsão do modelo e ranking ATP/WTA (top 20 com os dois jogadores).
- Ao vivo, com o addon WebSocket, o marcador é atualizado ponto a ponto pelo canal multi-desporto
  (`wss://sports.bzzoiro.com/ws/live/`, `"sport": "tennis"`): sets, jogos, pontos, quem serve e as
  estatísticas de serviço. Sem cobertura, o marcador vem da API a cada 30 s.
- Sem o addon a API responde 402: o painel *Administração → Dados ao vivo* mostra "Sem Sports Addon".
  `TENNIS=0` desliga o ténis.

## WinHouse — fonte de jogos, odds e resultados

Com `WINHOUSE_BASE_URL` definido, `server/winhouse.js` importa futebol, basquetebol, hóquei e ténis:

- **Pré-jogo** (a cada minuto): `/ajax/prematchgamesmainleague`, `/ajax/toptenprematchgames` e
  `/ajax/prematchgames24hour` → jogos futuros e odds. Odds que nenhuma lista confirma há 15 min fecham.
- **Ao vivo** (a cada 15 s): `/ajax/livegames` → placar, minuto e odds em jogo da própria casa
  (um preço 1.00 é seleção suspensa e fecha o mercado).
- **Desportos e mercados**: futebol, andebol e futsal 1X2, Dupla hipótese e golos (linhas .5);
  basquetebol vencedor com prolongamento e pontos (.5); hóquei 1X2 e resultado exato do tempo
  regulamentar; ténis vencedor; ténis de mesa e badminton vencedor (+ resultado exato em sets no
  ténis de mesa); voleibol vencedor.
- **Todos os mercados**: a página de cada jogo (`prematchgame/{id}`) das próximas
  `WINHOUSE_DETAIL_HOURS` horas é lida aos poucos (`WINHOUSE_DETAIL_PER_CYCLE` por minuto, cada uma
  de novo após `WINHOUSE_DETAIL_REFRESH_MINUTES`). Os mercados que o resultado final decide
  (golos em todas as linhas, ambas marcam, par/ímpar, handicap asiático, resultado exato, totais
  por equipa) liquidam-se sozinhos; todos os outros (cantos, combinados, partes, tempos de golo…)
  são importados também e ficam em Admin → Liquidação, onde o operador marca cada seleção como
  ganha, perdida ou anulada depois do jogo.
- **Ao vivo, todos os mercados**: a página em direto de cada jogo (`WINHOUSE_LIVE_EVENT`, por
  omissão `livegame/{id}`) é lida a cada `WINHOUSE_LIVE_DETAIL_SECONDS` (até
  `WINHOUSE_LIVE_DETAIL_PER_CYCLE` páginas a cada 10 s). Essas odds valem no máximo 2× esse tempo,
  caem a cada golo e só aparecem enquanto a lista ao vivo tiver o jogo aberto. Se a rota responder
  404, usa a página pré-jogo do mesmo jogo (`prematchgame/{id}`); se também essa falhar, pára 10
  minutos (Admin → Feed mostra a rota em uso; "Ver mercados ao vivo" testa a página). Os mercados
  da própria lista ao vivo que não liquidamos sozinhos (1.º set, apostas por sets…) também entram,
  para o operador decidir.
- **Tracker ao vivo (futebol)**: a página do jogo mostra o campo com a bola e a situação
  (ataque, ataque perigoso, canto…), as estatísticas (posse, ataques, ataques perigosos, remates,
  cantos, cartões) e a cronologia, a partir do tracker da WinHouse: `/ajax/widget` dá o `EID` e a
  chave, `/widget-data` o estado do jogo. Só é lido para os jogos que alguém tem abertos (a cada
  `WINHOUSE_TRACKER_POLL_MS`); `WINHOUSE_TRACKER=0` desliga. A posição da bola (`xy`) e a situação
  chegam pelo WebSocket do tracker (`ws-widget`, cerca de 1 por segundo); com ele ligado, o
  `widget-data` só é relido a cada 15 s (cronologia, contagens). `WINHOUSE_TRACKER_WS=0` desliga-o. Admin → Feed → "Ver tracker" mostra o
  que a WinHouse devolve para um jogo.
- **Bloqueios**: jogos femininos e de escalões jovens (U19, Sub-20, Junior…) não são importados
  (`WINHOUSE_BLOCK_WOMEN=0` / `WINHOUSE_BLOCK_YOUTH=0` mostram-nos), nem futebol virtual (FIFA
  4x4/5x5, subsoccer, cyber…), ténis de mesa ATT / Setka Cup / TT Cup e ténis UTR
  (`WINHOUSE_BLOCK_MINOR=0` mostra-os). `WINHOUSE_BLOCK_LEAGUES` junta mais termos, separados por
  vírgulas (ex.: `Liga Pro, Czech`). Os já importados são removidos enquanto não tiverem apostas.
- **Fim**: um jogo que sai da lista ao vivo e não volta em `WINHOUSE_FINISH_CONFIRM_SECONDS` é
  liquidado pelo último placar só se estava claramente no fim (futebol ≥ 88'; basquetebol ≥ 39'
  ou 47' na NBA e sem empate; hóquei ≥ 59' ou prolongamento = empate no regulamentar; ténis com 2
  sets ganhos). O resto vai para Admin → Liquidação para o operador decidir.
- **Fuso**: `game_date`/`game_time` estão na hora local da WinHouse; o desvio é estimado pelos jogos
  ao vivo (ou fixado com `WINHOUSE_TZ_OFFSET_MINUTES`). Um jogo que aparece no ao vivo fecha o pré-jogo.

Para usar só a WinHouse, apague `BZZOIRO_API_TOKEN` (o campo ao vivo, estatísticas, H2H e
classificação vinham do Bzzoiro e deixam de aparecer).

## PropLine — segunda fonte de odds

O Bzzoiro continua a ser a fonte principal: cria os jogos e dá placares, estatísticas, o campo ao vivo
e os resultados com que tudo é liquidado. A PropLine (`api.prop-line.com/v1`, cabeçalho `X-API-Key`)
só traz **odds**, e só para mercados que o Bzzoiro não tem nesse jogo:

- Os jogos da PropLine são associados aos nossos por desporto, hora de início (±20 min; ténis ±4 h) e
  nomes (acentos, "FC", "Man Utd"/"Manchester United", "B. Shick"/"Bernard Shick", casa/fora trocados).
- Cada odd é guardada com `selections.src = 'pl'`. Um mercado com odds do Bzzoiro nunca é sobreposto,
  e o Bzzoiro ao fechar as suas odds não fecha as da PropLine (e vice-versa).
- Pré-jogo: mediana das casas (DFS e mercados de previsão excluídos), preço americano → decimal, só
  mercados completos, linhas .5 nos totais, .5/inteiras nos handicaps, sem totais por equipa.
  Futebol (EPL, LaLiga, Serie A, Bundesliga, Ligue 1, MLS): 1X2, golos, handicap, ambas marcam.
  Ténis: vencedor, jogos, handicap de jogos, sets. NBA: vencedor, pontos, handicap. NHL: vencedor.
- Ao vivo: só casas que cotam em jogo (`pregame_only` falso), mercados não suspensos, odds vistas nos
  últimos `PROPLINE_LIVE_MAX_AGE` s e alteradas depois do último golo. O início do jogo e cada golo
  fecham as odds da PropLine; as apostas são recusadas se a confirmação ao vivo tiver mais de
  `LIVE_ODDS_MAX_AGE_SECONDS`.
- Pedidos: um por competição no pré-jogo (cadência calculada a partir de `PROPLINE_DAILY_REQUESTS`) e
  um por jogo associado ao vivo. Segue os cabeçalhos `X-Daily-*`; um 429 põe em pausa até ao reset, uma
  chave recusada (401/403) desliga a fonte e mostra o motivo no admin. Erros nunca afetam o Bzzoiro.
- Planos: com o grátis (1 000/dia) o pré-jogo é lido ~a cada 20 min e o ao vivo esgota a quota depressa.
  Com o Streaming (1 000 000/dia): `PROPLINE_DAILY_REQUESTS=800000`, `PROPLINE_LIVE_SECONDS=10`,
  `PROPLINE_MAX_LIVE_EVENTS=50` (pré-jogo a cada minuto, ao vivo a cada 10 s: até ~450 000 pedidos/dia com 50 jogos ao vivo).
- Admin → Feed mostra o estado, a quota, jogos associados e odds ativas, com "Ler PropLine agora", e cada
  evento tem "Ver odds PropLine".

## Basquetebol, hóquei no gelo, dardos e CS2

Também com o Sports Addon (`server/sports.js`, um motor comum com uma configuração por desporto):

| Desporto | Mercados | Liquidação | Página do jogo |
|---|---|---|---|
| Basquetebol | Vencedor (incl. prolongamento) | resultado final | estatísticas por equipa, box score, previsão, classificação |
| Hóquei no gelo | Resultado 1X2 **em tempo regulamentar** e empate anula; ou vencedor incl. prolongamento quando as casas só dão 2 odds | 1X2 pelos 3 períodos; vencedor pelo final | golos por período, H2H e forma, previsão, classificação (com VP/DP) |
| Dardos | Vencedor do encontro | por sets/legs; walkover anula | legs por set, H2H com médias de 3 dardos, previsão, ranking PDC |
| CS2 | Vencedor do encontro | por mapas; empate num BO2 anula | mapas, comparação das equipas (mapas, rondas T/CT, K/D), H2H, previsão |

- As odds são a média das casas de apostas (`/{id}/odds/`), atualizadas a cada 10 min (3 min na
  última hora). **Ao vivo** (também no ténis), a cada 30 s: abre com as odds que as casas atualizaram
  depois do início e nos últimos `LIVE_ODDS_MAX_AGE_SECONDS` (180 s); quando a odd não traz data (preço
  de consenso ou a odd da lista de jogos ao vivo), só abre enquanto se mexe — abre quando muda em
  relação à anterior e fecha se ficar parada mais de 180 s. Sem nada disto fica "Mercado ao vivo
  suspenso". Em *Administração → Eventos*, "Ver odds do fornecedor" mostra a resposta crua. No ténis, quando a lista de encontros não traz odds, vêm de `/matches/{id}/odds/`.
- `SPORTS_ADDON=basquetebol,hoquei,dardos,esports` escolhe os desportos (vazio desliga todos) e
  `SPORTS_DAYS` quantos dias importar.
- Padel não tem odds na API (não dá para apostar) e as corridas de cavalos precisam de um modelo de
  corrida com vários participantes — ficaram de fora nesta versão.

## Casino (slots e casino ao vivo)

O casino liga-se à Agent API v4 de um agregador de jogos (Pragmatic Play, PG, Evolution, Hacksaw…), em
modo **Transfer**:

```bash
CASINO_API_URL=https://endereco-do-agregador CASINO_API_TOKEN=o-seu-token npm start
```

- As variáveis podem estar no ambiente do servidor ou num ficheiro `.env` na pasta do projeto (lido ao
  arrancar; reinicie depois de o alterar). O URL pode ser colado com ou sem `https://` e `/v4`.
- Se os jogos não aparecerem, use **Administração → Casino → Testar ligação**: verifica a configuração,
  o agente (token, IP autorizado), os fornecedores atribuídos e os jogos, e diz o que falta.
- O catálogo (fornecedores e jogos) é lido da API e guardado em cache durante 1 hora. Fornecedores em
  manutenção aparecem desativados.
- A página do casino carrega os jogos **por blocos** de 24 (botão *Mostrar mais jogos*), com pesquisa,
  categorias e fornecedores filtrados no servidor (`/api/casino/games?offset=&limit=&provider=&category=&q=`).
- Os jogos abrem **dentro da ClassicBet** (`#/casino/jogar`), só com o jogo em ecrã embutido; o botão
  "casa" do jogo volta ao casino sem sair da plataforma.
- **Carteira única**: o jogador só tem a carteira ClassicBet. Ao abrir um jogo, o saldo inteiro passa
  automaticamente para o casino (`casino_out`); ao sair do jogo (ou ao voltar ao site, apostar, ver a
  carteira ou levantar) o saldo do casino volta todo para a carteira (`casino_in`). O saldo mostrado é
  sempre carteira + casino. As transferências são feitas uma de cada vez por jogador; o débito é feito
  antes do depósito no casino e devolvido se falhar; se uma resposta se perder, o saldo do casino é
  verificado antes, para nunca creditar duas vezes.
- Os depósitos no casino consomem **pontos do agente**: acompanhe-os em *Administração → Casino*.
- A autoexclusão também bloqueia o casino.
- **Não usamos** a alteração de RTP (`/v4/agent/rtp`, `rtp`/`win_ratio` no arranque do jogo) nem as
  "bonus calls": os jogos correm sempre com o RTP por omissão do fornecedor. Confirme com o agregador
  que os jogos são originais e licenciados para o seu mercado.

## Destaques e Ao Vivo

- **Ordem**: futebol primeiro, depois ténis, basquetebol, hóquei, dardos e CS2; dentro de cada
  desporto, as ligas grandes primeiro (`server/leagues.js`: Liga dos Campeões, Premier League, LaLiga,
  Serie A, Bundesliga, Ligue 1, Liga Portugal…; Grand Slams e Masters; NBA/EuroLeague; NHL; majors
  de dardos e de CS2).
- **Destaques** (página inicial): "Ao Vivo agora" e "Eventos em destaque" são carrosséis na
  horizontal. Entram primeiro os eventos destacados no painel, depois todo o futebol de ligas grandes
  e um evento de cada um dos outros desportos (o de liga maior). Sem futebol de liga grande, entram
  os melhores jogos de futebol que houver.
- **Ténis ao vivo**: em vez do minuto aparece o set (S1, S2, S3…) e, por baixo, o ponto (15, 30,
  40, AD); em cada jogador, sets ganhos, jogos no set e ponto, com quem serve assinalado.

## Página do jogo e mercados

Clicar num jogo (cartão, linha de pré-jogo ou ao vivo) abre `#/jogo/<id>`, uma página só desse jogo:

- **Cabeçalho**: escudos, competição, marcador e minuto ao vivo, ou a data do jogo.
- **Mercados**: Resultado final (1X2), Dupla hipótese, Empate anula aposta, Total de golos
  (mais/menos 0.5–4.5) e Ambas as equipas marcam. Pré-jogo vem das odds de consenso do fornecedor
  (`/odds/` e `/events/{id}/odds/`); em jogo, do WebSocket. Todos são liquidados pelo resultado do
  tempo regulamentar (o "empate anula" devolve a aposta em caso de empate). Numa múltipla só entra uma
  seleção por jogo.
- **Estatísticas**: posse, xG, remates, cantos, faltas, cartões e a cronologia (golos, cartões,
  substituições, VAR), de `/events/{id}/stats/` e `/incidents/`.
- **Minicampo 2D** (por cima do boletim; no telemóvel, por cima dos separadores): relvado com linhas,
  meias-luas, arcos e bandeirolas de canto e balizas com rede; bola oficial com rasto que se desvanece;
  seta de pressão desde a baliza da equipa que ataca até à bola (mais forte em ataque perigoso/canto);
  etiqueta com a equipa e a situação; últimas ações. As coordenadas vêm do WebSocket "a atacar da
  esquerda para a direita" para a equipa com a bola, por isso as da equipa visitante são espelhadas.
- **Ténis**: campo com a bola do lado de quem serve (lado dos pares/ímpares conforme os pontos do
  jogo) e os sets. A API de ténis não envia posição da bola, só pontos e serviço.

- **Confrontos (H2H)**: vitórias, empates e golos entre as duas equipas e os últimos jogos (com o
  resultado do ponto de vista da equipa da casa), de `/events/{id}/h2h/`.
- **Previsão**: probabilidades do modelo do fornecedor (1X2, golos esperados, mais/menos, ambas
  marcam, resultado mais provável), de `/events/{id}/prediction/`.
- **Classificação**: tabela da época atual (`/leagues/{id}/season/` → `/standings/`), com as duas
  equipas destacadas e as zonas de apuramento/descida; em competições por grupos mostra o grupo delas.

Estes dados aparecem antes e durante o jogo e ficam em cache 10 minutos.

O servidor reencaminha o WebSocket para o navegador em tempo real por Server-Sent Events
(`/api/events/<id>/live`); sem WebSocket, a página atualiza a cada 5 s.

## Liquidação de mercados

Todos os mercados são liquidados pelo resultado do tempo regulamentar:

| Situação | O que acontece |
|---|---|
| Jogo termina (dados ao vivo ou resultado no painel) | Todas as seleções são resolvidas (ganha / perde / anulada — "empate anula" num empate); múltiplas pagam o produto das odds das pernas ganhas, pernas anuladas contam 1.00 |
| Jogo cancelado ou abandonado | Apostas anuladas e montantes devolvidos |
| Jogo adiado | Mercado suspenso; se não tiver nova data em `POSTPONED_VOID_HOURS` (48 h), é anulado automaticamente |
| Evento terminado com apostas ainda em aberto | O motor de liquidação (corre a cada minuto) liquida-as — rede de segurança |

Em **Administração → Liquidação** vê as apostas em aberto, a responsabilidade máxima, o que foi pago e a
margem do dia, e a fila de eventos que precisam de decisão (ao vivo há mais de 4 h, atrasados sem
resultado, adiados). Pode liquidar com um resultado, anular com motivo ou executar a liquidação na hora.
Cada liquidação fica registada (tabela `settlements`) com a origem — dados ao vivo, automático ou o
administrador que a fez.

## Estrutura

```
server/
  index.js      arranque do servidor
  app.js        rotas da API (auth, conta, carteira, apostas, admin) e ficheiros estáticos
  betting.js    colocação de apostas e liquidação
  settlement.js motor de liquidação (rede de segurança, adiados, fila para o operador)
  markets.js    mercados disponíveis e regras de liquidação
  feed.js       importação de futebol real (jogos, odds, ao vivo, resultados)
  livews.js     WebSocket ao vivo (odds e marcador em jogo)
  tennis.js     importação de ténis ATP/WTA (encontros, odds, resultados, H2H, previsões, ranking)
  sports.js     basquetebol, hóquei no gelo, dardos e CS2 (Sports Addon)
  casino.js     casino (agregador Agent API v4, modo Transfer)
  wallet.js     movimentos de saldo (ledger)
  db.js         esquema SQLite
  seed.js       administrador inicial e eventos de exemplo
  security.js   hash de palavras-passe (scrypt), sessões, limites de pedidos
  config.js     configuração por variáveis de ambiente
public/         frontend (HTML, CSS e JavaScript sem build)
test/           testes da API (node:test)
```

Todo o dinheiro é guardado em cêntimos inteiros e as odds em centésimas, para evitar erros de
arredondamento. Cada alteração de saldo fica registada na tabela `transactions`.

## Segurança

- Palavras-passe com scrypt e sal; sessões com token aleatório guardado apenas como hash.
- Cookie `httpOnly`, `SameSite=Lax` e `Secure` em produção.
- Proteção CSRF: pedidos que alteram dados têm de ser JSON e vir da mesma origem.
- Content-Security-Policy restritiva, limite de tentativas de login e registo.

## Antes de operar com dinheiro real

O software está pronto a funcionar, mas apostas a dinheiro real exigem, por lei, elementos que não
podem vir no código:

1. **Licença** da entidade reguladora do país onde vai operar (em Portugal, o SRIJ).
2. **Fornecedor de pagamentos** — hoje os depósitos estão em `PAYMENTS_MODE=demo` (creditados sem
   dinheiro real). Integre o fornecedor em `POST /api/wallet/deposit` e use `PAYMENTS_MODE=disabled`
   até lá. Os levantamentos já funcionam como pedidos que o administrador aprova após fazer a
   transferência.
3. **Verificação de identidade (KYC)** e limites de depósito exigidos pelo regulador.
4. **Fonte de odds e resultados** — o feed de futebol acima cobre jogos, odds pré-jogo e resultados;
   para odds ao vivo ou outros desportos é preciso um fornecedor adicional (ou gestão manual no painel).
5. **Fornecedor de casino** licenciado — a integração está feita (ver acima); o agregador tem de
   fornecer jogos originais e licenciados para o seu mercado.
6. HTTPS (atrás de um proxy como Nginx/Caddy) e cópias de segurança de `data/`.

## Administração (`/admin`)

O painel de administração é uma página à parte em **`seudominio/admin`** (também `/administrador`),
com login próprio; o site de apostas não o mostra.

- Entra-se com a conta definida por `ADMIN_EMAIL` e `ADMIN_PASSWORD` no servidor: ao arrancar, essa
  conta é criada, ou — se já existir (por exemplo registada no site) — passa a administrador com
  essa palavra-passe. Uma conta que não seja de administrador é recusada no login do painel.
- Secções: Painel (resumo do dia, levantamentos pendentes), Eventos, Liquidação, Apostas,
  Levantamentos, Utilizadores, Novo evento, Dados ao vivo e Casino.

## Frequência de atualização

| O quê | Intervalo | Variável |
|---|---|---|
| Placar e odds ao vivo (servidor ⇄ fornecedor) | 5 s (futebol e ténis com WebSocket: instantâneo) | `LIVE_POLL_SECONDS` |
| Odds pré-jogo de cada jogo | 60 s (30 s na última hora) | `PREMATCH_ODDS_SECONDS` |
| Importação de jogos / resultados | 10 min / 2 min | — |
| Páginas no navegador (listas, jogo, saldo no casino) | 5 s | — |

Cada ciclo tem o seu próprio bloqueio, por isso uma importação demorada não atrasa o placar ao vivo.

## Catálogo de mercados (admin)

Em **/admin → Catálogo de mercados**, "Consultar a API agora" pega numa amostra de jogos reais de cada
desporto (pré-jogo e ao vivo), lê as odds que o fornecedor devolve e lista, por desporto: tipo de mercado,
família, período, linhas, seleções, número de casas e em quantos jogos aparece, marcando os que a
Bet62 já oferece. "Copiar resultado (JSON)" exporta a tabela. Serve para decidir que mercados ligar
com base no que a API entrega de facto (a cobertura varia por liga).
