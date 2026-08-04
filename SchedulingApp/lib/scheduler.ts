import {
  AppSettings,
  ClassBlock,
  Student,
  WorkDay,
  WorkShift,
  duration,
} from "./types";

const STEP = 0.25;
const EPSILON = 0.001;
export const MAX_CONSECUTIVE_HOURS = 6;

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

export function consecutiveHours(
  studentId: string,
  day: WorkDay,
  shifts: WorkShift[],
) {
  const intervals = shifts
    .filter((shift) => shift.studentId === studentId && shift.day === day)
    .map((shift) => ({ start: shift.start, end: shift.end }))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  let longest = 0;
  let chainStart: number | null = null;
  let chainEnd: number | null = null;

  for (const interval of intervals) {
    if (chainStart === null || chainEnd === null) {
      chainStart = interval.start;
      chainEnd = interval.end;
      longest = Math.max(longest, chainEnd - chainStart);
      continue;
    }

    if (interval.start <= chainEnd + EPSILON) {
      chainEnd = Math.max(chainEnd, interval.end);
    } else {
      chainStart = interval.start;
      chainEnd = interval.end;
    }
    longest = Math.max(longest, chainEnd - chainStart);
  }

  return longest;
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
  if (
    consecutiveHours(shift.studentId, shift.day, allShifts) >
    MAX_CONSECUTIVE_HOURS + EPSILON
  ) {
    warnings.push("more than 6 consecutive hours");
  }
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

type AssignmentCandidate = {
  studentId: string;
  day: WorkDay;
  slots: number[];
  extension: boolean;
  deficitGain: number;
  coverageAverage: number;
  daySlots: number;
  progress: number;
};

export function generateSchedule(
  students: Student[],
  classBlocks: ClassBlock[],
  settings: AppSettings,
) {
  const activeStudents = students.filter((student) => student.active);
  const slotCount = Math.max(
    0,
    Math.round((settings.dayEnd - settings.dayStart) / STEP),
  );
  const minShiftSlots = Math.max(1, Math.ceil(settings.minShiftHours / STEP));
  const maxWeeklySlots = Math.max(0, Math.floor(settings.maxWeeklyHours / STEP));
  const maxConsecutiveSlots = Math.floor(MAX_CONSECUTIVE_HOURS / STEP);
  const assignments = new Map(
    activeStudents.map((student) => [
      student.id,
      Array.from({ length: 5 }, () => new Set<number>()),
    ]),
  );
  const coverage = Array.from(
    { length: 5 },
    () => Array.from({ length: slotCount }, () => 0),
  );
  const usedSlots = new Map(activeStudents.map((student) => [student.id, 0]));
  const allDays = [0, 1, 2, 3, 4] as WorkDay[];

  function daySet(studentId: string, day: WorkDay) {
    return assignments.get(studentId)?.[day];
  }

  function slotIsBlocked(studentId: string, day: WorkDay, slot: number) {
    const start = settings.dayStart + slot * STEP;
    const end = start + STEP;
    return classBlocks.some(
      (block) =>
        block.studentId === studentId &&
        block.day === day &&
        overlaps(start, end, block.start, block.end),
    );
  }

  function longestRun(slots: Set<number>) {
    const ordered = [...slots].sort((a, b) => a - b);
    let longest = 0;
    let current = 0;
    let previous: number | null = null;

    for (const slot of ordered) {
      current = previous !== null && slot === previous + 1 ? current + 1 : 1;
      longest = Math.max(longest, current);
      previous = slot;
    }
    return longest;
  }

  function canAssign(studentId: string, day: WorkDay, slots: number[]) {
    const current = daySet(studentId, day);
    if (!current || !slots.length) return false;
    if ((usedSlots.get(studentId) ?? 0) + slots.length > maxWeeklySlots) {
      return false;
    }
    if (
      slots.some(
        (slot) =>
          slot < 0 ||
          slot >= slotCount ||
          current.has(slot) ||
          slotIsBlocked(studentId, day, slot),
      )
    ) {
      return false;
    }

    const combined = new Set(current);
    slots.forEach((slot) => combined.add(slot));
    return longestRun(combined) <= maxConsecutiveSlots;
  }

  function candidate(
    studentId: string,
    day: WorkDay,
    slots: number[],
    extension: boolean,
  ): AssignmentCandidate | null {
    if (!canAssign(studentId, day, slots)) return null;
    const coveredTotal = slots.reduce(
      (total, slot) => total + coverage[day][slot],
      0,
    );
    const deficitGain = slots.filter(
      (slot) => coverage[day][slot] < settings.targetCoverage,
    ).length;
    return {
      studentId,
      day,
      slots,
      extension,
      deficitGain,
      coverageAverage: coveredTotal / slots.length,
      daySlots: daySet(studentId, day)?.size ?? 0,
      progress: maxWeeklySlots
        ? (usedSlots.get(studentId) ?? 0) / maxWeeklySlots
        : 1,
    };
  }

  function newBlockCandidates(
    studentId: string,
    days: WorkDay[],
    length: number,
  ) {
    const results: AssignmentCandidate[] = [];
    if (length <= 0 || length > slotCount) return results;

    for (const day of days) {
      for (let start = 0; start + length <= slotCount; start += 1) {
        const slots = Array.from({ length }, (_, index) => start + index);
        const option = candidate(studentId, day, slots, false);
        if (option) results.push(option);
      }
    }
    return results;
  }

  function extensionCandidates(studentId: string, days: WorkDay[]) {
    const results: AssignmentCandidate[] = [];

    for (const day of days) {
      const current = daySet(studentId, day);
      if (!current?.size) continue;
      const edgeSlots = new Set<number>();
      for (const slot of current) {
        if (!current.has(slot - 1)) edgeSlots.add(slot - 1);
        if (!current.has(slot + 1)) edgeSlots.add(slot + 1);
      }
      for (const slot of edgeSlots) {
        const option = candidate(studentId, day, [slot], true);
        if (option) results.push(option);
      }
    }
    return results;
  }

  function assign(option: AssignmentCandidate) {
    const current = daySet(option.studentId, option.day);
    if (!current) return;
    for (const slot of option.slots) {
      current.add(slot);
      coverage[option.day][slot] += 1;
    }
    usedSlots.set(
      option.studentId,
      (usedSlots.get(option.studentId) ?? 0) + option.slots.length,
    );
  }

  if (
    minShiftSlots <= maxConsecutiveSlots &&
    minShiftSlots <= maxWeeklySlots
  ) {
    for (const day of allDays) {
      const offset = activeStudents.length ? day % activeStudents.length : 0;
      const orderedStudents = [
        ...activeStudents.slice(offset),
        ...activeStudents.slice(0, offset),
      ];

      for (const student of orderedStudents) {
        const options = newBlockCandidates(student.id, [day], minShiftSlots)
          .sort(
            (a, b) =>
              a.coverageAverage - b.coverageAverage ||
              a.slots[0] - b.slots[0],
          );
        if (options[0]) assign(options[0]);
      }
    }
  }

  const maximumAssignments = activeStudents.length * Math.max(1, maxWeeklySlots);
  let coverageIterations = 0;

  while (coverageIterations < maximumAssignments) {
    const hasCoverageGap = coverage.some((day) =>
      day.some((count) => count < settings.targetCoverage),
    );
    if (!hasCoverageGap) break;

    const options: AssignmentCandidate[] = [];
    for (const student of activeStudents) {
      const remaining = maxWeeklySlots - (usedSlots.get(student.id) ?? 0);
      options.push(...extensionCandidates(student.id, allDays));
      if (remaining >= minShiftSlots) {
        options.push(
          ...newBlockCandidates(student.id, allDays, minShiftSlots),
        );
      }
    }

    const chosen = options
      .filter((option) => option.deficitGain > 0)
      .sort(
        (a, b) =>
          b.deficitGain - a.deficitGain ||
          a.progress - b.progress ||
          a.coverageAverage - b.coverageAverage ||
          Number(b.extension) - Number(a.extension) ||
          a.daySlots - b.daySlots,
      )[0];

    if (!chosen) break;
    assign(chosen);
    coverageIterations += chosen.slots.length;
  }

  let targetIterations = 0;
  while (targetIterations < maximumAssignments) {
    let madeProgress = false;
    const orderedStudents = [...activeStudents].sort(
      (a, b) =>
        (usedSlots.get(a.id) ?? 0) - (usedSlots.get(b.id) ?? 0),
    );

    for (const student of orderedStudents) {
      const remaining = maxWeeklySlots - (usedSlots.get(student.id) ?? 0);
      if (remaining <= 0) continue;

      const options = extensionCandidates(student.id, allDays);
      if (remaining >= minShiftSlots) {
        options.push(
          ...newBlockCandidates(student.id, allDays, minShiftSlots),
        );
      }

      const chosen = options.sort(
        (a, b) =>
          a.coverageAverage - b.coverageAverage ||
          a.daySlots - b.daySlots ||
          Number(b.extension) - Number(a.extension) ||
          a.day - b.day ||
          a.slots[0] - b.slots[0],
      )[0];

      if (!chosen) continue;
      assign(chosen);
      targetIterations += chosen.slots.length;
      madeProgress = true;
    }

    if (!madeProgress) break;
  }

  const shifts: WorkShift[] = [];
  for (const student of activeStudents) {
    for (const day of allDays) {
      const ordered = [...(daySet(student.id, day) ?? [])].sort((a, b) => a - b);
      if (!ordered.length) continue;

      let runStart = ordered[0];
      let previous = ordered[0];

      function addRun(startSlot: number, endSlot: number) {
        shifts.push({
          id: crypto.randomUUID(),
          studentId: student.id,
          day,
          start: settings.dayStart + startSlot * STEP,
          end: settings.dayStart + (endSlot + 1) * STEP,
        });
      }

      for (const slot of ordered.slice(1)) {
        if (slot !== previous + 1) {
          addRun(runStart, previous);
          runStart = slot;
        }
        previous = slot;
      }
      addRun(runStart, previous);
    }
  }

  return shifts;
}
