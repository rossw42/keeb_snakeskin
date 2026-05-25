// App entry: state, wiring, presets, drag handles.
import { DEFAULTS } from "./defaults.js";
import { extractOutlineFromSvg } from "./geometry.js";
import { buildForm, refreshAllModified, syncFieldFromState } from "./form.js";
import { CanvasRenderer } from "./render.js";

const PRESET_OUTLINES = ["basic_macropad", "corne-cherry", "ferris", "maizeless", "sofle1"];
const PRESET_CONFIGS = ["basic_macropad", "corne-cherry", "ferris", "lily58", "maizeless", "sofle1", "sofle2"];

// One state object backing the form. Unibody keys live in DEFAULTS now so
// they're saved to / loaded from config.json like everything else.
const state = structuredClone(DEFAULTS);

// One-time migration of any prior localStorage unibody state into the new
// in-config flow. After this runs once the localStorage entry is removed.
(function migrateLocalStorageUnibody() {
  try {
    const raw = localStorage.getItem("snakeskin.unibody");
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if ("unibody_tray" in parsed && !("unibody_mode" in parsed)) {
      parsed.unibody_mode = parsed.unibody_tray ? "tray" : "off";
      delete parsed.unibody_tray;
    }
    for (const [k, v] of Object.entries(parsed)) {
      if (k in DEFAULTS) state[k] = v;
    }
    localStorage.removeItem("snakeskin.unibody");
  } catch {}
})();

const formRoot = document.getElementById("form");
const svgEl = document.getElementById("canvas");
const viewEl = document.getElementById("view");
const canvasWrap = document.querySelector(".canvas-wrap");
const statusEl = document.getElementById("status");
const renderer = new CanvasRenderer(svgEl, viewEl);

const presetSvgSel = document.getElementById("preset-svg");
const presetCfgSel = document.getElementById("preset-config");
for (const name of PRESET_OUTLINES) {
  const o = document.createElement("option");
  o.value = `../preset_outlines/${name}.svg`; o.textContent = name;
  presetSvgSel.appendChild(o);
}
for (const name of PRESET_CONFIGS) {
  const o = document.createElement("option");
  o.value = `../preset_configs/${name}.json`; o.textContent = name;
  presetCfgSel.appendChild(o);
}

// Build form, with onChange dispatch.
buildForm(formRoot, state, (_key, _value) => {
  renderer.render(state);
  refreshHandles();
});

// Wire UI events
document.getElementById("svg-input").addEventListener("change", async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const text = await f.text();
  loadSvg(text, f.name);
});
document.getElementById("config-input").addEventListener("change", async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const text = await f.text();
  applyConfigJson(text, f.name);
});
presetSvgSel.addEventListener("change", async () => {
  const url = presetSvgSel.value; if (!url) return;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.statusText);
    loadSvg(await r.text(), url);
  } catch (err) {
    setStatus(`Could not fetch ${url}: ${err.message}. Run a local HTTP server (see README) or use the upload button.`, "error");
  }
});
presetCfgSel.addEventListener("change", async () => {
  const url = presetCfgSel.value; if (!url) return;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.statusText);
    applyConfigJson(await r.text(), url);
  } catch (err) {
    setStatus(`Could not fetch ${url}: ${err.message}.`, "error");
  }
});

document.getElementById("reset-btn").addEventListener("click", () => {
  Object.assign(state, structuredClone(DEFAULTS));
  buildForm(formRoot, state, () => {
    renderer.render(state);
    refreshHandles();
  });
  renderer.render(state);
  refreshHandles();
  setStatus("Reset to defaults.", "ok");
});

document.getElementById("download-btn").addEventListener("click", downloadConfig);

// --- helpers ----

function loadSvg(text, label) {
  try {
    const { points } = extractOutlineFromSvg(text);
    renderer.setOutline(points);
    renderer.render(state);
    refreshHandles();
    canvasWrap.classList.add("has-svg");
    setStatus(`Loaded outline: ${label} (${points.length} pts)`, "ok");
  } catch (err) {
    setStatus(`Failed to parse SVG: ${err.message}`, "error");
  }
}

function applyConfigJson(text, label) {
  let obj;
  try { obj = JSON.parse(text); }
  catch (err) { setStatus(`Invalid JSON: ${err.message}`, "error"); return; }
  // Reset snakeskin params to defaults, then overlay. Unibody state is preserved.
  Object.assign(state, structuredClone(DEFAULTS));
  for (const [k, v] of Object.entries(obj)) {
    if (k in DEFAULTS) state[k] = v;
  }
  // Remember the name so the next save prompt suggests it.
  const m = label.match(/([^/\\]+?)(\.json)?$/i);
  if (m) lastDownloadName = m[1];
  // Rebuild form so array fields re-render and modified markers refresh.
  buildForm(formRoot, state, () => {
    renderer.render(state);
    refreshHandles();
  });
  renderer.render(state);
  refreshHandles();
  setStatus(`Loaded config: ${label}`, "ok");
}

let lastDownloadName = "config";
function downloadConfig() {
  const diff = {};
  for (const k of Object.keys(DEFAULTS)) {
    if (!deepEq(state[k], DEFAULTS[k])) diff[k] = state[k];
  }
  const suggested = lastDownloadName || "config";
  const raw = window.prompt("Save config as:", suggested);
  if (raw == null) return; // user cancelled
  let name = raw.trim();
  if (!name) name = suggested;
  // strip a trailing .json so we control the extension
  name = name.replace(/\.json$/i, "");
  // allow a-z 0-9 _ - .  — anything else gets replaced with _
  name = name.replace(/[^a-zA-Z0-9._-]+/g, "_");
  if (!name) name = "config";
  lastDownloadName = name;

  const json = JSON.stringify(diff, null, 4) + "\n";
  const blob = new Blob([json], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  const n = Object.keys(diff).length;
  setStatus(`Downloaded ${name}.json (${n} non-default field${n === 1 ? "" : "s"})`, "ok");
}

function refreshHandles() {
  if (!renderer.outline) return;
  const handles = [
    { id: "cutout_position", angle: state.cutout_position, kind: "cutout", label: "cutout" },
  ];
  if (state.carrycase) {
    handles.push({ id: "carrycase_cutout_position", angle: state.carrycase_cutout_position, kind: "cutout", label: "carry cut" });
    handles.push({ id: "magnet_position", angle: state.magnet_position, kind: "magnet", label: "magnets" });
    handles.push({ id: "lip_position_angles[0]", angle: state.lip_position_angles[0], kind: "lip", label: "lip A" });
    handles.push({ id: "lip_position_angles[1]", angle: state.lip_position_angles[1], kind: "lip", label: "lip B" });
  }
  (state.additional_cutouts || []).forEach((tup, i) => {
    handles.push({ id: `additional_cutouts[${i}]`, angle: tup[0], kind: "cutout", label: `cut ${i + 1}` });
  });
  renderer.renderHandles(handles, dragCallback);
}

function dragCallback(id, angle, isFinal) {
  setAngleByHandleId(id, snap(angle));
  renderer.render(state);
  syncRelatedField(id);
  refreshHandles();
  if (isFinal) refreshAllModified(formRoot, state);
}

function setAngleByHandleId(id, angle) {
  if (id === "cutout_position") state.cutout_position = angle;
  else if (id === "carrycase_cutout_position") state.carrycase_cutout_position = angle;
  else if (id === "magnet_position") state.magnet_position = angle;
  else if (id === "lip_position_angles[0]") state.lip_position_angles = [angle, state.lip_position_angles[1]];
  else if (id === "lip_position_angles[1]") state.lip_position_angles = [state.lip_position_angles[0], angle];
  else if (id.startsWith("additional_cutouts[")) {
    const idx = Number(id.match(/\[(\d+)\]/)[1]);
    const next = state.additional_cutouts.map((t) => t.slice());
    next[idx][0] = angle;
    state.additional_cutouts = next;
  }
}

function syncRelatedField(id) {
  if (id.startsWith("lip_position_angles")) syncFieldFromState(formRoot, state, "lip_position_angles");
  else if (id.startsWith("additional_cutouts")) syncFieldFromState(formRoot, state, "additional_cutouts");
  else syncFieldFromState(formRoot, state, id);
}

function snap(angle) {
  // Round to 0.5° to keep numbers tidy, while still feeling smooth.
  return Math.round(angle * 2) / 2;
}

function setStatus(msg, kind = "") {
  statusEl.textContent = msg;
  statusEl.className = "status " + kind;
}

// Tracks the most recent unibody warning so we know when to clear it.
let lastUnibodyWarning = null;

// If unibody mode is on, surface collision/dip warnings in the status bar.
// Clears its own warning when the problem goes away.
function refreshUnibodyStatus() {
  let warning = null;
  if (state.unibody_mode && state.unibody_mode !== "off") {
    if (renderer.unibodyCollision) {
      warning = "⚠ Halves collide — increase separation, reduce splay, or adjust pinky offset.";
    } else if (renderer.unibodyTrayDips) {
      warning = "⚠ Tray hull dips into a case — reduce splay or increase tray tolerance/separation.";
    }
  }
  if (warning) {
    setStatus(warning, "error");
    lastUnibodyWarning = warning;
  } else if (lastUnibodyWarning) {
    setStatus("", "");
    lastUnibodyWarning = null;
  }
}

// Wrap the renderer so every render path also re-checks unibody status.
const _origRender = renderer.render.bind(renderer);
renderer.render = (s) => { _origRender(s); refreshUnibodyStatus(); };

function deepEq(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEq(a[i], b[i])) return false;
    return true;
  }
  return false;
}

setStatus("Load an SVG outline (top left) or pick a preset to begin.");
