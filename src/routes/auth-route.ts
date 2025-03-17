import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { zValidator } from "@hono/zod-validator";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import db from "@/lib/prisma";
import { createSession } from "@/lib/session";
import { comparePasswords, hashPassword } from "../lib/auth";

const auth = new Hono({ strict: false });

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

//* Register a new user
//* POST /auth/register
auth.post("/register", zValidator("json", signUpSchema), async (c) => {
  const { email, password, name } = c.req.valid("json");

  // Check if user already exists
  const userExists = await db.user.findUnique({ where: { email } });
  if (userExists) {
    return c.json(
      errorResponse("USER_EXISTS", "User with this email already exists"),
      StatusCodes.CONFLICT,
    );
  }

  // Hash password
  const hashedPassword = await hashPassword(password);

  // Create user
  const user = await db.user.create({
    data: {
      email,
      passwordHash: hashedPassword,
      name,
    },
  });

  return c.json(
    successResponse("User created successfully", {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    }),
    StatusCodes.CREATED,
  );
});

//* Login a user
//* POST /auth/login
auth.post("/login", zValidator("json", loginSchema), async (c) => {
  // Delete any existing session
  const existingToken = getCookie(c, "auth_service_session_token");
  if (existingToken) {
    await db.session.delete({ where: { token: existingToken } });
    deleteCookie(c, "auth_service_session_token");
  }

  const { email, password } = c.req.valid("json");

  // If user doesn't exist or the password is incorrect, return 401
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await comparePasswords(password, user.passwordHash))) {
    return c.json(
      errorResponse("INVALID_DATA", "Invalid email or password"),
      StatusCodes.UNAUTHORIZED,
    );
  }

  // Get session expiry date
  const expires = new Date();
  expires.setDate(expires.getDate() + 30);

  // Create session
  const session = await createSession(user, expires);

  // Set session token in HTTP-only cookie
  setCookie(c, "auth_service_session_token", session.token, {
    path: "/",
    secure: true,
    domain: "book.gozman.dev",
    httpOnly: true,
    // maxAge: 30 * 24 * 60 * 60,
    expires,
    sameSite: "Strict",
  });

  return c.json(
    successResponse("Login successful", {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    }),
    StatusCodes.OK,
  );
});

//* Logout user
//* POST /auth/logout
auth.post("/logout", async (c) => {
  const sessionToken = getCookie(c, "auth_service_session_token");

  if (sessionToken) {
    // Delete session from database
    await db.session.delete({ where: { token: sessionToken } });

    // Clear session cookie
    deleteCookie(c, "auth_service_session_token");
  }

  return c.json(successResponse("Logged out successfully"), StatusCodes.OK);
});

export default auth;
