"""Unibody tray generation.

Builds an additional clip-in tray that holds two snakeskin cases at a
configured separation, splay, and pinky offset. The two cases themselves
are produced unchanged by `generate_pcb_case` — the tray is a separate
print that the cases drop into and are held by magnets.

v1 scope: tray mode only. case mode (one-piece unibody around two PCBs)
is preview-only in the configurator and not yet generated here.
"""

import math

from build123d import (
    Axis,
    BuildLine,
    Ellipse,
    Location,
    Plane,
    Polyline,
    PositionMode,
    add,
    extrude,
    make_face,
    mirror,
    offset,
)


Loc = Location


def generate_unibody_tray(base_face, cfg):
    """Build the unibody tray for the given (single-half) PCB outline.

    Parameters
    ----------
    base_face : Face
        Centered PCB outline as produced by `import_svg_as_face`. Treated as
        one half — the tray is built by placing this and its X-mirror at
        ±separation/2 with ±splay rotation.
    cfg : dict
        Merged config (default_params + user overrides).

    Returns
    -------
    Part
        A solid tray ready to be exported via `_export`.
    """
    if cfg.get("unibody_mode") != "tray":
        raise ValueError("generate_unibody_tray called with unibody_mode != 'tray'")

    splay = cfg["unibody_splay_angle"]
    sep = cfg["unibody_separation"]
    pinky = cfg["unibody_pinky_offset"]
    tray_tol = cfg["unibody_tray_tolerance_xy"]
    tray_wall = cfg["unibody_tray_wall_xy"]
    is_right = cfg["unibody_outline_is_right_half"]

    # Total tray Z height = base + space under PCB + wall above PCB. The tray
    # is essentially "carrycase-like" in profile: a deep box that holds each
    # case from underneath and around the sides.
    case_wall_height = cfg["z_space_under_pcb"] + cfg["wall_z_height"]
    tray_inner_z = case_wall_height + cfg["base_z_thickness"]
    tray_outer_z = tray_inner_z + cfg["base_z_thickness"]

    # Per-case outer face: PCB outline grown by case wall thickness. This is
    # what the case looks like in plan view.
    case_outer = offset(base_face, cfg["wall_xy_thickness"])

    # Half-width of the case bounding box (used to compute side translation).
    bb = case_outer.bounding_box()
    half_w = (bb.max.X - bb.min.X) / 2

    # Place each half. Presets are usually LEFT halves so the raw outline goes
    # on the left and the X-mirror on the right; flip with the toggle.
    raw_face = case_outer
    mirrored_face = mirror(case_outer, about=Plane.YZ)

    if is_right:
        right_face = raw_face
        left_face = mirrored_face
    else:
        left_face = raw_face
        right_face = mirrored_face

    dx = sep / 2 + half_w

    # Apply splay (rotate around the half's own centroid) then translate. Use
    # the bbox center as the rotation pivot, matching how the configurator
    # treats it.
    def place(face, side_sign):
        centroid_loc = Loc(face.center())
        # Rotate around Z by ±splay around the face centroid, then translate
        # outward by ±dx and apply pinky offset.
        rot = Loc((0, 0, 0), (0, 0, 1), side_sign * splay)
        # Rotate-around-centroid: T(c) * R * T(-c)
        rotate_about_centroid = centroid_loc * rot * centroid_loc.inverse()
        translate = Loc((side_sign * dx, side_sign * (pinky / 2), 0))
        return translate * rotate_about_centroid * face

    left_placed = place(left_face, -1)
    right_placed = place(right_face, +1)

    # Tray inner footprint = each case footprint grown by tray tolerance.
    # Two faces — one well per case, with solid plastic between them.
    left_inner = offset(left_placed, tray_tol)
    right_inner = offset(right_placed, tray_tol)

    # Tray outer footprint = a SINGLE connected face that encloses both
    # halves. We build it as the convex hull of the two halves' outer
    # footprints (case + tray_tolerance + tray_wall_xy). At reasonable splay
    # angles this is the right shape — a single peanut/pebble-like outline.
    # We sample each face's outer perimeter, collect the points, hull them,
    # and build a face from the hull polyline.
    left_outer = offset(left_placed, tray_tol + tray_wall)
    right_outer = offset(right_placed, tray_tol + tray_wall)
    hull_pts = _convex_hull(_sample_face_perimeter(left_outer)
                            + _sample_face_perimeter(right_outer))
    outer_footprint = _face_from_hull(hull_pts)

    # Build the tray as: outer extrusion minus per-half pockets.
    eps = 0.01
    outer_solid = extrude(outer_footprint, tray_outer_z)
    base_lift = Loc((0, 0, cfg["base_z_thickness"]))
    left_pocket = extrude(left_inner.moved(base_lift), tray_inner_z + eps)
    right_pocket = extrude(right_inner.moved(base_lift), tray_inner_z + eps)
    tray = outer_solid - left_pocket - right_pocket

    # Magnet cutouts. We build them ourselves rather than delegating to
    # `_magnet_cutout`, because that function symmetrically extrudes
    # ±(wall_xy_thickness + carrycase_tolerance + magnet_height) which is
    # too long for the tray geometry — magnets near corners/curves end up
    # piercing all the way through the tray wall and into the pocket.
    if cfg.get("carrycase"):
        for sign, placed in ((-1, left_placed), (+1, right_placed)):
            applied_rot = sign * splay
            angle = cfg["magnet_position"] + applied_rot
            try:
                tray -= _tray_magnet_cutouts(placed, angle, cfg)
            except Exception as exc:  # noqa: BLE001
                print(f"Warning: tray magnet cutouts failed: {exc}")

    return tray


# --- helpers ---


def _tray_magnet_cutouts(placed_face, angle_deg, cfg):
    """Build magnet pockets in the tray wall, one per magnet.

    Each pocket is an ellipsoidal hole centered at the matching tray-magnet
    position (just outside the case wall, inside the tray wall). Extrusion is
    short — only deep enough to seat the magnet plus a tolerance — so it
    can't pierce the tray's outer wall on curved sections of the outline.
    """
    # Magnet dimensions match generate_pcb_case.py constants.
    magnet_height = 2
    magnet_radius = 4 / 2
    misc_tol = 0.2
    magnet_radius_y = magnet_radius + 0.3

    wall_xy = cfg["wall_xy_thickness"]
    tray_tol = cfg["unibody_tray_tolerance_xy"]
    # The magnet pocket sits on the INNER wall of the tray pocket, opening
    # toward the case. Its inner face is at `wall_xy + tray_tol` outward from
    # the PCB outline (= inner surface of the tray pocket wall). The pocket
    # extrudes outward into the plastic from there. Same idea as the existing
    # carrycase magnets: blind pockets, magnets inserted from inside the
    # cavity, magnetic force passes through magnet_separation_distance of
    # plastic to the case magnet.
    inner_wall_offset = wall_xy + tray_tol
    pocket_depth = magnet_height + 0.2  # depth into the wall

    # Build the elliptical hole and extrude OUTWARD only (one-sided).
    hole = (
        Plane.XZ
        * Ellipse(
            x_radius=magnet_radius + misc_tol / 2,
            y_radius=magnet_radius_y,
        ).face()
    )
    # Extrude in +Y of the hole's local frame; the rotate-and-translate below
    # aligns +Y with the outward normal of the wire at each magnet position.
    # Add a tiny -Y bite so the boolean cleanly punches through the inner wall.
    template = extrude(hole, pocket_depth) + extrude(hole, -0.05)

    # Walk the placed face's outer wire and place a cutout at each magnet.
    inner_wire = placed_face.wire()
    # Use the face's bbox centre as the angle origin (matches snakeskin's
    # _wire_location_at_angle convention).
    origin = placed_face.center()
    location, _, center_percent = _wire_location_at_angle(
        inner_wire, angle_deg, origin
    )
    center_at_mm = center_percent * inner_wire.length
    span = (cfg["magnet_count"] - 1) * cfg["magnet_spacing"]
    start = center_at_mm - span / 2

    cutouts = []
    for i in range(cfg["magnet_count"]):
        position = start + i * cfg["magnet_spacing"]
        # Normalise position into [0, length).
        if position < 0:
            position += inner_wire.length
        if position >= inner_wire.length:
            position -= inner_wire.length
        loc = inner_wire.location_at(position, position_mode=PositionMode.LENGTH)
        rotation = inner_wire.tangent_angle_at(
            position, position_mode=PositionMode.LENGTH
        )
        cut = template.rotate(Axis.Z, rotation)
        # Place the pocket so its INNER face sits on the inner pocket wall:
        # start at the PCB outline, push outward by inner_wall_offset along
        # the wall's outward normal.
        outward = _outward_normal_at_wire(inner_wire, position, origin)
        target = loc.position + outward * inner_wall_offset
        cut.position = (target.X, target.Y, target.Z)
        # Lift to magnet centre Z (matches _magnet_cutout: sits at
        # base_z_thickness + magnet_radius_y).
        cut.position += (0, 0, magnet_radius_y + cfg["base_z_thickness"] + 0.01)
        cutouts.append(cut)
    return cutouts


def _outward_normal_at_wire(wire, position, origin):
    """Return the unit outward normal at a wire arc-length position.

    "Outward" means away from `origin`. We use the tangent rotated -90° (CCW
    wires) and check the dot product with (point - origin); if it's negative,
    flip.
    """
    loc = wire.location_at(position, position_mode=PositionMode.LENGTH)
    angle_rad = math.radians(wire.tangent_angle_at(position, position_mode=PositionMode.LENGTH))
    tx, ty = math.cos(angle_rad), math.sin(angle_rad)
    # Right-hand normal of the tangent
    nx, ny = ty, -tx
    # Vector from origin to point
    px = loc.position.X - origin.X
    py = loc.position.Y - origin.Y
    # If the right-hand normal points inward, flip to outward.
    if nx * px + ny * py < 0:
        nx, ny = -nx, -ny
    from build123d import Vector
    return Vector(nx, ny, 0)


def _wire_location_at_angle(wire, angle_deg, origin):
    # Lazy import — generate_pcb_case imports this module at the bottom of
    # generate_cases(), so by the time any tray code runs, generate_pcb_case
    # is fully loaded.
    try:
        from generate_pcb_case import _wire_location_at_angle as _impl
    except ImportError:
        from .generate_pcb_case import _wire_location_at_angle as _impl
    return _impl(wire, angle_deg, origin=origin)


def _sample_face_perimeter(face, samples_per_edge=24):
    """Return a list of (x, y) tuples sampled along the face's outer wire."""
    pts = []
    wire = face.wire()
    for edge in wire.edges():
        n = max(2, samples_per_edge)
        for i in range(n):
            t = i / n  # don't include t=1 to avoid duplicates at edge joins
            v = edge @ t
            pts.append((v.X, v.Y))
    return pts


def _convex_hull(points):
    """Andrew's monotone-chain convex hull. Returns CCW-ordered (x, y) points."""
    pts = sorted(set(points))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper = []
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def _face_from_hull(hull_pts):
    """Build a planar Face from a closed CCW hull polyline."""
    with BuildLine() as bd:
        Polyline(*hull_pts, close=True)
    return make_face(bd.line)
