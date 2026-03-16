# Microservices Node.js

Microservices Node.js is a study-driven backend monorepo built to practice the core mechanics behind distributed systems with a deliberately small surface area. It demonstrates service decomposition, asynchronous communication with RabbitMQ, API gateway routing with Kong, container-based local infrastructure, database-per-service separation, OpenTelemetry instrumentation, and infrastructure provisioning with Pulumi on AWS.

This repository is intentionally simple in business scope so the engineering concepts stay easy to inspect:

- Two isolated services with separate databases
- Event-driven communication through RabbitMQ
- API gateway entrypoint with Kong
- Local observability with Jaeger
- AWS deployment structure using Pulumi + ECS Fargate
- Shared message contracts across services

## Project goals

This project was built to learn and reinforce practical microservices concepts such as:

- Service autonomy with independent runtime and persistence
- Synchronous HTTP at the edge and asynchronous messaging internally
- Contract sharing without coupling service internals
- Gateway-based routing for public traffic
- Distributed tracing fundamentals with OpenTelemetry
- Infrastructure as code for containerized deployment

## What this project demonstrates

This repository is less about feature breadth and more about architecture fundamentals:

- `app-orders` exposes the public HTTP API for order creation
- `app-orders` persists orders into its own PostgreSQL database
- `app-orders` publishes an `order-created` event to RabbitMQ
- `app-invoices` subscribes to the same queue and reacts asynchronously
- `contracts` centralizes shared event payload definitions
- `docker-compose.yml` boots the local message broker, Jaeger, and Kong gateway
- `infra` provisions AWS resources for production-style deployment using Pulumi

## Tech stack

- Node.js 22+
- TypeScript 5
- Fastify 5
- Zod
- Drizzle ORM + Drizzle Kit
- PostgreSQL
- RabbitMQ
- Kong Gateway
- OpenTelemetry
- Jaeger
- Docker Compose
- Pulumi
- AWS ECS Fargate

## Architecture

The project follows a small event-driven architecture where the orders service owns the write flow and the invoices service consumes domain events asynchronously.

### High-level flow

```text
Client
  |
  v
Kong API Gateway
  |
  v
Orders Service (HTTP)
  |
  +--> PostgreSQL (orders database)
  |
  `--> RabbitMQ queue: orders
            |
            v
     Invoices Service (subscriber)
            |
            `--> PostgreSQL (invoices database)

Tracing data can be inspected locally through Jaeger.
```

### Repository layout

```text
.
|- app-orders
|  |- src/http
|  |- src/broker
|  |- src/db
|  `- src/tracer
|- app-invoices
|  |- src/http
|  |- src/broker
|  `- src/db
|- contracts
|  `- messages
|- docker
|  `- kong
|- infra
|  `- src
`- docker-compose.yml
```

### Service boundaries

| Component      | Responsibility                                                              |
| -------------- | --------------------------------------------------------------------------- |
| `app-orders`   | Accept HTTP requests, store orders, emit integration events                 |
| `app-invoices` | Consume order events and represent the downstream invoice workflow boundary |
| `contracts`    | Define shared event payload types                                           |
| `docker/kong`  | Configure declarative API gateway routing                                   |
| `infra`        | Provision AWS load balancers, ECS services, RabbitMQ, and container images  |

## Services

### Orders service

The orders service is the public entrypoint of the system.

Current behavior:

- Exposes `GET /health`
- Exposes `POST /orders`
- Validates request body with Zod
- Persists the order into PostgreSQL
- Publishes an `order-created` message to RabbitMQ
- Adds trace metadata for observability experiments

Request example:

```http
POST /orders
Content-Type: application/json

{
  "amount": 150
}
```

Expected result:

- `201 Created`

### Invoices service

The invoices service currently acts as the asynchronous consumer side of the architecture.

Current behavior:

- Exposes `GET /health`
- Subscribes to the `orders` queue on startup
- Reads and acknowledges `order-created` messages
- Keeps an isolated invoices database schema ready for evolution

At the moment, the consumer logs and acknowledges received messages. This keeps the project focused on messaging flow first, with room to evolve into real invoice generation logic next.

## Event contract

The shared event contract currently used between services is:

```ts
interface OrderCreatedMessage {
  orderId: string;
  amount: number;
  customer: {
    id: string;
  };
}
```

This contract lives in [contracts/messages/order-created-message.ts](contracts/messages/order-created-message.ts).

## Data model

### Orders database

`app-orders` owns its own PostgreSQL schema and does not share tables with other services.

Core tables:

- `orders`
- `customers`

Order status values:

- `pending`
- `paid`
- `canceled`

### Invoices database

`app-invoices` uses a separate PostgreSQL database.

Core table:

- `invoices`

This separation is one of the key learning goals of the project: each service keeps its own persistence boundary.

## Local development

### Prerequisites

- Node.js 22+
- Docker and Docker Compose
- A package manager such as `npm` or `pnpm`

### Local infrastructure

The root `docker-compose.yml` starts:

- RabbitMQ with management UI
- Jaeger
- Kong API Gateway

The service folders contain dedicated PostgreSQL compose files:

- `app-orders/docker-compose.yml`
- `app-invoices/docker-compose.yml`

### Exposed local ports

| Component           | URL / Port               |
| ------------------- | ------------------------ |
| Orders service      | `http://localhost:3333`  |
| Invoices service    | `http://localhost:3334`  |
| Kong proxy          | `http://localhost:8000`  |
| Kong admin API      | `http://localhost:8001`  |
| Kong admin UI       | `http://localhost:8002`  |
| RabbitMQ AMQP       | `localhost:5672`         |
| RabbitMQ management | `http://localhost:15672` |
| Jaeger UI           | `http://localhost:16686` |
| Orders PostgreSQL   | `localhost:5482`         |
| Invoices PostgreSQL | `localhost:5483`         |

### Environment variables

### Orders service

| Variable                      | Required | Example                                            | Purpose                                    |
| ----------------------------- | -------- | -------------------------------------------------- | ------------------------------------------ |
| `DATABASE_URL`                | Yes      | `postgresql://docker:docker@localhost:5482/orders` | Orders database connection                 |
| `BROKER_URL`                  | Yes      | `amqp://guest:guest@localhost:5672`                | RabbitMQ connection                        |
| `OTEL_SERVICE_NAME`           | Yes      | `orders`                                           | Name used by the custom tracer             |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No       | `http://localhost:4318`                            | OTLP exporter endpoint when sending traces |
| `OTEL_TRACES_EXPORTER`        | No       | `otlp`                                             | Trace exporter selection                   |
| `OTEL_RESOURCE_ATTRIBUTES`    | No       | `service.name=orders,deployment.environment=local` | Extra trace resource metadata              |

### Invoices service

| Variable                      | Required | Example                                              | Purpose                                      |
| ----------------------------- | -------- | ---------------------------------------------------- | -------------------------------------------- |
| `DATABASE_URL`                | Yes      | `postgresql://docker:docker@localhost:5483/invoices` | Invoices database connection                 |
| `BROKER_URL`                  | Yes      | `amqp://guest:guest@localhost:5672`                  | RabbitMQ connection                          |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No       | `http://localhost:4318`                              | OTLP exporter endpoint                       |
| `OTEL_TRACES_EXPORTER`        | No       | `otlp`                                               | Trace exporter selection                     |
| `OTEL_SERVICE_NAME`           | No       | `invoices`                                           | Recommended service identifier for telemetry |

### Quick start

### 1. Install dependencies

Install dependencies in each runnable package:

```bash
cd app-orders && npm install
cd ../app-invoices && npm install
cd ../infra && npm install
```

### 2. Start infrastructure

From the repository root:

```bash
docker compose up -d
```

Start each PostgreSQL instance:

```bash
cd app-orders && docker compose up -d
cd ../app-invoices && docker compose up -d
```

### 3. Configure environment files

Create `app-orders/.env`:

```env
DATABASE_URL=postgresql://docker:docker@localhost:5482/orders
BROKER_URL=amqp://guest:guest@localhost:5672
OTEL_SERVICE_NAME=orders
OTEL_TRACES_EXPORTER=otlp
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_RESOURCE_ATTRIBUTES=service.name=orders,deployment.environment=local
```

Create `app-invoices/.env`:

```env
DATABASE_URL=postgresql://docker:docker@localhost:5483/invoices
BROKER_URL=amqp://guest:guest@localhost:5672
OTEL_SERVICE_NAME=invoices
OTEL_TRACES_EXPORTER=otlp
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

### 4. Apply database migrations

The project already contains Drizzle migrations under each service. Because `drizzle.config.ts` reads `DATABASE_URL` from the environment, load each `.env` file when running the migration command.

Example:

```bash
cd app-orders
node --env-file=.env ./node_modules/drizzle-kit/bin.cjs migrate

cd ../app-invoices
node --env-file=.env ./node_modules/drizzle-kit/bin.cjs migrate
```

### 5. Run the services

Start invoices first so the consumer is ready:

```bash
cd app-invoices
npm run dev
```

In another terminal, start orders:

```bash
cd app-orders
npm run dev
```

## How to test the flow

### Direct call to the orders service

```bash
curl -X POST http://localhost:3333/orders \
  -H "Content-Type: application/json" \
  -d "{\"amount\":150}"
```

### Through Kong gateway

```bash
curl -X POST http://localhost:8000/orders \
  -H "Content-Type: application/json" \
  -d "{\"amount\":150}"
```

Expected result:

- The orders service returns `201 Created`
- The order is stored in the orders database
- A message is published to the `orders` queue
- The invoices service consumes and acknowledges the message
- Trace data becomes visible in Jaeger when exporter settings are enabled

## Local observability

Jaeger is available locally to inspect distributed traces:

- UI: `http://localhost:16686`

The orders service also includes custom tracing code in [app-orders/src/tracer/tracer.ts](/app-orders/src/tracer/tracer.ts), which makes the repository a useful sandbox for experimenting with instrumentation and trace attributes.

## API gateway

Kong is configured declaratively from [docker/kong/config.template.yaml](/docker/kong/config.template.yaml).

Current routing:

- `/orders` -> orders service

This gives the project a realistic edge-entry pattern while keeping service internals decoupled from the public URL surface.

## Infrastructure as code

The `infra` package provisions a production-oriented AWS deployment with Pulumi.

Current infrastructure scope includes:

- ECS cluster
- Application and network load balancers
- RabbitMQ on ECS Fargate
- Orders service on ECS Fargate
- Kong on ECS Fargate
- ECR image build and push for service containers

Deployment automation is configured in [deploy.yml](/.github/workflows/deploy.yml).

## Project structure

```text
app-orders/
  src/http/server.ts         HTTP API for order creation
  src/broker/                RabbitMQ connection and publishing
  src/db/                    Drizzle schema and migrations
  src/tracer/                OpenTelemetry tracer helper

app-invoices/
  src/http/server.ts         Health endpoint and startup
  src/broker/                RabbitMQ consumer
  src/db/                    Drizzle schema and migrations

contracts/
  messages/                  Shared event payload definitions

docker/
  kong/                      Declarative Kong configuration and custom image

infra/
  src/                       Pulumi resources for AWS deployment
```

## Design choices

- Each service owns its own database instead of sharing tables
- Message contracts are shared separately from service implementations
- The public HTTP entrypoint is fronted by Kong, not exposed directly in the intended architecture
- Local infrastructure is containerized to make the system easy to run and inspect
- OpenTelemetry is included early so observability becomes part of the architecture, not an afterthought
- Pulumi is used to connect local learning with production-style deployment practices

## Current trade-offs and limitations

This repository is intentionally educational and still has room to evolve:

- The invoices service currently consumes and acknowledges messages but does not yet persist invoice creation logic
- The orders service uses a hardcoded customer identifier in the current flow
- There is no root workspace script orchestrating the whole monorepo yet
- Validation and happy-path flow are implemented, but the project is not yet framed as a complete business system
- The infrastructure layer is more advanced than the domain logic by design, because the learning focus is distributed architecture

## Suggested next improvements

If you want to keep evolving this repository, strong next steps would be:

- Persist invoices when `order-created` is consumed
- Add customer creation and lookup flows instead of using a fixed customer ID
- Introduce dead-letter queues and retry strategies
- Version message contracts
- Add automated tests for HTTP and messaging flows
- Add monorepo-level scripts for bootstrapping local development
- Expose metrics and structured logging alongside tracing

## Why this repository is valuable

Even with a small business domain, this project is a strong learning artifact because it makes the microservices concerns visible:

- Separate services
- Separate databases
- Shared contracts
- Messaging
- Gateway routing
- Tracing
- Containerized local setup
- Cloud deployment automation

If you are reviewing this repository as a portfolio project, the fastest way to evaluate it is to start the local stack, create an order through Kong, inspect RabbitMQ consumption, and open Jaeger to follow the trace across the flow.
