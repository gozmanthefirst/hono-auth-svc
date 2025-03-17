import { deleteCookie, getSignedCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { StatusCodes } from "http-status-codes";

import { env } from "@/env";
import { errorResponse } from "@/lib/api-response";
import { validateSession } from "@/lib/session";

export const authMiddleware = createMiddleware(async (c, next) => {
  const sessionToken = await getSignedCookie(
    c,
    env.COOKIE_SECRET,
    "auth_service_session_token",
  );

  if (!sessionToken) {
    return c.json(
      errorResponse("UNAUTHENTICATED", "No session found"),
      StatusCodes.UNAUTHORIZED,
    );
  }

  try {
    const session = await validateSession(sessionToken);

    if (!session) {
      // Clear invalid session cookie
      deleteCookie(c, "auth_service_session_token");

      return c.json(
        errorResponse("UNAUTHENTICATED", "Session expired"),
        StatusCodes.UNAUTHORIZED,
      );
    }

    c.set("user", session.user);
    await next();
  } catch (error) {
    return c.json(
      errorResponse("UNAUTHENTICATED", "Invalid session"),
      StatusCodes.UNAUTHORIZED,
    );
  }
});
