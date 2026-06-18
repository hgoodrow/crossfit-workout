import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import FALLBACK_PLAN from "./fallbackPlan.json";

// ---------------------------------------------------------------------------
// CROSSFIT WORKOUT — Strict HSPU Phase 1 program tracker (standalone PWA build)
// Storage: localStorage (persists on-device). Mobile-first responsive.
// The program (phase + 4-week microcycle) is loaded at runtime from
// public/program.json so it can be edited as a flat file without rebuilding.
// ---------------------------------------------------------------------------

const ACCENT = "#ff5a3c";
const GOLD = "#e8b64c";
const BLUE = "#5fb0ff";
const INK = "#0b0d12";
const PANEL = "#16191f";
const LINE = "rgba(255,255,255,0.08)";
const CHALK = "#eceef2";
const MUTE = "#8b9099";
const GREEN = "#6ee79f";
const VIOLET = "#7c5cff"; // secondary brand — duotone accents, ring, Intensity theme
const SURFACE = "linear-gradient(180deg,#181b22,#13151b)";
const ACCENT_GLOW = "0 0 0 1px rgba(255,90,60,.08), 0 10px 30px rgba(255,90,60,.06)";
const DUO = `linear-gradient(135deg, ${ACCENT}, ${VIOLET})`; // orange → violet brand gradient

// Spacing + type scale — used by newer components for consistent rhythm.
const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
const FS = { d1: 28, d2: 22, d3: 18, d4: 16, b1: 15, b2: 13, b3: 12, b4: 11 };

// localStorage wrapper matching the prior async storage shape
const store = {
  get: async (k) => {
    try { const v = localStorage.getItem(k); return v == null ? null : { value: v }; }
    catch { return null; }
  },
  set: async (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

// HSPU-focused tracking. holdSec + wristPain keys are reused from the prior
// schema so older logged data keeps charting; maxHSPU is the new north star.
const METRICS = [
  { key: "maxHSPU", label: "Strict HSPU", unit: "reps", color: ACCENT, invert: false, refY: 1, refLabel: "goal", refColor: GREEN },
  { key: "holdSec", label: "Handstand hold", unit: "s", color: GOLD, invert: false },
  { key: "wristPain", label: "Wrist pain", unit: "/10", color: BLUE, invert: true },
];

const fmtDate = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const todayISO = () => new Date().toISOString().slice(0, 10);
const sessionKey = (w, d) => `${w}-${d}`;
const themeColor = (t) => (t === "Intensity" ? VIOLET : t === "Assistance" ? GOLD : BLUE);

const totalSessions = (plan) => plan.weeks.reduce((n, w) => n + w.days.length, 0);

const getDay = (plan, w, d) => plan.weeks.find((x) => x.week === w)?.days.find((y) => y.day === d) || null;
const dayExercises = (day) => (day ? [...(day.warmup || []), ...(day.wod || []), ...(day.accessory || [])] : []);
const dayHasBench = (day) => dayExercises(day).some((e) => e.benchmark);
const dayHasHSPU = (day) => dayExercises(day).some((e) => e.benchmark || /handstand push-?up|hspu/i.test(e.name));
const dayHasHold = (day) => dayExercises(day).some((e) => /handstand hold/i.test(e.name));
const SLOTS = [["warmup", "Warm up"], ["wod", "WOD"], ["accessory", "Accessory"]];

// First week in the cycle that still has an unfinished day (where you are now).
const currentWeek = (plan, done) => {
  for (const w of plan.weeks)
    if (w.days.some((d) => !done[sessionKey(w.week, d.day)])) return w.week;
  return plan.weeks[plan.weeks.length - 1].week;
};

// First unfinished session in the cycle, or null when the cycle is complete.
const nextSession = (plan, done) => {
  for (const w of plan.weeks)
    for (const d of w.days)
      if (!done[sessionKey(w.week, d.day)]) return { week: w.week, day: d.day, theme: d.theme };
  return null;
};

export default function App() {
  const [logs, setLogs] = useState([]);
  const [progress, setProgress] = useState({ cycle: 1, done: {} });
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("dash");
  const [week, setWeek] = useState(1);
  const [ioMsg, setIoMsg] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [confirmDelId, setConfirmDelId] = useState(null);
  const [openMetric, setOpenMetric] = useState(null);
  const fileRef = useRef(null);
  const [draft, setDraft] = useState({
    date: todayISO(), week: 1, day: 1, movements: {}, maxHSPU: "", holdSec: "", wristPain: "", notes: "", markDone: false,
  });

  useEffect(() => {
    (async () => {
      const r = await store.get("hs:logs");
      if (r?.value) { try { setLogs(JSON.parse(r.value)); } catch {} }
      const p = await store.get("hs:progress");
      if (p?.value) { try { const j = JSON.parse(p.value); if (j && j.done) setProgress(j); } catch {} }

      // Load the program from the flat file, caching it so it survives offline
      // reloads and the brief post-deploy CDN propagation window.
      let nextPlan = null;
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}program.json`, { cache: "no-cache" });
        if (res.ok) {
          const json = await res.json();
          if (json && Array.isArray(json.weeks) && json.phase) {
            nextPlan = json;
            await store.set("hs:program", JSON.stringify(json));
          }
        }
      } catch {}
      if (!nextPlan) {
        const cached = await store.get("hs:program");
        if (cached?.value) { try { const j = JSON.parse(cached.value); if (Array.isArray(j.weeks)) nextPlan = j; } catch {} }
      }
      const resolved = nextPlan || FALLBACK_PLAN;
      setPlan(resolved);
      // Open the Program tab on the week the lifter is actually on, and pre-fill
      // the log with the next unfinished session.
      const pr = p?.value ? (() => { try { return JSON.parse(p.value); } catch { return null; } })() : null;
      setWeek(currentWeek(resolved, pr?.done || {}));
      const nx = nextSession(resolved, pr?.done || {}) || { week: 1, day: 1 };
      setDraft((d) => ({ ...d, week: nx.week, day: nx.day }));
      setLoading(false);
    })();
  }, []);

  const persistLogs = async (next) => { setLogs(next); await store.set("hs:logs", JSON.stringify(next)); };
  const persistProgress = async (next) => { setProgress(next); await store.set("hs:progress", JSON.stringify(next)); };

  const sorted = useMemo(() => [...logs].sort((a, b) => new Date(a.date) - new Date(b.date)), [logs]);
  const latest = sorted[sorted.length - 1];

  // Create a new session, or update the one being edited (editingId) in place.
  const saveLog = async () => {
    const num = (v) => (v === "" ? null : Number(v));
    const movements = Object.fromEntries(
      Object.entries(draft.movements || {}).filter(([, v]) => v != null && String(v).trim() !== "")
    );
    const entry = {
      id: editingId ?? Date.now(), date: draft.date, week: draft.week, day: draft.day, movements,
      maxHSPU: num(draft.maxHSPU), holdSec: num(draft.holdSec), wristPain: num(draft.wristPain),
      notes: draft.notes.trim(),
    };
    // Update by id when editing (keeping one-entry-per-date); else create.
    const next = editingId
      ? logs.map((l) => (l.id === editingId ? entry : l)).filter((l) => l.id === editingId || l.date !== entry.date)
      : [...logs.filter((l) => l.date !== entry.date), entry];
    await persistLogs(next);

    let done = progress.done;
    if (draft.week && draft.day) {
      const k = sessionKey(draft.week, draft.day);
      const has = !!done[k];
      if (draft.markDone && !has) { done = { ...done, [k]: true }; await persistProgress({ ...progress, done }); }
      else if (editingId && !draft.markDone && has) { const d2 = { ...done }; delete d2[k]; done = d2; await persistProgress({ ...progress, done }); }
    }

    const wasEditing = editingId != null;
    const nx = nextSession(plan, done) || { week: 1, day: 1 };
    setEditingId(null);
    setDraft({ date: todayISO(), week: nx.week, day: nx.day, movements: {}, maxHSPU: "", holdSec: "", wristPain: "", notes: "", markDone: false });
    setTab(wasEditing ? "history" : "dash");
  };

  const delLog = async (id) => persistLogs(logs.filter((l) => l.id !== id));

  // Pre-fill the Log form with an existing entry and switch into edit mode.
  const startEdit = (l) => {
    const fb = nextSession(plan, progress.done) || { week: 1, day: 1 };
    setEditingId(l.id);
    setDraft({
      date: l.date,
      week: l.week ?? fb.week,
      day: l.day ?? fb.day,
      movements: { ...(l.movements || {}) },
      maxHSPU: l.maxHSPU == null ? "" : String(l.maxHSPU),
      holdSec: l.holdSec == null ? "" : String(l.holdSec),
      wristPain: l.wristPain == null ? "" : String(l.wristPain),
      notes: l.notes || "",
      markDone: l.week && l.day ? !!progress.done[sessionKey(l.week, l.day)] : false,
    });
    setTab("log");
  };

  // Reset the form to a fresh next-up session (leaves edit mode).
  const newEntry = () => {
    setEditingId(null);
    const nx = nextSession(plan, progress.done) || { week: 1, day: 1 };
    setDraft({ date: todayISO(), week: nx.week, day: nx.day, movements: {}, maxHSPU: "", holdSec: "", wristPain: "", notes: "", markDone: false });
  };

  const cancelEdit = () => { newEntry(); setTab("history"); };

  // Tab selection from the nav bar: starting a new log exits any active edit.
  const selectTab = (id) => { if (id === "log" && editingId) newEntry(); setTab(id); };

  const toggleSession = async (w, d) => {
    const k = sessionKey(w, d);
    const done = { ...progress.done };
    if (done[k]) delete done[k]; else done[k] = true;
    await persistProgress({ ...progress, done });
  };

  const startNextCycle = async () => persistProgress({ cycle: progress.cycle + 1, done: {} });

  const flash = (msg) => { setIoMsg(msg); setTimeout(() => setIoMsg(""), 4000); };

  // Export logs + cycle progress to a downloadable JSON file (device-to-device backup).
  const exportData = () => {
    const payload = { app: "crossfit-workout", version: 2, exportedAt: new Date().toISOString(), logs, progress };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crossfit-log-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    flash(`Exported ${logs.length} session(s).`);
  };

  // Import a previously exported file: merge sessions by date and restore progress.
  const importData = async (file) => {
    try {
      const data = JSON.parse(await file.text());
      const incoming = Array.isArray(data) ? data : data.logs;
      if (!Array.isArray(incoming)) throw new Error("no sessions found in file");
      const byDate = new Map(logs.map((l) => [l.date, l]));
      for (const l of incoming) byDate.set(l.date, { ...l, id: l.id ?? Date.now() + Math.floor(Math.random() * 1e6) });
      await persistLogs([...byDate.values()]);
      if (data.progress && data.progress.done) await persistProgress(data.progress);
      flash(`Imported ${incoming.length} session(s).`);
    } catch (e) {
      flash(`Import failed: ${e.message}`);
    }
  };

  const delta = (key) => {
    const vals = sorted.filter((l) => l[key] != null);
    if (vals.length < 2) return null;
    return vals[vals.length - 1][key] - vals[0][key];
  };

  if (loading)
    return <Shell><div style={{ padding: 80, textAlign: "center", color: MUTE, fontFamily: "var(--mono)" }}>loading…</div></Shell>;

  const PHASE = plan.phase;
  const total = totalSessions(plan);
  const doneCount = Object.values(progress.done).filter(Boolean).length;
  const upNext = nextSession(plan, progress.done);
  const weekObj = plan.weeks.find((w) => w.week === week) || plan.weeks[0];

  const goToSession = (w) => { setWeek(w); setTab("program"); };

  return (
    <Shell>
      <Header />

      {tab === "dash" && (
        <div style={{ padding: "0 16px 60px" }}>
          <div className="rise"><PhaseProgress phase={PHASE} cycle={progress.cycle} done={doneCount} total={total}
            upNext={upNext} onJump={goToSession} onNextCycle={startNextCycle} /></div>

          {PHASE.about?.length > 0 && (
            <div className="rise" style={{ ...card(), marginTop: 14, animationDelay: ".05s" }}>
              <SectionLabel>Why strict HSPU first</SectionLabel>
              {PHASE.about.map((a, i) => (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: i < PHASE.about.length - 1 ? 10 : 0, color: MUTE, fontFamily: "var(--body)", fontSize: 13, lineHeight: 1.6 }}>
                  <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: "50%", display: "grid", placeItems: "center", background: "rgba(255,90,60,0.14)", color: ACCENT, fontFamily: "var(--mono)", fontSize: 11 }}>{i + 1}</span>
                  <span>{a}</span>
                </div>
              ))}
            </div>
          )}

          <div className="rise" style={{ ...card(), marginTop: 14, animationDelay: ".1s" }}>
            <SectionLabel>The {PHASE.weeks}-week block · {PHASE.daysPerWeek} days/week</SectionLabel>
            <div style={{ display: "grid", gap: 8 }}>
              {plan.weeks.map((w) => (
                <div key={w.week} style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
                  <span style={{ width: 52, flexShrink: 0, display: "flex", alignItems: "center", fontFamily: "var(--mono)", fontSize: 12, color: MUTE }}>Wk {w.week}</span>
                  <div style={{ display: "flex", gap: 6, flex: 1, flexWrap: "wrap" }}>
                    {w.days.map((d) => {
                      const tc = themeColor(d.theme);
                      const bench = dayHasBench(d);
                      const sdone = !!progress.done[sessionKey(w.week, d.day)];
                      return (
                        <button key={d.day} className="lift" onClick={() => goToSession(w.week)} style={{
                          flex: 1, minWidth: 100, textAlign: "left", cursor: "pointer",
                          background: sdone ? "rgba(110,231,159,0.08)" : INK,
                          border: `1px solid ${sdone ? "rgba(110,231,159,0.4)" : LINE}`, borderRadius: 10, padding: "8px 10px",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: tc }} />
                            <span style={{ fontFamily: "var(--body)", fontSize: 12, fontWeight: 500, color: CHALK }}>Day {d.day}</span>
                            {bench && <Icon name="flame" size={12} color={ACCENT} />}
                            {sdone && <span style={{ marginLeft: "auto", display: "inline-flex" }}><Icon name="check" size={13} color={GREEN} /></span>}
                          </div>
                          <div style={{ fontFamily: "var(--body)", fontSize: 11, color: MUTE, marginTop: 3, lineHeight: 1.35 }}>{d.wod?.[0]?.name || d.theme}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 16, flexWrap: "wrap", fontFamily: "var(--body)", fontSize: 11, color: MUTE }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name="flame" size={12} color={ACCENT} /> benchmark — log max strict HSPU</span>
              <span>Volume <span style={{ color: BLUE }}>●</span> · Assistance <span style={{ color: GOLD }}>●</span> · Intensity <span style={{ color: VIOLET }}>●</span></span>
            </div>
          </div>

          <div className="rise" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, margin: "22px 0 26px", animationDelay: ".15s" }}>
            {METRICS.map((m) => {
              const d = delta(m.key);
              const good = d == null ? null : m.invert ? d < 0 : d > 0;
              return (
                <StatCard key={m.key} metric={m} latestVal={latest?.[m.key] ?? null} d={d} good={good} data={sorted}
                  expanded={openMetric === m.key} onToggle={() => setOpenMetric(openMetric === m.key ? null : m.key)} />
              );
            })}
          </div>
        </div>
      )}

      {tab === "program" && (
        <div style={{ padding: "0 16px 60px", maxWidth: 820 }}>
          <div className="rise" style={{ ...card(), marginBottom: 14 }}>
            <SectionLabel>Phase {PHASE.level}</SectionLabel>
            <div style={{ fontFamily: "var(--display)", fontWeight: 600, fontSize: 20, color: CHALK }}>{PHASE.title}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 22px", margin: "14px 0 4px" }}>
              <KV k="Goal" v={PHASE.goal} accent />
              <KV k="Current" v={PHASE.currentAbility} />
              <KV k="Schedule" v={`${PHASE.daysPerWeek} days/week · ${PHASE.weeks} weeks`} />
            </div>
            {PHASE.notes?.map((n, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginTop: 10, color: MUTE, fontFamily: "var(--body)", fontSize: 13, lineHeight: 1.6 }}>
                <span style={{ color: ACCENT }}>◆</span><span>{n}</span>
              </div>
            ))}
          </div>

          <div className="rise" style={{ ...card(), marginBottom: 16, animationDelay: ".05s", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontFamily: "var(--display)", fontWeight: 600, fontSize: 16, color: CHALK }}>Cycle {progress.cycle}</div>
              <div style={{ fontFamily: "var(--body)", fontSize: 12, color: MUTE, marginTop: 2 }}>{doneCount}/{total} sessions complete</div>
              <div style={{ width: 180, maxWidth: "60vw", marginTop: 8 }}><ProgressBar value={doneCount} max={total} /></div>
            </div>
            <button onClick={startNextCycle} style={ghostBtn()}>Start next cycle</button>
          </div>

          <div className="rise" style={{ marginBottom: 16, overflowX: "auto", animationDelay: ".1s" }}>
            <div style={{ display: "inline-flex", gap: 3, background: "#111319", border: `1px solid ${LINE}`, borderRadius: 14, padding: 3 }}>
              {plan.weeks.map((w) => {
                const on = w.week === week;
                const wDone = w.days.every((d) => progress.done[sessionKey(w.week, d.day)]);
                return (
                  <button key={w.week} onClick={() => setWeek(w.week)} style={{
                    background: on ? "linear-gradient(180deg,#23262f,#1b1e26)" : "transparent",
                    border: "none", cursor: "pointer", whiteSpace: "nowrap", padding: "8px 16px", borderRadius: 10,
                    fontFamily: "var(--body)", fontSize: 13, fontWeight: on ? 500 : 400, color: on ? CHALK : MUTE,
                    boxShadow: on ? "0 1px 0 rgba(255,255,255,.06) inset" : "none",
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    Week {w.week}{wDone && <span style={{ color: GREEN, fontSize: 12 }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14, alignItems: "start" }}>
            {weekObj.days.map((d, i) => (
              <div key={d.day} className="rise" style={{ animationDelay: `${0.12 + i * 0.06}s` }}>
                <DayCard week={weekObj.week} day={d}
                  done={!!progress.done[sessionKey(weekObj.week, d.day)]}
                  onToggle={() => toggleSession(weekObj.week, d.day)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "log" && (() => {
        const sess = getDay(plan, draft.week, draft.day);
        const dayOpts = plan.weeks.find((w) => w.week === draft.week)?.days || [];
        const setMv = (name, v) => setDraft({ ...draft, movements: { ...draft.movements, [name]: v } });
        return (
          <div style={{ padding: "0 16px 60px", maxWidth: 680 }}>
            <div className="rise" style={card(true)}>
              {editingId && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 16, padding: "10px 12px", borderRadius: 12, background: "rgba(255,90,60,0.10)", border: "1px solid rgba(255,90,60,0.35)" }}>
                  <span style={{ fontFamily: "var(--body)", fontSize: 13, color: ACCENT }}>Editing session — {fmtDate(draft.date)}</span>
                  <button onClick={cancelEdit} style={ghostBtn()}>Cancel</button>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label="Week">
                  <select value={draft.week} onChange={(e) => setDraft({ ...draft, week: Number(e.target.value) })} style={inp()}>
                    {plan.weeks.map((w) => <option key={w.week} value={w.week}>Week {w.week}</option>)}
                  </select>
                </Field>
                <Field label="Day">
                  <select value={draft.day} onChange={(e) => setDraft({ ...draft, day: Number(e.target.value) })} style={inp()}>
                    {dayOpts.map((d) => <option key={d.day} value={d.day}>Day {d.day} · {d.theme}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Date"><input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} style={inp()} /></Field>

              {sess && SLOTS.map(([slot, title]) => {
                const items = sess[slot] || [];
                if (!items.length) return null;
                return (
                  <div key={slot} style={{ marginBottom: 6 }}>
                    <div style={{ fontFamily: "var(--body)", fontSize: 11, fontWeight: 500, color: MUTE, margin: "6px 0 8px" }}>{title}</div>
                    {items.map((ex, i) => (
                      <div key={i} style={{ marginBottom: 14 }}>
                        <label style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                          <span style={{ fontFamily: "var(--display)", fontWeight: 500, fontSize: 14, color: CHALK }}>{ex.name}{ex.benchmark && <span style={{ color: ACCENT, marginLeft: 6 }}>◆</span>}</span>
                          <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: GOLD }}>{ex.prescription}</span>
                        </label>
                        <input value={draft.movements[ex.name] || ""} onChange={(e) => setMv(ex.name, e.target.value)} placeholder="what you did — e.g. 45 lb, all 10" style={{ ...inp(), fontFamily: "var(--body)" }} />
                      </div>
                    ))}
                  </div>
                );
              })}

              <div style={{ height: 1, background: LINE, margin: "8px 0 16px" }} />
              <div style={{ fontFamily: "var(--body)", fontSize: 11, fontWeight: 500, color: MUTE, marginBottom: 12 }}>Tracked metrics</div>
              {dayHasHSPU(sess) && <Field label="Max strict HSPU (reps)"><input type="number" inputMode="numeric" min="0" value={draft.maxHSPU} onChange={(e) => setDraft({ ...draft, maxHSPU: e.target.value })} placeholder="0" style={inp()} /></Field>}
              <div style={{ display: "grid", gridTemplateColumns: dayHasHold(sess) ? "1fr 1fr" : "1fr", gap: 14 }}>
                {dayHasHold(sess) && <Field label="Handstand hold (s)"><input type="number" inputMode="numeric" value={draft.holdSec} onChange={(e) => setDraft({ ...draft, holdSec: e.target.value })} placeholder="30" style={inp()} /></Field>}
                <Field label="Wrist pain (0–10)"><input type="number" inputMode="numeric" min="0" max="10" value={draft.wristPain} onChange={(e) => setDraft({ ...draft, wristPain: e.target.value })} placeholder="2" style={inp()} /></Field>
              </div>
              <Field label="Notes"><textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="How it felt, scaling, anything to remember…" rows={3} style={{ ...inp(), resize: "vertical", fontFamily: "var(--body)" }} /></Field>

              <label style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0 18px", cursor: "pointer", fontFamily: "var(--body)", fontSize: 14, color: CHALK }}>
                <input type="checkbox" checked={draft.markDone} onChange={(e) => setDraft({ ...draft, markDone: e.target.checked })} style={{ accentColor: ACCENT, width: 18, height: 18 }} />
                Mark Week {draft.week} Day {draft.day} complete
              </label>

              <button onClick={saveLog} style={primaryBtn()}>{editingId ? "Update session" : "Save session"}</button>
            </div>
          </div>
        );
      })()}

      {tab === "history" && (
        <div style={{ padding: "0 16px 60px", maxWidth: 820 }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={exportData} style={ghostBtn()}>↓ Export JSON</button>
            <button onClick={() => fileRef.current?.click()} style={ghostBtn()}>↑ Import JSON</button>
            <input ref={fileRef} type="file" accept="application/json,.json"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importData(f); e.target.value = ""; }}
              style={{ display: "none" }} />
            {ioMsg && <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: GOLD }}>{ioMsg}</span>}
          </div>
          {sorted.length === 0 ? (
            <div style={{ textAlign: "center", padding: 50, color: MUTE, fontFamily: "var(--mono)" }}>No sessions yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {[...sorted].reverse().map((l, i) => {
                const day = l.week && l.day ? getDay(plan, l.week, l.day) : null;
                const tc = day ? themeColor(day.theme) : MUTE;
                const mv = l.movements ? Object.entries(l.movements) : [];
                const chips = [["HSPU", l.maxHSPU, ""], ["Hold", l.holdSec, "s"], ["Pain", l.wristPain, "/10"]].filter(([, v]) => v != null);
                return (
                  <div key={l.id} className="rise lift" style={{ ...card(), animationDelay: `${Math.min(i * 0.04, 0.3)}s` }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "var(--display)", fontWeight: 600, fontSize: 15, color: CHALK }}>{fmtDate(l.date)}</span>
                        {l.week && l.day && (
                          <span style={{ fontFamily: "var(--mono)", fontSize: 11, padding: "3px 10px", borderRadius: 999, background: `${tc}22`, color: tc }}>
                            Wk {l.week} · Day {l.day}{day ? ` · ${day.theme}` : ""}
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        {confirmDelId === l.id ? (
                          <>
                            <span style={{ fontFamily: "var(--body)", fontSize: 12, color: MUTE }}>Delete?</span>
                            <button onClick={() => { delLog(l.id); setConfirmDelId(null); }} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--body)", fontSize: 13, color: ACCENT }}>Yes</button>
                            <button onClick={() => setConfirmDelId(null)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--body)", fontSize: 13, color: MUTE }}>No</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(l)} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${LINE}`, borderRadius: 999, cursor: "pointer", fontFamily: "var(--body)", fontSize: 12, color: CHALK, padding: "5px 12px" }}><Icon name="edit" size={13} /> Edit</button>
                            <button className="del" onClick={() => setConfirmDelId(l.id)} style={{ background: "none", border: "none", cursor: "pointer", display: "inline-flex", padding: 4 }} aria-label="Delete session"><Icon name="trash" size={16} /></button>
                          </>
                        )}
                      </div>
                    </div>

                    {chips.length > 0 && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                        {chips.map(([k, v, u]) => (
                          <span key={k} style={{ fontFamily: "var(--mono)", fontSize: 12, padding: "4px 10px", borderRadius: 999, background: INK, border: `1px solid ${LINE}`, color: CHALK }}>
                            <span style={{ color: MUTE }}>{k} </span>{v}{u}
                          </span>
                        ))}
                      </div>
                    )}

                    {mv.length > 0 && (
                      <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
                        {mv.map(([name, res]) => (
                          <div key={name} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, fontFamily: "var(--body)" }}>
                            <span style={{ color: MUTE }}>{name}</span>
                            <span style={{ color: CHALK, fontFamily: "var(--mono)", fontSize: 12, textAlign: "right" }}>{res}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {l.notes && <div style={{ marginTop: 12, color: MUTE, fontFamily: "var(--body)", fontSize: 13, lineHeight: 1.6 }}>{l.notes}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ padding: "0 16px 40px", color: MUTE, fontFamily: "var(--mono)", fontSize: 11, opacity: 0.6 }}>
        Data persists on this device. Not medical advice — scale loads and manage wrist load conservatively.
      </div>

      <BottomNav tab={tab} onSelect={selectTab} />
    </Shell>
  );
}

function PhaseProgress({ phase, cycle, done, total, upNext, onJump, onNextCycle }) {
  return (
    <div style={{ ...card(), marginTop: 18, background: "linear-gradient(180deg,#1d1714,#161318)", border: `1px solid rgba(255,90,60,0.4)`, boxShadow: ACCENT_GLOW }}>
      <div style={{ display: "flex", gap: SP.lg, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <SectionLabel accent>Phase {phase.level} · goal</SectionLabel>
          <div style={{ fontFamily: "var(--display)", fontWeight: 600, fontSize: FS.d3, color: CHALK, marginBottom: SP.md }}>{phase.goal}</div>
          <div style={{ fontFamily: "var(--body)", fontSize: FS.b3, color: MUTE }}>Cycle {cycle} · {done}/{total} sessions</div>
        </div>
        <Ring value={done} max={total} />
      </div>
      <div style={{ marginTop: SP.lg }}>
        {upNext ? (
          <button className="cta glow" onClick={() => onJump(upNext.week)} style={{ ...primaryBtn(), width: "auto", padding: "11px 16px" }}>
            Next up · Week {upNext.week} Day {upNext.day} · {upNext.theme} <span className="arrow" style={{ display: "inline-flex", verticalAlign: "middle" }}><Icon name="chevron" size={16} /></span>
          </button>
        ) : (
          <button className="cta" onClick={onNextCycle} style={{ ...primaryBtn(), width: "auto", padding: "11px 16px" }}>
            Cycle complete — start cycle {cycle + 1} <span className="arrow" style={{ display: "inline-flex", verticalAlign: "middle" }}><Icon name="chevron" size={16} /></span>
          </button>
        )}
      </div>
    </div>
  );
}

// Circular cycle-progress ring with the orange→violet brand gradient.
function Ring({ value, max, size = 88, stroke = 9 }) {
  const pct = max ? Math.min(1, value / max) : 0;
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const [off, setOff] = useState(c);
  useEffect(() => { const id = requestAnimationFrame(() => setOff(c * (1 - pct))); return () => cancelAnimationFrame(id); }, [c, pct]);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={ACCENT} /><stop offset="100%" stopColor={VIOLET} />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#ringGrad)" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={off} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset .9s cubic-bezier(.2,.7,.2,1)" }} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill={CHALK} style={{ fontFamily: "var(--display)", fontWeight: 600, fontSize: FS.d3 }}>{Math.round(pct * 100)}%</text>
    </svg>
  );
}

// Compact trend line for a stat card. Empty → faint dashed baseline.
function Sparkline({ data, keyName, color }) {
  const pts = data.filter((d) => d[keyName] != null).map((d) => ({ v: d[keyName] }));
  if (pts.length === 0)
    return <div style={{ height: "100%", display: "flex", alignItems: "center" }}><div style={{ width: "100%", borderTop: `1px dashed ${LINE}` }} /></div>;
  const gid = `spark-${keyName}`;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={pts} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.35} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} strokeLinecap="round" fill={`url(#${gid})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function DeltaChip({ d, good, unit }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "var(--mono)", fontSize: FS.b4, padding: "3px 9px", borderRadius: 999, background: good ? "rgba(110,231,159,0.13)" : "rgba(255,90,60,0.14)", color: good ? GREEN : ACCENT }}>
      {d > 0 ? <Icon name="up" size={11} /> : d < 0 ? <Icon name="down" size={11} /> : null} {Math.abs(d)}{unit}
    </span>
  );
}

// Unified metric card: number + delta + inline sparkline; tap to expand the full chart.
function StatCard({ metric, latestVal, d, good, data, expanded, onToggle }) {
  const has = latestVal != null;
  const hint = expanded ? "tap to collapse" : has ? "tap for trend" : "log a session to start";
  return (
    <div className="lift" onClick={onToggle} style={{ ...card(), cursor: "pointer" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: SP.sm }}>
        <span style={{ fontFamily: "var(--body)", fontSize: FS.b3, color: MUTE }}>{metric.label}</span>
        {d != null && <DeltaChip d={d} good={good} unit={metric.unit} />}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: SP.sm }}>
        <span style={{ fontFamily: "var(--display)", fontWeight: 600, fontSize: FS.d1, color: CHALK, lineHeight: 1 }}>{has ? <CountUp value={latestVal} /> : "—"}</span>
        <span style={{ fontFamily: "var(--body)", fontSize: FS.b2, color: MUTE }}>{metric.unit}</span>
      </div>
      <div style={{ height: 46, marginTop: SP.md }}><Sparkline data={data} keyName={metric.key} color={metric.color} /></div>
      {expanded && (
        <div onClick={(e) => e.stopPropagation()} style={{ height: 168, marginTop: SP.md, borderTop: `1px solid ${LINE}`, paddingTop: SP.md }}>
          <Chart data={data} keyName={metric.key} color={metric.color} refY={metric.refY} refLabel={metric.refLabel} refColor={metric.refColor} />
        </div>
      )}
      <div style={{ marginTop: SP.sm, fontFamily: "var(--body)", fontSize: FS.b4, color: "#5f6470" }}>{hint}</div>
    </div>
  );
}

function DayCard({ week, day, done, onToggle }) {
  const tc = themeColor(day.theme);
  return (
    <div className="lift" style={{ ...card(), opacity: done ? 0.72 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "var(--display)", fontWeight: 600, fontSize: 16, color: CHALK }}>Day {day.day}</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, padding: "3px 10px", borderRadius: 999, background: `${tc}22`, color: tc }}>{day.theme}</span>
        </div>
        <button onClick={onToggle} style={{
          display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer",
          background: done ? "rgba(110,231,159,0.13)" : "transparent",
          border: `1px solid ${done ? GREEN : LINE}`, borderRadius: 999, padding: "6px 12px",
          fontFamily: "var(--body)", fontSize: 12, color: done ? GREEN : MUTE,
        }}>{done ? <><span className="pop" style={{ display: "inline-flex" }}><Icon name="check" size={14} /></span> Done</> : "Mark done"}</button>
      </div>
      <Slot title="Warm up" items={day.warmup} />
      <Slot title="WOD" items={day.wod} />
      <Slot title="Accessory" items={day.accessory} />
    </div>
  );
}

function Slot({ title, items }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontFamily: "var(--body)", fontSize: 11, fontWeight: 500, letterSpacing: 0.3, color: MUTE, marginBottom: 7 }}>{title}</div>
      {items.map((ex, i) => (
        <div key={i} style={{ background: INK, border: `1px solid ${LINE}`, borderRadius: 12, padding: "11px 13px", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--display)", fontWeight: 500, fontSize: 14, color: CHALK }}>{ex.name}</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: GOLD, textAlign: "right" }}>{ex.prescription}</span>
          </div>
          {ex.cue && <div style={{ fontFamily: "var(--body)", fontSize: 12.5, color: MUTE, marginTop: 5, lineHeight: 1.55 }}>{ex.cue}</div>}
          {ex.benchmark && <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 8, fontFamily: "var(--mono)", fontSize: 11, padding: "3px 9px", borderRadius: 999, background: "rgba(255,90,60,0.14)", color: ACCENT }}><Icon name="flame" size={12} /> Benchmark — log your max strict HSPU</div>}
        </div>
      ))}
    </div>
  );
}

function KV({ k, v, accent }) {
  return (
    <div style={{ minWidth: 120 }}>
      <div style={{ fontFamily: "var(--body)", fontSize: 11, color: MUTE }}>{k}</div>
      <div style={{ fontFamily: "var(--body)", fontSize: 14, color: accent ? CHALK : CHALK, marginTop: 3 }}>{v}</div>
    </div>
  );
}

// Inline-SVG icon set (CSP-safe, no dependency). One <path> may hold several subpaths.
const ICON_PATHS = {
  edit: "M12 20h9 M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z",
  trash: "M3 6h18 M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6 M10 11v6 M14 11v6",
  check: "M20 6L9 17l-5-5",
  flame: "M12 2s5 3.2 5 8.5a5 5 0 0 1-10 0c0-2 1-3.6 2.2-4.7C9.7 7 11 5 12 2z",
  chevron: "M9 6l6 6-6 6",
  up: "M12 19V5 M6 11l6-6 6 6",
  down: "M12 5v14 M6 13l6 6 6-6",
  dash: "M3 11l9-8 9 8 M5 9.5V21h14V9.5",
  program: "M4 5h16v16H4z M4 9h16 M9 3v4 M15 3v4",
  plus: "M12 5v14 M5 12h14",
  history: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z M12 8v4l2.5 1.5",
};
function Icon({ name, size = 18, color = "currentColor", strokeWidth = 1.6 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }} aria-hidden="true">
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

// Duotone monogram — an inverted (handstand) figure on the brand gradient.
function Logo({ size = 30 }) {
  return (
    <span style={{ width: size, height: size, borderRadius: 9, background: DUO, display: "grid", placeItems: "center", boxShadow: "0 4px 14px rgba(124,92,255,.35)", flexShrink: 0 }}>
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="19" r="2" fill="#fff" stroke="none" />
        <path d="M12 17V9 M12 9l-4-5 M12 9l4-5" />
      </svg>
    </span>
  );
}

// Thumb-reachable bottom navigation for the phone PWA. "+ Log" is the raised center action.
function BottomNav({ tab, onSelect }) {
  const items = [["dash", "Home", "dash"], ["program", "Program", "program"], ["log", "Log", "plus"], ["history", "History", "history"]];
  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50, background: "rgba(11,13,18,0.92)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderTop: `1px solid ${LINE}`, paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-around", padding: "8px 12px" }}>
        {items.map(([id, label, icon]) => {
          const on = tab === id;
          if (id === "log") {
            return (
              <button key={id} onClick={() => onSelect(id)} aria-label="Log a session" style={{ background: "none", border: "none", cursor: "pointer", display: "grid", placeItems: "center" }}>
                <span style={{ width: 48, height: 48, borderRadius: 16, display: "grid", placeItems: "center", background: DUO, boxShadow: "0 6px 18px rgba(255,90,60,.35)" }}><Icon name="plus" size={22} color="#fff" strokeWidth={2.2} /></span>
              </button>
            );
          }
          return (
            <button key={id} onClick={() => onSelect(id)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 64, color: on ? CHALK : MUTE }}>
              <Icon name={icon} size={20} color={on ? ACCENT : MUTE} />
              <span style={{ fontFamily: "var(--body)", fontSize: 11, fontWeight: on ? 500 : 400 }}>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Shell({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: INK, color: CHALK, paddingTop: "env(safe-area-inset-top)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap');
        :root{--display:'Space Grotesk',sans-serif;--body:'Inter',sans-serif;--mono:'JetBrains Mono',monospace;}
        *{box-sizing:border-box;margin:0;-webkit-tap-highlight-color:transparent;}
        html,body{background:${INK};-webkit-text-size-adjust:100%;font-feature-settings:"tnum","cv01";}
        input,textarea{font-size:16px;}
        input::placeholder,textarea::placeholder{color:#4a4f5a;}
        input:focus,textarea:focus{border-color:rgba(255,90,60,.55)!important;box-shadow:0 0 0 3px rgba(255,90,60,.12);}
        button{transition:transform .08s ease, background .15s ease, border-color .15s ease, box-shadow .15s ease;}
        button:active{transform:scale(.985);}
        .del{color:${MUTE};transition:color .15s;}
        .del:hover{color:${ACCENT};}
        @keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        @keyframes glowpulse{0%,100%{box-shadow:0 6px 18px rgba(255,90,60,.30)}50%{box-shadow:0 8px 30px rgba(255,90,60,.55)}}
        @keyframes pop{0%{transform:scale(.5);opacity:0}60%{transform:scale(1.18)}100%{transform:scale(1);opacity:1}}
        .rise{animation:rise .5s cubic-bezier(.2,.7,.2,1) both;}
        .lift{transition:box-shadow .18s ease,border-color .18s ease;}
        .lift:hover{border-color:rgba(255,255,255,.16);box-shadow:0 12px 32px rgba(0,0,0,.45);}
        .glow{animation:glowpulse 2.6s ease-in-out infinite;}
        .pop{display:inline-block;animation:pop .32s cubic-bezier(.2,.7,.2,1);}
        .cta .arrow{display:inline-block;transition:transform .18s ease;}
        .cta:hover .arrow{transform:translateX(4px);}
        @media (prefers-reduced-motion:reduce){.rise,.glow,.pop{animation:none!important}.lift,.cta .arrow{transition:none}}
        ::selection{background:${ACCENT};color:#fff;}
      `}</style>
      <div style={{ fontFamily: "var(--body)", maxWidth: 1040, margin: "0 auto", paddingBottom: "calc(80px + env(safe-area-inset-bottom))" }}>{children}</div>
    </div>
  );
}

function Header() {
  return (
    <div style={{ padding: "26px 16px 14px", display: "flex", alignItems: "center", gap: 12 }}>
      <Logo />
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: FS.d2, letterSpacing: -0.5, lineHeight: 1, color: CHALK }}>Crossfit Workout<span style={{ color: ACCENT }}>.</span></h1>
        <span style={{ fontFamily: "var(--body)", fontSize: FS.b3, color: MUTE }}>strict HSPU · phase 1</span>
      </div>
    </div>
  );
}

function Chart({ data, keyName, color, refY, refLabel, refColor }) {
  const pts = data.filter((d) => d[keyName] != null).map((d) => ({ date: fmtDate(d.date), v: d[keyName] }));
  if (pts.length === 0) return <div style={{ height: "100%", display: "grid", placeItems: "center", color: MUTE, fontFamily: "var(--body)", fontSize: 12 }}>no data yet</div>;
  const gid = `grad-${keyName}`;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={pts} margin={{ top: 6, right: 10, left: -14, bottom: 0 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="2 6" vertical={false} />
        <XAxis dataKey="date" tick={{ fill: MUTE, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: MUTE, fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
        <Tooltip contentStyle={{ background: "#13151b", border: `1px solid ${LINE}`, borderRadius: 12, fontSize: 12, color: CHALK }} cursor={{ stroke: "rgba(255,255,255,0.12)" }} />
        {refY != null && <ReferenceLine y={refY} stroke={refColor || GOLD} strokeDasharray="4 6" strokeOpacity={0.6} label={{ value: refLabel, fill: refColor || GOLD, fontSize: 10, position: "insideTopRight" }} />}
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2.5} strokeLinecap="round" fill={`url(#${gid})`} dot={{ r: 3, fill: color, strokeWidth: 0 }} activeDot={{ r: 5 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function SectionLabel({ children, accent }) {
  return (
    <div style={{ fontFamily: "var(--body)", fontSize: 12, fontWeight: 500, color: accent ? ACCENT : MUTE, marginBottom: 12 }}>{children}</div>
  );
}

// Fill bar that sweeps from 0 to its value on mount.
function ProgressBar({ value, max }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(max ? Math.min(100, (value / max) * 100) : 0));
    return () => cancelAnimationFrame(id);
  }, [value, max]);
  return (
    <div style={{ width: "100%", height: 6, background: INK, borderRadius: 999, overflow: "hidden" }}>
      <div style={{ width: `${w}%`, height: "100%", background: "linear-gradient(90deg,#ff6a4d,#ff4f30)", transition: "width .9s cubic-bezier(.2,.7,.2,1)" }} />
    </div>
  );
}

// Number that eases up to its value whenever it changes.
function CountUp({ value }) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now(), dur = 600, a = from.current, b = value;
    let raf;
    const tick = (t) => {
      const k = Math.min(1, (t - start) / dur), e = 1 - Math.pow(1 - k, 3);
      setV(a + (b - a) * e);
      if (k < 1) raf = requestAnimationFrame(tick); else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{Math.round(v)}</>;
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontFamily: "var(--body)", fontSize: 12, color: MUTE, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const card = (pad) => ({ background: SURFACE, border: `1px solid ${LINE}`, borderRadius: 18, padding: pad ? 22 : 18, boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 6px 20px rgba(0,0,0,0.25)" });
const inp = () => ({ width: "100%", background: INK, border: `1px solid ${LINE}`, borderRadius: 12, padding: "12px 13px", color: CHALK, fontFamily: "var(--mono)", fontSize: 16, outline: "none", transition: "border-color .15s, box-shadow .15s" });
const td = () => ({ padding: "11px 12px", color: CHALK, whiteSpace: "nowrap" });
const primaryBtn = () => ({ width: "100%", background: "linear-gradient(180deg,#ff6a4d,#ff4f30)", border: "none", borderRadius: 12, padding: "14px", color: "#fff", fontFamily: "var(--body)", fontSize: 15, fontWeight: 500, cursor: "pointer", boxShadow: "0 6px 18px rgba(255,90,60,.28)" });
const ghostBtn = () => ({ background: "transparent", border: `1px solid ${LINE}`, borderRadius: 12, padding: "9px 15px", color: CHALK, fontFamily: "var(--body)", fontSize: 13, cursor: "pointer" });
