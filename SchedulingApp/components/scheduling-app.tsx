"use client";

import {
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { demoData } from "@/lib/demo-data";
import {
  coverageSummary,
  generateSchedule,
  shiftWarnings,
  weeklyHours,
} from "@/lib/scheduler";
import {
  AppSettings,
  ClassBlock,
  DAYS,
  Student,
  StudentColor,
  WorkDay,
  WorkShift,
  duration,
  formatTime,
} from "@/lib/types";
import {
  getSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";

type Tab = "schedule" | "students" | "classes" | "settings";
type Modal = "shift" | "student" | "class" | null;

const COLORS: StudentColor[] = ["coral", "blue", "green", "purple", "gold"];
const PIXELS_PER_HOUR = 64;
const SNAP = 0.5;

function timeOptions(start = 6, end = 21) {
  return Array.from({ length: (end - start) * 2 + 1 }, (_, index) => start + index * 0.5);
}

export default function SchedulingApp() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [tab, setTab] = useState<Tab>("schedule");
  const [students, setStudents] = useState<Student[]>(demoData.students);
  const [classBlocks, setClassBlocks] = useState<ClassBlock[]>(demoData.classBlocks);
  const [shifts, setShifts] = useState<WorkShift[]>(demoData.shifts);
  const [settings, setSettings] = useState<AppSettings>(demoData.settings);
  const [modal, setModal] = useState<Modal>(null);
  const [notice, setNotice] = useState("Demo workspace — Supabase connection is next");
  const [authState, setAuthState] = useState<"checking" | "login" | "ready">(
    isSupabaseConfigured ? "checking" : "ready",
  );
  const [adminEmail, setAdminEmail] = useState("");
  const [loginError, setLoginError] = useState("");
  const shiftsRef = useRef(shifts);

  const coverage = useMemo(() => coverageSummary(shifts, settings), [shifts, settings]);
  const totalHours = useMemo(
    () => shifts.reduce((total, shift) => total + duration(shift), 0),
    [shifts],
  );

  useEffect(() => {
    shiftsRef.current = shifts;
  }, [shifts]);

  async function loadWorkspace() {
    if (!supabase) return;
    const [studentResult, blockResult, shiftResult, settingsResult] = await Promise.all([
      supabase.from("students").select("id,name,color,active").order("created_at"),
      supabase.from("class_blocks").select("id,student_id,day,start_time,end_time,label"),
      supabase.from("work_shifts").select("id,student_id,day,start_time,end_time"),
      supabase.from("app_settings").select("*").eq("id", 1).maybeSingle(),
    ]);

    const error =
      studentResult.error ?? blockResult.error ?? shiftResult.error ?? settingsResult.error;
    if (error) {
      setNotice(`Supabase setup needed: ${error.message}`);
      setStudents([]);
      setClassBlocks([]);
      setShifts([]);
      setAuthState("ready");
      return;
    }

    const studentRows = (studentResult.data ?? []) as Array<{
      id: string; name: string; color: StudentColor; active: boolean;
    }>;
    const blockRows = (blockResult.data ?? []) as Array<{
      id: string; student_id: string; day: WorkDay;
      start_time: number; end_time: number; label: string | null;
    }>;
    const shiftRows = (shiftResult.data ?? []) as Array<{
      id: string; student_id: string; day: WorkDay;
      start_time: number; end_time: number;
    }>;

    setStudents(studentRows);
    setClassBlocks(blockRows.map((row) => ({
      id: row.id,
      studentId: row.student_id,
      day: row.day,
      start: Number(row.start_time),
      end: Number(row.end_time),
      label: row.label ?? undefined,
    })));
    setShifts(shiftRows.map((row) => ({
      id: row.id,
      studentId: row.student_id,
      day: row.day,
      start: Number(row.start_time),
      end: Number(row.end_time),
    })));

    const saved = settingsResult.data as {
      day_start: number; day_end: number; max_weekly_hours: number;
      min_shift_hours: number; target_coverage: number;
    } | null;
    if (saved) {
      setSettings({
        dayStart: Number(saved.day_start),
        dayEnd: Number(saved.day_end),
        maxWeeklyHours: Number(saved.max_weekly_hours),
        minShiftHours: Number(saved.min_shift_hours),
        targetCoverage: Number(saved.target_coverage),
      });
    }
    setNotice("Connected to Supabase — changes save automatically");
    setAuthState("ready");
  }

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        setAuthState("login");
        return;
      }
      setAdminEmail(data.session.user.email ?? "");
      void loadWorkspace();
    });
  // The Supabase browser client is stable for the lifetime of this page.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setLoginError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoginError(error.message);
      return;
    }
    setAdminEmail(data.user.email ?? email);
    setAuthState("checking");
    await loadWorkspace();
  }

  async function signOut() {
    await supabase?.auth.signOut();
    setAuthState("login");
    setStudents([]);
    setClassBlocks([]);
    setShifts([]);
  }

  async function saveStudent(student: Student) {
    if (!supabase) return;
    const { error } = await supabase.from("students").upsert(student);
    if (error) setNotice(`Save failed: ${error.message}`);
  }

  async function saveClassBlock(block: ClassBlock) {
    if (!supabase) return;
    const { error } = await supabase.from("class_blocks").upsert({
      id: block.id,
      student_id: block.studentId,
      day: block.day,
      start_time: block.start,
      end_time: block.end,
      label: block.label ?? null,
    });
    if (error) setNotice(`Save failed: ${error.message}`);
  }

  async function saveShift(shift: WorkShift) {
    if (!supabase) return;
    const { error } = await supabase.from("work_shifts").upsert({
      id: shift.id,
      student_id: shift.studentId,
      day: shift.day,
      start_time: shift.start,
      end_time: shift.end,
    });
    if (error) setNotice(`Save failed: ${error.message}`);
  }

  async function replaceSavedShifts(next: WorkShift[]) {
    if (!supabase) return;
    const deleted = await supabase.from("work_shifts").delete().gte("day", 0);
    if (deleted.error) {
      setNotice(`Save failed: ${deleted.error.message}`);
      return;
    }
    if (!next.length) return;
    const { error } = await supabase.from("work_shifts").insert(
      next.map((shift) => ({
        id: shift.id,
        student_id: shift.studentId,
        day: shift.day,
        start_time: shift.start,
        end_time: shift.end,
      })),
    );
    if (error) setNotice(`Save failed: ${error.message}`);
  }

  async function deleteRow(table: "students" | "class_blocks" | "work_shifts", id: string) {
    if (!supabase) return;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) setNotice(`Delete failed: ${error.message}`);
  }

  function studentFor(id: string) {
    return students.find((student) => student.id === id);
  }

  function makeSchedule() {
    const generated = generateSchedule(students, classBlocks, settings);
    const summary = coverageSummary(generated, settings);
    setShifts(generated);
    void replaceSavedShifts(generated);
    setNotice(
      summary.percent === 100
        ? "Full coverage generated"
        : `Best viable schedule generated — ${summary.gapHours} open hours remain`,
    );
    setTab("schedule");
  }

  function moveShift(id: string, day: WorkDay, start: number) {
    const currentShift = shifts.find((shift) => shift.id === id);
    if (!currentShift) return;
    const length = duration(currentShift);
    const nextStart = Math.max(
      settings.dayStart,
      Math.min(start, settings.dayEnd - length),
    );
    const moved = { ...currentShift, day, start: nextStart, end: nextStart + length };
    setShifts((current) => current.map((shift) => shift.id === id ? moved : shift));
    void saveShift(moved);
    setNotice("Shift moved — review highlighted warnings");
  }

  function beginResize(event: ReactPointerEvent, shift: WorkShift) {
    event.preventDefault();
    event.stopPropagation();
    const initialY = event.clientY;
    const initialEnd = shift.end;

    function onMove(moveEvent: PointerEvent) {
      const delta =
        Math.round(((moveEvent.clientY - initialY) / PIXELS_PER_HOUR) / SNAP) * SNAP;
      const nextEnd = Math.max(
        shift.start + settings.minShiftHours,
        Math.min(settings.dayEnd, initialEnd + delta),
      );
      setShifts((current) =>
        current.map((item) => (item.id === shift.id ? { ...item, end: nextEnd } : item)),
      );
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setNotice("Shift resized — review highlighted warnings");
      const resized = shiftsRef.current.find((item) => item.id === shift.id);
      if (resized) void saveShift(resized);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function addStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (!name) return;
    const student: Student = {
      id: crypto.randomUUID(),
      name,
      color: COLORS[students.length % COLORS.length],
      active: true,
    };
    setStudents((current) => [...current, student]);
    void saveStudent(student);
    setModal(null);
    setNotice(`${name} added`);
  }

  function addClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const studentId = String(form.get("studentId"));
    const day = Number(form.get("day")) as WorkDay;
    const start = Number(form.get("start"));
    const end = Number(form.get("end"));
    if (!studentId || end <= start) return;
    const block: ClassBlock = {
      id: crypto.randomUUID(), studentId, day, start, end, label: "Class",
    };
    setClassBlocks((current) => [...current, block]);
    void saveClassBlock(block);
    setModal(null);
    setNotice("Class block added");
  }

  function addShift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const studentId = String(form.get("studentId"));
    const day = Number(form.get("day")) as WorkDay;
    const start = Number(form.get("start"));
    const end = Number(form.get("end"));
    if (!studentId || end <= start) return;
    const shift: WorkShift = { id: crypto.randomUUID(), studentId, day, start, end };
    setShifts((current) => [...current, shift]);
    void saveShift(shift);
    setModal(null);
    setNotice("Shift added — review highlighted warnings");
  }

  function updateSetting(key: keyof AppSettings, value: number) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    if (supabase) {
      void supabase.from("app_settings").upsert({
        id: 1,
        day_start: next.dayStart,
        day_end: next.dayEnd,
        max_weekly_hours: next.maxWeeklyHours,
        min_shift_hours: next.minShiftHours,
        target_coverage: next.targetCoverage,
        updated_at: new Date().toISOString(),
      });
    }
    setNotice("Settings updated — regenerate or review the current schedule");
  }

  function removeStudent(id: string) {
    setStudents((current) => current.filter((student) => student.id !== id));
    setClassBlocks((current) => current.filter((block) => block.studentId !== id));
    setShifts((current) => current.filter((shift) => shift.studentId !== id));
    void deleteRow("students", id);
  }

  const titles: Record<Tab, [string, string]> = {
    schedule: ["Work schedule", "Build around class commitments, then fine-tune by hand."],
    students: ["Students", "Manage the students who can be assigned to work."],
    classes: ["Class blocks", "Record times when each student is unavailable."],
    settings: ["Scheduling rules", "Adjust the constraints used to build viable schedules."],
  };

  if (authState === "checking") return <LoadingScreen />;
  if (authState === "login") {
    return <LoginScreen onSubmit={signIn} error={loginError} />;
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">C&amp;C</span>
          <div><strong>Class &amp; Clock</strong><small>IT Operations</small></div>
        </div>
        <nav aria-label="Primary navigation">
          <NavButton active={tab === "schedule"} onClick={() => setTab("schedule")} icon="▦">Schedule</NavButton>
          <NavButton active={tab === "students"} onClick={() => setTab("students")} icon="♙">Students</NavButton>
          <NavButton active={tab === "classes"} onClick={() => setTab("classes")} icon="◷">Class blocks</NavButton>
          <NavButton active={tab === "settings"} onClick={() => setTab("settings")} icon="⚙">Settings</NavButton>
        </nav>
        <div className="rules-card">
          <span className="eyebrow">Schedule rules</span>
          <dl>
            <div><dt>Workday</dt><dd>{formatTime(settings.dayStart)}–{formatTime(settings.dayEnd)}</dd></div>
            <div><dt>Weekly max</dt><dd>{settings.maxWeeklyHours} hours</dd></div>
            <div><dt>Min. shift</dt><dd>{settings.minShiftHours} hours</dd></div>
          </dl>
        </div>
        <div className="admin">
          <span className="avatar">AD</span>
          <div><strong>Administrator</strong><small>{adminEmail || "Demo workspace"}</small></div>
          <button aria-label="Sign out" onClick={() => void signOut()} disabled={!supabase}>↪</button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">{tab === "schedule" ? "Weekly coverage" : "Workspace setup"}</span>
            <h1>{titles[tab][0]}</h1>
            <p>{titles[tab][1]}</p>
          </div>
          <div className="actions">
            {tab === "schedule" && <button className="button secondary" onClick={() => setModal("shift")}>＋ Add shift</button>}
            {tab === "students" && <button className="button secondary" onClick={() => setModal("student")}>＋ Add student</button>}
            {tab === "classes" && <button className="button secondary" onClick={() => setModal("class")}>＋ Add class block</button>}
            {tab !== "settings" && <button className="button primary" onClick={makeSchedule}>✦ Generate schedule</button>}
          </div>
        </header>

        <div className="notice" role="status"><span />{notice}</div>

        {tab === "schedule" && (
          <>
            <section className="summary-row" aria-label="Schedule summary">
              <article><span>Coverage</span><strong>{coverage.percent}%</strong><small className={coverage.percent === 100 ? "positive" : "warning"}>{coverage.percent === 100 ? "Full day coverage" : `${coverage.gaps.length} gaps need attention`}</small></article>
              <article><span>Scheduled hours</span><strong>{totalHours}</strong><small>Across {students.filter((student) => weeklyHours(student.id, shifts) > 0).length} students</small></article>
              <article><span>Open time</span><strong>{coverage.gapHours}h</strong><small className={coverage.gapHours ? "warning" : "positive"}>{coverage.gapHours ? "Adjust blocks or availability" : "No open coverage"}</small></article>
              <article className="coverage-key"><span>Coverage health</span><div><i className="healthy" /> Covered <i className="gap" /> Gap</div><small>Drag blocks to make adjustments</small></article>
            </section>
            <ScheduleGrid
              classBlocks={classBlocks}
              shifts={shifts}
              settings={settings}
              studentFor={studentFor}
              onMove={moveShift}
              onResize={beginResize}
              onDelete={(id) => {
                setShifts((current) => current.filter((shift) => shift.id !== id));
                void deleteRow("work_shifts", id);
              }}
            />
          </>
        )}

        {tab === "students" && (
          <section className="panel">
            <div className="table-head"><span>Student</span><span>Class blocks</span><span>Scheduled</span><span>Status</span><span /></div>
            {students.map((student) => (
              <div className="table-row" key={student.id}>
                <div className="student-name"><i className={student.color}>{student.name.slice(0, 1)}</i><strong>{student.name}</strong></div>
                <span>{classBlocks.filter((block) => block.studentId === student.id).length}</span>
                <span>{weeklyHours(student.id, shifts)} / {settings.maxWeeklyHours}h</span>
                <button className={`status ${student.active ? "active" : ""}`} onClick={() => {
                  const updated = { ...student, active: !student.active };
                  setStudents((current) => current.map((item) => item.id === student.id ? updated : item));
                  void saveStudent(updated);
                }}>{student.active ? "Active" : "Inactive"}</button>
                <button className="icon-button danger" aria-label={`Delete ${student.name}`} onClick={() => removeStudent(student.id)}>×</button>
              </div>
            ))}
            {!students.length && <EmptyState title="No students yet" body="Add a student to begin entering class schedules." />}
          </section>
        )}

        {tab === "classes" && (
          <section className="panel">
            <div className="table-head class-table"><span>Student</span><span>Day</span><span>Unavailable</span><span>Duration</span><span /></div>
            {[...classBlocks].sort((a, b) => a.day - b.day || a.start - b.start).map((block) => (
              <div className="table-row class-table" key={block.id}>
                <div className="student-name"><i className={studentFor(block.studentId)?.color}>{studentFor(block.studentId)?.name.slice(0, 1)}</i><strong>{studentFor(block.studentId)?.name ?? "Unknown"}</strong></div>
                <span>{DAYS[block.day]}</span>
                <span>{formatTime(block.start)} – {formatTime(block.end)}</span>
                <span>{block.end - block.start}h</span>
                <button className="icon-button danger" aria-label="Delete class block" onClick={() => {
                  setClassBlocks((current) => current.filter((item) => item.id !== block.id));
                  void deleteRow("class_blocks", block.id);
                }}>×</button>
              </div>
            ))}
            {!classBlocks.length && <EmptyState title="No class blocks yet" body="Add unavailable times before generating a schedule." />}
          </section>
        )}

        {tab === "settings" && (
          <section className="settings-grid">
            <SettingCard title="Workday hours" body="Shifts stay within this daily window.">
              <Field label="Starts"><select value={settings.dayStart} onChange={(event) => updateSetting("dayStart", Number(event.target.value))}>{timeOptions(6, 12).map((time) => <option value={time} key={time}>{formatTime(time)}</option>)}</select></Field>
              <Field label="Ends"><select value={settings.dayEnd} onChange={(event) => updateSetting("dayEnd", Number(event.target.value))}>{timeOptions(13, 21).map((time) => <option value={time} key={time}>{formatTime(time)}</option>)}</select></Field>
            </SettingCard>
            <SettingCard title="Student limits" body="Control maximum hours and viable shift length.">
              <Field label="Weekly maximum"><input type="number" min="1" max="40" step=".5" value={settings.maxWeeklyHours} onChange={(event) => updateSetting("maxWeeklyHours", Number(event.target.value))} /></Field>
              <Field label="Minimum shift"><input type="number" min=".5" max="8" step=".5" value={settings.minShiftHours} onChange={(event) => updateSetting("minShiftHours", Number(event.target.value))} /></Field>
            </SettingCard>
            <SettingCard title="Coverage target" body="Preferred number of students working at once.">
              <Field label="Students on duty"><input type="number" min="1" max="5" value={settings.targetCoverage} onChange={(event) => updateSetting("targetCoverage", Number(event.target.value))} /></Field>
              <button className="button primary wide" onClick={makeSchedule}>Regenerate with these rules</button>
            </SettingCard>
          </section>
        )}
      </section>

      {modal && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setModal(null)}>
          <div className="modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setModal(null)} aria-label="Close">×</button>
            {modal === "student" && <StudentForm onSubmit={addStudent} />}
            {modal === "class" && <BlockForm students={students} title="Add class block" submitLabel="Add class block" onSubmit={addClass} />}
            {modal === "shift" && <BlockForm students={students} title="Add work shift" submitLabel="Add shift" onSubmit={addShift} constrained settings={settings} />}
          </div>
        </div>
      )}
    </main>
  );
}

function LoadingScreen() {
  return (
    <main className="auth-screen">
      <div className="auth-card loading-card">
        <span className="brand-mark">C&amp;C</span>
        <h1>Loading C&amp;C</h1>
        <p>Connecting to the scheduling workspace…</p>
      </div>
    </main>
  );
}

function LoginScreen({
  onSubmit,
  error,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  error: string;
}) {
  return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={onSubmit}>
        <span className="brand-mark">C&amp;C</span>
        <span className="eyebrow">IT Operations</span>
        <h1>Sign in to C&amp;C</h1>
        <p>Use the administrator account created in Supabase.</p>
        <Field label="Email address"><input name="email" type="email" autoComplete="email" required autoFocus /></Field>
        <Field label="Password"><input name="password" type="password" autoComplete="current-password" required /></Field>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="button primary wide" type="submit">Sign in</button>
      </form>
    </main>
  );
}

function NavButton({ active, icon, children, onClick }: { active: boolean; icon: string; children: React.ReactNode; onClick: () => void }) {
  return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}><span>{icon}</span>{children}</button>;
}

function ScheduleGrid({
  classBlocks,
  shifts,
  settings,
  studentFor,
  onMove,
  onResize,
  onDelete,
}: {
  classBlocks: ClassBlock[];
  shifts: WorkShift[];
  settings: AppSettings;
  studentFor: (id: string) => Student | undefined;
  onMove: (id: string, day: WorkDay, start: number) => void;
  onResize: (event: ReactPointerEvent, shift: WorkShift) => void;
  onDelete: (id: string) => void;
}) {
  const displayPadding = 1;
  const displayStart = Math.max(0, settings.dayStart - displayPadding);
  const displayEnd = Math.min(24, settings.dayEnd + displayPadding);
  const slotCount = Math.round((displayEnd - displayStart) / SNAP);
  const timeLabels = Array.from(
    { length: slotCount + 1 },
    (_, index) => displayStart + index * SNAP,
  ).filter(
    (time) => time === displayStart || time === displayEnd || Number.isInteger(time),
  );
  const gridHeight = (displayEnd - displayStart) * PIXELS_PER_HOUR;

  return (
    <section className="calendar-card">
      <div className="calendar-toolbar">
        <div><strong>Standard work week</strong></div>
        <div className="week-label">Monday–Friday <span>•</span> 30-minute increments</div>
      </div>
      <div className="calendar-scroll">
        <div className="calendar" style={{ gridTemplateRows: `42px ${gridHeight}px` }}>
          <div className="corner" />
          {DAYS.map((day) => <div className="day-head" key={day}>{day.slice(0, 3).toUpperCase()}</div>)}
          <div className="time-column">
            {timeLabels.map((time) => (
              <span key={time} style={{ top: (time - displayStart) * PIXELS_PER_HOUR }}>
                {formatTime(time).replace(":00", "")}
              </span>
            ))}
          </div>
          {DAYS.map((_, dayIndex) => (
            <div
              className="day-column"
              key={dayIndex}
              style={{ height: gridHeight }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData("text/shift-id");
                const rect = event.currentTarget.getBoundingClientRect();
                const offset = Math.max(0, Math.min(gridHeight, event.clientY - rect.top));
                const start = displayStart + Math.round((offset / PIXELS_PER_HOUR) / SNAP) * SNAP;
                if (id) onMove(id, dayIndex as WorkDay, start);
              }}
            >
              {Array.from({ length: slotCount }).map((_, index) => {
                const slotStart = displayStart + index * SNAP;
                const outsideWorkHours =
                  slotStart < settings.dayStart || slotStart >= settings.dayEnd;
                return (
                  <i
                    className={`${index % 2 ? "half" : ""} ${outsideWorkHours ? "outside-hours" : ""}`}
                    key={index}
                  />
                );
              })}
              {shifts.filter((shift) => shift.day === dayIndex).map((shift) => {
                const student = studentFor(shift.studentId);
                const warnings = shiftWarnings(shift, shifts, classBlocks, settings);
                return (
                  <article
                    draggable
                    onDragStart={(event) => event.dataTransfer.setData("text/shift-id", shift.id)}
                    className={`shift ${student?.color ?? "blue"} ${warnings.length ? "invalid" : ""}`}
                    key={shift.id}
                    style={{
                      top: (shift.start - displayStart) * PIXELS_PER_HOUR + 3,
                      height: duration(shift) * PIXELS_PER_HOUR - 6,
                    }}
                    title={warnings.length ? warnings.join(", ") : "Drag to move this shift"}
                  >
                    <strong>{student?.name ?? "Unknown"}</strong>
                    <span>{formatTime(shift.start)} – {formatTime(shift.end)}</span>
                    {warnings.length > 0 && <em>! {warnings[0]}</em>}
                    <button className="shift-delete" onClick={() => onDelete(shift.id)} aria-label="Delete shift">×</button>
                    <button className="resize-handle" onPointerDown={(event) => onResize(event, shift)} aria-label="Resize shift">•••</button>
                  </article>
                );
              })}
            </div>
          ))}
        </div>
        {!shifts.length && <div className="calendar-empty"><strong>No work shifts yet</strong><span>Generate a schedule or add a shift manually.</span></div>}
      </div>
    </section>
  );
}

function StudentForm({ onSubmit }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form onSubmit={onSubmit}>
      <span className="eyebrow">Student roster</span><h2>Add student</h2><p>Only a display name is required.</p>
      <Field label="Student name"><input name="name" autoFocus required placeholder="e.g. Malia K." /></Field>
      <button className="button primary wide" type="submit">Add student</button>
    </form>
  );
}

function BlockForm({ students, title, submitLabel, onSubmit, constrained, settings }: { students: Student[]; title: string; submitLabel: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void; constrained?: boolean; settings?: AppSettings }) {
  const start = constrained && settings ? settings.dayStart : 6;
  const end = constrained && settings ? settings.dayEnd : 21;
  return (
    <form onSubmit={onSubmit}>
      <span className="eyebrow">Availability</span><h2>{title}</h2><p>Times snap to 30-minute increments.</p>
      <Field label="Student"><select name="studentId" required>{students.map((student) => <option value={student.id} key={student.id}>{student.name}</option>)}</select></Field>
      <Field label="Day"><select name="day">{DAYS.map((day, index) => <option value={index} key={day}>{day}</option>)}</select></Field>
      <div className="field-pair">
        <Field label="Starts"><select name="start" defaultValue={start}>{timeOptions(start, end).slice(0, -1).map((time) => <option value={time} key={time}>{formatTime(time)}</option>)}</select></Field>
        <Field label="Ends"><select name="end" defaultValue={Math.min(start + 2, end)}>{timeOptions(start, end).slice(1).map((time) => <option value={time} key={time}>{formatTime(time)}</option>)}</select></Field>
      </div>
      <button className="button primary wide" type="submit">{submitLabel}</button>
    </form>
  );
}

function SettingCard({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return <article className="setting-card"><h2>{title}</h2><p>{body}</p>{children}</article>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="empty-state"><strong>{title}</strong><span>{body}</span></div>;
}
