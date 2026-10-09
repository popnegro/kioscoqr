import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import { and, eq } from "drizzle-orm";
import { Router, type Request, type Response } from "express";
import { db } from "../db/client.js";
import { cashierStations, cashiers, payments, tenants } from "../db/schema.js";

export const cashierRouter = Router();

const COOKIE_NAME = "kioscoqr_cashier";
const SESSION_SECONDS = 4 * 60 * 60;

type CashierSession = { stationCode: string; expiresAt: number };

function validToken(received: string | undefined, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function encodeSession(session: CashierSession, secret: string): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return payload + "." + sign(payload, secret);
}

function readSession(cookieHeader: string | undefined, secret: string): CashierSession | null {
  const pair = cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(COOKIE_NAME + "="));
  if (!pair) return null;

  const value = pair.slice(COOKIE_NAME.length + 1);
  const separator = value.lastIndexOf(".");
  if (separator < 1) return null;
  const payload = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!validToken(signature, sign(payload, secret))) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<CashierSession>;
    if (
      typeof parsed.stationCode !== "string" ||
      !/^[A-Za-z0-9_-]{3,64}$/.test(parsed.stationCode) ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= Math.floor(Date.now() / 1000)
    ) return null;
    return { stationCode: parsed.stationCode, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

function sameOrigin(req: Request): boolean {
  const origin = req.header("origin");
  const host = req.header("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function clearSession(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/api/cashier",
  });
}

cashierRouter.post("/session", async (req, res) => {
  const expectedToken = process.env.CASHIER_API_TOKEN;
  if (!expectedToken) return res.status(503).json({ ok: false, error: "CASHIER_API_NOT_CONFIGURED" });
  if (!sameOrigin(req)) return res.status(403).json({ ok: false, error: "ORIGIN_NOT_ALLOWED" });
  if (!validToken(typeof req.body?.token === "string" ? req.body.token : undefined, expectedToken)) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }
  if (!db) return res.status(503).json({ ok: false, error: "DATABASE_NOT_CONFIGURED" });

  const stationCode = typeof req.body?.stationCode === "string" ? req.body.stationCode.trim() : "";
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(stationCode)) {
    return res.status(400).json({ ok: false, error: "INVALID_STATION_CODE" });
  }

  try {
    const rows = await db
      .select({ stationName: cashierStations.name, tenantName: tenants.name })
      .from(cashierStations)
      .innerJoin(tenants, eq(cashierStations.tenantId, tenants.id))
      .where(and(
        eq(cashierStations.publicCode, stationCode),
        eq(cashierStations.status, "ACTIVE"),
        eq(tenants.status, "ACTIVE"),
      ))
      .limit(1);
    const station = rows[0];
    if (!station) return res.status(404).json({ ok: false, error: "STATION_NOT_FOUND" });

    const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
    res.cookie(COOKIE_NAME, encodeSession({ stationCode, expiresAt }, expectedToken), {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/api/cashier",
      maxAge: SESSION_SECONDS * 1000,
    });
    return res.json({
      ok: true,
      session: { stationCode, stationName: station.stationName, tenantName: station.tenantName, expiresAt },
    });
  } catch {
    return res.status(503).json({ ok: false, error: "CASHIER_SESSION_UNAVAILABLE" });
  }
});

cashierRouter.get("/session", async (req, res) => {
  const secret = process.env.CASHIER_API_TOKEN;
  if (!secret) return res.status(503).json({ ok: false, error: "CASHIER_API_NOT_CONFIGURED" });
  const session = readSession(req.headers.cookie, secret);
  if (!session) return res.status(401).json({ ok: false, error: "SESSION_REQUIRED" });
  if (!db) return res.status(503).json({ ok: false, error: "DATABASE_NOT_CONFIGURED" });

  try {
    const rows = await db
      .select({ stationName: cashierStations.name, tenantName: tenants.name })
      .from(cashierStations)
      .innerJoin(tenants, eq(cashierStations.tenantId, tenants.id))
      .where(and(
        eq(cashierStations.publicCode, session.stationCode),
        eq(cashierStations.status, "ACTIVE"),
        eq(tenants.status, "ACTIVE"),
      ))
      .limit(1);
    const station = rows[0];
    if (!station) {
      clearSession(res);
      return res.status(401).json({ ok: false, error: "STATION_NOT_ACTIVE" });
    }
    return res.json({
      ok: true,
      session: { stationCode: session.stationCode, stationName: station.stationName, tenantName: station.tenantName, expiresAt: session.expiresAt },
    });
  } catch {
    return res.status(503).json({ ok: false, error: "CASHIER_SESSION_UNAVAILABLE" });
  }
});

cashierRouter.post("/session/logout", (req, res) => {
  if (!sameOrigin(req)) return res.status(403).json({ ok: false, error: "ORIGIN_NOT_ALLOWED" });
  clearSession(res);
  return res.json({ ok: true });
});

cashierRouter.post("/operations", async (req, res) => {
  const expectedToken = process.env.CASHIER_API_TOKEN;
  if (!expectedToken) return res.status(503).json({ ok: false, error: "CASHIER_API_NOT_CONFIGURED" });
  if (!sameOrigin(req)) return res.status(403).json({ ok: false, error: "ORIGIN_NOT_ALLOWED" });
  const session = readSession(req.headers.cookie, expectedToken);
  if (!session) return res.status(401).json({ ok: false, error: "SESSION_REQUIRED" });
  if (!db) return res.status(503).json({ ok: false, error: "DATABASE_NOT_CONFIGURED" });

  const amount = req.body?.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) / 100 !== amount || amount > 9999999999.99) {
    return res.status(400).json({ ok: false, error: "INVALID_AMOUNT" });
  }

  try {
    const stationRows = await db
      .select({ stationId: cashierStations.id, tenantId: tenants.id })
      .from(cashierStations)
      .innerJoin(tenants, eq(cashierStations.tenantId, tenants.id))
      .where(and(
        eq(cashierStations.publicCode, session.stationCode),
        eq(cashierStations.status, "ACTIVE"),
        eq(tenants.status, "ACTIVE"),
      ))
      .limit(1);
    const station = stationRows[0];
    if (!station) {
      clearSession(res);
      return res.status(401).json({ ok: false, error: "STATION_NOT_ACTIVE" });
    }

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
      operation: { reference, amount: amount.toFixed(2), currency: "ARS", status: "CREATED", paymentEnabled: false },
      message: "Operación creada como intención. No se inició ni confirmó ningún cobro.",
    });
  } catch {
    return res.status(503).json({ ok: false, error: "OPERATION_CREATION_UNAVAILABLE" });
  }
});


cashierRouter.get("/operations/:reference/qr", async (req, res) => {
  const secret = process.env.CASHIER_API_TOKEN;
  if (!secret) return res.status(503).json({ ok: false, error: "CASHIER_API_NOT_CONFIGURED" });
  const session = readSession(req.headers.cookie, secret);
  if (!session) return res.status(401).json({ ok: false, error: "SESSION_REQUIRED" });
  if (!db) return res.status(503).json({ ok: false, error: "DATABASE_NOT_CONFIGURED" });

  const reference = req.params.reference.trim();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(reference)) return res.status(400).json({ ok: false, error: "INVALID_OPERATION_REFERENCE" });

  try {
    const rows = await db
      .select({ reference: payments.externalReference, stationCode: cashierStations.publicCode })
      .from(payments)
      .innerJoin(cashierStations, eq(payments.stationId, cashierStations.id))
      .innerJoin(tenants, eq(cashierStations.tenantId, tenants.id))
      .where(and(
        eq(payments.externalReference, reference),
        eq(cashierStations.publicCode, session.stationCode),
        eq(cashierStations.status, "ACTIVE"),
        eq(tenants.status, "ACTIVE"),
      ))
      .limit(1);
    const operation = rows[0];
    if (!operation) return res.status(404).json({ ok: false, error: "OPERATION_NOT_FOUND" });

    const host = req.header("host");
    if (!host) return res.status(400).json({ ok: false, error: "PUBLIC_HOST_UNAVAILABLE" });
    const forwardedProto = req.header("x-forwarded-proto")?.split(",")[0]?.trim();
    const protocol = forwardedProto === "https" ? "https" : req.protocol;
    const customerUrl = new URL("/", protocol + "://" + host);
    customerUrl.searchParams.set("station", operation.stationCode);
    customerUrl.searchParams.set("reference", operation.reference);
    const svg = await QRCode.toString(customerUrl.toString(), {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
      width: 280,
    });
    res.setHeader("Cache-Control", "no-store, private");
    res.type("image/svg+xml").send(svg);
  } catch {
    return res.status(503).json({ ok: false, error: "OPERATION_QR_UNAVAILABLE" });
  }
});
