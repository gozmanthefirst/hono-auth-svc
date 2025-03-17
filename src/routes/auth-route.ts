import { Hono } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { zValidator } from "@hono/zod-validator";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import { env } from "@/env";
import { errorResponse, successResponse } from "@/lib/api-response";
import { comparePasswords, hashPassword } from "@/lib/auth";
import { sendPasswordResetEmail, sendVerificationEmail } from "@/lib/email";
import db from "@/lib/prisma";
import {
  createPasswordResetToken,
  validatePasswordResetToken,
} from "@/lib/reset-password";
import { createSession } from "@/lib/session";
import {
  createVerificationToken,
  validateVerificationToken,
} from "@/lib/verification";

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

const resendVerificationSchema = z.object({
  email: z.string().email(),
});

const requestPasswordResetSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(8),
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

  // Create and send verification token
  const verificationToken = await createVerificationToken(user);
  await sendVerificationEmail({
    to: user.email,
    name: user.name,
    token: verificationToken.token,
  });

  return c.json(
    successResponse(
      "User created successfully. Please check your email to verify your account.",
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      },
    ),
    StatusCodes.CREATED,
  );
});

//* Login a user
//* POST /auth/login
auth.post("/login", zValidator("json", loginSchema), async (c) => {
  // Delete any existing session
  const existingToken = await getSignedCookie(
    c,
    env.COOKIE_SECRET,
    "auth_service_session_token",
  );
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

  if (!user.emailVerified) {
    // Create new verification token
    const verificationToken = await createVerificationToken(user);

    // Send verification email
    await sendVerificationEmail({
      to: user.email,
      name: user.name,
      token: verificationToken.token,
    });

    return c.json(
      errorResponse(
        "EMAIL_NOT_VERIFIED",
        "Your email is not verified. A new verification email has been sent.",
      ),
      StatusCodes.FORBIDDEN,
    );
  }

  // Get session expiry date
  const expires = new Date();
  expires.setDate(expires.getDate() + 30);

  // Create session
  const session = await createSession(user, expires);

  // Set session token in HTTP-only cookie
  await setSignedCookie(
    c,
    "auth_service_session_token",
    session.token,
    env.COOKIE_SECRET,
    {
      path: "/",
      secure: env.NODE_ENV === "production",
      domain: env.NODE_ENV === "production" ? "your-domain.com" : undefined,
      httpOnly: true,
      expires,
      sameSite: "Strict",
    },
  );

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
  const sessionToken = await getSignedCookie(
    c,
    env.COOKIE_SECRET,
    "auth_service_session_token",
  );

  if (sessionToken) {
    // Delete session from database
    await db.session.delete({ where: { token: sessionToken } });

    // Clear session cookie
    deleteCookie(c, "auth_service_session_token");
  }

  return c.json(successResponse("Logged out successfully"), StatusCodes.OK);
});

//* Verify email
//* GET /auth/verify-email
auth.get("/verify-email", async (c) => {
  const token = c.req.query("token");

  if (!token) {
    return c.json(
      errorResponse("INVALID_TOKEN", "Verification token is required"),
      StatusCodes.BAD_REQUEST,
    );
  }

  const verificationToken = await validateVerificationToken(token);

  if (!verificationToken) {
    return c.json(
      errorResponse("INVALID_TOKEN", "Invalid or expired verification token"),
      StatusCodes.BAD_REQUEST,
    );
  }

  // Update user and cleanup
  await db.$transaction([
    db.user.update({
      where: { id: verificationToken.userId },
      data: { emailVerified: true },
    }),
    db.emailVerificationToken.delete({
      where: { id: verificationToken.id },
    }),
  ]);

  return c.json(successResponse("Email verified successfully"), StatusCodes.OK);
});

//* Resend verification email
//* POST /auth/resend-verification
auth.post(
  "/resend-verification",
  zValidator("json", resendVerificationSchema),
  async (c) => {
    const { email } = c.req.valid("json");

    const user = await db.user.findUnique({ where: { email } });

    if (!user) {
      // Return same message as success to prevent email enumeration
      return c.json(
        successResponse(
          "If your email exists, a verification link has been sent.",
        ),
        StatusCodes.OK,
      );
    }

    if (user.emailVerified) {
      return c.json(
        errorResponse("ALREADY_VERIFIED", "This email is already verified"),
        StatusCodes.BAD_REQUEST,
      );
    }

    // Delete any existing verification tokens
    await db.emailVerificationToken.deleteMany({
      where: { userId: user.id },
    });

    // Create new verification token
    const verificationToken = await createVerificationToken(user);

    // Send verification email
    await sendVerificationEmail({
      to: user.email,
      name: user.name,
      token: verificationToken.token,
    });

    return c.json(
      successResponse(
        "If your email exists, a verification link has been sent.",
      ),
      StatusCodes.OK,
    );
  },
);

//* Request password reset
//* POST /auth/request-reset
auth.post(
  "/request-reset",
  zValidator("json", requestPasswordResetSchema),
  async (c) => {
    const { email } = c.req.valid("json");

    const user = await db.user.findUnique({ where: { email } });

    if (!user) {
      // Return same message as success to prevent email enumeration
      return c.json(
        successResponse(
          "If your email exists, a password reset link has been sent.",
        ),
        StatusCodes.OK,
      );
    }

    // Create reset token
    const resetToken = await createPasswordResetToken(user);

    // Send reset email
    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      token: resetToken.token,
    });

    return c.json(
      successResponse(
        "If your email exists, a password reset link has been sent.",
      ),
      StatusCodes.OK,
    );
  },
);

//* Reset password
//* POST /auth/reset-password
auth.post(
  "/reset-password",
  zValidator("json", resetPasswordSchema),
  async (c) => {
    const { token, password } = c.req.valid("json");

    const resetToken = await validatePasswordResetToken(token);

    if (!resetToken) {
      return c.json(
        errorResponse("INVALID_TOKEN", "Invalid or expired reset token"),
        StatusCodes.BAD_REQUEST,
      );
    }

    // Hash new password
    const hashedPassword = await hashPassword(password);

    // Update password and cleanup in a transaction
    await db.$transaction([
      db.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash: hashedPassword },
      }),
      db.passwordResetToken.delete({
        where: { id: resetToken.id },
      }),
      // Delete all sessions for this user
      db.session.deleteMany({
        where: { userId: resetToken.userId },
      }),
    ]);

    return c.json(
      successResponse(
        "Password reset successful. Please login with your new password.",
      ),
      StatusCodes.OK,
    );
  },
);

export default auth;
