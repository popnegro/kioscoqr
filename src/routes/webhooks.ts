import { and, eq } from "drizzle-orm";
import { Router } from "express";
import { db } from "../db/client.js";
import { payments } from "../db/schema.js";
import { applyVerifiedModoEvent, reconcileMercadoPagoPayment, verifyModoWebhook, WebhookNotConfiguredError } from "../payments/reconcile.js";
import { ProviderNotConfiguredError, ProviderRequestError } from "../payments/providers.js";

export const webhooksRouter = Router();

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function mercadoPagoOrderId(req: Parameters<Parameters<typeof webhooksRouter.post>[1]>[0]): string | null {
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const data = body.data && typeof body.data === "object" ? body.data as Record<string, unknown> : {};
  const queryData = req.query.data && typeof req.query.data === "object" ? req.query.data as Record<string, unknown> : {};
  return stringValue(data.id) ?? stringValue(queryData.id) ?? stringValue(req.query["data.id"]) ?? stringValue(req.query.id) ?? stringValue(body.id);
}

webhooksRouter.post("/mercadopago", async (req, res) => {
  if (!db) return res.status(503).json({ ok: false, error: "DATABASE_NOT_CONFIGURED" });
  const orderId = mercadoPagoOrderId(req);
  if (!orderId) return res.status(400).json({ ok: false, error: "INVALID_NOTIFICATION" });

  try {
    const rows = await db.select({
      id: payments.id,
      providerPaymentId: payments.providerPaymentId,
      externalReference: payments.externalReference,
      amount: payments.amount,
      currency: payments.currency,
      status: payments.status,
    }).from(payments).where(and(
      eq(payments.provider, "MERCADOPAGO"),
      eq(payments.providerPaymentId, orderId),
    )).limit(1);

    const payment = rows[0];
    // Notifications for orders not created by this KioscoQR instance are safely ignored.
    if (!payment) return res.status(200).json({ ok: true, ignored: true });
    if (payment.status !== "PENDING") return res.status(200).json({ ok: true, status: payment.status });

    const status = await reconcileMercadoPagoPayment(payment);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true, status });
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) {
      return res.status(503).json({ ok: false, error: "PROVIDER_NOT_CONFIGURED" });
    }
    if (error instanceof ProviderRequestError) {
      return res.status(502).json({ ok: false, error: "PROVIDER_STATUS_UNAVAILABLE" });
    }
    return res.status(503).json({ ok: false, error: "PAYMENT_RECONCILIATION_UNAVAILABLE" });
  }
});

webhooksRouter.post("/modo", async (req, res) => {
  if (!db) return res.status(503).json({ ok: false, error: "DATABASE_NOT_CONFIGURED" });
  try {
    const event = verifyModoWebhook(req.body);
    const status = await applyVerifiedModoEvent(event);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true, status });
  } catch (error) {
    if (error instanceof WebhookNotConfiguredError) {
      return res.status(503).json({ ok: false, error: "MODO_WEBHOOK_VERIFICATION_NOT_CONFIGURED" });
    }
    if (error instanceof ProviderRequestError) {
      return res.status(401).json({ ok: false, error: "MODO_NOTIFICATION_INVALID" });
    }
    return res.status(503).json({ ok: false, error: "PAYMENT_RECONCILIATION_UNAVAILABLE" });
  }
});
