# Integración de pagos: Mercado Pago + MODO

## Decisión funcional

El cajero elige un proveedor antes de generar el QR. Cada operación queda asociada a un solo proveedor, importe, moneda ARS, tenant, puesto y referencia única. No se permite cambiar de proveedor una vez creada la intención; para cambiarlo se crea otra operación y se cancela/expira la anterior si el proveedor ya emitió una solicitud.

## Estado de seguridad

El selector de proveedor y los adaptadores de creación de QR están implementados en esta rama. Si falta alguna variable obligatoria, la API devuelve `503 PROVIDER_NOT_CONFIGURED`. Cuando el proveedor confirma la creación y devuelve su QR, la operación se registra como `PENDING`. La consulta de estado/webhook aún no está implementada: no habilitar uso operativo ni marcar `PAID` por escaneo, redirección, captura de pantalla o respuesta del navegador.

## Mercado Pago — QR dinámico presencial

Documentación oficial: https://www.mercadopago.com.ar/developers/es/docs/qr-code/payment-processing

- Crear una order QR con `POST https://api.mercadopago.com/v1/orders`.
- Autenticar del lado servidor con `Authorization: Bearer <access token>`.
- Enviar `X-Idempotency-Key` única por intento.
- Incluir la referencia propia en `external_reference`, el importe en `transactions.payments` y configurar `config.qr.mode: "dynamic"` junto con el identificador de caja `config.qr.external_pos_id`.
- Renderizar el contenido QR exclusivo retornado por la API (por ejemplo, `qr_data`), no la URL interna de KioscoQR.
- Persistir el identificador de order del proveedor y correlacionarlo con la referencia propia. El adaptador actual persiste el ID en `provider_payment_id`.
- La implementación pendiente debe consultar `GET /v1/orders/{order_id}` y validar importe, moneda, referencia y estado antes de cualquier transición local.

Variables de entorno previstas:
- `MERCADOPAGO_ACCESS_TOKEN`
- `MERCADOPAGO_POS_ID` (el identificador externo de caja configurado en Mercado Pago)
- `MERCADOPAGO_WEBHOOK_SECRET` solo si aplica al tipo de notificación configurada; no asumir que todas las integraciones QR admiten la misma firma.

## MODO — Payment Request con QR

Documentación oficial: https://merchants.modo.com.ar/docs/f6bc2e95-a4c3-47c4-8db9-de9d1e8d4024

- Endpoint documentado: `POST /v2/payment-requests/`.
- Base de preproducción: `https://merchants.preprod.playdigital.com.ar`; producción: `https://merchants.playdigital.com.ar`.
- Requiere token Bearer y header `User-Agent` con el nombre real del comercio.
- El payload requiere `description`, `amount`, `currency: "ARS"`, `cc_code`, `processor_code` y `external_intention_id` único. Algunos gateways requieren campos adicionales (por ejemplo, `establishment_numbers` para Line). La documentación limita `expiration_date` a 5–10 minutos; el adaptador usa 10 minutos.
- La respuesta documentada incluye `id`, `qr` y `deeplink`; el adaptador requiere `id` y `qr` como strings y utiliza el QR devuelto por MODO, nunca un QR interno.
- Los valores comerciales `cc_code` y `processor_code`, el gateway/adquirente y las credenciales deben ser provistos por la cuenta comercial MODO/Payway correspondiente; no se deben inventar.

Variables de entorno previstas:
- `MODO_BASE_URL` (preproducción inicialmente)
- `MODO_ACCESS_TOKEN`
- `MODO_MERCHANT_USER_AGENT`
- `MODO_CC_CODE`
- `MODO_PROCESSOR_CODE`
- `MODO_WEBHOOK_SECRET` o mecanismo de validación oficial provisto para la cuenta, si corresponde.

## Contrato interno recomendado

- Proveedor: `MERCADOPAGO` o `MODO`.
- Crear intención: referencia idempotente, importe ARS, descripción no sensible.
- Respuesta: provider, provider order/payment request ID, payload QR del proveedor, expiración, estado local `PENDING` solo tras creación confirmada por la API.
- Estados locales: la creación confirmada deja `PENDING`; la transición a `PAID` no está implementada. Debe añadirse consulta de estado/webhook con validación de importe, moneda, referencia e identidad del comercio.
- Webhooks: aceptar reintentos de forma idempotente, no confiar en importes/referencias aportados sin consultar al proveedor, y no loguear tokens ni datos personales.
- Reconciliación: si se pierde la respuesta al crear una intención, consultar por la referencia/idempotency key antes de crear otra para evitar dobles cobros.
- Un proveedor sin configuración válida se deshabilita en la UI y la API devuelve `503 PROVIDER_NOT_CONFIGURED`. No degradar silenciosamente a QR interno.

## Puerta para habilitar producción

1. Credenciales de prueba y parámetros de caja/gateway disponibles.
2. Implementación de consulta de estado/webhook para ambos proveedores y reconciliación de solicitudes con resultado de red ambiguo.
3. Pruebas automáticas con respuestas simuladas y pruebas reales de sandbox/preproducción.
4. QA de importe, referencia, expiración, pagos duplicados, estados fallidos y aislamiento multi-tenant.
5. Recién entonces configurar credenciales productivas y habilitar cobros.
