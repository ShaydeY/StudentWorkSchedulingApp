const hours = ["8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM"];

const shifts = [
  { name: "Malia K.", day: 0, start: 0, span: 4, color: "coral" },
  { name: "Noah T.", day: 0, start: 4, span: 5, color: "blue" },
  { name: "Ikaika P.", day: 1, start: 0, span: 3, color: "green" },
  { name: "Malia K.", day: 1, start: 3, span: 4, color: "coral" },
  { name: "Noah T.", day: 1, start: 7, span: 2, color: "blue" },
  { name: "Noah T.", day: 2, start: 0, span: 5, color: "blue" },
  { name: "Leilani R.", day: 2, start: 5, span: 4, color: "purple" },
  { name: "Leilani R.", day: 3, start: 0, span: 4, color: "purple" },
  { name: "Ikaika P.", day: 3, start: 4, span: 5, color: "green" },
  { name: "Malia K.", day: 4, start: 0, span: 5, color: "coral" },
  { name: "Noah T.", day: 4, start: 5, span: 4, color: "blue" },
];

export default function Home() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">C&amp;C</span>
          <div>
            <strong>Class &amp; Clock</strong>
            <small>IT Operations</small>
          </div>
        </div>

        <nav aria-label="Primary navigation">
          <a className="nav-item active" href="#">
            <span>▦</span> Schedule
          </a>
          <a className="nav-item" href="#">
            <span>♙</span> Students
          </a>
          <a className="nav-item" href="#">
            <span>◷</span> Class blocks
          </a>
          <a className="nav-item" href="#">
            <span>⚙</span> Settings
          </a>
        </nav>

        <div className="rules-card">
          <span className="eyebrow">Schedule rules</span>
          <dl>
            <div><dt>Workday</dt><dd>8 AM–5 PM</dd></div>
            <div><dt>Weekly max</dt><dd>19 hours</dd></div>
            <div><dt>Min. shift</dt><dd>2 hours</dd></div>
          </dl>
        </div>

        <div className="admin">
          <span className="avatar">AD</span>
          <div><strong>Administrator</strong><small>Workspace owner</small></div>
          <button aria-label="Admin menu">•••</button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">Weekly coverage</span>
            <h1>Work schedule</h1>
            <p>Build around class commitments, then fine-tune by hand.</p>
          </div>
          <div className="actions">
            <button className="button secondary">＋ Add shift</button>
            <button className="button primary">✦ Generate schedule</button>
          </div>
        </header>

        <section className="summary-row" aria-label="Schedule summary">
          <article><span>Coverage</span><strong>94%</strong><small className="positive">↑ 8% from draft</small></article>
          <article><span>Scheduled hours</span><strong>76</strong><small>Across 4 students</small></article>
          <article><span>Open time</span><strong>2.5h</strong><small className="warning">3 gaps need attention</small></article>
          <article className="coverage-key"><span>Coverage health</span><div><i className="healthy" /> Covered <i className="gap" /> Gap</div><small>Drag blocks to make adjustments</small></article>
        </section>

        <section className="calendar-card">
          <div className="calendar-toolbar">
            <div>
              <button aria-label="Previous week">‹</button>
              <button aria-label="Next week">›</button>
              <strong>July 20–24, 2026</strong>
            </div>
            <div className="week-label">Monday–Friday <span>•</span> HST</div>
          </div>

          <div className="calendar">
            <div className="corner" />
            {["MON 20", "TUE 21", "WED 22", "THU 23", "FRI 24"].map((day) => (
              <div className="day-head" key={day}>{day}</div>
            ))}
            <div className="time-column">
              {hours.map((hour) => <span key={hour}>{hour}</span>)}
            </div>
            {[0, 1, 2, 3, 4].map((day) => (
              <div className="day-column" key={day}>
                {Array.from({ length: 9 }).map((_, index) => <i key={index} />)}
                {shifts.filter((shift) => shift.day === day).map((shift) => (
                  <article
                    className={`shift ${shift.color}`}
                    key={`${shift.name}-${shift.start}`}
                    style={{ top: `${shift.start * 64 + 6}px`, height: `${shift.span * 64 - 12}px` }}
                  >
                    <strong>{shift.name}</strong>
                    <span>{hours[shift.start]} – {hours[shift.start + shift.span]}</span>
                    <b>⋮⋮</b>
                  </article>
                ))}
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
