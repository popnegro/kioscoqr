import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";

const databaseUrl = process.env.DATABASE_URL;

export const db = databaseUrl ? drizzle(neon(databaseUrl), { schema }) : null;
