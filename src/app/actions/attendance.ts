"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { AttendanceStatus } from "@prisma/client";

export type AttendanceFormState = { error?: string; success?: string } | null;

/**
 * Saves a whole day's attendance in one submit. The form posts one row per
 * employee (status / clockIn / clockOut / overtimeHours / notes, keyed by
 * employee id) plus a hidden `employeeIds` field listing which rows to save.
 * This is the fast path HR staff use each morning for daily workers.
 */
export async function saveAttendanceBatch(
  date: string,
  _prevState: AttendanceFormState,
  formData: FormData
): Promise<AttendanceFormState> {
  const session = await getServerSession(authOptions);
  requireRole(session?.user.role, "attendance:write");

  const employeeIds = (formData.get("employeeIds") as string)?.split(",").filter(Boolean) ?? [];
  if (employeeIds.length === 0) return { error: "No employees to save." };

  const day = new Date(date + "T00:00:00.000Z");

  const ops = employeeIds.map((employeeId) => {
    const status = (formData.get(`status_${employeeId}`) as AttendanceStatus) || "ABSENT";
    const clockInRaw = formData.get(`clockIn_${employeeId}`) as string;
    const clockOutRaw = formData.get(`clockOut_${employeeId}`) as string;
    const overtimeRaw = formData.get(`overtime_${employeeId}`) as string;
    const notes = (formData.get(`notes_${employeeId}`) as string) || null;

    const clockIn = clockInRaw ? new Date(`${date}T${clockInRaw}:00.000Z`) : null;
    const clockOut = clockOutRaw ? new Date(`${date}T${clockOutRaw}:00.000Z`) : null;
    const overtimeHours = overtimeRaw ? Number(overtimeRaw) : 0;

    let hoursWorked: number | null = null;
    if (clockIn && clockOut && clockOut > clockIn) {
      hoursWorked = Math.round(((clockOut.getTime() - clockIn.getTime()) / 3600000) * 100) / 100;
    }

    return prisma.attendance.upsert({
      where: { employeeId_date: { employeeId, date: day } },
      update: { status, clockIn, clockOut, hoursWorked, overtimeHours, notes, recordedById: session!.user.id },
      create: { employeeId, date: day, status, clockIn, clockOut, hoursWorked, overtimeHours, notes, recordedById: session!.user.id },
    });
  });

  await prisma.$transaction(ops);

  revalidatePath("/attendance");
  return { success: `Saved attendance for ${employeeIds.length} employee(s) on ${date}.` };
}
