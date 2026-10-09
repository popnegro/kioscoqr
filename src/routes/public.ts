import { eq, and } from "drizzle-orm";
import { Router } from "express";
import { db } from "../db/client.js";
import { cashierStations, tenants } from "../db/schema.js";

export const publicRouter = Router();

publicRouter.get("/stations/:publicCode", async (req, res) => {
  if (!db) {
    return res.status(503).json({
      ok: false,
      error: "DATABASE_NOT_CONFIGURED",
    });
  }

  const publicCode = req.params.publicCode.trim();

  if (!/^[A-Za-z0-9_-]{3,64}$/.test(publicCode)) {
    return res.status(400).json({
      ok: false,
      error: "INVALID_PUBLIC_CODE",
    });
  }

  try {
    const rows = await db
      .select({
        stationId: cashierStations.id,
        stationName: cashierStations.name,
        publicCode: cashierStations.publicCode,
        tenantId: tenants.id,
        tenantName: tenants.name,
        tenantSlug: tenants.slug,
        googleReviewUrl: tenants.googleReviewUrl,
        whatsappNumber: tenants.whatsappNumber,
      })
      .from(cashierStations)
      .innerJoin(tenants, eq(cashierStations.tenantId, tenants.id))
      .where(
        and(
          eq(cashierStations.publicCode, publicCode),
          eq(cashierStations.status, "ACTIVE"),
          eq(tenants.status, "ACTIVE"),
        ),
      )
      .limit(1);

    const station = rows[0];

    if (!station) {
      return res.status(404).json({
        ok: false,
        error: "STATION_NOT_FOUND",
      });
    }

    return res.json({
      ok: true,
      station: {
        id: station.stationId,
        name: station.stationName,
        publicCode: station.publicCode,
      },
      tenant: {
        id: station.tenantId,
        name: station.tenantName,
        slug: station.tenantSlug,
      },
      public: {
        googleReviewUrl: station.googleReviewUrl,
        whatsappNumber: station.whatsappNumber,
      },
    });
  } catch {
    // Keep database/schema failures from leaking as unhandled HTTP 500 responses.
    return res.status(503).json({
      ok: false,
      error: "STATION_LOOKUP_UNAVAILABLE",
    });
  }
});
