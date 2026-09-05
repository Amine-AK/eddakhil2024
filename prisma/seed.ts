import {
  PrismaClient,
  Role,
  AttendanceStatus,
  AbsenceReason,
  PeriodSegment,
  JustificationStatus,
  DisciplinaryActionType,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Shared demo password for every seeded account. Never used outside local/dev seeding.
const DEMO_PASSWORD = "Passw0rd!";

const SUBJECTS = [
  "الرياضيات",
  "الفيزياء والكيمياء",
  "اللغة العربية",
  "اللغة الفرنسية",
  "اللغة الإنجليزية",
  "التاريخ والجغرافيا",
  "علوم الحياة والأرض",
  "التربية الإسلامية",
];

const PERIODS = [
  { name: "الحصة 1", startTime: "08:00", endTime: "09:00", order: 1 },
  { name: "الحصة 2", startTime: "09:00", endTime: "10:00", order: 2 },
  { name: "الحصة 3", startTime: "10:15", endTime: "11:15", order: 3 },
  { name: "الحصة 4", startTime: "11:15", endTime: "12:15", order: 4 },
  { name: "الحصة 5", startTime: "14:00", endTime: "15:00", order: 5 },
  { name: "الحصة 6", startTime: "15:00", endTime: "16:00", order: 6 },
];

const CLASS_NAMES = ["1BAC-1", "1BAC-2", "2BAC-1"];
const ROOM_NAMES = ["قاعة 101", "قاعة 102", "قاعة 103", "مختبر", "قاعة 105"];

const TEACHER_NAMES = ["أحمد بنعلي", "فاطمة الزهراء العلوي", "يوسف الإدريسي", "خديجة المرابط", "عبد الرحيم الفاسي"];

const STUDENT_FIRST = ["محمد", "أحمد", "يوسف", "عمر", "خالد", "سارة", "فاطمة", "مريم", "زينب", "ليلى", "أمين", "كريم"];
const STUDENT_LAST = [
  "العلوي",
  "البركاني",
  "الإدريسي",
  "الحسني",
  "الوردي",
  "بنجلون",
  "الفاسي",
  "الشرقاوي",
  "المنصوري",
  "الزياني",
];

function firstNonNull<T>(arr: readonly T[], index: number): T {
  const v = arr[index % arr.length];
  if (v === undefined) throw new Error("empty array");
  return v;
}

async function main() {
  console.log("Seeding...");
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ── Academic year ────────────────────────────────────────────────────
  const year = await prisma.academicYear.upsert({
    where: { label: "2025-2026" },
    update: {},
    create: {
      label: "2025-2026",
      startDate: new Date("2025-09-01T00:00:00.000Z"),
      endDate: new Date("2026-06-30T00:00:00.000Z"),
      isActive: true,
    },
  });

  // ── Fixed reference data ────────────────────────────────────────────
  const periods = [];
  for (const p of PERIODS) {
    periods.push(await prisma.period.upsert({ where: { name: p.name }, update: {}, create: p }));
  }

  const subjects = [];
  for (const name of SUBJECTS) {
    subjects.push(await prisma.subject.upsert({ where: { name }, update: {}, create: { name } }));
  }

  const rooms = [];
  for (const name of ROOM_NAMES) {
    rooms.push(await prisma.room.upsert({ where: { name }, update: {}, create: { name } }));
  }

  // ── Classes ──────────────────────────────────────────────────────────
  const classes = [];
  for (const name of CLASS_NAMES) {
    classes.push(
      await prisma.class.upsert({
        where: { academicYearId_name: { academicYearId: year.id, name } },
        update: {},
        create: { name, academicYearId: year.id },
      }),
    );
  }

  // ── Users: one per role, plus teachers ─────────────────────────────
  const roleUsers: Record<string, { email: string; name: string; role: Role }> = {
    admin: { email: "admin@school.test", name: "مدير النظام", role: Role.ADMIN },
    supervisor: { email: "supervisor@school.test", name: "الحارس العام", role: Role.SUPERVISOR },
    gate: { email: "gate@school.test", name: "حارس البوابة", role: Role.GATE },
    readonly: { email: "readonly@school.test", name: "مستخدم اطلاع فقط", role: Role.READONLY },
  };
  for (const u of Object.values(roleUsers)) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, passwordHash },
    });
  }

  const teachers = [];
  for (let i = 0; i < TEACHER_NAMES.length; i++) {
    const email = `teacher${i + 1}@school.test`;
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name: firstNonNull(TEACHER_NAMES, i), role: Role.TEACHER, passwordHash },
    });
    const teacher = await prisma.teacher.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });
    teachers.push(teacher);
  }

  // ── Students ─────────────────────────────────────────────────────────
  const allStudents = [];
  let massarSeq = 1000;
  for (const cls of classes) {
    for (let i = 0; i < 12; i++) {
      massarSeq += 1;
      const massarCode = `M${massarSeq}`;
      const student = await prisma.student.upsert({
        where: { massarCode },
        update: {},
        create: {
          massarCode,
          firstName: firstNonNull(STUDENT_FIRST, i + cls.name.length),
          lastName: firstNonNull(STUDENT_LAST, i * 3 + cls.name.length),
          classId: cls.id,
        },
      });
      allStudents.push(student);
    }
  }

  // ── Schedules ────────────────────────────────────────────────────────
  // Weekdays 1..5 = Mon..Fri, deterministically covered. We also always
  // include today's weekday so the seed is immediately usable for demos
  // and manual testing regardless of which day it is run.
  const todayWeekday = new Date().getDay();
  const weekdays = Array.from(new Set([1, 2, 3, 4, 5, todayWeekday]));

  await prisma.schedule.deleteMany({ where: { academicYearId: year.id } });

  for (const cls of classes) {
    for (const weekday of weekdays) {
      for (let pIdx = 0; pIdx < periods.length; pIdx++) {
        const period = firstNonNull(periods, pIdx);
        const subject = firstNonNull(subjects, pIdx + cls.name.length);
        const teacher = firstNonNull(teachers, pIdx + cls.name.length);
        const room = firstNonNull(rooms, pIdx);
        // Periods 3 & 4 form a double lesson for the first class, to exercise segment tracking.
        const isDouble = cls.name === firstNonNull(CLASS_NAMES, 0) && (pIdx === 2 || pIdx === 3);
        await prisma.schedule.create({
          data: {
            academicYearId: year.id,
            classId: cls.id,
            teacherId: teacher.id,
            subjectId: subject.id,
            roomId: room.id,
            periodId: period.id,
            weekday,
            isDouble,
          },
        });
      }
    }
  }

  // ── E2E test fixture ─────────────────────────────────────────────────
  // A dedicated class/teacher/students the Playwright suite can log in as.
  // Deliberately no Schedule row is created here: which period is "current"
  // must always be resolved from the real clock (never faked), so the E2E
  // suite itself links this teacher to whichever real period is active at
  // the moment it runs (see tests/e2e/fixtures.ts) and cleans it up after.
  const e2eClass = await prisma.class.upsert({
    where: { academicYearId_name: { academicYearId: year.id, name: "E2E-TEST" } },
    update: {},
    create: { name: "E2E-TEST", academicYearId: year.id },
  });
  const e2eTeacherUser = await prisma.user.upsert({
    where: { email: "e2e-teacher@school.test" },
    update: {},
    create: { email: "e2e-teacher@school.test", name: "معلم الاختبار", role: Role.TEACHER, passwordHash },
  });
  await prisma.teacher.upsert({
    where: { userId: e2eTeacherUser.id },
    update: {},
    create: { userId: e2eTeacherUser.id },
  });
  for (let i = 0; i < 3; i++) {
    const massarCode = `E2E${i + 1}`;
    await prisma.student.upsert({
      where: { massarCode },
      update: {},
      create: { massarCode, firstName: firstNonNull(STUDENT_FIRST, i), lastName: "E2E", classId: e2eClass.id },
    });
  }

  // ── Example attendance / alert / review / disciplinary scenarios ────
  // Anchored on the first class + today's weekday so demo data lines up
  // with "today" regardless of when this script runs.
  const demoClass = firstNonNull(classes, 0);
  const demoSchedules = await prisma.schedule.findMany({
    where: { classId: demoClass.id, weekday: todayWeekday },
    include: { period: true },
    orderBy: { period: { order: "asc" } },
  });
  const demoStudents = allStudents.filter((s) => s.classId === demoClass.id).slice(0, 4);

  if (demoSchedules.length >= 2 && demoStudents.length >= 3) {
    const firstSchedule = firstNonNull(demoSchedules, 0);
    const secondSchedule = firstNonNull(demoSchedules, 1);
    const [absentStudent, lateStudent, reviewStudent, disciplinaryStudent] = demoStudents;

    const absentEvent = await prisma.attendanceEvent.upsert({
      where: { idempotencyKey: "seed-absent-1" },
      update: {},
      create: {
        studentId: absentStudent!.id,
        scheduleId: firstSchedule.id,
        date: new Date(new Date().toDateString()),
        segment: PeriodSegment.FULL,
        status: AttendanceStatus.ABSENT,
        reason: AbsenceReason.UNKNOWN,
        recordedByUserId: (await prisma.user.findUniqueOrThrow({ where: { email: "teacher1@school.test" } })).id,
        idempotencyKey: "seed-absent-1",
      },
    });

    await prisma.crossPeriodAlert.upsert({
      where: {
        sourceEventId_targetPeriodId: { sourceEventId: absentEvent.id, targetPeriodId: secondSchedule.periodId },
      },
      update: {},
      create: {
        studentId: absentStudent!.id,
        sourceEventId: absentEvent.id,
        date: absentEvent.date,
        targetPeriodId: secondSchedule.periodId,
        targetClassId: demoClass.id,
      },
    });

    await prisma.attendanceEvent.upsert({
      where: { idempotencyKey: "seed-late-1" },
      update: {},
      create: {
        studentId: lateStudent!.id,
        scheduleId: firstSchedule.id,
        date: new Date(new Date().toDateString()),
        segment: PeriodSegment.FULL,
        status: AttendanceStatus.LATE,
        recordedByUserId: (await prisma.user.findUniqueOrThrow({ where: { email: "teacher1@school.test" } })).id,
        idempotencyKey: "seed-late-1",
      },
    });

    // Example review case: a pending justification older than the 48h window.
    if (reviewStudent) {
      const staleAbsence = await prisma.attendanceEvent.upsert({
        where: { idempotencyKey: "seed-review-absent-1" },
        update: {},
        create: {
          studentId: reviewStudent.id,
          scheduleId: firstSchedule.id,
          date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
          segment: PeriodSegment.FULL,
          status: AttendanceStatus.ABSENT,
          reason: AbsenceReason.MORNING_ABSENCE,
          recordedByUserId: (await prisma.user.findUniqueOrThrow({ where: { email: "teacher2@school.test" } })).id,
          idempotencyKey: "seed-review-absent-1",
        },
      });
      await prisma.justification.upsert({
        where: { id: "00000000-0000-0000-0000-000000000001" },
        update: {},
        create: {
          id: "00000000-0000-0000-0000-000000000001",
          studentId: reviewStudent.id,
          absenceDate: staleAbsence.date,
          reasonText: "غياب بسبب موعد طبي (تجاوز مهلة 48 ساعة)",
          parentPresent: false,
          submittedByUserId: (await prisma.user.findUniqueOrThrow({ where: { email: "gate@school.test" } })).id,
          status: JustificationStatus.PENDING,
        },
      });
    }

    // Example disciplinary case: an open, non-holding action from accumulated absences.
    if (disciplinaryStudent) {
      await prisma.disciplinaryAction.upsert({
        where: { id: "00000000-0000-0000-0000-000000000002" },
        update: {},
        create: {
          id: "00000000-0000-0000-0000-000000000002",
          studentId: disciplinaryStudent.id,
          type: DisciplinaryActionType.FIRST_PARENT_NOTICE,
          reason: "٣ أيام غياب متتالية غير مبررة",
          isHold: false,
          createdByUserId: (await prisma.user.findUniqueOrThrow({ where: { email: "supervisor@school.test" } })).id,
        },
      });
    }
  }

  // ── Decision-engine configuration (config-driven, not hardcoded) ────
  await prisma.decisionRuleConfig.upsert({
    where: { key: "entry_decision_rules" },
    update: {},
    create: {
      key: "entry_decision_rules",
      value: {
        justificationWindowHours: 48,
        conductDeductionUnjustifiedAbsence: -1,
        repeatedAbsenceThresholdOccurrences: 3,
        repeatedAbsenceLookbackDays: 30,
        conductReviewThreshold: -10,
      },
    },
  });

  await prisma.decisionRuleConfig.upsert({
    where: { key: "disciplinary_ladder" },
    update: {},
    create: {
      key: "disciplinary_ladder",
      value: [
        { minDays: 1, maxDays: 1, action: "VERBAL_WARNING", isHold: false },
        { minDays: 3, maxDays: 5, action: "FIRST_PARENT_NOTICE", isHold: false },
        { minDays: 8, maxDays: 10, action: "SECOND_PARENT_NOTICE", isHold: false },
        { minDays: 15, maxDays: 15, action: "FORMAL_REPRIMAND", isHold: false },
        { minDays: 30, maxDays: null, action: "DROPPED_OUT_REFERRAL", isHold: true },
      ],
    },
  });

  console.log("Seed complete.");
  console.log(`Demo password for all seeded users: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
