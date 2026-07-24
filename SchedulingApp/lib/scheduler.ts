import {
  AppSettings,
  ClassBlock,
  Student,
  WorkDay,
  WorkShift,
  duration,
} from "./types";

const STEP = 0.5;

function overlaps(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && endA > startB;
}

export function hasClassConflict(shift: WorkShift, blocks: ClassBlock[]) {
  return blocks.some(
    (block) =>
      block.studentId === shift.studentId &&
      block.day === shift.day &&
      overlaps(shift.start, shift.end, block.start, block.end),
  );
}

export function weeklyHours(studentId: string, shifts: WorkShift[]) {
  return shifts
    .filter((shift) => shift.studentId === studentId)
    .reduce((total, shift) => total + duration(shift), 0);
}

export function shiftWarnings(
  shift: WorkShift,
  allShifts: WorkShift[],
  blocks: ClassBlock[],
  settings: AppSettings,
) {
  const warnings: string[] = [];
  if (shift.start < settings.dayStart || shift.end > settings.dayEnd) {
    warnings.push("outside work hours");
  }
  if (duration(shift) < settings.minShiftHours) warnings.push("shift is too short");
  if (hasClassConflict(shift, blocks)) warnings.push("class conflict");
  if (weeklyHours(shift.studentId, allShifts) > settings.maxWeeklyHours) {
    warnings.push("weekly hour limit exceeded");
  }
  return warnings;
}

export function coverageSummary(shifts: WorkShift[], settings: AppSettings) {
  const slotsPerDay = Math.round((settings.dayEnd - settings.dayStart) / STEP);
  let covered = 0;
  const gaps: Array<{ day: WorkDay; start: number; end: number }> = [];

  for (let day = 0 as WorkDay; day <= 4; day = (day + 1) as WorkDay) {
    let gapStart: number | null = null;
    for (let slot = 0; slot < slotsPerDay; slot += 1) {
      const start = settings.dayStart + slot * STEP;
      const count = shifts.filter(
        (shift) => shift.day === day && shift.start <= start && shift.end >= start + STEP,
      ).length;
      if (count >= settings.targetCoverage) {
        covered += 1;
        if (gapStart !== null) {
          gaps.push({ day, start: gapStart, end: start });
          gapStart = null;
        }
      } else if (gapStart === null) {
        gapStart = start;
      }
    }
    if (gapStart !== null) gaps.push({ day, start: gapStart, end: settings.dayEnd });
  }

  const total = slotsPerDay * 5;
  return {
    percent: total ? Math.round((covered / total) * 100) : 0,
    gapHours: (total - covered) * STEP,
    gaps,
  };
}

function availableUntil(
  studentId: string,
  day: WorkDay,
  start: number,
  classBlocks: ClassBlock[],
  placed: WorkShift[],
  settings: AppSettings,
) {
  let cursor = start;
  while (cursor < settings.dayEnd) {
    const next = cursor + STEP;
    const blocked = classBlocks.some(
      (block) =>
        block.studentId === studentId &&
        block.day === day &&
        overlaps(cursor, next, block.start, block.end),
    );
    const alreadyWorking = placed.some(
      (shift) =>
        shift.studentId === studentId &&
        shift.day === day &&
        overlaps(cursor, next, shift.start, shift.end),
    );
    if (blocked || alreadyWorking) break;
    cursor = next;
  }
  return cursor;
}

export function generateSchedule(
  students: Student[],
  classBlocks: ClassBlock[],
  settings: AppSettings,
) {
  const activeStudents = students.filter((student) => student.active);
  const placed: WorkShift[] = [];
  const used = new Map(activeStudents.map((student) => [student.id, 0]));
  const minSlots = Math.ceil(settings.minShiftHours / STEP);

  for (let layer = 0; layer < settings.targetCoverage; layer += 1) {
    for (let day = 0 as WorkDay; day <= 4; day = (day + 1) as WorkDay) {
      let cursor = settings.dayStart;

      while (cursor < settings.dayEnd) {
        const candidates = activeStudents
          .map((student) => {
            const remaining = settings.maxWeeklyHours - (used.get(student.id) ?? 0);
            const availableEnd = availableUntil(
              student.id,
              day,
              cursor,
              classBlocks,
              placed,
              settings,
            );
            const available = Math.min(availableEnd - cursor, remaining, 5);
            return { student, available, used: used.get(student.id) ?? 0 };
          })
          .filter((candidate) => candidate.available / STEP >= minSlots)
          .sort((a, b) => a.used - b.used || b.available - a.available);

        const chosen = candidates[0];
        if (!chosen) {
          cursor += STEP;
          continue;
        }

        let shiftLength = chosen.available;
        const remainingDay = settings.dayEnd - cursor;
        if (
          remainingDay - shiftLength > 0 &&
          remainingDay - shiftLength < settings.minShiftHours
        ) {
          shiftLength = Math.max(settings.minShiftHours, remainingDay - settings.minShiftHours);
        }

        const shift: WorkShift = {
          id: crypto.randomUUID(),
          studentId: chosen.student.id,
          day,
          start: cursor,
          end: cursor + shiftLength,
        };
        placed.push(shift);
        used.set(chosen.student.id, chosen.used + shiftLength);
        cursor = shift.end;
      }
    }
  }

  return placed;
}
