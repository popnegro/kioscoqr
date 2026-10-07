import express from "express";
import { db } from "./db/client.js";

export const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "kioscoqr", database: db ? "configured" : "not_configured", timestamp: new Date().toISOString() });
});

app.get("/api/state", (_req, res) => {
  if (!db) return res.status(503).json({ ok: false, error: "DATABASE_NOT_CONFIGURED" });
  res.json({ ok: true, service: "kioscoqr", database: "configured" });
});

app.use((_req, res) => res.status(404).json({ ok: false, error: "NOT_FOUND" }));
