# ClassicBet

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
| Desporto | Eventos pré-jogo e ao vivo por desporto e competição, pesquisa, resultados, odds atualizadas a cada 10 s |
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
| WebSocket | tempo real | Odds 1X2 em jogo e marcador (addon pago). Cada golo fecha o mercado até chegar a odd seguinte; sem odd ao vivo recente (`LIVE_ODDS_MAX_AGE_SECONDS`, 180 s) não se aceitam apostas em jogo. Sem o addon, os jogos em curso ficam só com marcador |
| Resultados | 2 min | Quando o jogo termina, grava o resultado do tempo regulamentar e liquida as apostas; jogos cancelados/abandonados são anulados e reembolsados; adiados ficam suspensos até terem nova data |

Com uma chave Football Unlimited o feed `/odds/` traz o preço de cada casa de apostas: a plataforma usa
a média entre elas (numa chave gratuita, o consenso do próprio fornecedor).

Jogos importados só aparecem aos jogadores depois de terem odds. Os escudos dos clubes vêm do proxy de imagens do fornecedor (sem token); quando não há escudo, mostram-se as iniciais. O estado do feed (última execução,
erros, eventos importados) e um botão **Sincronizar agora** estão em *Administração → Dados ao vivo*.
Os eventos criados manualmente no painel continuam a funcionar em paralelo.

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
- **Tracker**: campo 2D com a posição da bola, a situação de jogo (ataque, ataque perigoso, canto…) e
  as ações recentes, a partir das mensagens `livedata` e `action` do WebSocket.

O servidor reencaminha o WebSocket para o navegador em tempo real por Server-Sent Events
(`/api/events/<id>/live`); sem WebSocket, a página atualiza a cada 15 s.

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
