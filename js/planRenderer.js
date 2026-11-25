/**
 * HomeBrief — Presentation 2D Floor Plan SVG Renderer
 * Clean homeowner-friendly presentation floor plan:
 *  - Solid 9" exterior walls & 4.5" interior partition walls cleanly broken at openings
 *  - Open road-facing driveways (corner pillars + gate line) & commercial shop shutters
 *  - 90° door swing arcs, triple-line exterior windows, parallel staircase treads
 *  - Soft room color fills with subtle tile/paving/lawn patterns
 *  - Proportional minimalist furniture & auto-scaled room labels
 *  - Tight SVG viewBox with zero wasted whitespace
 */
window.HomeBrief = window.HomeBrief || {};

window.HomeBrief.PlanRenderer = (function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SCALE = 12; // 1 foot = 12 SVG units

  let currentSvg = null;
  let currentWidth = 900;
  let currentHeight = 760;

  const PALETTE = {
    bg: '#FFFFFF',
    sheetBorder: '#CBD5E1',
    wallExtFill: '#334155',
    wallExtStroke: '#1E293B',
    wallIntFill: '#64748B',
    wallIntStroke: '#334155',
    text: '#0F172A',
    subText: '#475569',
    dim: '#475569',
    furniture: '#94A3B8',
    door: '#334155',
    window: '#1E293B',
    windowFill: '#FFFFFF',
    shutter: '#0284C7',
    setbackFill: '#E8F5E9',
    setbackStroke: '#64748B',
    roadFill: '#E2E8F0',
    roadCenter: '#F59E0B',
    roadText: '#334155',
    roomFills: {
      living: '#FFFBEB',
      dining: '#FEF3C7',
      foyer: '#FFFDF5',
      passage: '#F8FAFC',
      master_bed: '#F7F1E5',
      bedroom: '#FAF5EC',
      wardrobe: '#F3ECE0',
      office: '#F5F3FF',
      kitchen: '#ECFDF5',
      utility: '#E6F7EE',
      bathroom: '#EFF6FF',
      toilet: '#EFF6FF',
      porch: '#F1F5F9',
      balcony: '#F1F5F9',
      staircase: '#F8FAFC',
      shop: '#FEF3C7'
    }
  };

  function ft(v) {
    return v * SCALE;
  }

  function fmtFtIn(feet) {
    const totalInches = Math.round(Math.max(0, feet) * 12);
    const f = Math.floor(totalInches / 12);
    const i = totalInches % 12;
    return `${f}'-${i}"`;
  }

  function el(tag, attrs = {}, parent = null) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      node.setAttribute(k, String(v));
    }
    if (parent) parent.appendChild(node);
    return node;
  }

  function buildDefs(svg) {
    const defs = el('defs', {}, svg);

    // Soft lawn hatch for open setbacks
    const lawnPat = el('pattern', {
      id: 'hb-lawn-pat', width: '16', height: '16',
      patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)'
    }, defs);
    el('rect', { width: 16, height: 16, fill: PALETTE.setbackFill }, lawnPat);
    el('line', { x1: 0, y1: 0, x2: 0, y2: 16, stroke: '#86EFAC', 'stroke-width': '1', 'stroke-opacity': '0.45' }, lawnPat);

    // Subtle tile grid for Kitchen & Bathrooms
    const tilePat = el('pattern', {
      id: 'hb-tile-grid', width: '14', height: '14', patternUnits: 'userSpaceOnUse'
    }, defs);
    el('path', {
      d: 'M 14 0 L 0 0 0 14', fill: 'none', stroke: '#94A3B8', 'stroke-width': '0.45', 'stroke-opacity': '0.25'
    }, tilePat);

    // Subtle paving pattern for Porch / Parking
    const pavePat = el('pattern', {
      id: 'hb-pave-grid', width: '18', height: '18', patternUnits: 'userSpaceOnUse'
    }, defs);
    el('path', {
      d: 'M 18 0 L 0 0 0 18', fill: 'none', stroke: '#94A3B8', 'stroke-width': '0.5', 'stroke-opacity': '0.25'
    }, pavePat);
  }

  function renderPlotAndRoad(parent, layoutData, formData, plotOffset) {
    const verts = layoutData.plotVertices.map(v => ({
      x: plotOffset.x + ft(v.x),
      y: plotOffset.y + ft(v.y)
    }));

    const minX = Math.min(...verts.map(v => v.x));
    const maxX = Math.max(...verts.map(v => v.x));
    const minY = Math.min(...verts.map(v => v.y));
    const maxY = Math.max(...verts.map(v => v.y));

    const roadBand = ft(6.5);
    const drawRoadLabel = (cx, cy, label, rotated) => {
      const boxW = label.length * 7.2 + 14;
      const boxH = 16;
      const g = el('g', rotated ? { transform: `rotate(-90 ${cx} ${cy})` } : {}, parent);
      el('rect', { x: cx - boxW / 2, y: cy - boxH / 2, width: boxW, height: boxH, fill: PALETTE.roadFill, rx: 2 }, g);
      const t = el('text', {
        x: cx, y: cy, fill: PALETTE.roadText,
        'font-family': 'Inter, Arial, sans-serif', 'font-size': '10.5', 'font-weight': '600',
        'text-anchor': 'middle', 'dominant-baseline': 'middle'
      }, g);
      t.textContent = label;
    };

    const drawRoad = (side, label) => {
      if (side === 'east') {
        const rx = maxX + ft(0.5);
        el('rect', { x: rx, y: minY, width: roadBand, height: maxY - minY, fill: PALETTE.roadFill }, parent);
        el('line', { x1: rx + roadBand / 2, y1: minY, x2: rx + roadBand / 2, y2: maxY, stroke: PALETTE.roadCenter, 'stroke-width': '1.6', 'stroke-dasharray': '10,8' }, parent);
        drawRoadLabel(rx + roadBand / 2, (minY + maxY) / 2, label, true);
      } else if (side === 'west') {
        const rx = minX - ft(0.5) - roadBand;
        el('rect', { x: rx, y: minY, width: roadBand, height: maxY - minY, fill: PALETTE.roadFill }, parent);
        el('line', { x1: rx + roadBand / 2, y1: minY, x2: rx + roadBand / 2, y2: maxY, stroke: PALETTE.roadCenter, 'stroke-width': '1.6', 'stroke-dasharray': '10,8' }, parent);
        drawRoadLabel(rx + roadBand / 2, (minY + maxY) / 2, label, true);
      } else if (side === 'north') {
        const ry = minY - ft(0.5) - roadBand;
        el('rect', { x: minX, y: ry, width: maxX - minX, height: roadBand, fill: PALETTE.roadFill }, parent);
        el('line', { x1: minX, y1: ry + roadBand / 2, x2: maxX, y2: ry + roadBand / 2, stroke: PALETTE.roadCenter, 'stroke-width': '1.6', 'stroke-dasharray': '10,8' }, parent);
        drawRoadLabel((minX + maxX) / 2, ry + roadBand / 2, label, false);
      } else {
        const ry = maxY + ft(0.5);
        el('rect', { x: minX, y: ry, width: maxX - minX, height: roadBand, fill: PALETTE.roadFill }, parent);
        el('line', { x1: minX, y1: ry + roadBand / 2, x2: maxX, y2: ry + roadBand / 2, stroke: PALETTE.roadCenter, 'stroke-width': '1.6', 'stroke-dasharray': '10,8' }, parent);
        drawRoadLabel((minX + maxX) / 2, ry + roadBand / 2, label, false);
      }
    };

    const primary = layoutData.roadFacing || 'east';
    drawRoad(primary, `30'-0" WIDE ROAD (${primary.toUpperCase()})`);
    if (formData.cornerPlot) {
      const secMap = { east: 'south', west: 'south', north: 'east', south: 'east' };
      const sec = secMap[primary];
      drawRoad(sec, `20'-0" SIDE ROAD (${sec.toUpperCase()})`);
    }

    // Soft green lawn setback polygon + dashed property boundary
    const ptsAttr = verts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    el('polygon', { points: ptsAttr, fill: 'url(#hb-lawn-pat)' }, parent);
    el('polygon', {
      points: ptsAttr, fill: 'none', stroke: PALETTE.setbackStroke,
      'stroke-width': '1.8', 'stroke-dasharray': '9,5'
    }, parent);

    // Setback callouts
    const env = layoutData.buildableEnvelope;
    const ex1 = plotOffset.x + ft(env.x);
    const ey1 = plotOffset.y + ft(env.y);
    const ex2 = ex1 + ft(env.width);
    const ey2 = ey1 + ft(env.height);
    const midEnvX = (ex1 + ex2) / 2;
    const midEnvY = (ey1 + ey2) / 2;

    if (ey1 - minY >= ft(1.5)) drawSetbackTag(parent, midEnvX, minY, midEnvX, ey1, fmtFtIn((ey1 - minY) / SCALE));
    if (maxY - ey2 >= ft(1.5)) drawSetbackTag(parent, midEnvX, ey2, midEnvX, maxY, fmtFtIn((maxY - ey2) / SCALE));
    if (ex1 - minX >= ft(1.5)) drawSetbackTag(parent, minX, midEnvY, ex1, midEnvY, fmtFtIn((ex1 - minX) / SCALE));
    if (maxX - ex2 >= ft(1.5)) drawSetbackTag(parent, ex2, midEnvY, maxX, midEnvY, fmtFtIn((maxX - ex2) / SCALE));
  }

  function drawSetbackTag(parent, x1, y1, x2, y2, label) {
    el('line', { x1, y1, x2, y2, stroke: PALETTE.dim, 'stroke-width': '0.9', 'stroke-dasharray': '3,2' }, parent);
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    el('rect', { x: mx - 18, y: my - 7, width: 36, height: 14, fill: '#FFFFFF', 'fill-opacity': '0.88', rx: 2 }, parent);
    const t = el('text', {
      x: mx, y: my, fill: PALETTE.dim,
      'font-family': 'Inter, Arial, sans-serif', 'font-size': '9', 'font-weight': '600',
      'text-anchor': 'middle', 'dominant-baseline': 'middle'
    }, parent);
    t.textContent = label;
  }

  function renderRoomFills(parent, floor, plotOffset) {
    floor.rooms.forEach(r => {
      const rx = plotOffset.x + ft(r.x);
      const ry = plotOffset.y + ft(r.y);
      const rw = ft(r.width);
      const rh = ft(r.height);

      const baseFill = PALETTE.roomFills[r.type] || '#FFFFFF';
      el('rect', { x: rx, y: ry, width: rw, height: rh, fill: baseFill }, parent);

      if (r.type === 'kitchen' || r.type === 'utility' || r.type === 'bathroom' || r.type === 'toilet') {
        el('rect', { x: rx, y: ry, width: rw, height: rh, fill: 'url(#hb-tile-grid)' }, parent);
      } else if (r.type === 'porch' || r.type === 'balcony') {
        el('rect', { x: rx, y: ry, width: rw, height: rh, fill: 'url(#hb-pave-grid)' }, parent);
      }
    });
  }

  /**
   * Draw 9" exterior walls & 4.5" interior walls cleanly broken at doors, windows,
   * open driveways (porch/balcony), and commercial shop shutters.
   */
  function renderWallsAndOpenings(wallParent, doorParent, winParent, floor, layoutData, plotOffset) {
    const EPS = 0.25;
    const env = layoutData.buildableEnvelope;

    const hMap = new Map();
    const vMap = new Map();

    const addSeg = (map, coord, start, end, isExterior, edgeKind) => {
      const key = Math.round(coord * 4) / 4;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ start: Math.min(start, end), end: Math.max(start, end), isExterior, edgeKind });
    };

    floor.rooms.forEach(r => {
      const onN = Math.abs(r.y - env.y) < EPS;
      const onS = Math.abs((r.y + r.height) - (env.y + env.height)) < EPS;
      const onW = Math.abs(r.x - env.x) < EPS;
      const onE = Math.abs((r.x + r.width) - (env.x + env.width)) < EPS;

      const edgeKindFor = (dir) => {
        if (r.openEdge === dir) return 'open';
        if (r.shutterEdge === dir) return 'shutter';
        return 'solid';
      };

      addSeg(hMap, r.y, r.x, r.x + r.width, onN, edgeKindFor('north'));
      addSeg(hMap, r.y + r.height, r.x, r.x + r.width, onS, edgeKindFor('south'));
      addSeg(vMap, r.x, r.y, r.y + r.height, onW, edgeKindFor('west'));
      addSeg(vMap, r.x + r.width, r.y, r.y + r.height, onE, edgeKindFor('east'));
    });

    const allDoors = [];
    const allWindows = [];
    floor.rooms.forEach(r => {
      (r.doors || []).forEach(d => allDoors.push({ ...d, room: r }));
      (r.windows || []).forEach(w => allWindows.push({ ...w, room: r }));
    });

    function mergeByKind(list) {
      const groups = { solid: [], open: [], shutter: [] };
      list.forEach(seg => groups[seg.edgeKind || 'solid'].push(seg));

      const mergeArr = (arr) => {
        if (!arr.length) return [];
        arr.sort((a, b) => a.start - b.start);
        const out = [{ ...arr[0] }];
        for (let i = 1; i < arr.length; i++) {
          const prev = out[out.length - 1];
          const cur = arr[i];
          if (cur.start <= prev.end + 0.05 && cur.isExterior === prev.isExterior) {
            prev.end = Math.max(prev.end, cur.end);
          } else if (cur.start < prev.end - 0.05) {
            if (cur.end > prev.end) {
              out.push({ start: prev.end, end: cur.end, isExterior: cur.isExterior, edgeKind: cur.edgeKind });
            }
          } else {
            out.push({ ...cur });
          }
        }
        return out;
      };

      return {
        solid: mergeArr(groups.solid),
        open: mergeArr(groups.open),
        shutter: mergeArr(groups.shutter)
      };
    }

    function drawOpenDrivewayOrBalcony(orient, coord, seg) {
      const p1 = orient === 'h'
        ? { x: plotOffset.x + ft(seg.start), y: plotOffset.y + ft(coord) }
        : { x: plotOffset.x + ft(coord), y: plotOffset.y + ft(seg.start) };
      const p2 = orient === 'h'
        ? { x: plotOffset.x + ft(seg.end), y: plotOffset.y + ft(coord) }
        : { x: plotOffset.x + ft(coord), y: plotOffset.y + ft(seg.end) };

      // Dashed open driveway / gate / railing line (never solid brick wall)
      el('line', {
        x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
        stroke: PALETTE.wallIntStroke, 'stroke-width': '1.4', 'stroke-dasharray': '6,4'
      }, wallParent);

      // Corner structural pillars (9" x 9")
      const col = ft(0.75);
      el('rect', { x: p1.x - col / 2, y: p1.y - col / 2, width: col, height: col, fill: PALETTE.wallExtFill, stroke: PALETTE.wallExtStroke, 'stroke-width': '1' }, wallParent);
      el('rect', { x: p2.x - col / 2, y: p2.y - col / 2, width: col, height: col, fill: PALETTE.wallExtFill, stroke: PALETTE.wallExtStroke, 'stroke-width': '1' }, wallParent);
    }

    function drawCommercialShutter(orient, coord, seg) {
      const halfT = ft(0.375);
      const p1 = orient === 'h'
        ? { x: plotOffset.x + ft(seg.start), y: plotOffset.y + ft(coord) }
        : { x: plotOffset.x + ft(coord), y: plotOffset.y + ft(seg.start) };
      const p2 = orient === 'h'
        ? { x: plotOffset.x + ft(seg.end), y: plotOffset.y + ft(coord) }
        : { x: plotOffset.x + ft(coord), y: plotOffset.y + ft(seg.end) };

      const col = ft(0.75);
      // Shopfront glazed/shutter track across opening
      if (orient === 'h') {
        el('rect', { x: p1.x, y: p1.y - halfT, width: p2.x - p1.x, height: halfT * 2, fill: '#E0F2FE', stroke: PALETTE.shutter, 'stroke-width': '1.2' }, winParent);
        el('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, stroke: PALETTE.shutter, 'stroke-width': '1.5', 'stroke-dasharray': '8,4' }, winParent);
      } else {
        el('rect', { x: p1.x - halfT, y: p1.y, width: halfT * 2, height: p2.y - p1.y, fill: '#E0F2FE', stroke: PALETTE.shutter, 'stroke-width': '1.2' }, winParent);
        el('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, stroke: PALETTE.shutter, 'stroke-width': '1.5', 'stroke-dasharray': '8,4' }, winParent);
      }
      // Corner piers
      el('rect', { x: p1.x - col / 2, y: p1.y - col / 2, width: col, height: col, fill: PALETTE.wallExtFill }, wallParent);
      el('rect', { x: p2.x - col / 2, y: p2.y - col / 2, width: col, height: col, fill: PALETTE.wallExtFill }, wallParent);
    }

    function drawCarvedWall(orient, coord, seg) {
      const wallThickFt = seg.isExterior ? 0.75 : 0.375;
      const halfT = ft(wallThickFt / 2);

      const openings = [];
      allDoors.forEach(d => {
        const match = orient === 'h'
          ? (d.wall === 'north' || d.wall === 'south') && Math.abs(d.y - coord) < EPS
          : (d.wall === 'east' || d.wall === 'west') && Math.abs(d.x - coord) < EPS;
        if (match) {
          const pos = orient === 'h' ? d.x : d.y;
          if (pos >= seg.start - 0.2 && pos + d.width <= seg.end + 0.2) {
            openings.push({ start: pos, end: pos + d.width, kind: 'door', item: d });
          }
        }
      });

      allWindows.forEach(w => {
        const match = orient === 'h'
          ? (w.wall === 'north' || w.wall === 'south') && Math.abs(w.y - coord) < EPS
          : (w.wall === 'east' || w.wall === 'west') && Math.abs(w.x - coord) < EPS;
        if (match) {
          const pos = orient === 'h' ? w.x : w.y;
          if (pos >= seg.start - 0.2 && pos + w.width <= seg.end + 0.2) {
            openings.push({ start: pos, end: pos + w.width, kind: 'window', item: w });
          }
        }
      });

      openings.sort((a, b) => a.start - b.start);

      let cursor = seg.start;
      const drawWallPiece = (sFt, eFt) => {
        if (eFt - sFt <= 0.05) return;
        const fill = seg.isExterior ? PALETTE.wallExtFill : PALETTE.wallIntFill;
        const stroke = seg.isExterior ? PALETTE.wallExtStroke : PALETTE.wallIntStroke;
        if (orient === 'h') {
          el('rect', { x: plotOffset.x + ft(sFt), y: plotOffset.y + ft(coord) - halfT, width: ft(eFt - sFt), height: halfT * 2, fill, stroke, 'stroke-width': '0.9' }, wallParent);
        } else {
          el('rect', { x: plotOffset.x + ft(coord) - halfT, y: plotOffset.y + ft(sFt), width: halfT * 2, height: ft(eFt - sFt), fill, stroke, 'stroke-width': '0.9' }, wallParent);
        }
      };

      openings.forEach(op => {
        if (op.start > cursor) drawWallPiece(cursor, Math.min(op.start, seg.end));
        if (op.kind === 'window') drawWindowSymbol(winParent, orient, coord, op.start, op.end, halfT, op.item.type, plotOffset);
        cursor = Math.max(cursor, op.end);
      });
      if (cursor < seg.end) drawWallPiece(cursor, seg.end);
    }

    const renderAxis = (map, orient) => {
      for (const [coord, list] of map.entries()) {
        const { solid, open, shutter } = mergeByKind(list);
        solid.forEach(seg => drawCarvedWall(orient, coord, seg));
        open.forEach(seg => {
          const covered = solid.some(s => seg.start >= s.start - 0.1 && seg.end <= s.end + 0.1);
          if (!covered) drawOpenDrivewayOrBalcony(orient, coord, seg);
        });
        shutter.forEach(seg => {
          const covered = solid.some(s => seg.start >= s.start - 0.1 && seg.end <= s.end + 0.1);
          if (!covered) drawCommercialShutter(orient, coord, seg);
        });
      }
    };

    renderAxis(hMap, 'h');
    renderAxis(vMap, 'v');

    allDoors.forEach(d => drawDoorSymbol(doorParent, d, plotOffset));
  }

  function drawWindowSymbol(parent, orient, coord, startFt, endFt, halfT, winType, plotOffset) {
    if (orient === 'h') {
      const x = plotOffset.x + ft(startFt);
      const y = plotOffset.y + ft(coord) - halfT;
      const w = ft(endFt - startFt);
      const h = halfT * 2;
      el('rect', { x, y, width: w, height: h, fill: PALETTE.windowFill, stroke: PALETTE.window, 'stroke-width': '1' }, parent);
      el('line', { x1: x, y1: y + h * 0.35, x2: x + w, y2: y + h * 0.35, stroke: PALETTE.window, 'stroke-width': '0.9' }, parent);
      el('line', { x1: x, y1: y + h * 0.65, x2: x + w, y2: y + h * 0.65, stroke: PALETTE.window, 'stroke-width': '0.9' }, parent);
      if (winType === 'ventilator') {
        el('line', { x1: x, y1: y, x2: x + w, y2: y + h, stroke: PALETTE.window, 'stroke-width': '0.8', 'stroke-dasharray': '2,2' }, parent);
      }
    } else {
      const x = plotOffset.x + ft(coord) - halfT;
      const y = plotOffset.y + ft(startFt);
      const w = halfT * 2;
      const h = ft(endFt - startFt);
      el('rect', { x, y, width: w, height: h, fill: PALETTE.windowFill, stroke: PALETTE.window, 'stroke-width': '1' }, parent);
      el('line', { x1: x + w * 0.35, y1: y, x2: x + w * 0.35, y2: y + h, stroke: PALETTE.window, 'stroke-width': '0.9' }, parent);
      el('line', { x1: x + w * 0.65, y1: y, x2: x + w * 0.65, y2: y + h, stroke: PALETTE.window, 'stroke-width': '0.9' }, parent);
      if (winType === 'ventilator') {
        el('line', { x1: x, y1: y, x2: x + w, y2: y + h, stroke: PALETTE.window, 'stroke-width': '0.8', 'stroke-dasharray': '2,2' }, parent);
      }
    }
  }

  function drawDoorSymbol(parent, d, plotOffset) {
    const r = d.room;
    const dx = plotOffset.x + ft(d.x);
    const dy = plotOffset.y + ft(d.y);
    const dw = ft(d.width);

    if (d.type === 'double') {
      const half = dw / 2;
      drawSingleLeaf(parent, d.wall, dx, dy, half, r, false, plotOffset);
      if (d.wall === 'north' || d.wall === 'south') {
        drawSingleLeaf(parent, d.wall, dx + dw, dy, half, r, true, plotOffset);
      } else {
        drawSingleLeaf(parent, d.wall, dx, dy + dw, half, r, true, plotOffset);
      }
    } else {
      drawSingleLeaf(parent, d.wall, dx, dy, dw, r, false, plotOffset);
    }
  }

  function drawSingleLeaf(parent, wall, hx, hy, len, room, reverseHinge, plotOffset) {
    const rcx = plotOffset.x + ft(room.x + room.width / 2);
    const rcy = plotOffset.y + ft(room.y + room.height / 2);
    let lx, ly, ax, ay, sweep;

    if (wall === 'north' || wall === 'south') {
      const dirY = rcy >= hy ? 1 : -1;
      const dirX = reverseHinge ? -1 : 1;
      lx = hx;
      ly = hy + dirY * len;
      ax = hx + dirX * len;
      ay = hy;
      sweep = (dirX * dirY > 0) ? 0 : 1;
    } else {
      const dirX = rcx >= hx ? 1 : -1;
      const dirY = reverseHinge ? -1 : 1;
      lx = hx + dirX * len;
      ly = hy;
      ax = hx;
      ay = hy + dirY * len;
      sweep = (dirX * dirY > 0) ? 1 : 0;
    }

    el('line', { x1: hx, y1: hy, x2: lx, y2: ly, stroke: PALETTE.door, 'stroke-width': '1.6' }, parent);
    el('path', {
      d: `M ${lx.toFixed(1)} ${ly.toFixed(1)} A ${len.toFixed(1)} ${len.toFixed(1)} 0 0 ${sweep} ${ax.toFixed(1)} ${ay.toFixed(1)}`,
      fill: 'none', stroke: PALETTE.door, 'stroke-width': '0.9', 'stroke-dasharray': '3,2'
    }, parent);
  }

  function renderStaircase(parent, stairs, plotOffset) {
    if (!stairs) return;
    const x = plotOffset.x + ft(stairs.x);
    const y = plotOffset.y + ft(stairs.y);
    const w = ft(stairs.width);
    const h = ft(stairs.height);

    const verticalFlight = h >= w;
    const treadStep = ft(0.85);

    if (verticalFlight) {
      const landingH = Math.min(w * 0.55, h * 0.28);
      el('line', { x1: x, y1: y + landingH, x2: x + w, y2: y + landingH, stroke: PALETTE.text, 'stroke-width': '1' }, parent);
      el('line', { x1: x + w / 2, y1: y + landingH, x2: x + w / 2, y2: y + h, stroke: PALETTE.text, 'stroke-width': '1' }, parent);
      for (let ty = y + landingH + treadStep; ty < y + h - 4; ty += treadStep) {
        el('line', { x1: x, y1: ty, x2: x + w, y2: ty, stroke: PALETTE.dim, 'stroke-width': '0.85' }, parent);
      }
      const cx = x + w * 0.25;
      el('line', { x1: cx, y1: y + h - 8, x2: cx, y2: y + landingH + 8, stroke: PALETTE.text, 'stroke-width': '1.2' }, parent);
      el('polyline', { points: `${cx - 4},${y + landingH + 13} ${cx},${y + landingH + 8} ${cx + 4},${y + landingH + 13}`, fill: 'none', stroke: PALETTE.text, 'stroke-width': '1.2' }, parent);
      const lbl = el('text', { x: x + w / 2, y: y + landingH / 2, fill: PALETTE.text, 'font-family': 'Inter, Arial, sans-serif', 'font-size': '8.5', 'font-weight': '700', 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, parent);
      lbl.textContent = stairs.direction === 'down' ? 'DN' : 'UP';
    } else {
      const landingW = Math.min(h * 0.55, w * 0.28);
      el('line', { x1: x + landingW, y1: y, x2: x + landingW, y2: y + h, stroke: PALETTE.text, 'stroke-width': '1' }, parent);
      el('line', { x1: x + landingW, y1: y + h / 2, x2: x + w, y2: y + h / 2, stroke: PALETTE.text, 'stroke-width': '1' }, parent);
      for (let tx = x + landingW + treadStep; tx < x + w - 4; tx += treadStep) {
        el('line', { x1: tx, y1: y, x2: tx, y2: y + h, stroke: PALETTE.dim, 'stroke-width': '0.85' }, parent);
      }
      const cy = y + h * 0.25;
      el('line', { x1: x + w - 8, y1: cy, x2: x + landingW + 8, y2: cy, stroke: PALETTE.text, 'stroke-width': '1.2' }, parent);
      el('polyline', { points: `${x + landingW + 13},${cy - 4} ${x + landingW + 8},${cy} ${x + landingW + 13},${cy + 4}`, fill: 'none', stroke: PALETTE.text, 'stroke-width': '1.2' }, parent);
      const lbl = el('text', { x: x + landingW / 2, y: y + h / 2, fill: PALETTE.text, 'font-family': 'Inter, Arial, sans-serif', 'font-size': '8.5', 'font-weight': '700', 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, parent);
      lbl.textContent = stairs.direction === 'down' ? 'DN' : 'UP';
    }
  }

  function renderFurniture(parent, floor, plotOffset) {
    const stroke = PALETTE.furniture;

    floor.rooms.forEach(r => {
      const rx = plotOffset.x + ft(r.x);
      const ry = plotOffset.y + ft(r.y);
      const rw = ft(r.width);
      const rh = ft(r.height);

      (r.furniture || []).forEach(f => {
        const fx = rx + ft(f.x);
        const fy = ry + ft(f.y);
        const fw = ft(f.width);
        const fh = ft(f.height);

        if (fx < rx + 3 || fy < ry + 3 || fx + fw > rx + rw - 3 || fy + fh > ry + rh - 3) return;

        if (f.type === 'bed') {
          el('rect', { x: fx, y: fy, width: fw, height: fh, rx: 2, fill: '#FFFFFF', 'fill-opacity': '0.6', stroke, 'stroke-width': '1' }, parent);
          const pw = fw * 0.36;
          const ph = Math.min(13, fh * 0.18);
          el('rect', { x: fx + fw * 0.1, y: fy + 4, width: pw, height: ph, rx: 2, fill: 'none', stroke, 'stroke-width': '0.8' }, parent);
          el('rect', { x: fx + fw * 0.54, y: fy + 4, width: pw, height: ph, rx: 2, fill: 'none', stroke, 'stroke-width': '0.8' }, parent);
          el('line', { x1: fx, y1: fy + fh * 0.35, x2: fx + fw, y2: fy + fh * 0.35, stroke, 'stroke-width': '0.8' }, parent);
        } else if (f.type === 'sidetable' || f.type === 'wardrobe' || f.type === 'coffeetable' || f.type === 'tv_unit') {
          el('rect', { x: fx, y: fy, width: fw, height: fh, fill: '#FFFFFF', 'fill-opacity': '0.5', stroke, 'stroke-width': '0.9' }, parent);
          if (f.type === 'wardrobe') {
            el('line', { x1: fx, y1: fy, x2: fx + fw, y2: fy + fh, stroke, 'stroke-width': '0.6', 'stroke-dasharray': '3,3' }, parent);
          }
        } else if (f.type === 'sofa') {
          el('rect', { x: fx, y: fy, width: fw, height: fh, rx: 2, fill: '#FFFFFF', 'fill-opacity': '0.55', stroke, 'stroke-width': '1' }, parent);
          el('line', { x1: fx, y1: fy + fh * 0.28, x2: fx + fw, y2: fy + fh * 0.28, stroke, 'stroke-width': '0.8' }, parent);
          el('line', { x1: fx + fw * 0.1, y1: fy + fh * 0.28, x2: fx + fw * 0.1, y2: fy + fh, stroke, 'stroke-width': '0.8' }, parent);
          el('line', { x1: fx + fw * 0.9, y1: fy + fh * 0.28, x2: fx + fw * 0.9, y2: fy + fh, stroke, 'stroke-width': '0.8' }, parent);
        } else if (f.type === 'dining_table') {
          el('rect', { x: fx, y: fy, width: fw, height: fh, rx: 3, fill: '#FFFFFF', 'fill-opacity': '0.6', stroke, 'stroke-width': '1' }, parent);
          [0.3, 0.7].forEach(p => {
            el('circle', { cx: fx + fw * p, cy: fy - 5, r: 3.8, fill: 'none', stroke, 'stroke-width': '0.8' }, parent);
            el('circle', { cx: fx + fw * p, cy: fy + fh + 5, r: 3.8, fill: 'none', stroke, 'stroke-width': '0.8' }, parent);
          });
        } else if (f.type === 'kitchen_counter') {
          el('rect', { x: fx, y: fy, width: fw, height: fh, fill: '#FFFFFF', 'fill-opacity': '0.6', stroke, 'stroke-width': '1' }, parent);
        } else if (f.type === 'sink') {
          el('rect', { x: fx, y: fy, width: fw, height: fh, rx: 2, fill: 'none', stroke, 'stroke-width': '0.9' }, parent);
          el('circle', { cx: fx + fw / 2, cy: fy + fh / 2, r: Math.min(fw, fh) * 0.22, fill: 'none', stroke, 'stroke-width': '0.8' }, parent);
        } else if (f.type === 'hob') {
          el('rect', { x: fx, y: fy, width: fw, height: fh, fill: 'none', stroke, 'stroke-width': '0.9' }, parent);
          const br = Math.min(fw, fh) * 0.18;
          [0.28, 0.72].forEach(px => [0.3, 0.7].forEach(py => {
            el('circle', { cx: fx + fw * px, cy: fy + fh * py, r: br, fill: 'none', stroke, 'stroke-width': '0.8' }, parent);
          }));
        } else if (f.type === 'wc') {
          el('rect', { x: fx, y: fy, width: fw, height: fh * 0.35, fill: '#FFFFFF', stroke, 'stroke-width': '0.9' }, parent);
          el('ellipse', { cx: fx + fw / 2, cy: fy + fh * 0.68, rx: fw * 0.38, ry: fh * 0.3, fill: '#FFFFFF', stroke, 'stroke-width': '0.9' }, parent);
        } else if (f.type === 'washbasin') {
          el('rect', { x: fx, y: fy, width: fw, height: fh, rx: 4, fill: '#FFFFFF', stroke, 'stroke-width': '0.9' }, parent);
          el('circle', { cx: fx + fw / 2, cy: fy + fh / 2, r: 2.3, fill: 'none', stroke, 'stroke-width': '0.8' }, parent);
        } else if (f.type === 'shower') {
          el('rect', { x: fx, y: fy, width: fw, height: fh, fill: 'none', stroke, 'stroke-width': '0.8', 'stroke-dasharray': '3,2' }, parent);
          el('line', { x1: fx, y1: fy, x2: fx + fw, y2: fy + fh, stroke, 'stroke-width': '0.6' }, parent);
          el('circle', { cx: fx + fw / 2, cy: fy + fh / 2, r: 2.8, fill: 'none', stroke, 'stroke-width': '0.8' }, parent);
        } else if (f.type === 'car') {
          el('rect', { x: fx, y: fy, width: fw, height: fh, rx: 10, fill: '#FFFFFF', 'fill-opacity': '0.7', stroke, 'stroke-width': '1.2' }, parent);
          el('rect', { x: fx + fw * 0.14, y: fy + fh * 0.22, width: fw * 0.72, height: fh * 0.52, rx: 4, fill: 'none', stroke, 'stroke-width': '0.8' }, parent);
        } else if (f.type === 'desk') {
          el('rect', { x: fx, y: fy, width: fw, height: fh, fill: '#FFFFFF', 'fill-opacity': '0.6', stroke, 'stroke-width': '1' }, parent);
          el('circle', { cx: fx + fw / 2, cy: fy + fh + 7, r: 5.5, fill: 'none', stroke, 'stroke-width': '0.8' }, parent);
        }
      });
    });
  }

  function renderLabels(parent, floor, plotOffset) {
    floor.rooms.forEach(r => {
      const areaSqFt = r.width * r.height;
      if (areaSqFt < 18) return;

      const cx = plotOffset.x + ft(r.x + r.width / 2);
      const cy = plotOffset.y + ft(r.y + r.height / 2);
      const boxW = ft(r.width) - 8;

      let nameSize = areaSqFt > 110 ? 10.5 : areaSqFt > 50 ? 8.8 : 7.2;
      const maxChars = Math.max(8, r.name.length);
      const estCharW = nameSize * 0.58;
      if (maxChars * estCharW > boxW) {
        nameSize = Math.max(6.2, (boxW / maxChars) / 0.58);
      }
      const dimSize = Math.max(5.8, nameSize - 1.2);

      // Solid readable pill behind every room label (especially STAIRCASE over treads!)
      const pillW = Math.min(boxW, Math.max(r.name.length, 12) * nameSize * 0.60 + 10);
      const pillH = nameSize + dimSize + 9;
      el('rect', {
        x: cx - pillW / 2,
        y: cy - nameSize - 3,
        width: pillW,
        height: pillH,
        fill: '#FFFFFF',
        'fill-opacity': r.type === 'staircase' ? '0.96' : '0.84',
        stroke: r.type === 'staircase' ? '#CBD5E1' : 'none',
        'stroke-width': r.type === 'staircase' ? '0.6' : '0',
        rx: 3
      }, parent);

      const tName = el('text', {
        x: cx, y: cy - 3,
        fill: PALETTE.text,
        'font-family': 'Inter, Arial, sans-serif',
        'font-size': nameSize.toFixed(1),
        'font-weight': '700',
        'text-anchor': 'middle'
      }, parent);
      tName.textContent = r.name;

      const tDim = el('text', {
        x: cx, y: cy + dimSize + 1.5,
        fill: PALETTE.subText,
        'font-family': '"Courier New", monospace',
        'font-size': dimSize.toFixed(1),
        'font-weight': '600',
        'text-anchor': 'middle'
      }, parent);
      tDim.textContent = `${fmtFtIn(r.width)} × ${fmtFtIn(r.height)}`;
    });
  }

  function renderDimensionChains(parent, layoutData, plotOffset) {
    const verts = layoutData.plotVertices;
    const minX = plotOffset.x + ft(Math.min(...verts.map(v => v.x)));
    const maxX = plotOffset.x + ft(Math.max(...verts.map(v => v.x)));
    const minY = plotOffset.y + ft(Math.min(...verts.map(v => v.y)));
    const maxY = plotOffset.y + ft(Math.max(...verts.map(v => v.y)));

    const env = layoutData.buildableEnvelope;
    const bx1 = plotOffset.x + ft(env.x);
    const by1 = plotOffset.y + ft(env.y);
    const bx2 = bx1 + ft(env.width);
    const by2 = by1 + ft(env.height);

    const road = layoutData.roadFacing || 'east';
    const topChainY = road === 'north' ? maxY + ft(2.8) : minY - ft(2.8);
    const topOuterY = road === 'north' ? maxY + ft(4.8) : minY - ft(4.8);

    const sideChainX = road === 'west' ? maxX + ft(2.8) : minX - ft(2.8);
    const sideOuterX = road === 'west' ? maxX + ft(4.8) : minX - ft(4.8);

    drawDimH(parent, minX, maxX, topOuterY, minY, fmtFtIn(layoutData.plotWidth) + ' PLOT WIDTH');
    drawDimH(parent, bx1, bx2, topChainY, by1, fmtFtIn(env.width) + ' BUILT-UP');

    drawDimV(parent, minY, maxY, sideOuterX, minX, fmtFtIn(layoutData.plotLength) + ' PLOT LENGTH');
    drawDimV(parent, by1, by2, sideChainX, bx1, fmtFtIn(env.height) + ' BUILT-UP');
  }

  function drawTick45(parent, x, y) {
    const r = 4;
    el('line', { x1: x - r, y1: y + r, x2: x + r, y2: y - r, stroke: PALETTE.dim, 'stroke-width': '1.3' }, parent);
  }

  function drawDimH(parent, x1, x2, lineY, refY, text) {
    el('line', { x1, y1: refY, x2: x1, y2: lineY, stroke: PALETTE.dim, 'stroke-width': '0.65', 'stroke-opacity': '0.55' }, parent);
    el('line', { x1: x2, y1: refY, x2: x2, y2: lineY, stroke: PALETTE.dim, 'stroke-width': '0.65', 'stroke-opacity': '0.55' }, parent);
    el('line', { x1: x1 - 5, y1: lineY, x2: x2 + 5, y2: lineY, stroke: PALETTE.dim, 'stroke-width': '1' }, parent);
    drawTick45(parent, x1, lineY);
    drawTick45(parent, x2, lineY);

    const t = el('text', {
      x: (x1 + x2) / 2, y: lineY - 5, fill: PALETTE.dim,
      'font-family': 'Inter, Arial, sans-serif', 'font-size': '9.5', 'font-weight': '600', 'text-anchor': 'middle'
    }, parent);
    t.textContent = text;
  }

  function drawDimV(parent, y1, y2, lineX, refX, text) {
    el('line', { x1: refX, y1, x2: lineX, y2: y1, stroke: PALETTE.dim, 'stroke-width': '0.65', 'stroke-opacity': '0.55' }, parent);
    el('line', { x1: refX, y1: y2, x2: lineX, y2: y2, stroke: PALETTE.dim, 'stroke-width': '0.65', 'stroke-opacity': '0.55' }, parent);
    el('line', { x1: lineX, y1: y1 - 5, x2: lineX, y2: y2 + 5, stroke: PALETTE.dim, 'stroke-width': '1' }, parent);
    drawTick45(parent, lineX, y1);
    drawTick45(parent, lineX, y2);

    const cy = (y1 + y2) / 2;
    const t = el('text', {
      x: lineX - 6, y: cy, fill: PALETTE.dim,
      'font-family': 'Inter, Arial, sans-serif', 'font-size': '9.5', 'font-weight': '600',
      'text-anchor': 'middle', transform: `rotate(-90 ${lineX - 6} ${cy})`
    }, parent);
    t.textContent = text;
  }

  function renderNorthArrow(parent, cx, cy) {
    el('circle', { cx, cy, r: 20, fill: '#FFFFFF', stroke: '#CBD5E1', 'stroke-width': '1.2' }, parent);
    el('polygon', { points: `${cx},${cy - 15} ${cx - 6},${cy + 5} ${cx},${cy + 1} ${cx + 6},${cy + 5}`, fill: PALETTE.text }, parent);
    const t = el('text', {
      x: cx, y: cy + 15, fill: '#2563EB',
      'font-family': 'Inter, Arial, sans-serif', 'font-size': '10', 'font-weight': '700', 'text-anchor': 'middle'
    }, parent);
    t.textContent = 'N';
  }

  return {
    render(containerId, layoutData, formData, options = {}) {
      const container = document.getElementById(containerId);
      if (!container || !layoutData) return;

      const optionIndex = options.optionIndex || 0;
      const floorIndex = options.floorIndex || 0;
      const optObj = layoutData.options[optionIndex] || layoutData.options[0];
      const floor = optObj.floors[floorIndex] || optObj.floors[0];

      const plotPxW = ft(layoutData.plotWidth);
      const plotPxH = ft(layoutData.plotLength || layoutData.plotDepth);

      // Tight, balanced margins around plot, dimension chains, and road strips — zero wasted bottom whitespace
      const padLeft = 105;
      const padRight = 115;
      const padTop = 98;
      const padBottom = 110;

      const sheetW = Math.max(560, Math.round(plotPxW + padLeft + padRight));
      const sheetH = Math.round(plotPxH + padTop + padBottom);
      currentWidth = sheetW;
      currentHeight = sheetH;

      const plotOffset = {
        x: Math.round((sheetW - plotPxW) / 2),
        y: padTop
      };

      container.innerHTML = '';
      const svg = el('svg', {
        xmlns: SVG_NS,
        viewBox: `0 0 ${sheetW} ${sheetH}`,
        width: sheetW,
        height: sheetH,
        role: 'img',
        'aria-label': `2D Floor Plan - ${floor.name}`
      }, container);
      currentSvg = svg;

      buildDefs(svg);

      // Clean light background
      el('rect', { x: 0, y: 0, width: sheetW, height: sheetH, fill: PALETTE.bg }, svg);

      const gPlot = el('g', { id: 'g-plot' }, svg);
      const gFills = el('g', { id: 'g-room-fills' }, svg);
      const gFurn = el('g', { id: 'g-furniture' }, svg);
      const gWalls = el('g', { id: 'g-walls' }, svg);
      const gWindows = el('g', { id: 'g-windows' }, svg);
      const gDoors = el('g', { id: 'g-doors' }, svg);
      const gStairs = el('g', { id: 'g-stairs' }, svg);
      const gLabels = el('g', { id: 'g-labels' }, svg);
      const gDims = el('g', { id: 'g-dimensions' }, svg);
      const gMeta = el('g', { id: 'g-meta' }, svg);

      renderPlotAndRoad(gPlot, layoutData, formData, plotOffset);
      renderRoomFills(gFills, floor, plotOffset);
      renderFurniture(gFurn, floor, plotOffset);
      renderWallsAndOpenings(gWalls, gDoors, gWindows, floor, layoutData, plotOffset);
      renderStaircase(gStairs, floor.stairs, plotOffset);
      renderLabels(gLabels, floor, plotOffset);
      renderDimensionChains(gDims, layoutData, plotOffset);
      renderNorthArrow(gMeta, sheetW - 34, 34);
    },

    getSvgElement() {
      return currentSvg;
    },

    exportSVG() {
      if (!currentSvg) return '';
      const serializer = new XMLSerializer();
      let str = serializer.serializeToString(currentSvg);
      if (!str.startsWith('<?xml')) {
        str = '<?xml version="1.0" encoding="UTF-8"?>\n' + str;
      }
      return str;
    },

    exportPNG(callback) {
      if (!currentSvg || typeof callback !== 'function') return;
      const svgStr = this.exportSVG();
      const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.onload = function () {
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = currentWidth * scale;
        canvas.height = currentHeight * scale;
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, currentWidth, currentHeight);
        URL.revokeObjectURL(url);
        callback(canvas.toDataURL('image/png'));
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
      };
      img.src = url;
    }
  };
})();
