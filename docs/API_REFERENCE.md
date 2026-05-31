# API Reference (Bet62)

This document outlines the API structure and key endpoints for the Bet62 platform.
Base URL: `https://api.bet62.com` (Production) / `http://localhost:8787` (Local)

## Authentication
Most endpoints require Bearer Token authentication via the `Authorization` header.
Tokens are obtained via `/api/auth/signin`.

---

## 1. Authentication (`/api/auth`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/signin` | Login with username/password | No |
| `POST` | `/signup` | Register new user | No |
| `POST` | `/refresh` | Refresh access token | Yes (Refresh Token) |
| `POST` | `/logout` | Invalidate session | Yes |

## 2. User & Profile (`/api/users`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/profile` | Get current user profile | Yes |
| `PUT` | `/profile` | Update profile details | Yes |
| `GET` | `/iban` | Check verified IBAN status | Yes |
| `POST` | `/iban` | Submit IBAN for verification | Yes |
| `GET` | `/transactions` | List wallet transactions | Yes |

## 3. Wallet & Payments (`/api/wallet`, `/api/deposits`, `/api/withdrawals`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/wallet/balance` | Get current balance | Yes |
| `POST` | `/api/deposits/mbway` | Initiate MBWAY deposit | Yes |
| `POST` | `/api/withdrawals` | Request withdrawal | Yes |
| `POST` | `/api/webhooks/ifthenpay` | Webhook for payment callbacks | No (Signature Check) |

## 4. Betting (`/api/bets`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/place` | Place a new bet (Single/Multiple) | Yes |
| `GET` | `/history` | Get bet history | Yes |
| `POST` | `/cashout` | Cashout an active bet | Yes |

## 5. Sports & Odds (`/api/sports`, `/api/live`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/live/stream` | SSE Stream for live odds | No |
| `GET` | `/api/sports/:sport/events` | List events for a sport | No |
| `GET` | `/api/sports/event/:id` | Get detailed event odds | No |

## 6. Admin (`/api/admin`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/users` | List all users | Yes (Admin) |
| `GET` | `/risk/exposure` | View market exposure | Yes (Admin) |
| `GET` | `/withdrawals` | Manage pending withdrawals | Yes (Admin) |
| `POST` | `/withdrawals/:id/approve`| Approve withdrawal | Yes (Admin) |

## 7. Integrations (Third-Party)
| Service | Status | Endpoints |
| :--- | :--- | :--- |
| **Banxa** | Sandbox | `/api/banxa/quotes`, `/api/banxa/orders` |
| **Fireblocks** | Active | `/api/fireblocks/vaults` |
| **Nuvei** | Test/Prod | `/api/nuvei/session` |

---

## Error Handling
Standard HTTP codes are used:
- `200 OK`: Success
- `400 Bad Request`: Validation error
- `401 Unauthorized`: Invalid/Missing token
- `403 Forbidden`: Insufficient permissions
- `500 Internal Error`: Server-side issue

## Development
To run locally:
```bash
npm run worker
```
