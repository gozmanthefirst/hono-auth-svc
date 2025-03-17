import { Hono } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import { StatusCodes } from "http-status-codes";

import { errorResponse, successResponse } from "@/lib/api-response";
import { getCurrentSession } from "@/lib/session";

const user = new Hono({ strict: false });

//* Get user
//* POST /user/me
user.get("/me", async (c) => {
  const sessionToken = getCookie(c, "auth_service_session_token");

  if (!sessionToken) {
    return c.json(
      errorResponse("NOT_AUTHENTICATED", "No active session"),
      StatusCodes.UNAUTHORIZED,
    );
  }

  const session = await getCurrentSession(sessionToken);
  if (!session) {
    deleteCookie(c, "auth_service_session_token");
    return c.json(
      errorResponse("NOT_AUTHENTICATED", "Session expired"),
      StatusCodes.UNAUTHORIZED,
    );
  }

  return c.json(
    successResponse("Session valid", {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
    }),
  );
});
