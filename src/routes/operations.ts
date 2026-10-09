import { and, eq } from "drizzle-orm";
import { Router } from "express";
import { db } from "../db/client.js";
import { cashierStations, payments, tenants } from "../db/schema.js";

export const operationsRouter = Router();

operationsRouter.get("/operations/:reference", async (req, res) => {
  if (!db) return res.status(503).json({ ok: false, error: "DATABASE_NOT_CONFIGURED" });

  const reference = req.params.reference.trim();
  const publicCode = typeof req.query.station === "string" ? req.query.station.trim() : "";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(reference) || !/^[A-Za-z0-9_-]{3,64}$/.test(publicCode)) {
    return res.status(400).json({ ok: false, error: "INVALID_OPERATION_REFERENCE" });
  }

  try {
    const rows = await db
      .select({
        reference: payments.externalReference,
        amount: payments.amount,
        currency: payments.currency,
        status: payments.status,
        stationId: payments.stationId,
        stationName: cashierStations.name,
        publicCode: cashierStations.publicCode,
        tenantId: tenants.id,
        tenantName: tenants.name,
        tenantSlug: tenants.slug,
        googleReviewUrl: tenants.googleReviewUrl,
        whatsappNumber: tenants.whatsappNumber,
        tenantStatus: tenants.status,
      })
      .from(payments)
      .innerJoin(cashierStations, eq(payments.stationId, cashierStations.id))
      .innerJoin(tenants, eq(payments.tenantId, tenants.id))
      .where(and(
        eq(payments.externalReference, reference),
        eq(cashierStations.publicCode, publicCode),
        eq(cashierStations.status, "ACTIVE"),
        eq(tenants.status, "ACTIVE"),
      ))
      .limit(1);

    const operation = rows[0];
    if (!operation) return res.status(404).json({ ok: false, error: "OPERATION_NOT_FOUND" });

    return res.json({
      ok: true,
      operation: {
        reference: operation.reference,
        amount: operation.amount,
        currency: operation.currency,
        status: operation.status,
        paymentEnabled: false,
      },
      station: {
        id: operation.stationId,
        name: operation.stationName,
        publicCode: operation.publicCode,
      },
      tenant: {
        id: operation.tenantId,
        name: operation.tenantName,
        slug: operation.tenantSlug,
      },
      public: {
        googleReviewUrl: operation.googleReviewUrl,
        whatsappNumber: operation.whatsappNumber,
      },
      message: "Estado informativo. La integración de pagos todavía no está habilitada.",
    });
  } catch {
    return res.status(503).json({ ok: false, error: "OPERATION_LOOKUP_UNAVAILABLE" });
  }
});
