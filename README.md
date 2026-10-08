# KioscoQR

SaaS multi-tenant para cobros mediante QR estático por puesto de cobro.

## Estado

Fundación backend + modelo PostgreSQL/Neon implementados en feat/multitenant-foundation.

## Arquitectura MVP

- Un tenant representa un comercio/kiosco.
- Cada puesto de cobro tiene un QR estático público.
- El cajero crea el cobro con importe y puesto.
- El proveedor confirma el pago mediante webhook/API.
- Solo el backend puede pasar un pago a PAID.
- El cajero puede pasar PAID a COMPLETED.
- Clientes y consentimientos de WhatsApp pertenecen al tenant.
- El navegador nunca puede seleccionar arbitrariamente el tenant_id.

## Estados

CREATED -> PENDING -> PAID -> COMPLETED

Alternativas: EXPIRED y CANCELLED.

## Desarrollo

npm install
cp .env.example .env
npm run check
npm run dev

Endpoints iniciales:
- GET /api/health
- GET /api/state

## Neon

Aplicar drizzle/0000_initial.sql sobre la branch de Neon correspondiente antes de probar GET /api/state con DATABASE_URL.

## Autonomous gate test

Esta modificación mínima existe únicamente para validar el circuito CI -> PR -> aprobación del agente -> HUMAN GATE -> auto-merge.
