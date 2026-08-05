import { WorkDay } from "./types";

export interface ScannedClassBlock {
  day: WorkDay;
  start: number;
  end: number;
  label: string;
  confidence: "high" | "medium" | "low";
}

export interface ScheduleScanResult {
  blocks: ScannedClassBlock[];
  warnings: string[];
}
