// SVG parsing + polyline outline + angle/centroid math.
// Mirrors what src/import_svg.py does at import time:
//   1. Mirror Y axis (SVG Y-down -> CAD Y-up).
//   2. Center the outline on its bounding-box centroid.
//
// We do NOT attempt an exact match for build123d's _wire_location_at_angle —
// instead we cast a ray from the centroid in the requested direction and
// intersect with the outline polyline, taking the FURTHEST intersection
// (matching the Python behaviour at generate_pcb_case.py:853).

const SAMPLES_PER_BEZIER = 24;
const SAMPLES_PER_ARC = 32;

// Extract a stitched outline polyline from an SVG document.
//
// KiCad exports the edge-cuts layer as many tiny <path> fragments (lines and
// short arcs) sometimes wrapped in <g transform="translate(...)">. This
// function:
//   1. Mounts the SVG in a hidden div so getPointAtLength + getCTM apply
//      ancestor transforms correctly.
//   2. Samples every <path> as a fragment {start, end, points} in user-space.
//   3. Discards near-duplicate fragments (KiCad sometimes doubles up edges).
//   4. Stitches fragments end-to-end greedily, flipping when needed — same
//      idea as src/import_svg.py:_sort_curves.
//   5. Mirrors Y (SVG Y-down -> math Y-up) and centers on bbox centroid.
export function extractOutlineFromSvg(svgText) {
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-99999px;top:-99999px;width:1px;height:1px;overflow:hidden;";
  // innerHTML works for SVG inside an HTML host; tags are namespaced via xmlns in the source.
  host.innerHTML = svgText;
  document.body.appendChild(host);
  try {
    const svg = host.querySelector("svg");
    if (!svg) throw new Error("No <svg> root element.");
    const paths = Array.from(svg.querySelectorAll("path"));
    if (!paths.length) throw new Error("No <path> elements in SVG.");

    const rootCTM = svg.getScreenCTM();
    if (!rootCTM) throw new Error("Could not resolve SVG transform.");

    const fragments = [];
    for (const p of paths) {
      let total;
      try { total = p.getTotalLength(); } catch { continue; }
      if (!isFinite(total) || total <= 0) continue;
      const ctm = p.getScreenCTM();
      if (!ctm) continue;
      // Convert from screen pixels back to SVG user units so the result is in mm.
      const m = rootCTM.inverse().multiply(ctm);
      const n = Math.max(2, Math.min(400, Math.round(total / 0.2)));
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const pt = p.getPointAtLength((i / n) * total);
        // Apply path's CTM (from local to root user-units).
        const x = m.a * pt.x + m.c * pt.y + m.e;
        const y = m.b * pt.x + m.d * pt.y + m.f;
        pts.push([x, y]);
      }
      fragments.push({
        start: pts[0],
        end: pts[pts.length - 1],
        points: pts,
        length: total,
      });
    }
    if (!fragments.length) throw new Error("No samplable path geometry.");

    const cleaned = removeDuplicateFragments(fragments, 0.05);
    const stitched = stitch(cleaned);

    // Mirror Y so result matches snakeskin's convention, then center on bbox.
    const flipped = stitched.map(([x, y]) => [x, -y]);
    const fbb = bbox(flipped);
    const cx = (fbb.minX + fbb.maxX) / 2;
    const cy = (fbb.minY + fbb.maxY) / 2;
    const centered = flipped.map(([x, y]) => [x - cx, y - cy]);

    // De-duplicate consecutive identical points (common at fragment seams).
    const dedup = [];
    for (const p of centered) {
      if (!dedup.length) { dedup.push(p); continue; }
      const last = dedup[dedup.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-4) dedup.push(p);
    }

    return { points: dedup, bbox: bbox(dedup), fragmentCount: cleaned.length };
  } finally {
    document.body.removeChild(host);
  }
}

function removeDuplicateFragments(frags, tol) {
  const kept = [];
  for (const f of frags) {
    let isDup = false;
    for (const k of kept) {
      if (Math.abs(k.length - f.length) > tol) continue;
      const sameDir = ptClose(k.start, f.start, tol) && ptClose(k.end, f.end, tol);
      const revDir = ptClose(k.start, f.end, tol) && ptClose(k.end, f.start, tol);
      if (sameDir || revDir) { isDup = true; break; }
    }
    if (!isDup) kept.push(f);
  }
  return kept;
}

function ptClose(a, b, tol) {
  return Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol;
}

// Greedy nearest-neighbour stitch. Mirrors the spirit of import_svg.py:_sort_curves.
function stitch(fragments) {
  const remaining = fragments.slice();
  const ordered = [remaining.shift()];
  while (remaining.length) {
    const tail = ordered[ordered.length - 1].end;
    let bestIdx = -1, bestDist = Infinity, flip = false;
    for (let i = 0; i < remaining.length; i++) {
      const f = remaining[i];
      const dStart = Math.hypot(tail[0] - f.start[0], tail[1] - f.start[1]);
      const dEnd = Math.hypot(tail[0] - f.end[0], tail[1] - f.end[1]);
      if (dStart < bestDist) { bestDist = dStart; bestIdx = i; flip = false; }
      if (dEnd < bestDist) { bestDist = dEnd; bestIdx = i; flip = true; }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    if (flip) {
      next.points = next.points.slice().reverse();
      const s = next.start; next.start = next.end; next.end = s;
    }
    ordered.push(next);
  }
  // Concatenate, dropping the duplicated start point of each fragment after the first.
  const out = ordered[0].points.slice();
  for (let i = 1; i < ordered.length; i++) {
    const seg = ordered[i].points;
    out.push(...seg.slice(1));
  }
  return out;
}

export function bbox(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x; if (y < minY) minY = y;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

// Compute cumulative arc-length for each polyline vertex. Closed loop assumed:
// final segment goes back to point[0].
export function cumulativeLengths(points) {
  const cum = new Array(points.length + 1);
  cum[0] = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    cum[i + 1] = cum[i] + Math.hypot(x2 - x1, y2 - y1);
  }
  return cum; // cum[points.length] = total perimeter
}

// Find the point on the outline at the given polar angle (degrees, 0=+X, 90=+Y)
// from the bbox centroid, taking the FURTHEST intersection along the ray.
// Returns { x, y, segIndex, segT, lengthAlong } or null.
export function pointAtAngle(points, cum, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad), dy = Math.sin(rad);
  const total = cum[cum.length - 1];

  let best = null; // { dist, x, y, segIndex, segT }
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % n];
    const hit = raySegment(0, 0, dx, dy, x1, y1, x2, y2);
    if (!hit) continue;
    if (!best || hit.t > best.t) best = { ...hit, segIndex: i };
  }
  if (!best) return null;
  const segLen = cum[best.segIndex + 1] - cum[best.segIndex];
  const lengthAlong = cum[best.segIndex] + best.s * segLen;
  return {
    x: best.x, y: best.y,
    segIndex: best.segIndex, segT: best.s,
    lengthAlong, total,
  };
}

// Ray (ox,oy) + t*(dx,dy), t>=0  vs segment (x1,y1)-(x2,y2).
// Returns { t, s, x, y } where s in [0,1] along segment, t = distance along ray.
function raySegment(ox, oy, dx, dy, x1, y1, x2, y2) {
  const sx = x2 - x1, sy = y2 - y1;
  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((x1 - ox) * sy - (y1 - oy) * sx) / denom;
  const s = ((x1 - ox) * dy - (y1 - oy) * dx) / denom;
  if (t < 0 || s < 0 || s > 1) return null;
  return { t, s, x: ox + dx * t, y: oy + dy * t };
}

// Walk the outline starting at lengthAlong=L0, going +distance (signed).
// Returns the (x,y) at that arc-length offset.
export function pointAtLengthAlong(points, cum, lengthAlong) {
  const total = cum[cum.length - 1];
  let L = ((lengthAlong % total) + total) % total;
  // binary search for the segment
  let lo = 0, hi = cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= L) lo = mid; else hi = mid;
  }
  const segLen = cum[lo + 1] - cum[lo] || 1;
  const t = (L - cum[lo]) / segLen;
  const n = points.length;
  const [x1, y1] = points[lo];
  const [x2, y2] = points[(lo + 1) % n];
  return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
}

// Sample a stretch of outline as an SVG polyline string (for arc rendering).
// Centered at lengthAlong, total span = widthMm.
export function arcPolyline(points, cum, centerLength, widthMm) {
  const total = cum[cum.length - 1];
  const half = widthMm / 2;
  const start = centerLength - half;
  const end = centerLength + half;
  const step = Math.max(0.3, widthMm / 60);
  const out = [];
  for (let L = start; L <= end + 1e-6; L += step) {
    out.push(pointAtLengthAlong(points, cum, L));
  }
  return out;
}

// Convert an XY point to angle in degrees from origin. -180..180.
export function angleOf(x, y) {
  return (Math.atan2(y, x) * 180) / Math.PI;
}

// Outward-offset polyline (positive = outward). Used to render the wall offset.
// Simple per-vertex normal averaging — fine for visualization.
export function offsetPolyline(points, dist) {
  const n = points.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const cur = points[i];
    const next = points[(i + 1) % n];
    const n1 = unitNormal(prev, cur);
    const n2 = unitNormal(cur, next);
    let nx = n1[0] + n2[0], ny = n1[1] + n2[1];
    const m = Math.hypot(nx, ny) || 1;
    nx /= m; ny /= m;
    out[i] = [cur[0] + nx * dist, cur[1] + ny * dist];
  }
  return out;
}

// Outward (right-hand) normal for the segment a->b assuming counter-clockwise winding.
function unitNormal(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const m = Math.hypot(dx, dy) || 1;
  // Outward when winding is CCW: rotate -90deg => (dy, -dx)
  return [dy / m, -dx / m];
}

// Signed area to detect winding (positive = CCW in math coords, after Y-flip).
export function signedArea(points) {
  let a = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

export function pointsToPathD(points) {
  if (!points.length) return "";
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i++) d += ` L ${points[i][0]} ${points[i][1]}`;
  return d + " Z";
}
