import { PrismaClient, EmploymentType, AttendanceStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database…");

  // ---------- Departments & positions ----------
  const [production, warehouse, qc, admin, hr] = await Promise.all([
    prisma.department.upsert({ where: { name: "Production" }, update: {}, create: { name: "Production" } }),
    prisma.department.upsert({ where: { name: "Warehouse" }, update: {}, create: { name: "Warehouse" } }),
    prisma.department.upsert({ where: { name: "Quality Control" }, update: {}, create: { name: "Quality Control" } }),
    prisma.department.upsert({ where: { name: "Administration" }, update: {}, create: { name: "Administration" } }),
    prisma.department.upsert({ where: { name: "Human Resources" }, update: {}, create: { name: "Human Resources" } }),
  ]);

  const positions = await Promise.all([
    prisma.position.upsert({ where: { title_departmentId: { title: "Line Operator", departmentId: production.id } }, update: {}, create: { title: "Line Operator", departmentId: production.id } }),
    prisma.position.upsert({ where: { title_departmentId: { title: "Machine Technician", departmentId: production.id } }, update: {}, create: { title: "Machine Technician", departmentId: production.id } }),
    prisma.position.upsert({ where: { title_departmentId: { title: "Production Supervisor", departmentId: production.id } }, update: {}, create: { title: "Production Supervisor", departmentId: production.id } }),
    prisma.position.upsert({ where: { title_departmentId: { title: "Warehouse Staff", departmentId: warehouse.id } }, update: {}, create: { title: "Warehouse Staff", departmentId: warehouse.id } }),
    prisma.position.upsert({ where: { title_departmentId: { title: "QC Inspector", departmentId: qc.id } }, update: {}, create: { title: "QC Inspector", departmentId: qc.id } }),
    prisma.position.upsert({ where: { title_departmentId: { title: "General Manager", departmentId: admin.id } }, update: {}, create: { title: "General Manager", departmentId: admin.id } }),
    prisma.position.upsert({ where: { title_departmentId: { title: "HR Manager", departmentId: hr.id } }, update: {}, create: { title: "HR Manager", departmentId: hr.id } }),
    prisma.position.upsert({ where: { title_departmentId: { title: "HR Staff", departmentId: hr.id } }, update: {}, create: { title: "HR Staff", departmentId: hr.id } }),
  ]);
  const posByTitle = Object.fromEntries(positions.map((p) => [p.title, p]));

  // ---------- Permanent staff with login accounts ----------
  const password = await bcrypt.hash("Password123!", 10);

  async function upsertStaff(opts: {
    employeeNumber: string;
    firstName: string;
    lastName: string;
    email: string;
    role: "EXECUTIVE" | "HR_MANAGER" | "HR_STAFF" | "WORKER";
    departmentId: string;
    positionId: string;
    monthlySalary: number;
  }) {
    const employee = await prisma.employee.upsert({
      where: { employeeNumber: opts.employeeNumber },
      update: {},
      create: {
        employeeNumber: opts.employeeNumber,
        firstName: opts.firstName,
        lastName: opts.lastName,
        email: opts.email,
        hireDate: new Date("2023-01-10"),
        employmentType: EmploymentType.PERMANENT,
        departmentId: opts.departmentId,
        positionId: opts.positionId,
        monthlySalary: opts.monthlySalary,
        bankName: "Bank Central Asia",
        bankAccount: "1234567890",
      },
    });

    await prisma.user.upsert({
      where: { email: opts.email },
      update: {},
      create: {
        email: opts.email,
        passwordHash: password,
        name: `${opts.firstName} ${opts.lastName}`,
        role: opts.role,
        employeeId: employee.id,
      },
    });

    return employee;
  }

  await upsertStaff({
    employeeNumber: "EMP-0001",
    firstName: "Andi",
    lastName: "Wijaya",
    email: "executive@hris.local",
    role: "EXECUTIVE",
    departmentId: admin.id,
    positionId: posByTitle["General Manager"].id,
    monthlySalary: 35_000_000,
  });

  await upsertStaff({
    employeeNumber: "EMP-0002",
    firstName: "Siti",
    lastName: "Rahayu",
    email: "hrmanager@hris.local",
    role: "HR_MANAGER",
    departmentId: hr.id,
    positionId: posByTitle["HR Manager"].id,
    monthlySalary: 18_000_000,
  });

  await upsertStaff({
    employeeNumber: "EMP-0003",
    firstName: "Budi",
    lastName: "Santoso",
    email: "hrstaff@hris.local",
    role: "HR_STAFF",
    departmentId: hr.id,
    positionId: posByTitle["HR Staff"].id,
    monthlySalary: 8_000_000,
  });

  const workerEmployee = await upsertStaff({
    employeeNumber: "EMP-0004",
    firstName: "Dewi",
    lastName: "Lestari",
    email: "worker@hris.local",
    role: "WORKER",
    departmentId: production.id,
    positionId: posByTitle["Production Supervisor"].id,
    monthlySalary: 9_500_000,
  });

  await prisma.leaveBalance.upsert({
    where: { employeeId_type_year: { employeeId: workerEmployee.id, type: "ANNUAL", year: new Date().getFullYear() } },
    update: {},
    create: { employeeId: workerEmployee.id, type: "ANNUAL", year: new Date().getFullYear(), allocated: 12, used: 0 },
  });

  // ---------- Daily workers (no login accounts) ----------
  const dailyWorkerNames = [
    ["Agus", "Setiawan"],
    ["Rina", "Puspita"],
    ["Joko", "Prasetyo"],
    ["Wati", "Handayani"],
    ["Eko", "Purnomo"],
    ["Yuni", "Astuti"],
    ["Hendra", "Gunawan"],
    ["Nurul", "Aini"],
  ];

  const dailyWorkers = [];
  for (let i = 0; i < dailyWorkerNames.length; i++) {
    const [firstName, lastName] = dailyWorkerNames[i];
    const employeeNumber = `DW-${String(i + 1).padStart(4, "0")}`;
    const dw = await prisma.employee.upsert({
      where: { employeeNumber },
      update: {},
      create: {
        employeeNumber,
        firstName,
        lastName,
        hireDate: new Date("2024-03-01"),
        employmentType: EmploymentType.DAILY_WORKER,
        departmentId: i % 3 === 0 ? warehouse.id : production.id,
        positionId: i % 3 === 0 ? posByTitle["Warehouse Staff"].id : posByTitle["Line Operator"].id,
        dailyRate: 150_000,
      },
    });
    dailyWorkers.push(dw);
  }

  // ---------- Sample attendance for the last 5 working days ----------
  const allEmployees = [workerEmployee, ...dailyWorkers];
  const today = new Date();
  for (let d = 1; d <= 5; d++) {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - d);
    date.setUTCHours(0, 0, 0, 0);
    const day = date.getUTCDay();
    if (day === 0 || day === 6) continue; // skip weekends

    for (const emp of allEmployees) {
      const clockIn = new Date(date);
      clockIn.setUTCHours(8, 0, 0, 0);
      const clockOut = new Date(date);
      clockOut.setUTCHours(17, 0, 0, 0);

      await prisma.attendance.upsert({
        where: { employeeId_date: { employeeId: emp.id, date } },
        update: {},
        create: {
          employeeId: emp.id,
          date,
          status: AttendanceStatus.PRESENT,
          clockIn,
          clockOut,
          hoursWorked: 9,
          overtimeHours: 0,
        },
      });
    }
  }

  console.log("Seed complete.");
  console.log("\nLogin accounts (password for all: Password123!):");
  console.log("  Executive  -> executive@hris.local");
  console.log("  HR Manager -> hrmanager@hris.local");
  console.log("  HR Staff   -> hrstaff@hris.local");
  console.log("  Worker     -> worker@hris.local");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
