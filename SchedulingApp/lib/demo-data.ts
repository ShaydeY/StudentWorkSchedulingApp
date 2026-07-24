import { AppData } from "./types";

export const demoData: AppData = {
  settings: {
    dayStart: 8,
    dayEnd: 17,
    maxWeeklyHours: 19,
    minShiftHours: 2,
    targetCoverage: 1,
  },
  students: [
    { id: "malia", name: "Malia K.", color: "coral", active: true },
    { id: "noah", name: "Noah T.", color: "blue", active: true },
    { id: "ikaika", name: "Ikaika P.", color: "green", active: true },
    { id: "leilani", name: "Leilani R.", color: "purple", active: true },
  ],
  classBlocks: [
    { id: "c1", studentId: "malia", day: 0, start: 11, end: 12.5, label: "Class" },
    { id: "c2", studentId: "malia", day: 2, start: 9, end: 11, label: "Class" },
    { id: "c3", studentId: "noah", day: 0, start: 8, end: 11, label: "Class" },
    { id: "c4", studentId: "noah", day: 3, start: 10, end: 12, label: "Class" },
    { id: "c5", studentId: "ikaika", day: 1, start: 11, end: 14, label: "Class" },
    { id: "c6", studentId: "ikaika", day: 4, start: 8, end: 10, label: "Class" },
    { id: "c7", studentId: "leilani", day: 2, start: 8, end: 13, label: "Class" },
    { id: "c8", studentId: "leilani", day: 4, start: 12, end: 15, label: "Class" },
  ],
  shifts: [],
};
