"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole, can } from "@/lib/rbac";
import { LeaveType } from "@prisma/client";

export type LeaveFormState = { error?: string; success?: string } | null;

const requestSchema = z.object({
  employeeId: z.string().min(1),
  type: z.nativeEnum(LeaveType),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  reason: z.string().optional(),
});

function businessDaysBetween(start: Date, end: Date): number {
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const day = cur.getUTCDay();
    if (day !== 0 && day !== 6) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

export async function requestLeave(_prevState: LeaveFormState, formData: FormData): Promise<LeaveFormState> {
  const session = await getServerSession(authOptions);
  requireRole(session?.user.role, "leave:request");

  const raw = Object.fromEntries(formData.entries());
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid data" };
  const data = parsed.data;

  // Self-service workers may only file leave for themselves.
  if (session!.user.role === "WORKER" && data.employeeId !== session!.user.employeeId) {
    return { error: "You can only request leave for yourself." };
  }

  const startDate = new Date(data.startDate + "T00:00:00.000Z");
  const endDate = new Date(data.endDate + "T00:00:00.000Z");
  if (endDate < startDate) return { error: "End date must be after start date." };

  const days = businessDaysBetween(startDate, endDate);

  await prisma.leaveRequest.create({
    data: {
      employeeId: data.employeeId,
      type: data.type,
      startDate,
      endDate,
      days,
      reason: data.reason || null,
      status: "PENDING",
    },
  });

  revalidatePath("/leave");
  return { success: `Leave request submitted (${days} working day(s)).` };
}

export async function approveLeave(id: string) {
  const session = await getServerSession(authOptions);
  requireRole(session?.user.role, "leave:approve");

  const leave = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!leave || leave.status !== "PENDING") return;

  const year = leave.startDate.getUTCFullYear();

  await prisma.$transaction([
    prisma.leaveRequest.update({
      where: { id },
      data: { status: "APPROVED", approvedById: session!.user.id, approvedAt: new Date() },
    }),
    prisma.leaveBalance.upsert({
      where: { employeeId_type_year: { employeeId: leave.employeeId, type: leave.type, year } },
      update: { used: { increment: leave.days } },
      create: { employeeId: leave.employeeId, type: leave.type, year, allocated: 12, used: leave.days },
    }),
  ]);

  revalidatePath("/leave");
}

export async function rejectLeave(id: string, reason: string) {
  const session = await getServerSession(authOptions);
  requireRole(session?.user.role, "leave:approve");

  await prisma.leaveRequest.update({
    where: { id },
    data: { status: "REJECTED", approvedById: session!.user.id, approvedAt: new Date(), rejectReason: reason || null },
  });

  revalidatePath("/leave");
}

export async function cancelLeave(id: string) {
  const session = await getServerSession(authOptions);
  const leave = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!leave) return;

  const isOwner = leave.employeeId === session?.user.employeeId;
  const isHr = can(session?.user.role, "leave:approve");
  if (!isOwner && !isHr) throw new Error("Forbidden");

  await prisma.leaveRequest.update({ where: { id }, data: { status: "CANCELLED" } });
  revalidatePath("/leave");
}
