# 🏠 Homelink – Real Estate Liquidity Network

> Graph-powered real estate marketplace that detects multi-party transaction chains between property owners.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    HOMELINK PLATFORM                     │
├──────────────┬──────────────┬──────────────┬────────────┤
│  Next.js 14  │  Node.js API │  Neo4j Graph │ PostgreSQL │
│  Frontend    │  (Express)   │  Engine      │  Database  │
├──────────────┴──────────────┴──────────────┴────────────┤
│           Redis (Cache + Queue)  │  MinIO (Storage)     │
└─────────────────────────────────────────────────────────┘
```

## Modules

| Module | Description |
|--------|-------------|
| **Auth** | Email/password + Google OAuth, JWT refresh tokens, role-based access |
| **Marketplace** | Property listings, photo uploads, buying preferences |
| **Graph Engine** | Edge scoring between properties via Neo4j |
| **Chain Matching** | Cycle detection (2–5 parties), runs every 2 minutes |
| **Dynamic Price Bridge** | Financial balancing across participants |
| **CPS Scoring** | Chain Probability Score (0–1), min 0.60 to create opportunity |
| **Opportunity Queue** | Admin-reviewed chains, broker assignment |
| **Heatmap** | Geographic liquidity visualization |
| **Admin Dashboard** | Full platform control center |

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 20+
- Google OAuth credentials (optional)

### 1. Clone & configure

```bash
git clone <repo>
cd homelink
cp .env.example .env
# Edit .env with your credentials
```

### 2. Start infrastructure

```bash
docker-compose up -d postgres redis neo4j minio
```

### 3. Setup backend

```bash
cd backend
npm install
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

### 4. Setup frontend

```bash
cd frontend
npm install
npm run dev
```

### 5. Access

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:3001 |
| Neo4j Browser | http://localhost:7474 |
| MinIO Console | http://localhost:9001 |

### Seed Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@homelink.com | Admin@1234! |
| Broker | broker@homelink.com | Broker@1234! |
| Owner | rodrigo@example.com | User@1234! |

---

## API Reference

### Auth
```
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
GET  /api/v1/auth/me
GET  /api/v1/auth/google
```

### Properties
```
GET    /api/v1/properties
GET    /api/v1/properties/:id
POST   /api/v1/properties
PATCH  /api/v1/properties/:id
DELETE /api/v1/properties/:id
POST   /api/v1/properties/:id/images
POST   /api/v1/properties/import        (CSV bulk import)
```

### Buying Preferences
```
GET    /api/v1/preferences
POST   /api/v1/preferences
PATCH  /api/v1/preferences/:id
DELETE /api/v1/preferences/:id
```

### Chains (Admin)
```
GET    /api/v1/chains
GET    /api/v1/chains/:id
PATCH  /api/v1/chains/:id/approve
PATCH  /api/v1/chains/:id/reject
PATCH  /api/v1/chains/:id/assign-broker
POST   /api/v1/chains/trigger-run
```

### Admin
```
GET    /api/v1/admin/metrics
GET    /api/v1/admin/users
GET    /api/v1/admin/brokers
PATCH  /api/v1/admin/brokers/:id/approve
PATCH  /api/v1/admin/brokers/:id/suspend
GET    /api/v1/admin/agencies
GET    /api/v1/admin/engine/runs
```

### Heatmap
```
GET  /api/v1/heatmap
POST /api/v1/heatmap/recompute
```

---

## Chain Probability Score (CPS)

```
CPS = 0.30 × PriceScore
    + 0.25 × PreferenceScore
    + 0.20 × UserCommitment
    + 0.15 × LiquidityScore
    + 0.10 × StabilityScore

Minimum to generate opportunity: CPS ≥ 0.60
```

## Performance Targets

- 100,000+ properties
- Millions of graph edges
- Matching cycle: 2 minutes (configurable)
- Chain sizes: 2–5 participants
- Heatmap refresh: 10 minutes

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, Framer Motion |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL 16 + Prisma ORM |
| Graph | Neo4j 5 (GDS Plugin) |
| Queue | Bull (Redis-backed) |
| Cache | Redis 7 |
| Storage | MinIO (S3-compatible) |
| Real-time | Socket.io |
| Auth | JWT + Google OAuth 2.0 |

---

## Folder Structure

```
homelink/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # Full data model
│   │   └── seed.ts             # Sample data
│   └── src/
│       ├── auth/               # Auth service + routes
│       ├── marketplace/        # Property + preferences
│       ├── graph/              # Edge builder (Neo4j)
│       ├── matching/           # Chain detection + CPS
│       ├── admin/              # Admin control center
│       ├── broker/             # Broker management
│       ├── heatmap/            # Liquidity heatmap
│       ├── notifications/      # Notification system
│       └── common/             # DB, middleware, utils
└── frontend/
    └── src/
        ├── app/
        │   ├── page.tsx        # Landing page
        │   ├── auth/           # Login + register
        │   ├── admin/          # Admin dashboard
        │   ├── dashboard/      # Owner dashboard
        │   └── marketplace/    # Property listings
        ├── lib/api.ts          # Typed API client
        └── store/              # Zustand state
```
