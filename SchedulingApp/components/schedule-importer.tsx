"use client";

import { ChangeEvent, FormEvent, useRef, useState } from "react";
import { ScheduleScanResult, ScannedClassBlock } from "@/lib/schedule-import";
import { DAYS, Student, WorkDay, formatTime } from "@/lib/types";

interface ReviewBlock extends ScannedClassBlock { id: string; selected: boolean; }

export default function ScheduleImporter({ students, getAccessToken, onConfirm, onClose }: {
  students: Student[];
  getAccessToken: () => Promise<string | null>;
  onConfirm: (studentId: string, blocks: ScannedClassBlock[]) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [blocks, setBlocks] = useState<ReviewBlock[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setError("");
  }

  async function scan(event: FormEvent) {
    event.preventDefault();
    if (!file || !studentId) return;
    setScanning(true);
    setError("");
    setWarnings([]);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Your sign-in session expired. Please sign in again.");
      const body = new FormData();
      body.set("image", file);
      const response = await fetch("/api/scan-schedule", {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body,
      });
      const result = await response.json() as ScheduleScanResult & { error?: string };
      if (!response.ok) throw new Error(result.error || "The schedule could not be scanned.");
      setBlocks(result.blocks.map((block) => ({ ...block, id: crypto.randomUUID(), selected: true })));
      setWarnings(result.warnings);
      setScanned(true);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "The schedule could not be scanned.");
    } finally {
      setScanning(false);
    }
  }

  function updateBlock(id: string, update: Partial<ReviewBlock>) {
    setBlocks((current) => current.map((block) => block.id === id ? { ...block, ...update } : block));
  }

  function confirm() {
    const selected = blocks.filter((block) => block.selected && block.end > block.start);
    if (!selected.length) {
      setError("Select at least one valid class block to add.");
      return;
    }
    onConfirm(studentId, selected);
  }

  return (
    <div className="schedule-importer">
      <span className="eyebrow">Photo import</span>
      <h2>Scan a class schedule</h2>
      <p>Upload a course-table or weekly-calendar screenshot, then verify every result before saving.</p>
      <label className="field"><span>Student</span>
        <select value={studentId} onChange={(event) => setStudentId(event.target.value)} disabled={scanning}>
          {students.map((student) => <option value={student.id} key={student.id}>{student.name}</option>)}
        </select>
      </label>

      {!scanned && <form onSubmit={scan}>
        <label className={`upload-dropzone ${file ? "has-file" : ""}`}>
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseFile} required />
          <strong>{file ? file.name : "Choose schedule image"}</strong>
          <span>PNG, JPG, or WebP · 10 MB maximum</span>
        </label>
        <div className="privacy-note"><span aria-hidden="true">✓</span> The image is processed in memory and is not saved to the app database.</div>
        <button className="button primary wide" type="submit" disabled={!file || scanning || !studentId}>
          {scanning ? "Scanning schedule…" : "Scan schedule"}
        </button>
      </form>}

      {scanned && <div className="scan-review">
        <div className="scan-review-heading">
          <div><strong>Review detected blocks</strong><span>{blocks.length} found · uncheck anything that should not be added</span></div>
          <button className="button secondary" type="button" onClick={() => { setScanned(false); setBlocks([]); setWarnings([]); }}>Scan another</button>
        </div>
        {warnings.length > 0 && <div className="scan-warnings" role="status">{warnings.map((warning) => <span key={warning}>⚠ {warning}</span>)}</div>}
        <div className="scan-block-list">
          {blocks.map((block) => <div className={`scan-block-row confidence-${block.confidence}`} key={block.id}>
            <input aria-label="Include class block" type="checkbox" checked={block.selected} onChange={(event) => updateBlock(block.id, { selected: event.target.checked })} />
            <select aria-label="Day" value={block.day} onChange={(event) => updateBlock(block.id, { day: Number(event.target.value) as WorkDay })}>
              {DAYS.map((day, index) => <option value={index} key={day}>{day}</option>)}
            </select>
            <input aria-label="Start time" type="time" step="900" value={decimalToTime(block.start)} onChange={(event) => updateBlock(block.id, { start: timeToDecimal(event.target.value) })} />
            <span aria-hidden="true">to</span>
            <input aria-label="End time" type="time" step="900" value={decimalToTime(block.end)} onChange={(event) => updateBlock(block.id, { end: timeToDecimal(event.target.value) })} />
            <input aria-label="Class label" value={block.label} maxLength={80} onChange={(event) => updateBlock(block.id, { label: event.target.value })} />
            <small title={`${block.confidence} confidence`}>{block.confidence}</small>
          </div>)}
          {!blocks.length && <div className="scan-empty">No class meetings were detected. Try a clearer or more tightly cropped screenshot.</div>}
        </div>
        <div className="scan-summary">{blocks.filter((block) => block.selected).map((block) =>
          <span key={block.id}>{DAYS[block.day].slice(0, 3)} {formatTime(block.start)}–{formatTime(block.end)}</span>
        )}</div>
        <div className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="button primary" type="button" onClick={confirm} disabled={!blocks.some((block) => block.selected)}>Add selected blocks</button>
        </div>
      </div>}
      {error && <div className="form-error" role="alert">{error}</div>}
    </div>
  );
}

function decimalToTime(value: number) {
  const hours = Math.floor(value);
  const minutes = Math.round((value - hours) * 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function timeToDecimal(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours + minutes / 60;
}
