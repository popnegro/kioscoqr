# KioscoQR

PMV multi-tenant para preparar cobros presenciales mediante QR dinámico por operación. La versión actual crea intenciones de cobro, pero no procesa ni verifica pagos digitales.

## Estado

Fundación backend + modelo PostgreSQL/Neon implementados en feat/multitenant-foundation.

## Arquitectura MVP

- Un tenant representa un comercio/kiosco.
- Cada puesto de cobro pertenece a un tenant activo y tiene un código público para identificarlo.
- El cajero autenticado ingresa el importe y crea una operación con referencia única.
- KioscoQR genera un QR dinámico vinculado a esa operación y a su importe; el cliente debe escanear el QR específico de la operación, no un QR permanente del puesto.
- La integración de proveedor/webhook/API todavía no está configurada; el pago digital permanece deshabilitado.
- Solo una futura integración confiable del backend podrá pasar un pago a `PAID`; nunca se debe simular ese estado a partir del escaneo o de una captura de pantalla.
- La finalización operativa del cajero solo se habilitará cuando exista una verificación de pago confiable.
- Clientes y consentimientos de WhatsApp pertenecen al tenant.
- El navegador nunca puede seleccionar arbitrariamente el tenant_id.

## Estados

Flujo objetivo tras integrar un proveedor: `CREATED` -> `PENDING` -> `PAID` -> `COMPLETED`.

Estado real del PMV: las operaciones se crean como `CREATED`, con proveedor `NOT_CONFIGURED` y `paymentEnabled: false`. No se debe simular `PENDING`, `PAID` ni `COMPLETED`.

Alternativas futuras: `EXPIRED` y `CANCELLED`.

## Desarrollo

```bash
npm install
cp .env.example .env
npm run check
npm run dev
```

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
- Las operaciones permanecen en estado `CREATED`, con proveedor `NOT_CONFIGURED`. El QR identifica el importe y la referencia de la operación; no inicia, habilita ni confirma pagos.
- Flujo de cliente: (1) el cajero ingresa el importe y genera el QR dinámico; (2) el cliente escanea ese QR específico y revisa importe/referencia; (3) el cajero verifica el pago por un medio confiable antes de darlo por realizado. Esta verificación manual no está automatizada en el PMV.
- No configures el token en código cliente ni lo incluyas en repositorio, issues o logs. Rotarlo invalida las sesiones existentes.
- Antes de uso operativo, verificar en Preview los casos sin token (503), token incorrecto (401), puesto inválido (404), operación sin sesión (401) y creación válida de una intención (201). La prueba de creación inserta una fila en `payments`; no ejecutarla en producción sin autorización explícita.

## Proveedores de pago: Mercado Pago + MODO

El cajero seleccionará un solo proveedor antes de generar el QR. La operación quedará asociada a ese proveedor y no se permitirá cambiarlo después de iniciar el cobro. La implementación debe usar el QR emitido por el proveedor, no el QR interno actual.

- [Contrato técnico, endpoints y variables requeridas](docs/payment-providers-mercadopago-modo.md).
- Mercado Pago: requiere Access Token y caja/POS configurados para QR dinámico.
- MODO: requiere credenciales de acceso y parámetros comerciales `cc_code` y `processor_code` proporcionados por la cuenta/gateway del comercio.
- Ambos permanecen deshabilitados hasta completar creación de intención real, validación de estado, webhook/reconsulta e idempotencia en sandbox/preproducción. No habilitar producción antes de pasar QA.
