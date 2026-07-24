export type WorkDay = 0 | 1 | 2 | 3 | 4;

export type StudentColor = "coral" | "blue" | "green" | "purple" | "gold";

export interface Student {
  id: string;
  name: string;
  color: StudentColor;
  active: boolean;
}

export interface ClassBlock {
  id: string;
  studentId: string;
  day: WorkDay;
  start: number;
  end: number;
  label?: string;
}

export interface WorkShift {
  id: string;
  studentId: string;
  day: WorkDay;
  start: number;
  end: number;
}

export interface AppSettings {
  dayStart: number;
  dayEnd: number;
  maxWeeklyHours: number;
  minShiftHours: number;
  targetCoverage: number;
}

export interface AppData {
  students: Student[];
  classBlocks: ClassBlock[];
  shifts: WorkShift[];
  settings: AppSettings;
}

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;

export const DEFAULT_SETTINGS: AppSettings = {
  dayStart: 8,
  dayEnd: 17,
  maxWeeklyHours: 19,
  minShiftHours: 2,
  targetCoverage: 1,
};

export function formatTime(value: number) {
  const hours = Math.floor(value);
  const minutes = Math.round((value - hours) * 60);
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, "0")} ${suffix}`;
}

export function duration(shift: Pick<WorkShift, "start" | "end">) {
  return Math.max(0, shift.end - shift.start);
}
