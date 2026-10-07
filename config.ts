import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),
});

export const env = envSchema.parse(process.env);
