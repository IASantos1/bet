# BET62 — Especificação Completa do Sistema de Produção

**Plataforma de Apostas Desportivas com Dinheiro Real**

| | |
| :--- | :--- |
| **Projeto** | BET62 |
| **Tipo** | Sportsbook / Betting Platform |
| **Ambiente** | Produção Real |
| **Arquitetura** | Modular, distribuída e orientada a eventos |
| **Moeda principal** | EUR (€) |
| **Mercado principal** | Portugal / União Europeia, sujeito ao licenciamento e requisitos regulatórios aplicáveis |
| **Objetivo** | Construir uma casa de apostas desportivas robusta, auditável, segura e escalável, com arquitetura de nível profissional |

Este documento é a especificação de referência para a evolução da BET62 de aplicação de apostas para infraestrutura de sportsbook de produção. Serve como norte arquitetural para todos os módulos descritos abaixo — não descreve necessariamente o estado atual implementado do repositório, mas o alvo a atingir, faseado conforme a secção 85 (Ordem de Implementação).

---

## 1. Objetivo do Sistema

A BET62 deverá ser uma plataforma completa de apostas desportivas capaz de operar:

contas de utilizadores, autenticação, KYC, AML, gestão de risco, depósitos, levantamentos, carteira financeira, ledger de dupla entrada, sportsbook pré-jogo, sportsbook live, odds, mercados, boletim de apostas, apostas simples, múltiplas, apostas combinadas, cash out, suspensão automática de mercados, liquidação automática, re-liquidação, apostas anuladas, bónus, promoções, limites, antifraude, reconciliação financeira, backoffice, trading, auditoria, notificações, relatórios, WebSocket, monitorização, disaster recovery.

O sistema não deverá ser desenvolvido como uma aplicação demonstrativa ou protótipo. Todos os módulos deverão ser concebidos para utilização em produção, com controlo de concorrência, idempotência, auditoria, segurança e consistência financeira.

---

## 2. Princípio Fundamental

O saldo do utilizador nunca deverá ser tratado como um simples número alterado diretamente pela aplicação.

A BET62 deverá utilizar:

> **Wallet + Double-Entry Ledger + Transaction Engine**

O saldo apresentado ao utilizador deverá ser uma consequência dos lançamentos financeiros registados no ledger.

Nenhum serviço poderá simplesmente executar:

```
balance = balance - stake
```

ou:

```
balance = balance + payout
```

sem criar a respetiva transação financeira.

---

## 3. Arquitetura Geral

```
                         BET62
                           |
                    CDN / WAF / TLS
                           |
                     Load Balancer
                           |
                      API Gateway
                           |
       +-------------------+-------------------+
       |                   |                   |
   ACCOUNT SERVICE    SPORTSBOOK SERVICE   WALLET SERVICE
       |                   |                   |
       |               ODDS ENGINE        LEDGER ENGINE
       |                   |                   |
    KYC / AML          RISK ENGINE         PAYMENT ENGINE
       |                   |                   |
    FRAUD ENGINE       BET ENGINE          PSP CONNECTORS
                           |
                    SETTLEMENT ENGINE
                           |
                     CASHOUT ENGINE
                           |
                       EVENT BUS
                           |
          +----------------+----------------+
          |                |                |
      Sport Feed       Notifications    Analytics
          |
      SportMonks
          |
    Football Live
          |
     Tracker Engine
          |
       WebSocket
          |
       Frontend
```

---

## 4. Principais Serviços

A arquitetura deverá ser dividida nos seguintes domínios:

1. Identity Service
2. User Account Service
3. KYC Service
4. AML Service
5. Fraud Service
6. Wallet Service
7. Ledger Service
8. Payment Service
9. Sportsbook Service
10. Event Service
11. Market Service
12. Odds Service
13. Risk Service
14. Betting Service
15. Settlement Service
16. Cashout Service
17. Bonus Service
18. Notification Service
19. Backoffice Service
20. Trading Service
21. Audit Service
22. Reporting Service
23. Analytics Service
24. Configuration Service
25. WebSocket Gateway
26. Feed Integration Service

---

## 5. Identity Service

Responsável por: registo, login, logout, recuperação de conta, alteração de password, 2FA, sessões, dispositivos, tokens, refresh tokens, controlo de sessões simultâneas, deteção de login suspeito.

Estrutura:

```
users
user_credentials
sessions
refresh_tokens
user_devices
login_attempts
security_events
```

Passwords nunca deverão ser armazenadas em texto simples.

---

## 6. User Account Service

Cada conta deverá possuir:

```
user_id
username
email
phone
country
currency
account_status
kyc_status
aml_status
risk_status
vip_level
created_at
updated_at
```

Estados:

```
ACTIVE
PENDING
SUSPENDED
LOCKED
SELF_EXCLUDED
KYC_PENDING
KYC_REVIEW
KYC_REJECTED
CLOSED
```

---

## 7. Wallet Service

Cada utilizador deverá possuir uma carteira.

A carteira deverá separar:

```
AVAILABLE
RESERVED
BONUS
PENDING_WITHDRAWAL
```

Exemplo:

```
Available:          €500
Reserved:           €100
Bonus:               €50
Pending Withdrawal: €200
```

O sistema deverá manter claramente a diferença entre saldo disponível, saldo reservado, saldo de bónus e saldo pendente.

---

## 8. Ledger Financeiro

O Ledger deverá ser imutável.

Cada operação financeira deverá gerar uma ou mais entradas.

Exemplo de depósito:

```
PAYMENT_PROVIDER       +€100
PLAYER_WALLET          +€100
```

Aposta:

```
PLAYER_AVAILABLE       -€20
PLAYER_RESERVED        +€20
```

Aposta perdida:

```
PLAYER_RESERVED        -€20
HOUSE_REVENUE          +€20
```

Aposta ganha:

```
PLAYER_RESERVED        -€20
PLAYER_WALLET          +€50
HOUSE_LIABILITY        -€50
```

Cada transação deverá possuir:

```
transaction_id
reference_id
user_id
wallet_id
transaction_type
amount
currency
debit_account
credit_account
status
created_at
completed_at
metadata
```

---

## 9. Idempotência Financeira

Todos os pagamentos e operações financeiras deverão possuir uma chave de idempotência.

Exemplo: `provider_transaction_id` ou `idempotency_key`.

Se o mesmo webhook for recebido duas ou dez vezes, o sistema deverá processá-lo apenas uma vez.

Nunca deverá existir possibilidade de:

```
€100 depositados
+
€100 duplicados
=
€200
```

por causa de repetição de webhook.

---

## 10. Depósitos

Fluxo:

```
USER
 |
 | Deposit €100
 v
BET62 PAYMENT API
 |
 v
PAYMENT ORCHESTRATOR
 |
 +--> PSP A
 +--> PSP B
 +--> Bank
 +--> Other licensed provider
 |
 v
WEBHOOK
 |
 v
PAYMENT VALIDATOR
 |
 v
IDEMPOTENCY CHECK
 |
 v
LEDGER
 |
 v
WALLET
 |
 v
DEPOSIT CONFIRMED
```

Estados:

```
CREATED
PENDING
PROCESSING
COMPLETED
FAILED
CANCELLED
REVERSED
CHARGEBACK
```

---

## 11. Payment Orchestrator

O sistema de pagamentos deverá ser independente do frontend.

O frontend nunca deverá comunicar diretamente com o PSP para determinar o saldo.

Arquitetura:

```
Payment Orchestrator
 |
 +-- Provider A
 +-- Provider B
 +-- Provider C
 +-- Bank Transfer
 +-- Other approved PSP
```

O Orchestrator deverá permitir: routing, fallback, retry controlado, timeout, idempotência, webhook verification, reconciliação, provider health check.

---

## 12. Levantamentos

Fluxo:

```
USER
 |
 v
WITHDRAWAL REQUEST
 |
 v
BALANCE CHECK
 |
 v
KYC CHECK
 |
 v
AML CHECK
 |
 v
FRAUD CHECK
 |
 v
PAYMENT OWNERSHIP CHECK
 |
 v
RISK REVIEW
 |
 v
APPROVAL
 |
 v
PAYMENT PROVIDER
 |
 v
CONFIRMATION
 |
 v
LEDGER
 |
 v
WALLET
```

Estados:

```
REQUESTED
PENDING_REVIEW
APPROVED
PROCESSING
PAID
FAILED
REJECTED
CANCELLED
```

---

## 13. Sportsbook

O sportsbook deverá separar:

```
SPORT
COMPETITION
EVENT
PARTICIPANT
MARKET
SELECTION
ODDS
```

Exemplo:

```
Football
 |
Liga
 |
Match
 |
Match Winner
 |
 +-- Home
 +-- Draw
 +-- Away
```

---

## 14. Feed Engine

A BET62 deverá possuir uma camada própria de normalização de feeds.

Para futebol, o fornecedor principal deverá ser integrado através de uma camada de integração dedicada.

```
SPORT FEED
 |
 v
CONNECTOR
 |
 v
NORMALIZER
 |
 v
EVENT MAPPER
 |
 v
MARKET MAPPER
 |
 v
LIVE STATE
 |
 v
ODDS ENGINE
```

A aplicação nunca deverá depender diretamente do formato proprietário do fornecedor.

---

## 15. Event Mapping

Dois fornecedores podem identificar o mesmo evento de maneiras diferentes.

O sistema deverá criar `BET62_EVENT_ID` e mapear:

```
provider
provider_event_id
bet62_event_id
```

Da mesma forma: `provider_market_id` → `BET62_MARKET_ID`, e `provider_selection_id` → `BET62_SELECTION_ID`.

---

## 16. Odds Engine

O Odds Engine deverá receber:

```
feed_probability
market_state
margin
risk
exposure
limits
```

e produzir `BET62_ODDS`.

Cada odd deverá possuir:

```
odd_id
event_id
market_id
selection_id
price
status
version
timestamp
```

---

## 17. Versionamento de Odds

Toda alteração de odd deverá incrementar a versão.

Exemplo:

```
Version 101
Home = 2.10
Version 102
Home = 2.05
Version 103
Home = 1.95
```

Quando uma aposta chega (`bet request` + `odd version`), o Betting Engine deverá validar se o preço ainda é aceitável.

Se não for: `PRICE_CHANGED` ou `BET_REJECTED`, conforme a política configurada.

---

## 18. Live Engine

O Live Engine deverá processar: score, clock, period, goals, cards, substitutions, corners, incidents, market states.

Arquitetura:

```
SPORT FEED
 |
 v
LIVE INGESTION
 |
 v
LIVE STATE ENGINE
 |
 +--> SCORE
 +--> CLOCK
 +--> INCIDENTS
 +--> MARKET STATE
 |
 v
ODDS ENGINE
 |
 v
WEBSOCKET
 |
 v
BET62 FRONTEND
```

---

## 19. Market Suspension Engine

Eventos críticos deverão provocar suspensão automática.

Exemplo: `GOAL`, `RED CARD`, `PENALTY`, `VAR`, `MATCH END`, `FEED LOST`.

Fluxo:

```
INCIDENT
 |
 v
SUSPEND
 |
 v
UPDATE EVENT STATE
 |
 v
RECALCULATE
 |
 v
RISK CHECK
 |
 v
REOPEN
```

Nunca deverá depender exclusivamente de uma ação manual do trader.

---

## 20. Betting Engine

O Betting Engine é responsável por aceitar ou rejeitar apostas.

Fluxo:

```
BETSLIP
 |
 v
BET REQUEST
 |
 v
AUTHORIZATION
 |
 v
BALANCE CHECK
 |
 v
MARKET CHECK
 |
 v
ODDS CHECK
 |
 v
LIMIT CHECK
 |
 v
RISK CHECK
 |
 v
CORRELATION CHECK
 |
 v
WALLET RESERVATION
 |
 v
BET CREATION
 |
 v
BET ACCEPTED
```

---

## 21. Atomic Bet Transaction

A criação da aposta e a reserva do dinheiro deverão ser tratadas como operação atómica.

Não pode acontecer "bet criada + dinheiro não reservado" nem "dinheiro reservado + bet não criada". Caso uma das operações falhe, a transação deverá ser revertida de forma segura.

---

## 22. Bet Ticket

Cada aposta deverá possuir:

```
bet_id
user_id
stake
total_odds
potential_payout
currency
bet_type
status
created_at
accepted_at
settled_at
```

Cada seleção:

```
bet_leg_id
event_id
market_id
selection_id
odds
odds_version
status
result
```

---

## 23. Bet Types

A plataforma deverá suportar: `SINGLE`, `DOUBLE`, `TREBLE`, `MULTIPLE`, `SYSTEM`, `COMBINED`, `BET BUILDER`, `LIVE`, `PREMATCH`.

---

## 24. Correlation Engine

O sistema deverá impedir combinações inválidas ou altamente correlacionadas quando as regras comerciais não permitirem.

Exemplo: `Team wins` + `Team -1` + `Team scores over 2.5`.

O sistema deverá determinar: `ALLOWED`, `REJECTED`, `REPRICE`.

---

## 25. Risk Engine

O Risk Engine deverá controlar: player exposure, event exposure, market exposure, selection exposure, league exposure, sport exposure, global liability.

Exemplo:

```
Event Liability: €50,000
Market Liability: €20,000
Selection Liability: €12,000
```

Se o limite for ultrapassado: `reduce limit`, `reprice`, `suspend`, `reject`.

---

## 26. Player Limit Engine

Limites configuráveis: minimum stake, maximum stake, maximum payout, daily stake, daily payout, live stake, market stake, event stake.

Os limites deverão ser aplicados no backend. Nunca confiar apenas no frontend.

---

## 27. Settlement Engine

O Settlement Engine será responsável pela liquidação oficial.

Fluxo:

```
OFFICIAL RESULT
 |
 v
RESULT VALIDATOR
 |
 v
MARKET RESOLVER
 |
 v
BET RESOLVER
 |
 v
PAYOUT CALCULATOR
 |
 v
LEDGER
 |
 v
WALLET
 |
 v
NOTIFICATION
```

---

## 28. Market Resolution

Cada mercado deverá possuir uma regra determinística de resolução.

Exemplo:

```
MATCH_WINNER
HOME -> WON quando Home > Away
DRAW -> WON quando Home = Away
AWAY -> WON quando Away > Home
```

O código de resolução deverá ser testável independentemente da interface.

---

## 29. Settlement States

```
PENDING
PROCESSING
SETTLED
VOID
PARTIALLY_SETTLED
REQUIRES_REVIEW
RESETTLEMENT
```

---

## 30. Void

Quando um mercado for anulado:

```
BET
 |
 v
VOID
 |
 v
RELEASE RESERVE
 |
 v
RETURN STAKE
```

O lançamento deverá permanecer no ledger. Nunca apagar a operação original.

---

## 31. Re-settlement

Se o resultado oficial for corrigido:

```
ORIGINAL SETTLEMENT
        |
        v
CORRECTED RESULT
        |
        v
RESETTLEMENT
```

A operação anterior nunca deverá ser eliminada. Deverá existir:

```
settlement_id
original_settlement_id
correction_id
reason
old_result
new_result
```

---

## 32. Asian Handicap

O Settlement Engine deverá suportar: `0`, `0.25`, `0.50`, `0.75`, `1.00`, `1.25`, ...

Handicaps fracionados deverão dividir a stake internamente quando necessário.

---

## 33. Cash Out

O Cash Out deverá possuir serviço próprio.

```
BET
 |
 v
CURRENT EVENT STATE
 |
 v
CURRENT ODDS
 |
 v
RISK ENGINE
 |
 v
CASHOUT PRICE
 |
 v
USER ACCEPTS
 |
 v
BET CASHED OUT
 |
 v
LEDGER
```

O Cash Out deverá ser recalculado continuamente de acordo com: current price, market state, event state, liability, risk, stake, remaining potential payout.

---

## 34. Bonus Engine

Bónus deverão possuir carteira lógica separada.

Tipos: `WELCOME`, `DEPOSIT BONUS`, `FREE BET`, `CASHBACK`, `ODDS BOOST`, `VIP`, `PROMOTIONAL`.

Cada promoção deverá definir:

```
campaign_id
eligibility
minimum_deposit
maximum_bonus
wagering_requirement
eligible_markets
minimum_odds
expiry
max_conversion
```

As regras deverão ser explícitas para o utilizador e compatíveis com os requisitos legais aplicáveis.

---

## 35. KYC

O KYC deverá verificar, conforme os requisitos aplicáveis: identity, age, document, address, account ownership.

Estados:

```
NOT_STARTED
PENDING
IN_REVIEW
VERIFIED
REJECTED
EXPIRED
```

---

## 36. AML

O sistema deverá monitorizar transações e comportamento financeiro.

Indicadores: deposit velocity, withdrawal velocity, deposit/withdrawal ratio, multiple accounts, unusual transaction patterns, payment method mismatch, rapid deposit/withdrawal activity.

Casos suspeitos deverão ser encaminhados para revisão conforme os procedimentos internos e obrigações legais aplicáveis.

---

## 37. Fraud Engine

O Fraud Engine deverá analisar: IP, device, session, account relationships, payment methods, login behaviour, betting behaviour, transaction behaviour.

Deverá produzir `risk_score`. Exemplo:

```
0-20   LOW
21-50  MEDIUM
51-80  HIGH
81-100 CRITICAL
```

Os thresholds reais deverão ser configuráveis e validados operacionalmente.

---

## 38. Responsible Gambling

A plataforma deverá possuir mecanismos de: deposit limits, loss limits, stake limits, session controls, self-exclusion, cool-off, reality checks, account closure.

Esses mecanismos deverão ser tratados como controles de backend, não apenas elementos de interface.

---

## 39. Backoffice

O Backoffice deverá possuir controlo de acesso baseado em funções.

Exemplo: `SUPER_ADMIN`, `ADMIN`, `TRADER`, `RISK_MANAGER`, `FINANCE`, `KYC_OPERATOR`, `AML_OPERATOR`, `SUPPORT`, `AUDITOR`.

Cada função deverá possuir permissões específicas.

---

## 40. Trading Desk

O Trader deverá poder visualizar: live events, prematch events, markets, odds, liability, exposure, suspensions, feed status.

Operações possíveis: suspend market, open market, change margin, change limits, override price, void market.

Operações críticas deverão exigir: `reason`, `operator_id`, `timestamp`, `audit_id`.

---

## 41. Audit Log

Todas as ações administrativas deverão ser registadas.

Exemplo:

```
audit_id
operator_id
action
resource_type
resource_id
old_value
new_value
reason
ip
timestamp
```

Nenhum administrador deverá conseguir apagar o histórico de auditoria através da interface normal.

---

## 42. Notification Service

Eventos: `DEPOSIT_COMPLETED`, `WITHDRAWAL_APPROVED`, `BET_ACCEPTED`, `BET_REJECTED`, `BET_WON`, `BET_LOST`, `CASHOUT_COMPLETED`, `KYC_APPROVED`, `BONUS_GRANTED`, `SECURITY_ALERT`.

Canais: WebSocket, Push, Email, SMS, In-App.

---

## 43. WebSocket

O WebSocket Gateway deverá transmitir: `ODDS_UPDATE`, `MARKET_SUSPENDED`, `MARKET_OPENED`, `SCORE_UPDATE`, `CLOCK_UPDATE`, `INCIDENT`, `BET_ACCEPTED`, `BET_REJECTED`, `BALANCE_UPDATE`, `SETTLEMENT_UPDATE`.

O cliente não deverá consultar constantemente o banco de dados.

---

## 44. Event Bus

A comunicação assíncrona deverá utilizar um sistema de eventos.

Exemplo: `bet.created`, `bet.accepted`, `bet.rejected`, `market.suspended`, `market.reopened`, `event.goal`, `event.card`, `event.finished`, `settlement.started`, `settlement.completed`, `wallet.reserved`, `wallet.released`, `wallet.credited`, `deposit.completed`, `withdrawal.completed`.

Tecnologias possíveis: Kafka, Redpanda, NATS.

A escolha final deverá considerar volume, operação e requisitos de disponibilidade.

---

## 45. Redis

Redis poderá ser utilizado para: live state, odds cache, sessions, locks, rate limits, temporary calculations, WebSocket state.

Redis não deverá ser considerado a fonte financeira definitiva. A fonte financeira definitiva deverá ser o PostgreSQL/Ledger.

---

## 46. PostgreSQL

PostgreSQL deverá armazenar os dados transacionais principais.

Domínios: users, accounts, wallets, ledger_accounts, ledger_entries, events, markets, selections, odds, bets, bet_legs, bet_selections, settlements, settlement_items, deposits, withdrawals, payments, bonuses, bonus_transactions, risk_limits, risk_exposures, kyc, aml, fraud, audit_logs.

---

## 47. Concorrência

Todas as operações críticas deverão possuir controlo de concorrência. Especialmente: wallet, balance, bet acceptance, withdrawal, cashout, settlement, bonus.

Devem ser utilizadas: database transactions, row locking, optimistic locking, unique constraints, idempotency, versioning, conforme o caso.

---

## 48. Prevenção de Duplicação de Apostas

Se o utilizador clicar `APOSTAR` `APOSTAR` `APOSTAR` rapidamente, o backend deverá impedir múltiplas apostas involuntárias quando o mesmo pedido possuir a mesma chave de idempotência.

---

## 49. Segurança

Toda a plataforma deverá utilizar: TLS, HTTPS, secure cookies, CSRF protection, CORS policy, rate limiting, WAF, DDoS protection, input validation, SQL injection protection, XSS protection, RBAC, 2FA, secret management.

Credenciais de PSP e API nunca deverão ser armazenadas no frontend.

---

## 50. Segredos

Nunca colocar `SPORTMONKS_API_KEY`, `DATABASE_PASSWORD`, `PSP_SECRET`, `JWT_SECRET`, `SESSION_SECRET` no código-fonte.

Utilizar: environment variables, secret manager, encrypted configuration.

---

## 51. Observabilidade

A produção deverá possuir: logs, metrics, traces, alerts, health checks.

Monitorizar: API latency, database latency, WebSocket connections, feed latency, odds latency, bet acceptance latency, settlement latency, payment latency, error rate, CPU, RAM, disk, database connections, queue depth.

---

## 52. Alertas Críticos

Alertar imediatamente quando: Feed offline, Payment provider offline, Settlement failure, Wallet mismatch, Ledger mismatch, Database unavailable, Redis unavailable, Event bus unavailable, High error rate, Abnormal betting volume, Withdrawal spike, Deposit failure spike.

---

## 53. Reconciliation

O sistema deverá possuir reconciliação automática entre: BET62 Ledger, PSP, Bank, Wallet, Deposits, Withdrawals, Settlements, Bonuses.

Deverá produzir relatórios de: matched, unmatched, duplicate, missing, reversed, chargeback.

---

## 54. Accounting

Deverão existir contas internas para: PLAYER FUNDS, PLAYER RESERVED, BONUS LIABILITY, HOUSE REVENUE, PAYMENT FEES, TAXES, CHARGEBACKS, PENDING PAYOUTS.

O modelo contabilístico final deverá ser validado com a contabilidade da operação e os requisitos regulatórios aplicáveis.

---

## 55. Data Integrity

Nenhuma operação crítica deverá ser apagada fisicamente sem um procedimento específico de retenção e conformidade.

Preferir `status changes`, `reversal`, `correction`, `adjustment`, `audit trail` em vez de `DELETE` para operações financeiras.

---

## 56. Disaster Recovery

Produção deverá possuir: automated backups, point-in-time recovery, database replication, backup verification, disaster recovery procedure, restore testing.

Objetivos: RPO configurável, RTO configurável. Os valores finais deverão ser definidos conforme o SLA da BET62.

---

## 57. High Availability

Componentes críticos — API, Database, Redis, Event Bus, WebSocket, Payment Services, Feed Services — não deverão possuir um único ponto de falha quando o volume operacional justificar redundância.

---

## 58. Deployment

Pipeline:

```
Developer
 |
 v
Git
 |
 v
CI
 |
 +--> lint
 +--> typecheck
 +--> unit tests
 +--> integration tests
 +--> security checks
 +--> build
 |
 v
STAGING
 |
 v
E2E
 |
 v
PRODUCTION
```

Deploy deverá possuir: rollback, health check, migration strategy, versioning, release tracking.

---

## 59. Ambientes

Separar: `DEVELOPMENT`, `STAGING`, `PRODUCTION`.

Nunca utilizar produção para testes de pagamentos ou liquidação.

---

## 60. Database Migrations

Todas as alterações estruturais deverão utilizar migrations versionadas.

Exemplo: `001_initial_schema`, `002_wallet`, `003_ledger`, `004_betting`, `005_settlement`, `006_payments`, `007_risk`, `008_bonus`.

Não alterar manualmente a estrutura de produção sem migration controlada.

---

## 61. Testes

A BET62 deverá possuir:

**Unit Tests** — odds, markets, settlement, wallet, ledger, risk, bonus

**Integration Tests** — payment, database, feed, wallet, betting, settlement

**End-to-End** — register, KYC, deposit, bet, settlement, withdrawal

---

## 62. Testes Financeiros

Testar obrigatoriamente: deposit duplicate, withdrawal duplicate, webhook duplicate, double bet, double settlement, resettlement, void, cashout, race condition, negative balance, insufficient balance, concurrent bets.

---

## 63. Teste de Concorrência

Exemplo:

```
Saldo = €100
Request A = aposta €100
Request B = aposta €100
```

O resultado correto não pode ser `saldo = -€100`. Apenas uma operação deverá ser aceite, salvo regras que explicitamente permitam outro comportamento.

---

## 64. Teste de Settlement

Exemplo:

```
Bet:
Stake €100
Odd 2.50
Resultado:
WON
Expected:
Payout €250
Reserve released
Wallet credited
Bet = WON
Settlement = COMPLETED
```

Reexecutar o mesmo settlement deverá produzir `NO DUPLICATE PAYOUT`.

---

## 65. Teste de Depósito

```
Deposit = €100
Webhook #1
Webhook #2
Webhook #3
```

Resultado esperado: `Wallet = +€100` e não `Wallet = +€300`.

---

## 66. Frontend

A BET62 deverá possuir: Home, Sports, Football, Basketball, Tennis, Live, Search, Event Page, Market Page, Bet Slip, My Bets, Wallet, Deposits, Withdrawals, Promotions, Account, KYC, Responsible Gaming, Support.

---

## 67. Betslip

O boletim deverá apresentar: Selection, Event, Market, Odds, Stake, Potential payout, Bet type.

Antes da confirmação: Current odds, Current limit, Potential payout.

Após confirmação: Bet ID, Accepted odds, Stake, Potential payout, Timestamp.

---

## 68. Live Tracker

A BET62 poderá utilizar o Mini Match Tracker para: score, clock, ball position, attacks, incidents, goals, cards.

O tracker deverá ser visualização do estado do evento. Não deverá ser considerado a fonte financeira de verdade.

---

## 69. Fonte da Verdade

A hierarquia deverá ser:

```
FINANCE               → PostgreSQL Ledger
BET                    → Bet Database
SPORT RESULT           → Official Feed / Validated Result
LIVE VISUALIZATION     → Tracker State
CACHE                  → Redis
```

Cache nunca deverá substituir a fonte definitiva.

---

## 70. Latência

Objetivos internos deverão ser definidos por serviço.

Exemplo:

```
API p95 < 300ms
Bet validation p95 < 200ms
Wallet transaction p95 < 300ms
WebSocket odds propagation < 500ms
```

Valores finais deverão ser medidos em produção e ajustados conforme o volume.

A latência do feed externo não poderá ser confundida com a latência da infraestrutura BET62.

---

## 71. Rate Limiting

Aplicar limites em: login, register, deposit, withdrawal, bet, cashout, API, WebSocket, support.

Especialmente: bet endpoint, withdrawal endpoint, login endpoint.

---

## 72. API Versioning

As APIs deverão utilizar versionamento.

Exemplo: `/api/v1/auth`, `/api/v1/users`, `/api/v1/wallet`, `/api/v1/bets`, `/api/v1/events`, `/api/v1/markets`, `/api/v1/payments`.

Alterações incompatíveis deverão criar nova versão.

---

## 73. Documentação

A BET62 deverá possuir: OpenAPI, API documentation, Event documentation, Database documentation, Architecture documentation, Runbooks, Deployment documentation, Incident procedures.

---

## 74. Runbooks

Deverão existir procedimentos para: Feed offline, Payment provider offline, Settlement failure, Database failure, Redis failure, Event bus failure, Wrong result, Wrong odds, Duplicate settlement, Suspicious withdrawals, Security incident, Data recovery.

---

## 75. Suporte

O operador deverá conseguir localizar por IDs: User, Bet, Transaction, Deposit, Withdrawal, Settlement, Payment, Device, Audit trail.

Exemplo: User ID, Bet ID, Transaction ID, Payment ID, Settlement ID.

---

## 76. Identificadores

Todos os domínios deverão possuir IDs únicos.

Exemplo: `user_id`, `wallet_id`, `transaction_id`, `bet_id`, `event_id`, `market_id`, `selection_id`, `settlement_id`, `payment_id`, `withdrawal_id`, `deposit_id`, `audit_id`.

---

## 77. Regra de Ouro do Sistema

Nenhum serviço deverá alterar diretamente dados pertencentes a outro domínio sem passar pela interface/evento apropriado.

Exemplo — correto:

```
Settlement Engine
        |
        v
Wallet Service
        |
        v
Ledger
```

Errado:

```
Settlement Engine
        |
        v
UPDATE wallets SET balance = ...
```

---

## 78. Fluxo Final da Aposta

```
USER
 ↓
FRONTEND
 ↓
API GATEWAY
 ↓
BETTING SERVICE
 ↓
ODDS VALIDATOR
 ↓
MARKET VALIDATOR
 ↓
RISK ENGINE
 ↓
LIMIT ENGINE
 ↓
WALLET RESERVATION
 ↓
LEDGER
 ↓
BET CREATED
 ↓
BET ACCEPTED
 ↓
LIVE/PREMATCH EVENT
 ↓
OFFICIAL RESULT
 ↓
SETTLEMENT ENGINE
 ↓
MARKET RESOLUTION
 ↓
BET RESOLUTION
 ↓
PAYOUT
 ↓
LEDGER
 ↓
WALLET
 ↓
NOTIFICATION
```

---

## 79. Fluxo Financeiro Completo

```
DEPOSIT
 ↓
PAYMENT PROVIDER
 ↓
WEBHOOK
 ↓
PAYMENT VALIDATOR
 ↓
LEDGER
 ↓
WALLET
 ↓
AVAILABLE BALANCE
 ↓
BET RESERVATION
 ↓
SETTLEMENT
 ↓
WIN/LOSS
 ↓
WALLET
 ↓
WITHDRAWAL
 ↓
KYC/AML/FRAUD
 ↓
PAYMENT PROVIDER
 ↓
LEDGER
 ↓
WITHDRAWAL COMPLETED
```

---

## 80. Fluxo de Incidente Live

```
SPORT FEED
 ↓
GOAL
 ↓
LIVE ENGINE
 ↓
EVENT BUS
 ↓
MARKET SUSPENSION
 ↓
ODDS ENGINE
 ↓
NEW EVENT STATE
 ↓
RISK ENGINE
 ↓
NEW ODDS
 ↓
MARKET REOPEN
 ↓
WEBSOCKET
 ↓
BET62 FRONTEND
```

---

## 81. Fluxo de Correção de Resultado

```
OFFICIAL RESULT
 ↓
SETTLEMENT
 ↓
PAYOUT
 ↓
CORRECTED RESULT
 ↓
RESETTLEMENT
 ↓
REVERSAL
 ↓
NEW SETTLEMENT
 ↓
LEDGER
 ↓
WALLET
 ↓
AUDIT
```

---

## 82. Princípios de Produção da BET62

A BET62 deverá obedecer aos seguintes princípios:

1. Nunca confiar no frontend.
2. Nunca alterar saldo diretamente.
3. Nunca processar pagamento sem idempotência.
4. Nunca liquidar duas vezes a mesma aposta.
5. Nunca apagar transações financeiras.
6. Nunca confiar em cache como fonte financeira.
7. Nunca aceitar aposta sem validar odd.
8. Nunca aceitar aposta sem validar saldo.
9. Nunca ignorar exposição de risco.
10. Nunca permitir alteração administrativa sem auditoria.
11. Nunca guardar secrets no frontend.
12. Nunca utilizar produção para testes destrutivos.
13. Nunca depender de um único fornecedor crítico sem estratégia de contingência.
14. Toda operação financeira deve ser rastreável.
15. Toda liquidação deve ser reproduzível.

---

## 83. Stack Recomendada para BET62

Considerando a infraestrutura atual do projeto:

| Camada | Tecnologia |
| :--- | :--- |
| Frontend | Next.js |
| Backend | Node.js / TypeScript |
| Database | PostgreSQL |
| Cache | Redis |
| Event Bus | Kafka / Redpanda / NATS |
| Realtime | WebSocket |
| ORM | Drizzle |
| Analytics | ClickHouse |
| Reverse Proxy | Nginx / equivalente |
| Containers | Docker |
| Process / orchestration | Docker Compose inicialmente, Kubernetes quando a escala justificar |
| CI/CD | GitHub Actions |
| Hosting | Infraestrutura própria + cloud conforme necessidade |
| Monitoring | Prometheus, Grafana, Centralized Logs, Error Tracking |

---

## 84. Estrutura de Repositório

```
BET62/
│
├── apps/
│   ├── web/
│   ├── admin/
│   └── api/
│
├── services/
│   ├── betting/
│   ├── wallet/
│   ├── ledger/
│   ├── settlement/
│   ├── odds/
│   ├── risk/
│   ├── payments/
│   ├── kyc/
│   ├── aml/
│   ├── fraud/
│   ├── notifications/
│   └── feeds/
│
├── packages/
│   ├── types/
│   ├── api-client/
│   ├── validation/
│   ├── database/
│   ├── events/
│   └── config/
│
├── infrastructure/
│   ├── docker/
│   ├── nginx/
│   ├── postgres/
│   ├── redis/
│   └── monitoring/
│
├── migrations/
│
├── tests/
│
└── docs/
```

---

## 85. Ordem de Implementação

A implementação real deverá seguir esta ordem:

- **FASE 1** — Identity, Users, Database, Security
- **FASE 2** — Wallet, Ledger, Transactions
- **FASE 3** — Deposits, Withdrawals, Payment Orchestrator
- **FASE 4** — Sports, Events, Markets, Selections, Feed Integration
- **FASE 5** — Odds Engine, Risk Engine, Limits
- **FASE 6** — Betting Engine, Bet Slip, Bet Tickets
- **FASE 7** — Settlement Engine, Results, Void, Resettlement
- **FASE 8** — Live Engine, Market Suspension, WebSocket
- **FASE 9** — Cash Out
- **FASE 10** — KYC, AML, Fraud, Responsible Gambling
- **FASE 11** — Bonus Engine, Promotions, VIP
- **FASE 12** — Backoffice, Trading Desk, Finance, Reports
- **FASE 13** — Reconciliation, Accounting, Audit
- **FASE 14** — Monitoring, High Availability, Disaster Recovery
- **FASE 15** — Load Testing, Security Testing, Production Certification

---

## 86. Critério de Aceitação para Produção

A BET62 somente deverá ser considerada pronta para dinheiro real quando:

- [ ] Wallet testada
- [ ] Ledger testado
- [ ] Deposit testado
- [ ] Withdrawal testado
- [ ] Idempotência testada
- [ ] Betting testado
- [ ] Settlement testado
- [ ] Resettlement testado
- [ ] Void testado
- [ ] Cashout testado
- [ ] Risk testado
- [ ] KYC integrado
- [ ] AML implementado
- [ ] Fraud implementado
- [ ] Responsible Gambling implementado
- [ ] Audit implementado
- [ ] Reconciliation implementado
- [ ] Backup testado
- [ ] Restore testado
- [ ] Disaster Recovery testado
- [ ] Load Test concluído
- [ ] Security Test concluído
- [ ] Monitoring ativo
- [ ] Alertas ativos
- [ ] Rollback testado
- [ ] Payment reconciliation concluída
- [ ] Feed failover testado
- [ ] Settlement replay testado

---

## 87. Resultado Final

A BET62 deverá funcionar como uma plataforma em que:

```
DINHEIRO   → LEDGER    → WALLET
EVENTO     → ODDS      → BET       → RISK  → RESERVA
RESULTADO  → SETTLEMENT → PAYOUT   → LEDGER → WALLET
WITHDRAWAL → RISK/KYC/AML → PAYMENT → LEDGER
```

O princípio central é:

- O **sportsbook** decide o preço.
- O **Risk Engine** decide o risco.
- O **Betting Engine** decide se a aposta pode ser aceite.
- O **Wallet/Ledger** controla o dinheiro.
- O **Settlement Engine** decide o resultado financeiro da aposta.
- O **Payment Engine** movimenta dinheiro entre a BET62 e o sistema de pagamentos.
- O **Audit Engine** regista tudo.

Essa separação é o que permite que a BET62 evolua de uma aplicação de apostas para uma infraestrutura de sportsbook real, mantendo consistência financeira, rastreabilidade e capacidade de escala.
