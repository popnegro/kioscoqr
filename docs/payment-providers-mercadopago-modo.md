# Integración de pagos: Mercado Pago + MODO

## Decisión funcional

El cajero elige un proveedor antes de generar el QR. Cada operación queda asociada a un solo proveedor, importe, moneda ARS, tenant, puesto y referencia única. No se permite cambiar de proveedor una vez creada la intención; para cambiarlo se crea otra operación y se cancela/expira la anterior si el proveedor ya emitió una solicitud.

## Estado de seguridad

Esta especificación no habilita cobros. La versión actual genera un QR interno de referencia y deja `paymentEnabled: false`. No debe mostrarse como QR pagable de Mercado Pago o MODO hasta que el backend haya creado correctamente una orden/intención real con el proveedor y recibido su payload QR. Nunca marcar `PAID` por escaneo, redirección, captura de pantalla ni respuesta del navegador.

## Mercado Pago — QR dinámico presencial

Documentación oficial: https://www.mercadopago.com.ar/developers/es/docs/qr-code/payment-processing

- Crear una order QR con `POST https://api.mercadopago.com/v1/orders`.
- Autenticar del lado servidor con `Authorization: Bearer <access token>`.
- Enviar `X-Idempotency-Key` única por intento.
- Incluir la referencia propia en `external_reference`, el importe en `transactions.payments` y configurar `config.qr.mode: "dynamic"` junto con el identificador de caja `config.qr.external_pos_id`.
- Renderizar el contenido QR exclusivo retornado por la API (por ejemplo, `qr_data`), no la URL interna de KioscoQR.
- Persistir el identificador de order del proveedor y correlacionarlo con la referencia propia.
- Para webhook de órdenes QR, consultar la order en la API oficial y validar su estado antes de transicionar el registro local.

Variables de entorno previstas:
- `MERCADOPAGO_ACCESS_TOKEN`
- `MERCADOPAGO_POS_ID` (el identificador externo de caja configurado en Mercado Pago)
- `MERCADOPAGO_WEBHOOK_SECRET` solo si aplica al tipo de notificación configurada; no asumir que todas las integraciones QR admiten la misma firma.

## MODO — Payment Request con QR

Documentación oficial: https://merchants.modo.com.ar/docs/f6bc2e95-a4c3-47c4-8db9-de9d1e8d4024

- Endpoint documentado: `POST /v2/payment-requests/`.
- Base de preproducción: `https://merchants.preprod.playdigital.com.ar`; producción: `https://merchants.playdigital.com.ar`.
- Requiere token Bearer y header `User-Agent` con el nombre real del comercio.
- El payload requiere `description`, `amount`, `currency: "ARS"`, `cc_code`, `processor_code` y `external_intention_id` único. Algunos gateways requieren campos adicionales (por ejemplo, `establishment_numbers` para Line).
- La respuesta documentada incluye `id`, `qr` y `deeplink`; usar el QR devuelto por MODO, nunca generar un QR interno y presentarlo como cobrable.
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
- Estados locales: transición monotónica y validada; solo el servidor puede marcar `PAID` después de consultar la API oficial o validar una notificación auténtica y correlacionada.
- Webhooks: aceptar reintentos de forma idempotente, no confiar en importes/referencias aportados sin consultar al proveedor, y no loguear tokens ni datos personales.
- Reconciliación: si se pierde la respuesta al crear una intención, consultar por la referencia/idempotency key antes de crear otra para evitar dobles cobros.
- Un proveedor sin configuración válida debe quedar deshabilitado en la UI y devolver `503 PROVIDER_NOT_CONFIGURED`. No degradar silenciosamente a QR interno.

## Puerta para habilitar producción

1. Credenciales de prueba y parámetros de caja/gateway disponibles.
2. Implementación API + webhook/reconsulta, migración de datos e idempotencia.
3. Pruebas automáticas con respuestas simuladas y pruebas reales de sandbox/preproducción.
4. QA de importe, referencia, expiración, pagos duplicados, estados fallidos y aislamiento multi-tenant.
5. Recién entonces configurar credenciales productivas y habilitar cobros.
