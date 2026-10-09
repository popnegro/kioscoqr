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

## Panel de caja (PMV)

- Acceso: `/cashier` (no indexable).
- El servidor requiere `CASHIER_STATION_TOKENS`; configurá un objeto JSON cuyas claves sean códigos de puesto y cuyos valores sean secretos aleatorios independientes de al menos 32 caracteres. Ejemplo de estructura: `{"KSM-CAJA-01":"<secreto-aleatorio-de-este-puesto>"}`. Generá cada secreto con `openssl rand -base64 32` y cargá el JSON como variable de entorno en Vercel y localmente.
- La interfaz intercambia el token por una cookie de sesión firmada, `HttpOnly`, `Secure`, `SameSite=Strict`, limitada a `/api/cashier` y con duración de cuatro horas. El token no se almacena en localStorage ni sessionStorage.
- La sesión queda vinculada al código público de un puesto activo. Cada puesto tiene su propio secreto; el token de una caja no autoriza iniciar sesión en otra. Las operaciones usan el puesto desde la sesión; el navegador no puede enviar un tenant o cashier ID. La identidad de cajero individual todavía no se gestiona en esta fase.
- El endpoint de QR requiere una sesión activa y solo devuelve el QR de una operación del puesto de esa sesión.
- Las operaciones permanecen en estado `CREATED`, con proveedor `NOT_CONFIGURED`. El QR es informativo: no habilita ni confirma pagos.
- No configures el token en código cliente ni lo incluyas en repositorio, issues o logs. Rotarlo invalida las sesiones existentes.
- Antes de uso operativo, verificar en Preview los casos sin token (503), token incorrecto (401), puesto inválido (404), operación sin sesión (401) y creación válida de una intención (201). La prueba de creación inserta una fila en `payments`; no ejecutarla en producción sin autorización explícita.
