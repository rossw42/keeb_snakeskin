from pathlib import Path
import os

if "__file__" in globals():
    script_dir = Path(__file__).parent
else:
    script_dir = Path(os.getcwd())


default_params = {
    "output_dir": script_dir / "../build",
    "split": True,
    "carrycase": True,
    "flush_carrycase_lip": True,
    "honeycomb_base": True,
    "strap_loop": False,
    "tenting_stand": False,
    "tiny_edge_rounding": False,
    "simplify_beziers": False,
    "output_filetype": ".stl",
    "base_z_thickness": 2,
    "wall_xy_thickness": 2.81,
    "wall_z_height": 4.0,
    "z_space_under_pcb": 1,
    "wall_xy_bottom_tolerance": -0.2,
    "wall_xy_top_tolerance": 0.3,
    "cutout_position": 10,
    "cutout_width": 15,
    "additional_cutouts": [],
    "chamfer_len": 1,
    "honeycomb_radius": 6,
    "honeycomb_thickness": 3,
    "strap_loop_thickness": 4,
    "strap_loop_end_offset": 0,
    "strap_loop_gap": 5,
    "carrycase_tolerance_xy": 0.6,
    "carrycase_tolerance_z": 0.5,
    "carrycase_wall_xy_thickness": 4,
    # 11 is about the height above PCB for choc switches. 1.6 = standard pcb
    # thickness. 4 = default wall height
    "carrycase_z_gap_between_cases": 11 + 1.6 - 4 + 1,
    "carrycase_cutout_position": -90,
    "carrycase_cutout_xy_width": 20,
    "lip_len": 1.3,
    "lip_position_angles": [32, 158],
    "magnet_position": -90.0,
    "magnet_separation_distance": 0.81,
    "magnet_spacing": 15,
    "magnet_count": 8,
    "tent_legs": [[30, 50, 0]],
    "tent_hinge_position_offset": 0,
    "tent_hinge_width": 5,
    "tent_hinge_bolt_d": 3,  # M3
    "tent_hinge_bolt_l": 50,
    "tent_hinge_bolt_head_d": 6.94,
    "tent_hinge_nut_l": 2.4,
    "tent_hinge_nut_d": 5.5,
    # Unibody options. Generates an additional clip-in tray that holds the two
    # snakeskin cases at a configured separation, splay, and pinky offset.
    # When unibody_mode == "off" (default) snakeskin behaves as before.
    "unibody_mode": "off",  # "off" | "tray" | "case" (case is future work)
    "unibody_separation": 30,  # mm gap between inner edges of the two halves
    "unibody_splay_angle": 10,  # degrees each half splays outward from centerline
    "unibody_pinky_offset": 0,  # mm Y stagger between halves
    "unibody_tenting_angle": 0,  # degrees, recorded only (no Z effect in v1)
    "unibody_tray_wall_xy": 4,  # mm tray outer wall thickness
    "unibody_tray_tolerance_xy": 0.6,  # mm gap between case and tray
    # Most preset SVGs are LEFT halves (USB on the right of the outline);
    # set True for outlines that represent the right half (e.g. corne, sofle).
    "unibody_outline_is_right_half": False,
    # Folding case (Torn-style): produces a single STL with both halves joined
    # by a print-in-place piano hinge along the inner edge. Each half's base
    # extends past its inner wall into a flat plate, ending in interlocking
    # finger knuckles. Knuckle outer diameter sets the keycap-clearance gap
    # when folded keys-inside.
    # Mutually exclusive with `carrycase` and `tenting_stand` in v1.
    "folding_case": False,
    # Which X side of the SVG outline is the inner (hinge) edge. "right" matches
    # most presets (left halves with USB on the right).
    "folding_case_inner_side": "right",
    # Z gap between the two halves' base plates when folded shut, in mm. Used
    # to size the center strip width (= 2 * (case_height + keycap_clearance))
    # so each half has enough horizontal landing zone to fold without
    # collisions. Typical low-profile choc: 8-9 mm; MX-low: 11-12 mm;
    # MX-tall: ~18 mm.
    "folding_case_keycap_clearance": 12,
    "folding_case_finger_count": 3,        # fingers per half (Torn uses 3)
    "folding_case_pin_d": 3,               # mm — printed pin diameter
    "folding_case_finger_clearance": 0.4,  # mm — gap around pin + between fingers
    # Wall thickness of plastic around the pin (sets knuckle OD =
    # pin_d + 2 * hinge_wall_thickness). Note: this is measured from nominal
    # pin diameter, so the actual printed wall is reduced by `finger_clearance`
    # (the bore is wider than the pin). 1.9 mm here gives ~1.5 mm of real
    # printed wall with default 0.4 mm clearance — at the consensus minimum
    # (3 perimeters at 0.4 mm nozzle) for FDM print-in-place piano hinges.
    "folding_case_hinge_wall_thickness": 1.9,
    # Z height of the pin axis. If None, defaults at build time to
    # base_z_thickness + z_space_under_pcb + wall_z_height + keycap_clearance,
    # placing the pin above keycap tops so the cases can fold 180°
    # keys-inside without collisions. Each piece gets a thin vertical tab
    # from its base up to the pin to support the knuckle.
    "folding_case_pin_height": None,
    # Distance the case base extends past the natural PCB outline on the
    # inner side, ending at the hinge column. Bigger = stiffer hinge mount,
    # more compact-looking case; smaller = less material.
    "folding_case_base_extension": 8,      # mm
    # X width of the flat center section between the two pin axes. If None,
    # defaults at build time to 2 * (case_height + keycap_clearance), giving
    # each half-case a full-height landing zone when folded keys-inside.
    "folding_case_center_width": None,     # mm or None (auto)
    # Debug: emit just one case + base extension, no hinges, no mirror, no
    # center piece. Used to validate the building block in isolation.
    "folding_case_debug_single_half": False,
    # Output the assembly pre-folded into clamshell position: case A flat on
    # the bed, center bridge rotated up around pin1, case B rotated again
    # around pin2 to lie inverted above case A. Hinges are still
    # print-in-place — the rotations happen exactly around the pin axes.
    # Note: case B's walls become overhangs in this orientation; expect to
    # need supports under the upper half when slicing.
    "folding_case_output_folded": False,
}
