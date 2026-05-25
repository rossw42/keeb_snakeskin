// SVG-canvas rendering. Draws outline, wall offset, cutout arcs, magnets, lip arc,
// and draggable handles for each angle parameter.

import {
  bbox, cumulativeLengths, pointAtAngle, arcPolyline,
  pointsToPathD, offsetPolyline, signedArea, pointAtLengthAlong, angleOf,
} from "./geometry.js";

const NS = "http://www.w3.org/2000/svg";

export class CanvasRenderer {
  constructor(svgEl, viewEl) {
    this.svg = svgEl;
    this.view = viewEl;
    this.outlineEl = svgEl.querySelector("#outline");
    this.outlineOffsetEl = svgEl.querySelector("#outline-offset");
    this.unibodyLayer = svgEl.querySelector("#unibody-layer");
    this.cutoutLayer = svgEl.querySelector("#cutout-layer");
    this.magnetLayer = svgEl.querySelector("#magnet-layer");
    this.lipLayer = svgEl.querySelector("#lip-arc-layer");
    this.handleLayer = svgEl.querySelector("#handle-layer");
    this.centroidEl = svgEl.querySelector("#centroid");
    this.xAxisEl = svgEl.querySelector("#x-axis");
    this.yAxisEl = svgEl.querySelector("#y-axis");

    this.outline = null;        // [[x,y]...] (centered, Y-up)
    this.cum = null;            // cumulative arc lengths
    this.bbox = null;
    this.windingCCW = true;     // signed area > 0 in math coords (Y-up)
  }

  setOutline(points) {
    // Normalize winding to CCW so offsetPolyline always offsets outward.
    // Some SVG sources (after Y-flip) come out clockwise; without this the
    // wall offset would shrink the outline instead of growing it.
    if (signedArea(points) < 0) points = points.slice().reverse();
    this.outline = points;
    this.bbox = bbox(points);
    this.cum = cumulativeLengths(points);
    this.windingCCW = true;

    // viewBox in CAD coords (Y-up). Pad ~12% so handles outside the outline have room.
    const bb = this.bbox;
    const w = bb.maxX - bb.minX, h = bb.maxY - bb.minY;
    const padX = w * 0.15, padY = h * 0.15;
    const vbX = bb.minX - padX;
    const vbY = bb.minY - padY;
    const vbW = w + 2 * padX;
    const vbH = h + 2 * padY;
    this.svg.setAttribute("viewBox", `${vbX} ${vbY} ${vbW} ${vbH}`);
    // Flip Y so +Y points up visually.
    this.view.setAttribute("transform", `scale(1 -1)`);

    this.outlineEl.setAttribute("d", pointsToPathD(points));

    // Centroid + axes
    this.centroidEl.setAttribute("cx", 0);
    this.centroidEl.setAttribute("cy", 0);
    const axL = Math.max(w, h) * 0.6;
    this.xAxisEl.setAttribute("x1", -axL); this.xAxisEl.setAttribute("y1", 0);
    this.xAxisEl.setAttribute("x2", axL); this.xAxisEl.setAttribute("y2", 0);
    this.yAxisEl.setAttribute("x1", 0); this.yAxisEl.setAttribute("y1", -axL);
    this.yAxisEl.setAttribute("x2", 0); this.yAxisEl.setAttribute("y2", axL);
  }

  // Convert pointer event coords -> CAD (Y-up, centered) coords.
  clientToOutline(evt) {
    const pt = this.svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    // The view group is a child of the root <svg>; compose its CTM with the svg's screen CTM.
    const ctm = this.view.getScreenCTM();
    if (!ctm) return null;
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }

  // Update overlays from current state.
  render(state) {
    if (!this.outline) return;
    this._renderOffset(state);
    this._renderCutouts(state);
    this._renderMagnets(state);
    this._renderLip(state);
    this._renderUnibody(state);
    this._updateViewBox(state);
  }

  _updateViewBox(state) {
    const bb = this.bbox;
    if (!bb) return;
    let w = bb.maxX - bb.minX, h = bb.maxY - bb.minY;
    let cx = (bb.minX + bb.maxX) / 2, cy = (bb.minY + bb.maxY) / 2;
    if (state.unibody_mode && state.unibody_mode !== "off") {
      const splay = (state.unibody_splay_angle || 0) * Math.PI / 180;
      const halfW = w / 2;
      const halfWidthAfterSplay = halfW * Math.abs(Math.cos(splay)) + (h / 2) * Math.abs(Math.sin(splay));
      const halfHeightAfterSplay = halfW * Math.abs(Math.sin(splay)) + (h / 2) * Math.abs(Math.cos(splay));
      const sep = state.unibody_separation || 0;
      const offset = sep / 2 + halfWidthAfterSplay;
      w = 2 * (offset + halfWidthAfterSplay);
      h = Math.max(h, 2 * halfHeightAfterSplay) + Math.abs(state.unibody_pinky_offset || 0);
      cx = 0; cy = 0;
    }
    const padX = w * 0.15, padY = h * 0.15;
    this.svg.setAttribute("viewBox", `${cx - w / 2 - padX} ${cy - h / 2 - padY} ${w + 2 * padX} ${h + 2 * padY}`);
  }

  _renderUnibody(state) {
    this.unibodyLayer.innerHTML = "";
    this.unibodyCollision = false;
    this.unibodyTrayDips = false;
    this.unibodyLayer.classList.remove("colliding", "tray-dipping");

    const mode = state.unibody_mode || "off";
    if (mode === "off") {
      // Restore the regular single-outline view.
      for (const e of [this.outlineEl, this.outlineOffsetEl, this.handleLayer,
                       this.cutoutLayer, this.magnetLayer, this.lipLayer, this.centroidEl]) {
        e.style.display = "";
      }
      return;
    }

    const splay = state.unibody_splay_angle || 0;
    const sep = state.unibody_separation || 0;
    const pinky = state.unibody_pinky_offset || 0;
    const halfW = (this.bbox.maxX - this.bbox.minX) / 2;
    const dxRight = sep / 2 + halfW;

    // Most preset PCB outlines are LEFT halves (USB on the right of the
    // outline = inner side for a left half), so by default we put the raw
    // outline on the LEFT and the X-mirror on the RIGHT. Toggle the flag
    // for right-half outlines (corne, sofle, etc.).
    const mirrored = this.outline.map(([x, y]) => [-x, y]).reverse(); // reverse keeps CCW winding after mirror
    const isRight = !!state.unibody_outline_is_right_half;
    const left = isRight
      ? transformOutline(mirrored, -splay, -dxRight, -pinky / 2)
      : transformOutline(this.outline, -splay, -dxRight, -pinky / 2);
    const right = isRight
      ? transformOutline(this.outline, +splay, dxRight, +pinky / 2)
      : transformOutline(mirrored, +splay, dxRight, +pinky / 2);

    // Hide single-case overlays. In CASE mode we redraw them on each half;
    // in TRAY mode they don't apply to the assembly.
    for (const e of [this.outlineEl, this.outlineOffsetEl, this.handleLayer,
                     this.cutoutLayer, this.magnetLayer, this.lipLayer, this.centroidEl]) {
      e.style.display = "none";
    }

    // PCB outlines (always shown).
    drawPath(this.unibodyLayer, right, "unibody-half");
    drawPath(this.unibodyLayer, left, "unibody-half");

    if (mode === "tray") {
      this._renderUnibodyTray(state, right, left);
    } else if (mode === "case") {
      this._renderUnibodyCase(state, right, left, splay, dxRight, pinky);
    }

    // Centerline guide.
    const allY = [...right, ...left].map((p) => p[1]);
    const yMin = Math.min(...allY) - 5;
    const yMax = Math.max(...allY) + 5;
    const line = document.createElementNS(NS, "line");
    line.setAttribute("x1", 0); line.setAttribute("y1", yMin);
    line.setAttribute("x2", 0); line.setAttribute("y2", yMax);
    line.setAttribute("class", "unibody-centerline");
    this.unibodyLayer.appendChild(line);
  }

  _renderUnibodyTray(state, right, left) {
    const caseWallDist = (state.wall_xy_thickness || 0) + (state.wall_xy_top_tolerance || 0);
    const trayInnerOffset = caseWallDist + (state.unibody_tray_tolerance_xy || 0);
    const trayOuterOffset = trayInnerOffset + (state.unibody_tray_wall_xy || 0);

    const rightWall = caseWallDist ? offsetPolyline(right, caseWallDist) : right;
    const leftWall = caseWallDist ? offsetPolyline(left, caseWallDist) : left;
    drawPath(this.unibodyLayer, rightWall, "unibody-half-offset");
    drawPath(this.unibodyLayer, leftWall, "unibody-half-offset");

    // Case-vs-case collision (both halves with their case walls).
    const subR = subsample(rightWall, 80);
    const subL = subsample(leftWall, 80);
    if (polygonsIntersect(subR, subL)) {
      this.unibodyCollision = true;
      this.unibodyLayer.classList.add("colliding");
    }

    // Convex-hull tray. v1 approximation: real tray union dips in at the
    // centerline for high splay/large separation. We detect that and warn.
    const innerHull = convexHull([
      ...offsetPolyline(right, trayInnerOffset),
      ...offsetPolyline(left, trayInnerOffset),
    ]);
    const outerHull = convexHull([
      ...offsetPolyline(right, trayOuterOffset),
      ...offsetPolyline(left, trayOuterOffset),
    ]);
    drawPath(this.unibodyLayer, outerHull, "unibody-tray-outer");
    drawPath(this.unibodyLayer, innerHull, "unibody-tray-inner");

    // Magnets: each case has its own magnets at state.magnet_position. The
    // tray needs matching magnets on its inner wall, opposite each case magnet.
    // Same params as the regular case+carrycase setup — just rendered against
    // the unibody geometry.
    const splay = state.unibody_splay_angle || 0;
    const sep = state.unibody_separation || 0;
    const pinky = state.unibody_pinky_offset || 0;
    const halfW = (this.bbox.maxX - this.bbox.minX) / 2;
    const dxRight = sep / 2 + halfW;
    const mirroredOutline = this.outline.map(([x, y]) => [-x, y]).reverse();
    const isRight = !!state.unibody_outline_is_right_half;

    const leftSrc = isRight ? mirroredOutline : this.outline;
    const rightSrc = isRight ? this.outline : mirroredOutline;
    const caseMagnetsL = this._caseMagnetPositions(state, leftSrc, -splay, -dxRight, -pinky / 2);
    const caseMagnetsR = this._caseMagnetPositions(state, rightSrc, +splay, +dxRight, +pinky / 2);

    // Draw case magnets (purple, like in single-case mode).
    for (const m of [...caseMagnetsR, ...caseMagnetsL]) {
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", m.x); c.setAttribute("cy", m.y);
      c.setAttribute("r", 1.2);
      c.setAttribute("class", "magnet-dot");
      this.unibodyLayer.appendChild(c);
    }

    // Tray magnets sit directly opposite each case magnet, separated only by
    // (case wall) + (tray tolerance) + (tray wall to magnet centre). In the
    // existing case+carrycase setup the magnet pair is co-located in plan
    // view (same X,Y, just radially separated by ~1mm of plastic), so visually
    // the tray magnet should appear just outside the case wall. Use:
    //   wall_xy_thickness + tray_tolerance + magnet_separation_distance
    // — that puts the tray magnet centre at the tray inner wall surface +
    // a small slip into the tray plastic. Looks right for plan-view preview.
    const wall = state.wall_xy_thickness || 0;
    const trayTol = state.unibody_tray_tolerance_xy || 0;
    const sepDist = state.magnet_separation_distance || 0;
    const magnetGap = wall + trayTol + sepDist;
    for (const m of [...caseMagnetsR, ...caseMagnetsL]) {
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", m.x + m.nx * magnetGap);
      c.setAttribute("cy", m.y + m.ny * magnetGap);
      c.setAttribute("r", 1.2);
      c.setAttribute("class", "tray-magnet-dot");
      this.unibodyLayer.appendChild(c);
    }

    // Tray-dip detection: does the *true* tray inner boundary (≈ Minkowski
    // sum of each half + tolerance) dip into either case body? Convex hull
    // over-estimates the tray; if the hull encroaches on a case, the real
    // tray would too. Sample each case wall and ask whether any of its points
    // fall outside the inner hull. Conservative heuristic.
    const dipsR = !pointsAllInside(subR, innerHull);
    const dipsL = !pointsAllInside(subL, innerHull);
    if (dipsR || dipsL) {
      this.unibodyTrayDips = true;
      this.unibodyLayer.classList.add("tray-dipping");
    }
  }

  // Returns case magnets in world coords with their outward normals at the
  // case wall. Mirrors the math in _renderMagnets but transformed for a half.
  _caseMagnetPositions(state, halfPoints, angleDeg, tx, ty) {
    if (!state.carrycase) return [];
    const cum = cumulativeLengths(halfPoints);
    const center = pointAtAngle(halfPoints, cum, state.magnet_position || 0);
    if (!center) return [];
    const count = Math.max(1, Math.floor(state.magnet_count || 1));
    const spacing = state.magnet_spacing || 0;
    const total = cum[cum.length - 1];
    const startL = center.lengthAlong - ((count - 1) * spacing) / 2;
    const out = [];
    const eps = 0.5;
    for (let i = 0; i < count; i++) {
      const L = startL + i * spacing;
      if (L < 0 || L > total) continue;
      const [x, y] = pointAtLengthAlong(halfPoints, cum, L);
      // Outward normal in the half's local frame (right-hand of the tangent
      // in CCW winding). Estimate via short forward difference.
      const [x2, y2] = pointAtLengthAlong(halfPoints, cum, L + eps);
      const tx2 = x2 - x, ty2 = y2 - y;
      const m = Math.hypot(tx2, ty2) || 1;
      const nLocalX = ty2 / m;
      const nLocalY = -tx2 / m;
      const [wx, wy] = transformOutline([[x, y]], angleDeg, tx, ty)[0];
      const rad = (angleDeg * Math.PI) / 180;
      const c = Math.cos(rad), s = Math.sin(rad);
      const nx = c * nLocalX - s * nLocalY;
      const ny = s * nLocalX + c * nLocalY;
      out.push({ x: wx, y: wy, nx, ny });
    }
    return out;
  }

  _renderUnibodyCase(state, right, left, splay, dxRight, pinky) {
    // One-piece unibody around bare PCBs. Per-half overlays apply.
    const wallDist = (state.wall_xy_thickness || 0) + (state.wall_xy_top_tolerance || 0);
    const rightWall = wallDist ? offsetPolyline(right, wallDist) : right;
    const leftWall = wallDist ? offsetPolyline(left, wallDist) : left;
    drawPath(this.unibodyLayer, rightWall, "unibody-half-offset");
    drawPath(this.unibodyLayer, leftWall, "unibody-half-offset");

    // PCB-vs-PCB collision (no tray gap to swallow it).
    const subR = subsample(rightWall, 80);
    const subL = subsample(leftWall, 80);
    if (polygonsIntersect(subR, subL)) {
      this.unibodyCollision = true;
      this.unibodyLayer.classList.add("colliding");
    }

    // Unibody outer wall: convex hull of both walls. Same dip caveat as tray.
    const outer = convexHull([...rightWall, ...leftWall]);
    drawPath(this.unibodyLayer, outer, "unibody-tray-outer");

    // Per-half cutouts/magnets/lip — same math as single-case overlays,
    // transformed onto each half. Side assignment depends on which half the
    // raw outline represents.
    const mirroredOutline = this.outline.map(([x, y]) => [-x, y]).reverse();
    const isRight = !!state.unibody_outline_is_right_half;
    const leftSrc = isRight ? mirroredOutline : this.outline;
    const rightSrc = isRight ? this.outline : mirroredOutline;
    this._renderHalfOverlays(state, leftSrc, -splay, -dxRight, -pinky / 2);
    this._renderHalfOverlays(state, rightSrc, +splay, +dxRight, +pinky / 2);
  }

  _renderHalfOverlays(state, halfPoints, angleDeg, tx, ty) {
    // halfPoints is the *raw* half outline before transform. We compute
    // overlays in the half's local frame using its own centroid (= origin
    // since outlines are centered), then apply the same transform.
    const cum = cumulativeLengths(halfPoints);

    const drawArcLocal = (angle, width, cls) => {
      const center = pointAtAngle(halfPoints, cum, angle);
      if (!center) return;
      const pts = arcPolyline(halfPoints, cum, center.lengthAlong, width || 0.5);
      if (pts.length < 2) return;
      const tpts = transformOutline(pts, angleDeg, tx, ty);
      const path = document.createElementNS(NS, "path");
      let d = "";
      tpts.forEach((p, i) => { d += (i ? " L " : "M ") + p[0] + " " + p[1]; });
      path.setAttribute("d", d);
      path.setAttribute("class", cls);
      this.unibodyLayer.appendChild(path);
    };

    if (state.cutout_position != null && state.cutout_width != null) {
      drawArcLocal(state.cutout_position, state.cutout_width, "cutout-arc");
    }
    for (const [a, w] of state.additional_cutouts || []) {
      drawArcLocal(a, w, "cutout-arc additional");
    }
    if (state.carrycase) {
      drawArcLocal(state.carrycase_cutout_position, state.carrycase_cutout_xy_width || 0, "cutout-arc additional");

      const magnetCenter = pointAtAngle(halfPoints, cum, state.magnet_position || 0);
      if (magnetCenter) {
        const count = Math.max(1, Math.floor(state.magnet_count || 1));
        const spacing = state.magnet_spacing || 0;
        const total = cum[cum.length - 1];
        const startL = magnetCenter.lengthAlong - ((count - 1) * spacing) / 2;
        for (let i = 0; i < count; i++) {
          const L = startL + i * spacing;
          if (L < 0 || L > total) continue;
          const [x, y] = pointAtLengthAlong(halfPoints, cum, L);
          const [tx2, ty2] = transformOutline([[x, y]], angleDeg, tx, ty)[0];
          const c = document.createElementNS(NS, "circle");
          c.setAttribute("cx", tx2); c.setAttribute("cy", ty2); c.setAttribute("r", 1.2);
          c.setAttribute("class", "magnet-dot");
          this.unibodyLayer.appendChild(c);
        }
      }

      const angles = state.lip_position_angles || [];
      if (angles.length === 2) {
        const a = pointAtAngle(halfPoints, cum, angles[0]);
        const b = pointAtAngle(halfPoints, cum, angles[1]);
        if (a && b) {
          const total = cum[cum.length - 1];
          const fwd = ((b.lengthAlong - a.lengthAlong) % total + total) % total;
          const back = total - fwd;
          const goForward = fwd <= back;
          const span = goForward ? fwd : back;
          const start = goForward ? a.lengthAlong : b.lengthAlong;
          const step = Math.max(0.4, span / 80);
          const pts = [];
          for (let L = 0; L <= span + 1e-6; L += step) {
            pts.push(pointAtLengthAlong(halfPoints, cum, start + L));
          }
          const tpts = transformOutline(pts, angleDeg, tx, ty);
          const path = document.createElementNS(NS, "path");
          let d = "";
          tpts.forEach((p, i) => { d += (i ? " L " : "M ") + p[0] + " " + p[1]; });
          path.setAttribute("d", d);
          path.setAttribute("class", "lip-arc");
          this.unibodyLayer.appendChild(path);
        }
      }
    }
  }

  _renderOffset(state) {
    const dist = (state.wall_xy_thickness || 0) + (state.wall_xy_top_tolerance || 0);
    const offset = offsetPolyline(this.outline, dist);
    this.outlineOffsetEl.setAttribute("d", pointsToPathD(offset));
  }

  _renderCutouts(state) {
    this.cutoutLayer.innerHTML = "";
    if (state.cutout_position != null && state.cutout_width != null) {
      this._drawArc(this.cutoutLayer, state.cutout_position, state.cutout_width, "cutout-arc");
    }
    const additional = state.additional_cutouts || [];
    for (const [angle, width] of additional) {
      this._drawArc(this.cutoutLayer, angle, width, "cutout-arc additional");
    }
    if (state.carrycase && state.carrycase_cutout_position != null) {
      this._drawArc(this.cutoutLayer, state.carrycase_cutout_position, state.carrycase_cutout_xy_width || 0, "cutout-arc additional");
    }
  }

  _renderMagnets(state) {
    this.magnetLayer.innerHTML = "";
    if (!state.carrycase) return;
    const center = pointAtAngle(this.outline, this.cum, state.magnet_position || 0);
    if (!center) return;
    const count = Math.max(1, Math.floor(state.magnet_count || 1));
    const spacing = state.magnet_spacing || 0;
    const total = this.cum[this.cum.length - 1];
    // Center the run on center.lengthAlong
    const startL = center.lengthAlong - ((count - 1) * spacing) / 2;
    for (let i = 0; i < count; i++) {
      const L = startL + i * spacing;
      if (L < 0 || L > total) continue;
      const [x, y] = pointAtLengthAlong(this.outline, this.cum, L);
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", x); c.setAttribute("cy", y); c.setAttribute("r", 1.2);
      c.setAttribute("class", "magnet-dot");
      this.magnetLayer.appendChild(c);
    }
  }

  _renderLip(state) {
    this.lipLayer.innerHTML = "";
    if (!state.carrycase) return;
    const angles = state.lip_position_angles || [];
    if (angles.length !== 2) return;
    const a = pointAtAngle(this.outline, this.cum, angles[0]);
    const b = pointAtAngle(this.outline, this.cum, angles[1]);
    if (!a || !b) return;
    const total = this.cum[this.cum.length - 1];
    // Walk the shorter direction from a -> b along the outline.
    const fwd = ((b.lengthAlong - a.lengthAlong) % total + total) % total;
    const back = total - fwd;
    const goForward = fwd <= back;
    const span = goForward ? fwd : back;
    const start = goForward ? a.lengthAlong : b.lengthAlong;
    const step = Math.max(0.4, span / 80);
    const pts = [];
    for (let L = 0; L <= span + 1e-6; L += step) {
      pts.push(pointAtLengthAlong(this.outline, this.cum, start + L));
    }
    const path = document.createElementNS(NS, "path");
    let d = "";
    pts.forEach((p, i) => { d += (i ? " L " : "M ") + p[0] + " " + p[1]; });
    path.setAttribute("d", d);
    path.setAttribute("class", "lip-arc");
    this.lipLayer.appendChild(path);
  }

  _drawArc(parent, angle, width, cls) {
    const center = pointAtAngle(this.outline, this.cum, angle);
    if (!center) return;
    const pts = arcPolyline(this.outline, this.cum, center.lengthAlong, width || 0.5);
    if (pts.length < 2) return;
    const path = document.createElementNS(NS, "path");
    let d = "";
    pts.forEach((p, i) => { d += (i ? " L " : "M ") + p[0] + " " + p[1]; });
    path.setAttribute("d", d);
    path.setAttribute("class", cls);
    parent.appendChild(path);
  }

  // Render the draggable handles. `handles` is an array of:
  //   { id, angle, kind: 'cutout'|'magnet'|'lip'|'additional', label }
  // `onDrag(id, newAngle)` receives live angle while dragging.
  renderHandles(handles, onDrag) {
    this.handleLayer.innerHTML = "";

    // First pass: compute outline anchor and a candidate radial offset for each
    // handle. Then iteratively push any label that overlaps with an
    // already-placed one further outward along its radial. Labels are roughly
    // (charWidth * len) x lineHeight in mm.
    const CHAR_W = 1.7, LINE_H = 3.6, BASE_OFFSET = 4, LABEL_GAP = 4;
    const placed = []; // { hx, hy, lx, ly, anchor, w, h }
    const layout = [];
    for (const h of handles) {
      const pt = pointAtAngle(this.outline, this.cum, h.angle);
      if (!pt) { layout.push(null); continue; }
      const dist = Math.hypot(pt.x, pt.y) || 1;
      const ux = pt.x / dist, uy = pt.y / dist;
      let off = BASE_OFFSET;
      const text = h.label || "";
      const w = Math.max(4, text.length * CHAR_W);
      const hgt = LINE_H;
      // Try increasing offsets until the label box clears all previously placed.
      let labelBox;
      for (let tries = 0; tries < 12; tries++) {
        const hx = pt.x + ux * off;
        const hy = pt.y + uy * off;
        const lx = pt.x + ux * (off + LABEL_GAP);
        const ly = pt.y + uy * (off + LABEL_GAP);
        const anchor = ux < -0.3 ? "end" : ux > 0.3 ? "start" : "middle";
        const x0 = anchor === "end" ? lx - w : anchor === "start" ? lx : lx - w / 2;
        const y0 = ly - hgt / 2;
        labelBox = { x0, y0, x1: x0 + w, y1: y0 + hgt, hx, hy, lx, ly, anchor, ux, uy, off, w, h: hgt };
        const collides = placed.some((p) => boxesOverlap(p, labelBox));
        if (!collides) break;
        off += 2.5;
      }
      placed.push(labelBox);
      layout.push({ pt, ...labelBox, label: text });
    }

    for (let i = 0; i < handles.length; i++) {
      const h = handles[i];
      const L = layout[i];
      if (!L) continue;
      const { pt, hx, hy, lx, ly, anchor, uy } = L;

      const g = document.createElementNS(NS, "g");
      g.setAttribute("class", `handle-group ${h.kind}`);

      // Tether line (static visual)
      const line = document.createElementNS(NS, "line");
      line.setAttribute("x1", pt.x); line.setAttribute("y1", pt.y);
      line.setAttribute("x2", hx); line.setAttribute("y2", hy);
      line.setAttribute("stroke", "currentColor");
      line.setAttribute("stroke-width", "0.25");
      line.setAttribute("opacity", "0.5");
      line.setAttribute("vector-effect", "non-scaling-stroke");
      g.appendChild(line);

      const c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", hx); c.setAttribute("cy", hy);
      c.setAttribute("r", 2);
      c.setAttribute("class", `handle ${h.kind}`);
      const title = document.createElementNS(NS, "title");
      title.textContent = `${h.label}  (${h.angle.toFixed(1)}°)`;
      c.appendChild(title);
      g.appendChild(c);

      // Persistent label, computed in the layout pass to avoid collisions.
      const tg = document.createElementNS(NS, "g");
      tg.setAttribute("transform", `translate(${lx} ${ly}) scale(1 -1) translate(${-lx} ${-ly})`);
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", lx);
      t.setAttribute("y", ly + (uy >= 0 ? 1 : -2));
      t.setAttribute("text-anchor", anchor);
      t.setAttribute("class", "handle-label");
      t.textContent = h.label || "";
      tg.appendChild(t);
      g.appendChild(tg);

      // Drag behaviour
      c.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        c.setPointerCapture(e.pointerId);
        c.classList.add("dragging");
        const move = (ev) => {
          const p = this.clientToOutline(ev);
          if (!p) return;
          const a = angleOf(p.x, p.y);
          onDrag(h.id, a, false);
        };
        const up = (ev) => {
          c.releasePointerCapture(e.pointerId);
          c.classList.remove("dragging");
          c.removeEventListener("pointermove", move);
          c.removeEventListener("pointerup", up);
          c.removeEventListener("pointercancel", up);
          const p = this.clientToOutline(ev);
          if (p) onDrag(h.id, angleOf(p.x, p.y), true);
        };
        c.addEventListener("pointermove", move);
        c.addEventListener("pointerup", up);
        c.addEventListener("pointercancel", up);
      });

      this.handleLayer.appendChild(g);
    }
  }
}

function boxesOverlap(a, b) {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

function transformOutline(points, angleDeg, tx, ty) {
  const rad = (angleDeg * Math.PI) / 180;
  const c = Math.cos(rad), s = Math.sin(rad);
  return points.map(([x, y]) => [c * x - s * y + tx, s * x + c * y + ty]);
}

function subsample(points, n) {
  if (points.length <= n) return points;
  const step = points.length / n;
  const out = [];
  for (let i = 0; i < n; i++) out.push(points[Math.floor(i * step)]);
  return out;
}

// Two simple polygons intersect if any edge crosses, or one contains the other.
function polygonsIntersect(a, b) {
  const na = a.length, nb = b.length;
  for (let i = 0; i < na; i++) {
    const a1 = a[i], a2 = a[(i + 1) % na];
    for (let j = 0; j < nb; j++) {
      const b1 = b[j], b2 = b[(j + 1) % nb];
      if (segmentsCross(a1, a2, b1, b2)) return true;
    }
  }
  if (pointInPolygon(a[0], b)) return true;
  if (pointInPolygon(b[0], a)) return true;
  return false;
}

function segmentsCross(p1, p2, p3, p4) {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < 1e-12) return false;
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  return t > 0 && t < 1 && u > 0 && u < 1;
}

function pointsAllInside(points, poly) {
  for (const p of points) if (!pointInPolygon(p, poly)) return false;
  return true;
}

function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect = ((yi > p[1]) !== (yj > p[1])) &&
      (p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Andrew's monotone-chain convex hull. Returns CCW-ordered points.
function convexHull(points) {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

function drawPath(parent, points, cls) {
  if (!points.length) return;
  const path = document.createElementNS(NS, "path");
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i++) d += ` L ${points[i][0]} ${points[i][1]}`;
  d += " Z";
  path.setAttribute("d", d);
  path.setAttribute("class", cls);
  parent.appendChild(path);
}
