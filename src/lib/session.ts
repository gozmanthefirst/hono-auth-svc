import { randomBytes } from "crypto";

import type { User } from "@prisma/client";

import db from "../config/prisma";

export const createSession = async (
  user: User,
  expires: Date,
  metadata: { ipAddress?: string; userAgent?: string },
) => {
  const token = randomBytes(32).toString("hex");

  const session = await db.session.create({
    data: {
      userId: user.id,
      token,
      expires,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
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

export const getSuspiciousSessions = async (userId: string) => {
  const distinctIPs = await db.session.groupBy({
    by: ["ipAddress"],
    where: {
      userId,
      ipAddress: { not: null },
    },
    having: {
      ipAddress: {
        _count: {
          gt: 5,
        },
      },
    },
  });

  return distinctIPs;
};
