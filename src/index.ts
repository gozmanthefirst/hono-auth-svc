import { Hono } from "hono";
import { serve } from "@hono/node-server";

import { env } from "./env";

const app = new Hono();

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.get("/debug", (c) => {
  return c.json(env);
});

app.post("/auth/sign-up", (c) => {
  return c.json({});
});

app.post("/auth/login", (c) => {
  return c.json({});
});

serve(
  {
    fetch: app.fetch,
    port: 8000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);

if (env.NODE_ENV === "development") {
  console.log(`mode: ${env.NODE_ENV}`);
}
