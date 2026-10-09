import { timingSafeEqual, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Router } from "express";
import { db } from "../db/client.js";
import { cashierStations, cashiers, payments, tenants } from "../db/schema.js";

export const cashierRouter = Router();

function validToken(received: string | undefined, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

cashierRouter.post("/operations", async (req, res) => {
  const expectedToken = process.env.CASHIER_API_TOKEN;
  if (!expectedToken) {
    return res.status(503).json({ ok: false, error: "CASHIER_API_NOT_CONFIGURED" });
  }

  const authorization = req.header("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  if (!validToken(token, expectedToken)) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  if (!db) return res.status(503).json({ ok: false, error: "DATABASE_NOT_CONFIGURED" });

  const publicCode = typeof req.body?.stationCode === "string" ? req.body.stationCode.trim() : "";
  const amount = req.body?.amount;
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(publicCode)) {
    return res.status(400).json({ ok: false, error: "INVALID_STATION_CODE" });
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100 || amount > 9999999999.99) {
    return res.status(400).json({ ok: false, error: "INVALID_AMOUNT" });
  }

  try {
    const stationRows = await db
      .select({
        stationId: cashierStations.id,
        tenantId: tenants.id,
      })
      .from(cashierStations)
      .innerJoin(tenants, eq(cashierStations.tenantId, tenants.id))
      .where(and(
        eq(cashierStations.publicCode, publicCode),
        eq(cashierStations.status, "ACTIVE"),
        eq(tenants.status, "ACTIVE"),
      ))
      .limit(1);

    const station = stationRows[0];
    if (!station) return res.status(404).json({ ok: false, error: "STATION_NOT_FOUND" });

    const cashierRows = await db
      .select({ id: cashiers.id })
      .from(cashiers)
      .where(and(eq(cashiers.tenantId, station.tenantId), eq(cashiers.status, "ACTIVE")))
      .limit(1);

    const cashier = cashierRows[0];
    if (!cashier) return res.status(409).json({ ok: false, error: "NO_ACTIVE_CASHIER" });

    const reference = randomUUID();
    await db.insert(payments).values({
      tenantId: station.tenantId,
      stationId: station.stationId,
      cashierId: cashier.id,
      provider: "NOT_CONFIGURED",
      externalReference: reference,
      amount: amount.toFixed(2),
      currency: "ARS",
      status: "CREATED",
    });

    return res.status(201).json({
      ok: true,
      operation: {
        reference,
        amount: amount.toFixed(2),
        currency: "ARS",
        status: "CREATED",
        paymentEnabled: false,
      },
      message: "Operación creada como intención. No se inició ni confirmó ningún cobro.",
    });
  } catch {
    return res.status(503).json({ ok: false, error: "OPERATION_CREATION_UNAVAILABLE" });
  }
});
