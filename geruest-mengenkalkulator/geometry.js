"use strict";

// Pure 2D geometry helpers shared by the 2D plan (SVG) and the 3D view.
// Coordinate convention: x right, y "up" (standard math orientation).
// Angles in turtlePolygon are in degrees; positive = clockwise turn as seen
// from above, matching how a surveyor would walk the building perimeter.

const Geometry = (() => {
  const DEG = Math.PI / 180;

  function turtlePolygon(edges, closed) {
    let heading = 0;
    let x = 0;
    let y = 0;
    const vertices = [{ x, y }];
    for (let i = 0; i < edges.length; i += 1) {
      const len = edges[i].length;
      x += len * Math.cos(heading);
      y += len * Math.sin(heading);
      vertices.push({ x, y });
      const turn = (edges[i].angle ?? 90) * DEG;
      heading -= turn;
    }
    let closingError = null;
    if (closed && vertices.length > 1) {
      const first = vertices[0];
      const last = vertices[vertices.length - 1];
      closingError = Math.hypot(last.x - first.x, last.y - first.y);
    }
    const ring = closed ? vertices.slice(0, -1) : vertices;
    return { vertices, ring, closingError };
  }

  function shoelaceArea(ring) {
    let sum = 0;
    const n = ring.length;
    for (let i = 0; i < n; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      sum += a.x * b.y - b.x * a.y;
    }
    return sum / 2;
  }

  function lineIntersect(p1, d1, p2, d2) {
    const denom = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(denom) < 1e-9) return null;
    const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / denom;
    return { x: p1.x + d1.x * t, y: p1.y + d1.y * t };
  }

  // Offsets each edge outward by its own distance and re-intersects
  // neighbouring offset lines to find the new vertices. Distances[i]
  // applies to the edge from ring[i] to ring[(i+1)%n].
  function offsetPolygonEdges(ring, closed, distances) {
    const n = ring.length;
    if (n < 2) return ring.slice();
    const edgeCount = closed ? n : n - 1;
    const ccw = shoelaceArea(closed ? ring : ring) > 0;

    const edgeLines = [];
    for (let i = 0; i < edgeCount; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const dir = { x: dx / len, y: dy / len };
      const normal = ccw ? { x: dir.y, y: -dir.x } : { x: -dir.y, y: dir.x };
      const dist = distances[i] ?? 0;
      edgeLines.push({
        dir,
        dist,
        pOffsetA: { x: a.x + normal.x * dist, y: a.y + normal.y * dist },
        pOffsetB: { x: b.x + normal.x * dist, y: b.y + normal.y * dist },
      });
    }

    function safeIntersect(prev, curr, fallbackA, fallbackB) {
      const pt = lineIntersect(prev.pOffsetA, prev.dir, curr.pOffsetA, curr.dir);
      const fallback = { x: (fallbackA.x + fallbackB.x) / 2, y: (fallbackA.y + fallbackB.y) / 2 };
      if (!pt) return fallback;
      const maxDist = 10 * Math.max(prev.dist, curr.dist, 0.1);
      const d = Math.hypot(pt.x - fallbackA.x, pt.y - fallbackA.y);
      return d > maxDist ? fallback : pt;
    }

    const outVerts = [];
    for (let i = 0; i < n; i += 1) {
      if (closed) {
        const prev = edgeLines[(i - 1 + edgeCount) % edgeCount];
        const curr = edgeLines[i % edgeCount];
        outVerts.push(safeIntersect(prev, curr, prev.pOffsetB, curr.pOffsetA));
      } else if (i === 0) {
        outVerts.push(edgeLines[0].pOffsetA);
      } else if (i === n - 1) {
        outVerts.push(edgeLines[edgeCount - 1].pOffsetB);
      } else {
        const prev = edgeLines[i - 1];
        const curr = edgeLines[i];
        outVerts.push(safeIntersect(prev, curr, prev.pOffsetB, curr.pOffsetA));
      }
    }
    return outVerts;
  }

  // Per-edge direction/outward-normal frames, aligned by index with the
  // section order used to build the ring (edge i = ring[i] -> ring[i+1]).
  function edgeFrames(ring, closed) {
    const n = ring.length;
    const edgeCount = closed ? n : n - 1;
    const ccw = shoelaceArea(ring) > 0;
    const frames = [];
    for (let i = 0; i < edgeCount; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const dir = { x: dx / len, y: dy / len };
      const normal = ccw ? { x: dir.y, y: -dir.x } : { x: -dir.y, y: dir.x };
      frames.push({ a, b, dir, normal, length: len });
    }
    return frames;
  }

  function bounds(pointSets) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const points of pointSets) {
      for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }
    if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    return { minX, minY, maxX, maxY };
  }

  return { turtlePolygon, shoelaceArea, lineIntersect, offsetPolygonEdges, edgeFrames, bounds };
})();
