"""Folding case generation (three-piece print-in-place hinge).

Produces a single STL with three pieces: the two case halves of a split
keyboard plus a flat center bridge between them. The center is connected
to each case by a print-in-place piano hinge with its own pin axis. So
two pin axes total — one between Case A and the center, one between the
center and Case B.

Why three pieces (not two): two pin axes in series allow each hinge to
rotate independently up to ~90°, giving the assembly >180° total travel.
That's enough to fold flat keys-inside AND eventually tent (the center
piece becomes the apex when tented).

Hinge geometry per pin axis:
- Knuckle outer diameter = `folding_case_keycap_clearance`. When folded
  keys-inside the cases pivot down to lie parallel above each other,
  separated by knuckle_diameter so the keycaps don't touch.
- Knuckle Z-center = case_top_Z - knuckle_radius (when the knuckle fits
  inside case height) or case_bottom + knuckle_radius (otherwise),
  keeping the knuckle bottom flush with z=0 so the assembly sits flat
  on a desk.
- Knuckles alternate along Y between case-side and center-side so they
  interlock around the print-in-place pin.

Layout in X (with two cases facing inward and center between them):

    case A body  | A's extension | A knuckles | center strip | B knuckles | B's extension | case B body
                 |               |  pin1 ↑    |              |   ↑ pin2  |               |
       <- - - -  -base_ext        x = -cw/2                  x = +cw/2

where cw = `folding_case_center_width` (defaults to keycap_clearance).
The pin axes sit at x = ±cw/2 / +knuckle_radius? Actually no — the
center strip width is the distance BETWEEN the two pin axes. So pin1 is
at x = -cw/2, pin2 at x = +cw/2.

v1 scope: hinge only, no tenting lock, no carrycase, no magnet latch.
Mutually exclusive with `carrycase` and `tenting_stand`.
"""

from build123d import (
    Align,
    Axis,
    Box,
    Compound,
    Cylinder,
    Location,
    Plane,
    Rectangle,
    extrude,
    mirror,
    offset,
)


Loc = Location


def generate_folding_case(base_face, generate_pcb_case, pcb_case_wall_height, cfg):
    """Build the folding-case assembly (3 pieces + 2 pins)."""
    inner_side = cfg["folding_case_inner_side"]
    if inner_side not in ("left", "right"):
        raise ValueError(
            f"folding_case_inner_side must be 'left' or 'right', got {inner_side!r}"
        )
    n_fingers_a = cfg["folding_case_finger_count"]
    if n_fingers_a < 2:
        raise ValueError("folding_case_finger_count must be >= 2")

    base_t = cfg["base_z_thickness"]
    pin_r = cfg["folding_case_pin_d"] / 2
    clearance = cfg["folding_case_finger_clearance"]
    keycap_clearance = cfg["folding_case_keycap_clearance"]
    hinge_wall_thickness = cfg["folding_case_hinge_wall_thickness"]

    # Knuckle OD = pin_d + 2 * hinge_wall_thickness. Sized like typical
    # print-in-place piano hinges, decoupled from keycap_clearance.
    knuckle_outer_r = pin_r + hinge_wall_thickness

    base_extension = cfg["folding_case_base_extension"]
    # Auto-default center_width to `keycap_clearance`. When the cases fold
    # 90° over the center strip, the keycaps point inward toward each
    # other; setting the strip width to keycap_clearance keeps the keycap
    # tips just touching at the center without collision.
    center_width = cfg["folding_case_center_width"]
    if center_width is None:
        center_width = keycap_clearance

    # X positions, working from left to right:
    #   case A body in x < -base_extension - knuckle_outer_r - center_width/2
    #   A's extension covers from inner edge to x = -center_width/2 - knuckle_outer_r
    #   pin1 axis at x = -center_width/2 - knuckle_outer_r? actually no
    #
    # Re-think: each case's knuckle has its OUTER edge flush with its base
    # extension's outer edge. Center piece's knuckle has its OUTER edge
    # flush with the center strip's outer edge (each side). At each pin
    # axis, the case-side knuckle and the center-side knuckle share the
    # same pin axis but interlock along Y.
    #
    # If center strip width = cw and the strip is x in [-cw/2, +cw/2], then
    # the right pin axis is at x = +cw/2 (center's right knuckle is centered
    # there with outer edge at +cw/2 + knuckle_outer_r facing OUTWARD; case
    # B's knuckle on this same pin is centered there too, both wrap around
    # the pin from opposite Y slots).
    #
    # Wait — that puts the knuckle's outer X at cw/2 + R. So case B's
    # extension must reach to cw/2 + R as well (= the inner edge of case B's
    # base extension is at cw/2 + R, hinge between cw/2 + R and the case
    # body).
    pin1_x = -center_width / 2  # left pin (between A and center)
    pin2_x = +center_width / 2  # right pin (between center and B)

    # Layout (right side, mirrored for left):
    #   - Center strip:  x = -cw/2 .. +cw/2, base_t thick
    #   - Pin2 axis:     x = +cw/2 (= right edge of center strip)
    #   - Knuckle column at pin2: centered at pin2_x, OD = 2*knuckle_outer_r,
    #     so spans x = pin2_x - R to pin2_x + R. The LEFT half (x < pin2_x)
    #     overlaps the center strip; the RIGHT half overlaps the extension.
    #   - Extension:     x = pin2_x .. case_b_inner_x, full case Y
    #   - Case body:     x = case_b_inner_x .. case body max X
    hinge_outer_x = pin2_x  # extension's outer edge sits on the pin axis
    case_b_inner_x = hinge_outer_x + base_extension
    # Symmetrically for case A.

    # Build the half (will be mirrored for case A).
    # For Case B, we want the case body on the RIGHT side of the centerline,
    # with the body's inner edge at x = case_b_inner_x (= pin2_x +
    # knuckle_r + base_extension), and the body extending RIGHTWARD from
    # there. So the case's INNER edge must become min.X and the body must
    # extend toward +X.
    #
    # If inner_side="right", the SVG outline has its inner edge at max.X,
    # so we mirror first so it lands at min.X, then shift.
    # If inner_side="left", the outline already has inner edge at min.X.
    half = generate_pcb_case(base_face, pcb_case_wall_height)
    case_outer_face = offset(base_face, cfg["wall_xy_thickness"])
    bb = case_outer_face.bounding_box()

    if inner_side == "right":
        # Mirror so inner edge moves from max.X to min.X (now facing -X
        # direction, body extends toward +X).
        oriented = mirror(half, about=Plane.YZ)
        oriented_face = mirror(case_outer_face, about=Plane.YZ)
    else:
        oriented = half
        oriented_face = case_outer_face
    o_bb = oriented.bounding_box()
    # Shift so the (now-)min.X = case_b_inner_x.
    shift = case_b_inner_x - o_bb.min.X
    placed_b = oriented.moved(Loc((shift, 0, 0)))
    placed_b_face = oriented_face.moved(Loc((shift, 0, 0)))

    # Y / Z extents from the placed case.
    placed_bb = placed_b.bounding_box()
    case_top_z = placed_bb.max.Z
    case_bottom_z = 0.0

    # Pin axis Z: by default, place the knuckle so its bottom sits flush
    # with the case bottom (z=0) and its top is at z = knuckle_diameter.
    # The Z gap when folded keys-inside = knuckle_diameter, so the user
    # should size `folding_case_hinge_wall_thickness` so the OD clears
    # their keycap height: knuckle_OD = pin_d + 2 * hinge_wall_thickness.
    pin_z_override = cfg["folding_case_pin_height"]
    if pin_z_override is not None:
        knuckle_z_center = pin_z_override
    else:
        knuckle_z_center = case_bottom_z + knuckle_outer_r

    y_min, y_max = placed_bb.min.Y, placed_bb.max.Y
    hinge_total_y = y_max - y_min
    case_y_center = (y_min + y_max) / 2

    # Case B extension: from the case's inner edge inward to pin2_x + R
    # (which is where the hinge column's outer edge sits) — wait, the
    # extension is BETWEEN the case body and the hinge knuckle column.
    # Inner edge of case body = case_b_inner_x. Outer edge of hinge knuckle
    # column = pin2_x + knuckle_outer_r. These are equal by construction
    # (we set case_b_inner_x = pin2_x + R + base_extension, and the
    # extension fills the gap from case body's natural inner edge inward).
    #
    # Build extension face: closed polygon with vertical hinge edge at
    # x=hinge_outer_x, horizontal top/bottom edges out to the case's
    # natural top/bottom corners, and the case's actual inner-edge
    # contour as the inner boundary.
    extension_b_face = _build_inner_edge_extension(
        placed_b_face, hinge_outer_x, base_extension
    )
    extension_b = extrude(extension_b_face, base_t)

    # Debug short-circuit: emit just one case + its extension. Used to
    # validate the building block in isolation before adding hinges.
    if cfg.get("folding_case_debug_single_half"):
        out = placed_b + extension_b
        return Compound([*out.solids()])

    # Case A: mirror of B across YZ.
    placed_a = mirror(placed_b, about=Plane.YZ)
    extension_a = mirror(extension_b, about=Plane.YZ)

    # Center strip: a flat plate from x = -cw/2 to +cw/2, full Y range,
    # base_t thick, sitting on z=0.
    center_strip = extrude(
        Rectangle(
            width=center_width,
            height=hinge_total_y,
            align=(Align.CENTER, Align.CENTER),
        ).moved(Loc((0, case_y_center))),
        base_t,
    )

    # Finger layout per pin axis:
    # Total slots along Y = 2*n_fingers_a - 1. The case-side gets every
    # other slot, the center-side gets the rest. Each pin axis has its
    # own set of N case-side knuckles and N-1 center-side knuckles.
    n_total_slots = 2 * n_fingers_a - 1
    finger_len = (hinge_total_y - clearance * (n_total_slots - 1)) / n_total_slots
    if finger_len <= 0:
        raise ValueError(
            "Too many fingers for the case length; reduce folding_case_finger_count."
        )

    # Build knuckle stacks for each piece around each pin axis. Knuckles
    # sit at their natural position (bottom flush with case base z=0). No
    # vertical tabs needed because the pin is at mid-case height — the
    # case body itself supports the knuckles.
    case_b_hinge = _build_knuckles_at(
        pin2_x, case_y_center, knuckle_z_center,
        n_total_slots, knuckle_outer_r, finger_len, clearance,
        slot_indices=range(0, n_total_slots, 2),  # even slots → case
        y_min=y_min,
    )
    center_right_hinge = _build_knuckles_at(
        pin2_x, case_y_center, knuckle_z_center,
        n_total_slots, knuckle_outer_r, finger_len, clearance,
        slot_indices=range(1, n_total_slots, 2),  # odd slots → center
        y_min=y_min,
    )
    case_a_hinge = _build_knuckles_at(
        pin1_x, case_y_center, knuckle_z_center,
        n_total_slots, knuckle_outer_r, finger_len, clearance,
        slot_indices=range(0, n_total_slots, 2),
        y_min=y_min,
    )
    center_left_hinge = _build_knuckles_at(
        pin1_x, case_y_center, knuckle_z_center,
        n_total_slots, knuckle_outer_r, finger_len, clearance,
        slot_indices=range(1, n_total_slots, 2),
        y_min=y_min,
    )

    # Pin holes — drilled through every knuckle on each axis.
    pin_hole_b = _pin_cyl(pin2_x, case_y_center, knuckle_z_center,
                          pin_r + clearance, hinge_total_y + 2)
    pin_hole_a = _pin_cyl(pin1_x, case_y_center, knuckle_z_center,
                          pin_r + clearance, hinge_total_y + 2)

    # Print-in-place pins.
    pin_b = _pin_cyl(pin2_x, case_y_center, knuckle_z_center,
                     pin_r, hinge_total_y - 2 * clearance)
    pin_a = _pin_cyl(pin1_x, case_y_center, knuckle_z_center,
                     pin_r, hinge_total_y - 2 * clearance)

    # Fuse each piece with its own knuckles+tabs, then drill out the pin holes.
    case_b_full = placed_b + extension_b + case_b_hinge
    case_a_full = placed_a + extension_a + case_a_hinge
    center_full = center_strip + center_right_hinge + center_left_hinge

    case_b_full = case_b_full - pin_hole_b
    case_a_full = case_a_full - pin_hole_a
    center_full = center_full - pin_hole_a - pin_hole_b

    if cfg.get("folding_case_output_folded"):
        # Clamshell fold: rotate (center + caseB + pin_b) -90° around pin1's
        # Y-axis so the center strip stands vertical with pin2 above pin1;
        # then rotate (caseB + pin_b) another -90° around pin2's new
        # location so caseB lies inverted above caseA. Each rotation is
        # exactly the motion the printed hinge would perform, so the
        # interlocked knuckles stay aligned around their pins.
        pin1_axis = Axis(origin=(pin1_x, 0, knuckle_z_center), direction=(0, 1, 0))
        case_b_full = case_b_full.rotate(pin1_axis, -90)
        center_full = center_full.rotate(pin1_axis, -90)
        pin_b = pin_b.rotate(pin1_axis, -90)

        pin2_new_origin = (pin1_x, 0, knuckle_z_center + (pin2_x - pin1_x))
        pin2_axis_folded = Axis(origin=pin2_new_origin, direction=(0, 1, 0))
        case_b_full = case_b_full.rotate(pin2_axis_folded, -90)
        pin_b = pin_b.rotate(pin2_axis_folded, -90)

    return Compound([
        *case_a_full.solids(),
        *case_b_full.solids(),
        *center_full.solids(),
        pin_a,
        pin_b,
    ])


def _build_inner_edge_extension(placed_face, hinge_outer_x, extension_dist=None):
    """Build the case-base extension face on the inner side.

    The extension is a closed face bounded by:
      - Outer (away from case): vertical line at x = hinge_outer_x
      - Top: horizontal line from the hinge line to the case's top corner
      - Inner: the case's actual outer-wire contour from top corner to
        bottom corner (the "inner edge" of the case — the portion closest
        to the centerline)
      - Bottom: horizontal line from the case's bottom corner back to the
        hinge line

    The top and bottom horizontal lines are perpendicular to the vertical
    hinge line, giving a clean 90° transition at the case corners.

    `extension_dist` is currently unused but kept in the signature for
    future expansion (e.g. fillet radius).
    """
    from build123d import BuildLine, Polyline, make_face

    wire = placed_face.wire()
    n = 1500
    pts = [(wire @ (i / n)) for i in range(n + 1)]
    xs = [p.X for p in pts]
    ys = [p.Y for p in pts]

    # Find the case's top and bottom corners — the global y_max and y_min
    # points on the wire. These split the outer wire into two segments:
    # the inner-edge (closest to centerline) and the outer-edge (far side).
    i_ymax = max(range(len(pts)), key=lambda i: ys[i])
    i_ymin = min(range(len(pts)), key=lambda i: ys[i])

    lo, hi = sorted([i_ymin, i_ymax])
    seg_a_x = xs[lo:hi + 1]
    seg_a_y = ys[lo:hi + 1]
    seg_b_x = xs[hi:] + xs[:lo + 1]
    seg_b_y = ys[hi:] + ys[:lo + 1]

    # Inner edge = segment with smaller mean X (closer to centerline at x=0).
    if sum(seg_a_x) / len(seg_a_x) < sum(seg_b_x) / len(seg_b_x):
        inner_x, inner_y = seg_a_x, seg_a_y
    else:
        inner_x, inner_y = seg_b_x, seg_b_y

    # Order inner edge top-to-bottom (start at y_max, end at y_min).
    if inner_y[0] < inner_y[-1]:
        inner_x = list(reversed(inner_x))
        inner_y = list(reversed(inner_y))

    top_corner = (inner_x[0], inner_y[0])
    bot_corner = (inner_x[-1], inner_y[-1])

    # Build polygon: hinge-line top → case top corner → inner edge curve →
    # case bottom corner → hinge-line bottom → close.
    poly_pts = [(hinge_outer_x, top_corner[1])]
    poly_pts.extend(zip(inner_x, inner_y))
    poly_pts.append((hinge_outer_x, bot_corner[1]))

    with BuildLine() as bl:
        Polyline(*poly_pts, close=True)
    return make_face(bl.line)


def _build_knuckles_at(pin_x, y_center, z_center, n_slots, knuckle_r,
                       finger_len, clearance, slot_indices, y_min):
    """Build a fused set of knuckles at the given pin axis, taking only
    the Y slots specified by slot_indices."""
    knuckles = []
    for i in slot_indices:
        y_start = y_min + i * (finger_len + clearance)
        y_c = y_start + finger_len / 2
        k = (
            Cylinder(
                radius=knuckle_r,
                height=finger_len,
                align=(Align.CENTER, Align.CENTER, Align.CENTER),
            )
            .rotate(Axis.X, 90)
            .moved(Loc((pin_x, y_c, z_center)))
        )
        knuckles.append(k)
    return _fuse(knuckles)


def _pin_cyl(pin_x, y_center, z_center, radius, length):
    return (
        Cylinder(
            radius=radius,
            height=length,
            align=(Align.CENTER, Align.CENTER, Align.CENTER),
        )
        .rotate(Axis.X, 90)
        .moved(Loc((pin_x, y_center, z_center)))
    )


def _fuse(parts):
    out = parts[0]
    for p in parts[1:]:
        out = out + p
    return out
