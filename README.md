# KioscoQR

PMV multi-tenant para iniciar cobros presenciales mediante un QR dinámico por operación. El cajero puede seleccionar Mercado Pago o MODO; el backend emite el QR del proveedor cuando su configuración está completa. La verificación automática del estado todavía no está implementada.

## Estado

Fundación backend + modelo PostgreSQL/Neon implementados en feat/multitenant-foundation.

## Arquitectura MVP

- Un tenant representa un comercio/kiosco.
- Cada puesto de cobro pertenece a un tenant activo y tiene un código público para identificarlo.
- El cajero autenticado ingresa el importe y crea una operación con referencia única.
- KioscoQR genera un QR dinámico vinculado a esa operación y a su importe; el cliente debe escanear el QR específico de la operación, no un QR permanente del puesto.
- El selector de proveedor y los adaptadores de creación de QR están implementados en la rama de trabajo. Sin credenciales/identificadores válidos, el backend responde `503 PROVIDER_NOT_CONFIGURED` y no genera QR.
- La consulta de estado/webhook de ambos proveedores todavía no está implementada. Nunca marcar `PAID` por escaneo, captura o respuesta del navegador; no usar cobros reales hasta cerrar esa integración y QA.
- La finalización operativa del cajero solo se habilitará cuando exista una verificación de pago confiable.
- Clientes y consentimientos de WhatsApp pertenecen al tenant.
- El navegador nunca puede seleccionar arbitrariamente el tenant_id.

## Estados

Flujo objetivo tras integrar un proveedor: `CREATED` -> `PENDING` -> `PAID` -> `COMPLETED`.

Estado real del PMV: una operación solo puede pasar a `PENDING` cuando la API del proveedor confirma la creación de la intención y devuelve el QR. No existe transición automática a `PAID` ni `COMPLETED`.

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
- El cajero selecciona Mercado Pago o MODO y genera un único QR de ese proveedor para la operación. El QR interno de referencia está retirado del flujo de cobro.
- El endpoint heredado `/api/cashier/operations/:reference/qr` responde `410`; el QR debe venir de la API de pago.
- El backend establece `PENDING` solo después de recibir un ID y QR válidos del proveedor. Mercado Pago se reconcilia consultando `GET /v1/orders/{id}` y validando referencia, importe y moneda; MODO solo puede pasar a `PAID` con una notificación firmada que supere la verificación configurada. No habilitar producción hasta validar el contrato de firma MODO con el proveedor y completar QA de preproducción.
- No configures el token en código cliente ni lo incluyas en repositorio, issues o logs. Rotarlo invalida las sesiones existentes.
- Antes de uso operativo, verificar en Preview los casos sin token (503), token incorrecto (401), puesto inválido (404), operación sin sesión (401) y creación válida de una intención (201). La prueba de creación inserta una fila en `payments`; no ejecutarla en producción sin autorización explícita.

## Proveedores de pago: Mercado Pago + MODO

El cajero seleccionará un solo proveedor antes de generar el QR. La operación quedará asociada a ese proveedor y no se permitirá cambiarlo después de iniciar el cobro. La implementación debe usar el QR emitido por el proveedor, no el QR interno actual.

- [Contrato técnico, endpoints y variables requeridas](docs/payment-providers-mercadopago-modo.md).
- Mercado Pago: requiere Access Token y caja/POS configurados para QR dinámico.
- MODO: requiere credenciales de acceso y parámetros comerciales `cc_code` y `processor_code` proporcionados por la cuenta/gateway del comercio.
- La UI deshabilita cada proveedor hasta que el servidor detecta su configuración obligatoria. Caja consulta el estado automáticamente: Mercado Pago mediante consulta autenticada y MODO mediante webhook firmado. Las credenciales de prueba y la clave oficial de verificación MODO deben configurarse y validarse en preproducción antes de habilitar cobros operativos.
