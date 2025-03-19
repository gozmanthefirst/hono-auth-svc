import { Hono } from "hono";
import { deleteCookie, getSignedCookie } from "hono/cookie";
import { StatusCodes } from "http-status-codes";

import { env } from "@/config/env";
import { getCurrentSession } from "@/lib/session";
import { errorResponse, successResponse } from "@/utils/api-response";

const user = new Hono({ strict: false });

//* Get user
//* POST /user/me
user.get("/me", async (c) => {
  // Get session token
  const sessionToken = await getSignedCookie(
    c,
    env.COOKIE_SECRET,
    "auth_service_session_token",
  );

  if (!sessionToken) {
    return c.json(
      errorResponse("NOT_AUTHENTICATED", "No active session"),
      StatusCodes.UNAUTHORIZED,
    );
  }

  // Get current session
  // If there's no session, return 401
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
    StatusCodes.OK,
  );
});

export default user;
