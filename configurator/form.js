// Form rendering: groups, fields, two-way binding to state.
// Emits 'change' callbacks; tracks which fields differ from defaults.

import { DEFAULTS, META } from "./defaults.js";

// Unibody keys live in DEFAULTS now (snakeskin understands them) but get a
// dedicated UI section so users can find them. Listed in render order.
const UNIBODY_KEYS = [
  "unibody_mode",
  "unibody_separation",
  "unibody_splay_angle",
  "unibody_pinky_offset",
  "unibody_tenting_angle",
  "unibody_tray_wall_xy",
  "unibody_tray_tolerance_xy",
  "unibody_outline_is_right_half",
];

// Visual grouping. Fields not listed here go into "Other".
export const GROUPS = [
  ["General", ["split", "carrycase", "folding_case", "honeycomb_base", "flush_carrycase_lip", "strap_loop", "tenting_stand", "output_filetype", "tiny_edge_rounding", "simplify_beziers"]],
  ["Case dimensions", ["base_z_thickness", "wall_xy_thickness", "wall_z_height", "z_space_under_pcb", "wall_xy_bottom_tolerance", "wall_xy_top_tolerance", "chamfer_len"]],
  ["Cutouts", ["cutout_position", "cutout_width", "additional_cutouts"]],
  ["Magnets", ["magnet_position", "magnet_count", "magnet_spacing", "magnet_separation_distance"]],
  ["Carrycase", ["carrycase_tolerance_xy", "carrycase_tolerance_z", "carrycase_wall_xy_thickness", "carrycase_z_gap_between_cases", "carrycase_cutout_position", "carrycase_cutout_xy_width", "lip_len", "lip_position_angles"]],
  ["Honeycomb", ["honeycomb_radius", "honeycomb_thickness"]],
  ["Strap loop", ["strap_loop_thickness", "strap_loop_end_offset", "strap_loop_gap"]],
  ["Tenting stand", ["tent_legs", "tent_hinge_position_offset", "tent_hinge_width", "tent_hinge_bolt_d", "tent_hinge_bolt_l", "tent_hinge_bolt_head_d", "tent_hinge_nut_l", "tent_hinge_nut_d"]],
  ["Folding case", ["folding_case_inner_side", "folding_case_output_folded", "folding_case_keycap_clearance", "folding_case_base_extension", "folding_case_center_width", "folding_case_finger_count", "folding_case_pin_d", "folding_case_hinge_wall_thickness", "folding_case_finger_clearance", "folding_case_pin_height", "folding_case_debug_single_half"]],
];

// Detect type from default value.
function detectType(value, meta) {
  if (typeof value === "boolean") return "bool";
  if (Array.isArray(meta.choices)) return "enum";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return meta.integer ? "int" : "number";
  if (Array.isArray(value)) {
    if (value.length === 0) return "array2"; // unknown shape, default to [angle,width]
    if (Array.isArray(value[0])) return value[0].length === 3 ? "array3" : "array2";
    return value.length === 2 ? "tuple2" : "array";
  }
  // null defaults are treated as nullable numbers — the field accepts a
  // number or stays empty (= null = "use auto default at build time").
  if (value === null) return "nullable_number";
  return "string";
}

export function buildForm(root, state, onChange) {
  root.innerHTML = "";
  const used = new Set();

  for (const [groupName, keys] of GROUPS) {
    const details = el("details", { class: "group", open: groupName === "General" || groupName === "Cutouts" || groupName === "Magnets" || groupName === "Carrycase" });
    details.appendChild(el("summary", {}, groupName));
    const body = el("div", { class: "group-body" });
    for (const key of keys) {
      if (!(key in DEFAULTS)) continue;
      used.add(key);
      body.appendChild(buildField(key, state, onChange, DEFAULTS, META));
    }
    // Surface the unibody mode toggle in General so it's discoverable.
    if (groupName === "General") {
      body.appendChild(buildField("unibody_mode", state, onChange, DEFAULTS, META));
    }
    details.appendChild(body);
    root.appendChild(details);
  }

  // Mark unibody keys as used so the catch-all "Other" group doesn't list them.
  for (const k of UNIBODY_KEYS) used.add(k);

  // Catch any stragglers
  const extras = Object.keys(DEFAULTS).filter((k) => !used.has(k));
  if (extras.length) {
    const details = el("details", { class: "group" });
    details.appendChild(el("summary", {}, "Other"));
    const body = el("div", { class: "group-body" });
    for (const k of extras) body.appendChild(buildField(k, state, onChange, DEFAULTS, META));
    details.appendChild(body);
    root.appendChild(details);
  }

  // Unibody (visually distinct since tray-mode CASE generation is still WIP).
  const uni = el("details", { class: "group unibody", open: state.unibody_mode && state.unibody_mode !== "off" });
  uni.appendChild(el("summary", {}, "Unibody"));
  const ubody = el("div", { class: "group-body" });
  const note = el("div", { class: "hint", style: "color: var(--muted); padding: 2px 0 6px;" });
  note.textContent = "tray mode generates a clip-in tray .stl/.step. case mode is preview only.";
  ubody.appendChild(note);
  for (const key of UNIBODY_KEYS) {
    if (key === "unibody_mode") continue; // already shown in General
    ubody.appendChild(buildField(key, state, onChange, DEFAULTS, META));
  }
  uni.appendChild(ubody);
  root.appendChild(uni);
}

function buildField(key, state, onChange, defaults, metas) {
  const def = defaults[key];
  const meta = (metas && metas[key]) || {};
  const type = detectType(def, meta);

  const wrap = el("div", { class: "field", "data-key": key });
  const tip = (meta.tip || "") + (meta.unit ? ` (${meta.unit})` : "");
  const label = el("label", { class: "tooltip", "data-tip": tip });
  label.appendChild(el("span", { class: "modified" }));
  label.appendChild(el("span", { class: "name" }, key));
  wrap.appendChild(label);

  let input;
  switch (type) {
    case "bool":
      input = el("input", { type: "checkbox" });
      input.checked = !!state[key];
      input.addEventListener("change", () => commit(key, input.checked, state, wrap, onChange));
      break;
    case "enum":
      input = el("select");
      for (const opt of meta.choices) {
        const o = el("option", { value: opt }, opt);
        if (state[key] === opt) o.selected = true;
        input.appendChild(o);
      }
      input.addEventListener("change", () => commit(key, input.value, state, wrap, onChange));
      break;
    case "string":
      if (key === "output_filetype") {
        input = el("select");
        for (const opt of [".stl", ".step"]) {
          const o = el("option", { value: opt }, opt);
          if (state[key] === opt) o.selected = true;
          input.appendChild(o);
        }
        input.addEventListener("change", () => commit(key, input.value, state, wrap, onChange));
      } else {
        input = el("input", { type: "text" });
        input.value = state[key] ?? "";
        input.addEventListener("change", () => commit(key, input.value, state, wrap, onChange));
      }
      break;
    case "int":
    case "number":
      input = el("input", { type: "number", step: type === "int" ? "1" : "any" });
      input.value = state[key];
      input.addEventListener("change", () => {
        const v = input.value === "" ? def : Number(input.value);
        commit(key, v, state, wrap, onChange);
      });
      break;
    case "nullable_number":
      input = el("input", { type: "number", step: "any", placeholder: "auto" });
      input.value = state[key] == null ? "" : state[key];
      input.addEventListener("change", () => {
        const v = input.value === "" ? null : Number(input.value);
        commit(key, v, state, wrap, onChange);
      });
      break;
    case "tuple2":
      input = renderTuple(key, state, onChange, wrap, 2, ["start°", "end°"]);
      break;
    case "array2":
      input = renderArray(key, state, onChange, wrap, 2, ["angle°", "width mm"]);
      break;
    case "array3":
      input = renderArray(key, state, onChange, wrap, 3, ["width", "length", "angle°"]);
      break;
    default:
      input = el("input", { type: "text" });
      input.value = JSON.stringify(state[key]);
      input.addEventListener("change", () => {
        try { commit(key, JSON.parse(input.value), state, wrap, onChange); }
        catch { input.value = JSON.stringify(state[key]); }
      });
  }

  if (input) wrap.appendChild(input);

  // Mark modified state initially
  refreshModified(wrap, key, state);
  return wrap;
}

function renderTuple(key, state, onChange, wrap, n, placeholders) {
  wrap.classList.add("array");
  const rows = el("div", { class: "rows" });
  const row = el("div", { class: "row" });
  const arr = (state[key] || []).slice();
  while (arr.length < n) arr.push(0);
  for (let i = 0; i < n; i++) {
    const inp = el("input", { type: "number", step: "any", placeholder: placeholders[i] || "" });
    inp.value = arr[i];
    inp.addEventListener("change", () => {
      arr[i] = inp.value === "" ? 0 : Number(inp.value);
      commit(key, arr.slice(), state, wrap, onChange);
    });
    row.appendChild(inp);
  }
  rows.appendChild(row);
  wrap.appendChild(rows);
  return null;
}

function renderArray(key, state, onChange, wrap, n, placeholders) {
  wrap.classList.add("array");
  const rows = el("div", { class: "rows" });

  const rerender = () => {
    rows.innerHTML = "";
    const list = state[key] || [];
    list.forEach((tuple, idx) => {
      const row = el("div", { class: "row" });
      for (let i = 0; i < n; i++) {
        const inp = el("input", { type: "number", step: "any", placeholder: placeholders[i] || "" });
        inp.value = tuple[i] ?? 0;
        inp.addEventListener("change", () => {
          const next = state[key].map((t) => t.slice());
          next[idx][i] = inp.value === "" ? 0 : Number(inp.value);
          commit(key, next, state, wrap, onChange);
        });
        row.appendChild(inp);
      }
      const rm = el("button", { type: "button", title: "Remove" }, "×");
      rm.addEventListener("click", () => {
        const next = state[key].filter((_, j) => j !== idx);
        commit(key, next, state, wrap, onChange);
        rerender();
      });
      row.appendChild(rm);
      rows.appendChild(row);
    });
    const add = el("button", { type: "button", class: "add" }, "+ add");
    add.addEventListener("click", () => {
      const blank = new Array(n).fill(0);
      const next = [...(state[key] || []), blank];
      commit(key, next, state, wrap, onChange);
      rerender();
    });
    rows.appendChild(add);
  };

  rerender();
  wrap.appendChild(rows);
  // Allow external re-render of array fields
  wrap._rerender = rerender;
  return null;
}

function commit(key, value, state, wrap, onChange) {
  state[key] = value;
  refreshModified(wrap, key, state);
  onChange(key, value);
}

export function refreshAllModified(root, state) {
  for (const wrap of root.querySelectorAll(".field[data-key]")) {
    refreshModified(wrap, wrap.dataset.key, state);
  }
}

function refreshModified(wrap, key, state) {
  if (!wrap) return;
  const eq = deepEq(state[key], DEFAULTS[key]);
  wrap.classList.toggle("modified", !eq);
}

export function syncFieldFromState(root, state, key) {
  const wrap = root.querySelector(`.field[data-key="${cssEscape(key)}"]`);
  if (!wrap) return;
  // Re-render array fields wholesale; for primitives, just update the input.
  if (wrap._rerender) { wrap._rerender(); refreshModified(wrap, key, state); return; }
  const inp = wrap.querySelector("input, select");
  if (!inp) return;
  if (inp.type === "checkbox") inp.checked = !!state[key];
  else if (state[key] == null) inp.value = "";
  else if (Array.isArray(state[key])) {
    const inputs = wrap.querySelectorAll("input");
    state[key].forEach((v, i) => { if (inputs[i]) inputs[i].value = v; });
  } else inp.value = state[key];
  refreshModified(wrap, key, state);
}

function deepEq(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEq(a[i], b[i])) return false;
    return true;
  }
  return false;
}

function cssEscape(s) {
  return (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function el(tag, attrs = {}, text) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (v === true) e.setAttribute(k, "");
    else e.setAttribute(k, v);
  }
  if (text != null) e.appendChild(textNode(text));
  return e;
}
function textNode(t) { return document.createTextNode(t); }
