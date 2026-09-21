"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { computePayroll } from "@/lib/payroll";

export type PayrollFormState = { error?: string } | null;

const ASSUMED_MONTHLY_HOURS = 173; // standard full-time monthly hours, used to derive an overtime rate

export async function runPayroll(_prevState: PayrollFormState, formData: FormData): Promise<PayrollFormState> {
  const session = await getServerSession(authOptions);
  requireRole(session?.user.role, "payroll:run");

  const periodStart = formData.get("periodStart") as string;
  const periodEnd = formData.get("periodEnd") as string;
  if (!periodStart || !periodEnd) return { error: "Period start and end are required." };

  const start = new Date(periodStart + "T00:00:00.000Z");
  const end = new Date(periodEnd + "T23:59:59.999Z");
  if (end < start) return { error: "Period end must be after period start." };

  const existing = await prisma.payrollRun.findUnique({
    where: { periodStart_periodEnd: { periodStart: start, periodEnd: end } },
  });
  if (existing) return { error: "A payroll run for this exact period already exists." };

  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    include: { attendances: { where: { date: { gte: start, lte: end } } } },
  });

  let runId = "";

  await prisma.$transaction(async (tx) => {
    const run = await tx.payrollRun.create({
      data: { periodStart: start, periodEnd: end, status: "DRAFT", createdById: session!.user.id },
    });
    runId = run.id;

    for (const emp of employees) {
      const monthlySalary = emp.monthlySalary ? Number(emp.monthlySalary) : null;
      const dailyRate = emp.dailyRate ? Number(emp.dailyRate) : null;
      const overtimeHourlyRate =
        emp.employmentType === "PERMANENT"
          ? (monthlySalary ?? 0) / ASSUMED_MONTHLY_HOURS
          : (dailyRate ?? 0) / 8;

      const result = computePayroll({
        employmentType: emp.employmentType,
        monthlySalary,
        dailyRate,
        attendances: emp.attendances,
        overtimeHourlyRate,
      });

      await tx.payslip.create({
        data: {
          payrollRunId: run.id,
          employeeId: emp.id,
          employmentType: emp.employmentType,
          daysWorked: result.daysWorked,
          baseSalary: result.baseSalary,
          overtimePay: result.overtimePay,
          allowances: result.allowances,
          deductions: result.deductions,
          grossPay: result.grossPay,
          netPay: result.netPay,
        },
      });
    }
  });

  revalidatePath("/payroll");
  redirect(`/payroll/${runId}`);
}

export async function finalizePayrollRun(id: string) {
  const session = await getServerSession(authOptions);
  requireRole(session?.user.role, "payroll:finalize");

  await prisma.payrollRun.update({
    where: { id },
    data: { status: "FINALIZED", finalizedAt: new Date() },
  });
  revalidatePath(`/payroll/${id}`);
  revalidatePath("/payroll");
}

export async function markPayrollPaid(id: string) {
  const session = await getServerSession(authOptions);
  requireRole(session?.user.role, "payroll:finalize");

  await prisma.payrollRun.update({ where: { id }, data: { status: "PAID" } });
  revalidatePath(`/payroll/${id}`);
  revalidatePath("/payroll");
}
