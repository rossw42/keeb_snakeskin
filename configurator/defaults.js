// Mirror of src/default_params.py. Keep in sync manually.
// Order is meaningful for UI grouping — see groups.js.
export const DEFAULTS = {
  split: true,
  carrycase: true,
  flush_carrycase_lip: true,
  honeycomb_base: true,
  strap_loop: false,
  tenting_stand: false,
  tiny_edge_rounding: false,
  simplify_beziers: false,
  output_filetype: ".stl",

  base_z_thickness: 2,
  wall_xy_thickness: 2.81,
  wall_z_height: 4.0,
  z_space_under_pcb: 1,
  wall_xy_bottom_tolerance: -0.2,
  wall_xy_top_tolerance: 0.3,
  chamfer_len: 1,

  cutout_position: 10,
  cutout_width: 15,
  additional_cutouts: [],

  honeycomb_radius: 6,
  honeycomb_thickness: 3,

  strap_loop_thickness: 4,
  strap_loop_end_offset: 0,
  strap_loop_gap: 5,

  carrycase_tolerance_xy: 0.6,
  carrycase_tolerance_z: 0.5,
  carrycase_wall_xy_thickness: 4,
  carrycase_z_gap_between_cases: 11 + 1.6 - 4 + 1,
  carrycase_cutout_position: -90,
  carrycase_cutout_xy_width: 20,

  lip_len: 1.3,
  lip_position_angles: [32, 158],

  magnet_position: -90.0,
  magnet_separation_distance: 0.81,
  magnet_spacing: 15,
  magnet_count: 8,

  tent_legs: [[30, 50, 0]],
  tent_hinge_position_offset: 0,
  tent_hinge_width: 5,
  tent_hinge_bolt_d: 3,
  tent_hinge_bolt_l: 50,
  tent_hinge_bolt_head_d: 6.94,
  tent_hinge_nut_l: 2.4,
  tent_hinge_nut_d: 5.5,

  unibody_mode: "off",
  unibody_separation: 30,
  unibody_splay_angle: 10,
  unibody_pinky_offset: 0,
  unibody_tenting_angle: 0,
  unibody_tray_wall_xy: 4,
  unibody_tray_tolerance_xy: 0.6,
  unibody_outline_is_right_half: false,

  // Folding case: single STL with both halves + a flat center bridge joined
  // by print-in-place piano hinges. Mutually exclusive with `carrycase` and
  // `tenting_stand`.
  folding_case: false,
  folding_case_inner_side: "right",
  folding_case_keycap_clearance: 12,
  folding_case_finger_count: 3,
  folding_case_pin_d: 3,
  folding_case_finger_clearance: 0.4,
  folding_case_hinge_wall_thickness: 1.9,
  folding_case_pin_height: null,
  folding_case_base_extension: 8,
  folding_case_center_width: null,
  folding_case_debug_single_half: false,
  folding_case_output_folded: false,
};

// Parameter metadata: tooltip + units + UI hints. All fields optional.
// Tooltips summarize the README descriptions.
export const META = {
  split: { tip: "Generate a mirrored pair of files for a split board." },
  carrycase: { tip: "Generate the magnetic carrycase. Affects the main case shape too." },
  flush_carrycase_lip: { tip: "Carrycase lip retention style. True = lip extends into carrycase center with matching cutout in case (no supports needed). False = flat-bottom case, tighter fit, but needs supports all around the carrycase bottom and top lip when printing." },
  honeycomb_base: { tip: "Replace solid case base with a hexagon cage." },
  strap_loop: { tip: "Add a strap loop to the leftmost end of the boards (e.g. for legs/chair-arm mount). Experimental." },
  tenting_stand: { tip: "Add the quick-deploy tenting hinge + flap. Hinge accepts a hex nut and countersunk bolt of customisable length." },
  tiny_edge_rounding: { tip: "Troubleshooting: enable if your case errors out with an OCP/invalid-shape error caused by tiny outline edges. Slightly rounds internal corners." },
  simplify_beziers: { tip: "Troubleshooting: enable if bezier-edged outlines (e.g. corne) cause OCP errors. Approximates curves as straight lines, so the fit may get tighter — increase top tolerance if needed." },
  output_filetype: { tip: ".stl or .step. STEP keeps the parametric geometry and is better as a base for further CAD work." },

  base_z_thickness: { tip: "Z thickness of the case bottom.", unit: "mm" },
  wall_xy_thickness: { tip: "Wall thickness around the PCB. Recommend 2 + magnet_separation_distance when using the carrycase, so magnets don't rattle. If your keys sit close to the PCB edge with tall switches you may need more.", unit: "mm" },
  wall_z_height: { tip: "Wall height above the bottom of the PCB. Total wall = wall_z_height + z_space_under_pcb. Default leaves room for magnets when using the carrycase. Use ~1.6 for a no-carrycase case that just covers the PCB.", unit: "mm" },
  z_space_under_pcb: { tip: "Gap beneath the PCB for through-hole pins, wires, hotswap sockets etc. Use ~1.85 for kailh hotswap sockets.", unit: "mm" },
  wall_xy_bottom_tolerance: { tip: "Gap (or interference, if -ve) between PCB and case wall at the bottom. -ve gives friction fit. Implemented with a scaling hack — measure the result if you need it exact.", unit: "mm" },
  wall_xy_top_tolerance: { tip: "Gap between PCB outline and the widest part of the walls (top). Tune to printer tolerance and desired fit tightness.", unit: "mm" },
  chamfer_len: { tip: "Chamfer length on case edges.", unit: "mm" },

  cutout_position: { tip: "Angle (-180..180) from case centroid for the PCB removal cutout. 0=+X, 90=+Y, -90=-Y. Suggest placing it at your USB connector. Snapped to nearest possible angle.", unit: "°", angleParam: true },
  cutout_width: { tip: "Width of the removal cutout. May cut out a bit more if the area isn't a straight line.", unit: "mm" },
  additional_cutouts: { tip: "Extra cutouts in the wall as [angle, width] pairs (e.g. for a TRRS cable). Same angle convention as cutout_position." },

  honeycomb_radius: { tip: "Inscribed (major) radius of honeycomb hexagon cells.", unit: "mm" },
  honeycomb_thickness: { tip: "Thickness of the bars between honeycomb cells.", unit: "mm" },

  strap_loop_thickness: { tip: "XY thickness of the strap loop.", unit: "mm" },
  strap_loop_end_offset: { tip: "Inset from the case end where the strap loop starts. Tune to dodge or merge with corners.", unit: "mm" },
  strap_loop_gap: { tip: "Gap in the strap loop for the strap to thread through.", unit: "mm" },

  carrycase_tolerance_xy: { tip: "XY gap between PCB case and carrycase. Bigger = easier to insert/remove, looser fit when in.", unit: "mm" },
  carrycase_tolerance_z: { tip: "Z gap between case and carrycase blockers.", unit: "mm" },
  carrycase_wall_xy_thickness: { tip: "Thickness of the carrycase outer wall.", unit: "mm" },
  carrycase_z_gap_between_cases: { tip: "Vertical room between the tops of the case walls when nested. Estimate: (PCB-bottom to highest keycap) − wall_z_height + 1.", unit: "mm" },
  carrycase_cutout_position: { tip: "Angle (-180..180) for the finger cutout on the carrycase. Should be opposite the lip and on the same side as the magnets.", unit: "°", angleParam: true },
  carrycase_cutout_xy_width: { tip: "Width of the carrycase finger cutout.", unit: "mm" },

  lip_len: { tip: "Length of the lip (excluding carrycase tolerance) — XY length protruding over the case.", unit: "mm" },
  lip_position_angles: { tip: "[start, end] angles bracketing the lip arc. Difference must be < 180°. Should cover a long straight section, opposite the carrycase finger cutout and magnets.", angleParam: true },

  magnet_position: { tip: "Angle (-180..180) for the centerline of the magnet run along the wall (case + carrycase).", unit: "°", angleParam: true },
  magnet_separation_distance: { tip: "Plastic thickness between case magnet and carrycase magnet.", unit: "mm" },
  magnet_spacing: { tip: "Distance between magnet centers along the wall.", unit: "mm" },
  magnet_count: { tip: "Number of magnets per case (split + carrycase build = 4× this many magnets total). The finger cutout may eat a couple — check the output.", integer: true },

  tent_legs: { tip: "List of [width, length, tenting_angle] per leg (mm, mm, °). Multiple legs nest within each other; widths MUST decrease as length increases or nesting fails." },
  tent_hinge_position_offset: { tip: "Up/down offset of the hinge from the bbox center.", unit: "mm" },
  tent_hinge_width: { tip: "Y thickness of the hinge. Keep small if you have many flaps.", unit: "mm" },
  tent_hinge_bolt_d: { tip: "Bolt diameter (e.g. 3 = M3). Convert imperial sizes; do not measure the thread.", unit: "mm" },
  tent_hinge_bolt_l: { tip: "Bolt length (assumes countersunk head).", unit: "mm" },
  tent_hinge_bolt_head_d: { tip: "Bolt head diameter (used for countersink).", unit: "mm" },
  tent_hinge_nut_l: { tip: "Length (depth) of the nut retention hole. NOTE: defaults in default_params.py for this and tent_hinge_nut_d are swapped — set values explicitly.", unit: "mm" },
  tent_hinge_nut_d: { tip: "Inscribed (across-flats) diameter of the hex nut. NOTE: defaults in default_params.py for this and tent_hinge_nut_l are swapped — set values explicitly.", unit: "mm" },

  // Unibody options (also live in default_params.py).
  // unibody_mode: "off" | "tray" | "case" (case mode is configurator-preview only for now)
  unibody_mode: { tip: "off = single-case build. tray = also generate a clip-in tray holding both cases. case = single unibody case around two PCBs (preview only — code generation TBD).", choices: ["off", "tray", "case"] },
  unibody_separation: { tip: "Horizontal gap between the inner edges of the two halves.", unit: "mm" },
  unibody_splay_angle: { tip: "Outward rotation of each half (top of the board fans away from the centerline). Each half rotates ±this many degrees around its own centroid.", unit: "°" },
  unibody_pinky_offset: { tip: "Vertical stagger of the right half relative to the left.", unit: "mm" },
  unibody_tenting_angle: { tip: "Tilt around the X axis (top of board lifts away from desk). Recorded only — no Z effect in v1.", unit: "°" },
  unibody_tray_wall_xy: { tip: "Tray outer wall thickness (tray mode only).", unit: "mm" },
  unibody_tray_tolerance_xy: { tip: "XY gap between case and tray (tray mode only).", unit: "mm" },
  unibody_outline_is_right_half: { tip: "Most preset SVGs (ferris, maizeless) are LEFT halves. If your outline is a RIGHT half (e.g. corne, sofle), enable this so the unibody preview puts it on the right and the mirror on the left." },

  // Folding case
  folding_case: { tip: "Generate a single STL with both halves + a flat center bridge joined by a print-in-place piano hinge (clamshell, Torn-inspired form factor). Mutually exclusive with carrycase and tenting_stand." },
  folding_case_inner_side: { tip: "Which X side of the SVG outline is the inner (hinge-mating) edge. \"right\" matches most presets (left halves with USB on the right of the outline).", choices: ["right", "left"] },
  folding_case_keycap_clearance: { tip: "Z gap to leave for keycaps when folded. Drives the default center strip width. Typical: low-profile choc 8-9, MX-low 11-12, MX-tall ~18.", unit: "mm" },
  folding_case_finger_count: { tip: "Fingers per half. 3 is a good starting point. Fewer = more durable, more = smoother feel.", integer: true },
  folding_case_pin_d: { tip: "Print-in-place pin diameter. 3 mm is standard.", unit: "mm" },
  folding_case_finger_clearance: { tip: "Tolerance gap around the pin and between adjacent fingers. Becomes rotation clearance after first 'crack' on opening. PETG consensus: 0.35–0.50 mm — too tight risks fusion.", unit: "mm" },
  folding_case_hinge_wall_thickness: { tip: "Sets knuckle OD = pin_d + 2 × this. NOTE: measured from nominal pin OD; the actual printed wall is reduced by finger_clearance. Default 1.9 mm gives ~1.5 mm real printed wall (FDM minimum, 3 perimeters at 0.4 mm nozzle).", unit: "mm" },
  folding_case_pin_height: { tip: "Z height of the pin axis (mm). Leave blank for auto: knuckle bottom flush with case bottom (z = knuckle_radius). Set explicitly to elevate the pin." },
  folding_case_base_extension: { tip: "How far the case base extends past its natural inner edge before the hinge column. Bigger = stiffer hinge mount.", unit: "mm" },
  folding_case_center_width: { tip: "X width of the flat center strip between the two pin axes. Leave blank for auto = keycap_clearance. Wider = more visible center bridge but bigger folded depth.", unit: "mm" },
  folding_case_debug_single_half: { tip: "Debug: emit just one case + extension, no hinge / no mirror / no center piece. Validates the building block in isolation." },
  folding_case_output_folded: { tip: "Output the assembly pre-folded into clamshell position (case A flat, center vertical, case B inverted above A). Hinge geometry is preserved — rotations happen exactly around the pin axes. Useful when the flat layout doesn't fit the print bed. Trade-off: case B's roof becomes a downward overhang and pin axes are vertical instead of horizontal." },
};
