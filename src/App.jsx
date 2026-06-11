import React, { useState, useEffect, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

// ---------------------------------------------------------------------------
// CROSSFIT WORKOUT — Handstand → HSPU progression tracker (standalone PWA build)
// Storage: localStorage (persists on-device). Mobile-first responsive.
// ---------------------------------------------------------------------------

const ACCENT = "#ff5436";
const GOLD = "#e8b64c";
const INK = "#0e1015";
const PANEL = "#15181f";
const LINE = "#252a34";
const CHALK = "#e8e6df";
const MUTE = "#8b8f9a";

// localStorage wrapper matching the prior async storage shape
const store = {
  get: async (k) => {
    try { const v = localStorage.getItem(k); return v == null ? null : { value: v }; }
    catch { return null; }
  },
  set: async (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

const LADDER = [
  { id: 0, name: "Chest-to-Wall Hold", note: "Hands 6–8\" from wall, hollow body", target: "60s @ ≤8\"",
    sets: "3–4 holds", reps: "build to 60s", freq: "2–3×/week" },
  { id: 1, name: "Freestanding Hold", note: "Kick up, find balance", target: "30s",
    sets: "5–10 min practice", reps: "5–10s → 30s holds", freq: "daily (skill)" },
  { id: 2, name: "Negative HSPU", note: "3–5s controlled descent", target: "3 reps",
    sets: "3–4 sets", reps: "3 reps @ 3–5s descent", freq: "2–3×/week" },
  { id: 3, name: "Strict HSPU (no deficit)", note: "Head to floor → lockout", target: "5 reps",
    sets: "accumulate sets", reps: "start 1 → sets of 3–5", freq: "2–3×/week" },
  { id: 4, name: "Deficit Strict HSPU", note: "Plates / parallettes", target: "5 reps",
    sets: "sets of 3–5", reps: "progressive ROM", freq: "2–3×/week" },
  { id: 5, name: "Kipping HSPU", note: "Efficient once strict is owned", target: "—",
    sets: "conditioning volume", reps: "once 5+ strict owned", freq: "as programmed" },
];

// The actual training plan behind the log — prescriptions, prep, and mobility.
const PROGRAM = {
  cadence: [
    ["Strength & holds", "2–3× per week"],
    ["Balance / freestanding", "5–10 min daily"],
    ["Wrist + shoulder prep", "every session"],
    ["Expected timeline", "8–12 weeks"],
  ],
  warmup: [
    "Wrist circles — both directions, ~30s each",
    "Prayer stretch + reverse prayer — ease into extension and flexion",
    "Quadruped rocking — rock forward over extended wrists, add load progressively",
    "Banded overhead stretch + wall slides — open shoulder flexion before loading",
  ],
  mobility: [
    "Thoracic extension — foam roller over a rolled towel at mid-back; cat-cow with reach",
    "Shoulder flexion — banded overhead stretch, wall slide with overpressure",
    "Hollow body holds — floor, arms overhead, low back flat, 30–45s. Own this before inverting",
  ],
};

const METRICS = [
  { key: "holdSec", label: "C2W hold", unit: "s", color: ACCENT, invert: false },
  { key: "handDist", label: "Hand dist.", unit: "in", color: GOLD, invert: true, goal: 8 },
  { key: "wristPain", label: "Wrist pain", unit: "/10", color: "#5fb0ff", invert: true },
  { key: "wristExt", label: "Wrist ext.", unit: "°", color: "#7ad17a", invert: false },
];

const fmtDate = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function App() {
  const [logs, setLogs] = useState([]);
  const [ladderState, setLadderState] = useState({ current: 0, done: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("dash");
  const [draft, setDraft] = useState({
    date: todayISO(), holdSec: "", handDist: "", wristPain: "", wristExt: "", wristWrap: false, notes: "",
  });

  useEffect(() => {
    (async () => {
      const r = await store.get("hs:logs");
      if (r?.value) { try { setLogs(JSON.parse(r.value)); } catch {} }
      const l = await store.get("hs:ladder");
      if (l?.value) { try { setLadderState(JSON.parse(l.value)); } catch {} }
      setLoading(false);
    })();
  }, []);

  const persistLogs = async (next) => { setLogs(next); await store.set("hs:logs", JSON.stringify(next)); };
  const persistLadder = async (next) => { setLadderState(next); await store.set("hs:ladder", JSON.stringify(next)); };

  const sorted = useMemo(() => [...logs].sort((a, b) => new Date(a.date) - new Date(b.date)), [logs]);
  const latest = sorted[sorted.length - 1];

  const addLog = async () => {
    const entry = {
      id: Date.now(), date: draft.date,
      holdSec: draft.holdSec === "" ? null : Number(draft.holdSec),
      handDist: draft.handDist === "" ? null : Number(draft.handDist),
      wristPain: draft.wristPain === "" ? null : Number(draft.wristPain),
      wristExt: draft.wristExt === "" ? null : Number(draft.wristExt),
      wristWrap: draft.wristWrap, notes: draft.notes.trim(),
    };
    await persistLogs([...logs.filter((l) => l.date !== entry.date), entry]);
    setDraft({ date: todayISO(), holdSec: "", handDist: "", wristPain: "", wristExt: "", wristWrap: false, notes: "" });
    setTab("dash");
  };

  const delLog = async (id) => persistLogs(logs.filter((l) => l.id !== id));

  const toggleLadder = async (id) => {
    const done = ladderState.done.includes(id) ? ladderState.done.filter((x) => x !== id) : [...ladderState.done, id];
    const current = done.length ? Math.max(...done) + 1 : 0;
    await persistLadder({ current: Math.min(current, LADDER.length - 1), done });
  };

  const delta = (key) => {
    const vals = sorted.filter((l) => l[key] != null);
    if (vals.length < 2) return null;
    return vals[vals.length - 1][key] - vals[0][key];
  };

  if (loading)
    return <Shell><div style={{ padding: 80, textAlign: "center", color: MUTE, fontFamily: "var(--mono)" }}>loading log…</div></Shell>;

  return (
    <Shell>
      <Header tab={tab} setTab={setTab} />

      {tab === "dash" && (
        <div style={{ padding: "0 16px 60px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 26 }}>
            {METRICS.map((m) => {
              const d = delta(m.key);
              const good = d == null ? null : m.invert ? d < 0 : d > 0;
              return (
                <div key={m.key} style={card()}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: 1, color: MUTE, textTransform: "uppercase" }}>{m.label}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 8 }}>
                    <span style={{ fontFamily: "var(--display)", fontSize: 34, color: CHALK, lineHeight: 1 }}>{latest?.[m.key] ?? "—"}</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: MUTE }}>{m.unit}</span>
                  </div>
                  {d != null && (
                    <div style={{ fontFamily: "var(--mono)", fontSize: 12, marginTop: 6, color: good ? "#7ad17a" : ACCENT }}>
                      {d > 0 ? "▲" : d < 0 ? "▼" : "■"} {Math.abs(d)}{m.unit}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
            <ChartPanel title="Chest-to-wall hold" sub="seconds — climbing toward 60s">
              <Chart data={sorted} keyName="holdSec" color={ACCENT} ref60 />
            </ChartPanel>
            <ChartPanel title="Hand distance from wall" sub='inches — driving down to 6–8"'>
              <Chart data={sorted} keyName="handDist" color={GOLD} goal={8} />
            </ChartPanel>
            <ChartPanel title="Wrist pain" sub="0–10 scale — trending down">
              <Chart data={sorted} keyName="wristPain" color="#5fb0ff" />
            </ChartPanel>
            <ChartPanel title="Wrist extension" sub="degrees — building range">
              <Chart data={sorted} keyName="wristExt" color="#7ad17a" />
            </ChartPanel>
          </div>

          {sorted.length === 0 && (
            <div style={{ textAlign: "center", padding: 50, color: MUTE, fontFamily: "var(--mono)", fontSize: 13 }}>
              No sessions logged yet. Tap <span style={{ color: ACCENT }}>+ Log</span> to start the record.
            </div>
          )}
        </div>
      )}

      {tab === "log" && (
        <div style={{ padding: "0 16px 60px", maxWidth: 640 }}>
          <div style={card(true)}>
            <Field label="Date"><input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} style={inp()} /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Field label="C2W hold (s)"><input type="number" inputMode="numeric" value={draft.holdSec} onChange={(e) => setDraft({ ...draft, holdSec: e.target.value })} placeholder="30" style={inp()} /></Field>
              <Field label="Hand dist. (in)"><input type="number" inputMode="numeric" value={draft.handDist} onChange={(e) => setDraft({ ...draft, handDist: e.target.value })} placeholder="18" style={inp()} /></Field>
              <Field label="Wrist pain (0–10)"><input type="number" inputMode="numeric" min="0" max="10" value={draft.wristPain} onChange={(e) => setDraft({ ...draft, wristPain: e.target.value })} placeholder="3" style={inp()} /></Field>
              <Field label="Wrist ext. (°)"><input type="number" inputMode="numeric" value={draft.wristExt} onChange={(e) => setDraft({ ...draft, wristExt: e.target.value })} placeholder="70" style={inp()} /></Field>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 18px", cursor: "pointer", fontFamily: "var(--mono)", fontSize: 13, color: CHALK }}>
              <input type="checkbox" checked={draft.wristWrap} onChange={(e) => setDraft({ ...draft, wristWrap: e.target.checked })} style={{ accentColor: ACCENT, width: 18, height: 18 }} />
              Right wrist wrap worn
            </label>
            <Field label="Notes"><textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Felt it in mid-traps today. Banana-back at fatigue." rows={3} style={{ ...inp(), resize: "vertical", fontFamily: "var(--body)" }} /></Field>
            <button onClick={addLog} style={primaryBtn()}>Save session</button>
          </div>
        </div>
      )}

      {tab === "ladder" && (
        <div style={{ padding: "0 16px 60px", maxWidth: 760 }}>
          <p style={{ color: MUTE, fontSize: 14, lineHeight: 1.6, marginBottom: 22, fontFamily: "var(--body)" }}>
            The path from hold to HSPU. Tap a rung when you own it. Mobility gates — wrist extension, shoulder flexion — sit under rungs 0–2 and are the real bottleneck.
          </p>
          {LADDER.map((step) => {
            const done = ladderState.done.includes(step.id);
            const current = step.id === ladderState.current && !done;
            return (
              <div key={step.id} onClick={() => toggleLadder(step.id)} style={{
                display: "flex", gap: 14, alignItems: "flex-start", padding: "16px 16px", marginBottom: 10,
                background: current ? "rgba(255,84,54,0.06)" : PANEL, border: `1px solid ${current ? ACCENT : LINE}`,
                borderRadius: 4, cursor: "pointer",
              }}>
                <div style={{
                  width: 32, height: 32, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center",
                  fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700,
                  background: done ? "#7ad17a" : current ? ACCENT : "transparent",
                  color: done || current ? INK : MUTE, border: `1.5px solid ${done ? "#7ad17a" : current ? ACCENT : LINE}`,
                }}>{done ? "✓" : step.id}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
                    <span style={{ fontFamily: "var(--display)", fontSize: 17, color: done ? MUTE : CHALK, textDecoration: done ? "line-through" : "none" }}>{step.name}</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: GOLD }}>{step.target}</span>
                  </div>
                  <div style={{ color: MUTE, fontSize: 13, marginTop: 4, fontFamily: "var(--body)" }}>{step.note}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", marginTop: 8 }}>
                    {[["sets", step.sets], ["reps", step.reps], ["freq", step.freq]].map(([k, v]) => (
                      <span key={k} style={{ fontFamily: "var(--mono)", fontSize: 11 }}>
                        <span style={{ color: "#5f6470", letterSpacing: 1, textTransform: "uppercase" }}>{k} </span>
                        <span style={{ color: done ? MUTE : CHALK }}>{v}</span>
                      </span>
                    ))}
                  </div>
                  {current && <div style={{ marginTop: 8, fontFamily: "var(--mono)", fontSize: 11, letterSpacing: 1, color: ACCENT, textTransform: "uppercase" }}>◆ Current focus</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "program" && (
        <div style={{ padding: "0 16px 60px", maxWidth: 760 }}>
          <p style={{ color: MUTE, fontSize: 14, lineHeight: 1.6, marginBottom: 22, fontFamily: "var(--body)" }}>
            The training plan behind the log. Wrist prep is non-negotiable at every session, and the parallel mobility work — not the holds — is the real bottleneck right now.
          </p>

          <div style={{ ...card(), marginBottom: 14 }}>
            <SectionLabel>Weekly cadence</SectionLabel>
            {PROGRAM.cadence.map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderTop: `1px solid ${LINE}` }}>
                <span style={{ fontFamily: "var(--body)", fontSize: 14, color: CHALK }}>{k}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: GOLD, textAlign: "right" }}>{v}</span>
              </div>
            ))}
          </div>

          <div style={{ ...card(), marginBottom: 14, borderColor: ACCENT }}>
            <SectionLabel accent>Main work · current rung</SectionLabel>
            {(() => {
              const r = LADDER[ladderState.current] || LADDER[0];
              return (
                <>
                  <div style={{ fontFamily: "var(--display)", fontSize: 18, color: CHALK, marginBottom: 4 }}>{r.name}</div>
                  <div style={{ color: MUTE, fontSize: 13, marginBottom: 14, fontFamily: "var(--body)" }}>{r.note}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                    {[["Sets", r.sets], ["Reps / time", r.reps], ["Frequency", r.freq]].map(([k, v]) => (
                      <div key={k} style={{ background: INK, border: `1px solid ${LINE}`, borderRadius: 4, padding: "10px 12px" }}>
                        <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: 1, color: MUTE, textTransform: "uppercase" }}>{k}</div>
                        <div style={{ fontFamily: "var(--mono)", fontSize: 13, color: CHALK, marginTop: 5 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 12, fontFamily: "var(--mono)", fontSize: 11, color: MUTE }}>
                    Advances automatically as you tick rungs on <span style={{ color: ACCENT }}>Progression</span>.
                  </div>
                </>
              );
            })()}
          </div>

          <div style={{ ...card(), marginBottom: 14 }}>
            <SectionLabel>Every session · wrist + shoulder prep <span style={{ color: ACCENT }}>(3–5 min)</span></SectionLabel>
            <ol style={{ margin: 0, paddingLeft: 18, color: CHALK, fontFamily: "var(--body)", fontSize: 14, lineHeight: 1.7 }}>
              {PROGRAM.warmup.map((x, i) => <li key={i} style={{ marginBottom: 6 }}>{x}</li>)}
            </ol>
          </div>

          <div style={card()}>
            <SectionLabel>Parallel mobility · the real bottleneck</SectionLabel>
            <ul style={{ margin: 0, paddingLeft: 18, color: CHALK, fontFamily: "var(--body)", fontSize: 14, lineHeight: 1.7 }}>
              {PROGRAM.mobility.map((x, i) => <li key={i} style={{ marginBottom: 6 }}>{x}</li>)}
            </ul>
          </div>
        </div>
      )}

      {tab === "history" && (
        <div style={{ padding: "0 16px 60px" }}>
          {sorted.length === 0 ? (
            <div style={{ textAlign: "center", padding: 50, color: MUTE, fontFamily: "var(--mono)" }}>No sessions yet.</div>
          ) : (
            <div style={{ ...card(), padding: 0, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--mono)", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: INK }}>
                    {["Date", "Hold", "Dist", "Pain", "Ext", "Wrap", "Notes", ""].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "12px 12px", color: MUTE, fontWeight: 500, letterSpacing: 1, textTransform: "uppercase", fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...sorted].reverse().map((l) => (
                    <tr key={l.id} style={{ borderTop: `1px solid ${LINE}` }}>
                      <td style={td()}>{fmtDate(l.date)}</td>
                      <td style={td()}>{l.holdSec ?? "—"}{l.holdSec != null && "s"}</td>
                      <td style={td()}>{l.handDist ?? "—"}{l.handDist != null && '"'}</td>
                      <td style={td()}>{l.wristPain ?? "—"}</td>
                      <td style={td()}>{l.wristExt ?? "—"}{l.wristExt != null && "°"}</td>
                      <td style={td()}>{l.wristWrap ? "✓" : ""}</td>
                      <td style={{ ...td(), fontFamily: "var(--body)", color: MUTE, maxWidth: 220, whiteSpace: "normal" }}>{l.notes || "—"}</td>
                      <td style={td()}><button onClick={() => delLog(l.id)} style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", fontSize: 18 }}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div style={{ padding: "0 16px 40px", color: MUTE, fontFamily: "var(--mono)", fontSize: 11, opacity: 0.6 }}>
        Data persists on this device. Not medical advice — manage wrist load conservatively.
      </div>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: INK, color: CHALK, paddingTop: "env(safe-area-inset-top)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Spline+Sans:wght@400;500;600&family=Spline+Sans+Mono:wght@400;500&display=swap');
        :root{--display:'Archivo Black',sans-serif;--body:'Spline Sans',sans-serif;--mono:'Spline Sans Mono',monospace;}
        *{box-sizing:border-box;margin:0;-webkit-tap-highlight-color:transparent;}
        html,body{background:${INK};-webkit-text-size-adjust:100%;}
        input,textarea{font-size:16px;}
        input::placeholder,textarea::placeholder{color:#4a4f5a;}
        ::selection{background:${ACCENT};color:${INK};}
      `}</style>
      <div style={{ fontFamily: "var(--body)", maxWidth: 1040, margin: "0 auto" }}>{children}</div>
    </div>
  );
}

function Header({ tab, setTab }) {
  const tabs = [["dash", "Dashboard"], ["program", "Program"], ["log", "+ Log"], ["ladder", "Progression"], ["history", "History"]];
  return (
    <div style={{ padding: "28px 16px 18px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: "var(--display)", fontSize: 30, letterSpacing: -1, lineHeight: 1 }}>CROSSFIT WORKOUT<span style={{ color: ACCENT }}>.</span></h1>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: MUTE, letterSpacing: 1 }}>handstand → HSPU log</span>
      </div>
      <div style={{ display: "flex", gap: 2, marginTop: 22, borderBottom: `1px solid ${LINE}`, overflowX: "auto" }}>
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            background: "none", border: "none", cursor: "pointer", padding: "10px 14px", whiteSpace: "nowrap",
            fontFamily: "var(--mono)", fontSize: 13, color: tab === id ? CHALK : MUTE,
            borderBottom: `2px solid ${tab === id ? ACCENT : "transparent"}`, marginBottom: -1,
          }}>{label}</button>
        ))}
      </div>
    </div>
  );
}

function ChartPanel({ title, sub, children }) {
  return (
    <div style={card()}>
      <div style={{ fontFamily: "var(--display)", fontSize: 15, marginBottom: 2 }}>{title}</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: MUTE, marginBottom: 14 }}>{sub}</div>
      <div style={{ height: 180 }}>{children}</div>
    </div>
  );
}

function Chart({ data, keyName, color, ref60, goal }) {
  const pts = data.filter((d) => d[keyName] != null).map((d) => ({ date: fmtDate(d.date), v: d[keyName] }));
  if (pts.length === 0) return <div style={{ height: "100%", display: "grid", placeItems: "center", color: MUTE, fontFamily: "var(--mono)", fontSize: 12 }}>no data</div>;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={pts} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={LINE} strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="date" tick={{ fill: MUTE, fontSize: 11 }} stroke={LINE} />
        <YAxis tick={{ fill: MUTE, fontSize: 11 }} stroke={LINE} />
        <Tooltip contentStyle={{ background: INK, border: `1px solid ${LINE}`, borderRadius: 4, fontSize: 12, color: CHALK }} />
        {ref60 && <ReferenceLine y={60} stroke={GOLD} strokeDasharray="4 4" label={{ value: "60s", fill: GOLD, fontSize: 10, position: "insideTopRight" }} />}
        {goal && <ReferenceLine y={goal} stroke="#7ad17a" strokeDasharray="4 4" label={{ value: `${goal}"`, fill: "#7ad17a", fontSize: 10, position: "insideBottomRight" }} />}
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2.5} dot={{ r: 3, fill: color }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function SectionLabel({ children, accent }) {
  return (
    <div style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: accent ? ACCENT : MUTE, marginBottom: 12 }}>{children}</div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontFamily: "var(--mono)", fontSize: 11, letterSpacing: 1, color: MUTE, textTransform: "uppercase", marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const card = (pad) => ({ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 4, padding: pad ? 22 : 18 });
const inp = () => ({ width: "100%", background: INK, border: `1px solid ${LINE}`, borderRadius: 4, padding: "11px 12px", color: CHALK, fontFamily: "var(--mono)", fontSize: 16, outline: "none" });
const td = () => ({ padding: "11px 12px", color: CHALK, whiteSpace: "nowrap" });
const primaryBtn = () => ({ width: "100%", background: ACCENT, border: "none", borderRadius: 4, padding: "14px", color: INK, fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, letterSpacing: 1, cursor: "pointer", textTransform: "uppercase" });
