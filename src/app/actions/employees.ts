"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { EmploymentType } from "@prisma/client";

export type FormState = { error?: string } | null;

const employeeSchema = z
  .object({
    employeeNumber: z.string().min(1, "Employee number is required"),
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().optional(),
    address: z.string().optional(),
    hireDate: z.string().min(1, "Hire date is required"),
    employmentType: z.nativeEnum(EmploymentType),
    departmentId: z.string().optional(),
    positionId: z.string().optional(),
    monthlySalary: z.string().optional(),
    dailyRate: z.string().optional(),
    bankName: z.string().optional(),
    bankAccount: z.string().optional(),
  })
  .refine(
    (data) => (data.employmentType === "PERMANENT" ? !!data.monthlySalary : !!data.dailyRate),
    { message: "Provide the correct compensation for the selected employment type.", path: ["monthlySalary"] }
  );

async function assertCanWrite() {
  const session = await getServerSession(authOptions);
  requireRole(session?.user.role, "employees:write");
  return session!;
}

function buildData(data: z.infer<typeof employeeSchema>) {
  return {
    employeeNumber: data.employeeNumber,
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email || null,
    phone: data.phone || null,
    address: data.address || null,
    hireDate: new Date(data.hireDate),
    employmentType: data.employmentType,
    departmentId: data.departmentId || null,
    positionId: data.positionId || null,
    monthlySalary: data.employmentType === "PERMANENT" ? Number(data.monthlySalary) : null,
    dailyRate: data.employmentType === "DAILY_WORKER" ? Number(data.dailyRate) : null,
    bankName: data.bankName || null,
    bankAccount: data.bankAccount || null,
  };
}

export async function createEmployee(_prevState: FormState, formData: FormData): Promise<FormState> {
  await assertCanWrite();

  const raw = Object.fromEntries(formData.entries());
  const parsed = employeeSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }

  try {
    await prisma.employee.create({ data: buildData(parsed.data) });
  } catch (e: any) {
    if (e?.code === "P2002") return { error: "Employee number or email already exists." };
    return { error: "Could not create employee." };
  }

  revalidatePath("/employees");
  redirect("/employees");
}

export async function updateEmployee(id: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  await assertCanWrite();

  const raw = Object.fromEntries(formData.entries());
  const parsed = employeeSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }

  try {
    await prisma.employee.update({ where: { id }, data: buildData(parsed.data) });
  } catch (e: any) {
    if (e?.code === "P2002") return { error: "Employee number or email already exists." };
    return { error: "Could not update employee." };
  }

  revalidatePath("/employees");
  revalidatePath(`/employees/${id}`);
  redirect("/employees");
}

export async function setEmployeeStatus(id: string, status: "ACTIVE" | "INACTIVE" | "TERMINATED") {
  await assertCanWrite();
  await prisma.employee.update({ where: { id }, data: { status } });
  revalidatePath("/employees");
  revalidatePath(`/employees/${id}`);
}
