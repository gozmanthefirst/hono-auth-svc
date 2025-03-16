import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  PORT: z.coerce.number().default(8000),
  DATABASE_URL: z.string().url().default("postgresql://user:pwd@host:5432/db"),
});

export type EnvConfig = z.infer<typeof envSchema>;

export const envConfig = envSchema.parse(process.env);
