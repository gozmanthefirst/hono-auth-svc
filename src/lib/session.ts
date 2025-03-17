import { randomBytes } from "crypto";

import type { User } from "@prisma/client";

import db from "./prisma";

export const createSession = async (user: User, expires: Date) => {
  const token = randomBytes(32).toString("hex");

  const session = await db.session.create({
    data: {
      userId: user.id,
      token,
      expires,
    },
  });

  return session;
};

export const validateSession = async (token: string) => {
  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session || session.expires < new Date()) {
    if (session) {
      await db.session.delete({ where: { id: session.id } });
    }
    return null;
  }

  await db.session.update({
    where: { id: session.id },
    data: { lastUsedAt: new Date() },
  });

  return session;
};

export const getCurrentSession = async (token: string) => {
  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session || session.expires < new Date()) {
    return null;
  }

  return session;
};
