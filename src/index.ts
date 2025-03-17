import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { secureHeaders } from "hono/secure-headers";
import { serve } from "@hono/node-server";

import auth from "@/routes/auth-route";
import { env } from "./env";
import { authMiddleware } from "./middleware/auth-middleware";
import user from "./routes/user-route";

import "./types";

const app = new Hono({ strict: false });

// CSRF Protection
app.use(
  csrf({
    origin: ["http://localhost:3000", "http://localhost:3000"],
  }),
);

// Security Headers
app.use(
  "*",
  secureHeaders({
    xFrameOptions: "DENY",
    xXssProtection: "1",
    strictTransportSecurity:
      env.NODE_ENV === "production"
        ? "max-age=31536000; includeSubDomains"
        : false,
    referrerPolicy: "strict-origin-when-cross-origin",
  }),
);

// Public routes
app.route("/api/v1/auth", auth);

app.use(authMiddleware);

// Protected routes example
app.route("/api/v1/user", user);

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
