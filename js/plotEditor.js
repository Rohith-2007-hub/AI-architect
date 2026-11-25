/**
 * HomeBrief — Interactive Plot Shape & Area Matcher (Step 2)
 * Fixed-scale ~2x land grid workspace with mouse/touch corner & edge dragging,
 * smooth Length & Width editing (backspace-safe), Shoelace area calculation, and Auto-Fit.
 */
window.HomeBrief = window.HomeBrief || {};

window.HomeBrief.PlotEditor = (function () {
  'use strict';

  const SQFT_PER_CENT = 435.6;
  const MIN_SIDE_FT = 15;

  let containerEl = null;
  let canvas = null;
  let ctx = null;
  let formData = null;

  // Fixed workspace dimensions (feet) — locked once per targetArea so grid NEVER zooms out while editing
  let worldSize = 80;
  let marginPx = 42;
  let pxPerFt = 6;
  let dpr = 1;

  // Polygon vertices in feet: [top-left, top-right, bottom-right, bottom-left]
  let vertices = [];
  let currentPreset = 'rectangle';
  let lockedTargetArea = null;

  let dragState = null;
  let hoverHandle = null;
  let rafId = null;
  let listenersBound = false;
  let resizeHandler = null;

  function fmtFtIn(feet) {
    const totalInches = Math.round(Math.max(0, feet) * 12);
    const ft = Math.floor(totalInches / 12);
    const inch = totalInches % 12;
    return `${ft}'-${inch}"`;
  }

  function computeArea(pts) {
    if (!pts || pts.length < 3) return 0;
    let sum = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      sum += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    }
    return Math.abs(sum) / 2;
  }

  function dist(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  function checkIsIrregular(pts) {
    if (pts.length !== 4) return true;
    const tol = 0.25;
    const topHoriz = Math.abs(pts[0].y - pts[1].y) < tol;
    const botHoriz = Math.abs(pts[3].y - pts[2].y) < tol;
    const leftVert = Math.abs(pts[0].x - pts[3].x) < tol;
    const rightVert = Math.abs(pts[1].x - pts[2].x) < tol;
    return !(topHoriz && botHoriz && leftVert && rightVert);
  }

  /**
   * Compute average Width (horizontal / E-W) and Length (vertical / N-S) in feet.
   */
  function getPlotDims(pts) {
    const topW = dist(pts[0], pts[1]);
    const botW = dist(pts[3], pts[2]);
    const leftL = dist(pts[0], pts[3]);
    const rightL = dist(pts[1], pts[2]);
    return {
      width: (topW + botW) / 2,
      length: (leftL + rightL) / 2
    };
  }

  /**
   * Lock workspace grid scale ONCE based solely on Step 1 target area (~2x area).
   */
  function lockWorkspaceGrid(targetArea) {
    const area = targetArea || 2178;
    // Enough span for even a 1:2 deep plot inside a ~2x area workspace
    worldSize = Math.max(70, Math.ceil((Math.sqrt(area * 2.5) + 16) / 10) * 10);
  }

  function clampPolygonInsideGrid() {
    const pad = 2;
    const maxC = worldSize - pad;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    vertices.forEach(v => {
      minX = Math.min(minX, v.x);
      minY = Math.min(minY, v.y);
      maxX = Math.max(maxX, v.x);
      maxY = Math.max(maxY, v.y);
    });

    const spanX = maxX - minX;
    const spanY = maxY - minY;
    if (spanX <= maxC - pad && (minX < pad || maxX > maxC)) {
      const shiftX = (worldSize / 2) - (minX + maxX) / 2;
      vertices.forEach(v => { v.x += shiftX; });
    }
    if (spanY <= maxC - pad && (minY < pad || maxY > maxC)) {
      const shiftY = (worldSize / 2) - (minY + maxY) / 2;
      vertices.forEach(v => { v.y += shiftY; });
    }

    // Hard clamp within fixed grid bounds (never rescale grid!)
    vertices = vertices.map(v => ({
      x: Math.max(pad, Math.min(maxC, v.x)),
      y: Math.max(pad, Math.min(maxC, v.y))
    }));
  }

  function applyPreset(preset) {
    currentPreset = preset;
    const targetArea = formData.landAreaSqFt || 2178;
    const cx = worldSize / 2;
    const cy = worldSize / 2;
    const maxSpan = worldSize - 6;

    let w, l;
    if (preset === 'square') {
      w = Math.sqrt(targetArea);
      l = w;
    } else if (preset === 'rectangle') {
      const isEW = formData.roadFacing === 'east' || formData.roadFacing === 'west';
      w = isEW ? Math.sqrt(targetArea * 1.5) : Math.sqrt(targetArea * (2 / 3));
      l = targetArea / w;
    } else if (preset === 'deep') {
      const isEW = formData.roadFacing === 'east' || formData.roadFacing === 'west';
      w = isEW ? Math.sqrt(targetArea * 2) : Math.sqrt(targetArea * 0.5);
      l = targetArea / w;
    } else {
      const baseW = Math.sqrt(targetArea * 0.85);
      const baseL = targetArea / baseW;
      const halfL = Math.min(maxSpan / 2, baseL / 2);
      const frontHalfW = Math.min(maxSpan / 2, (baseW * 1.08) / 2);
      const rearHalfW = Math.min(maxSpan / 2, (baseW * 0.92) / 2);

      if (formData.roadFacing === 'north') {
        vertices = [
          { x: cx - frontHalfW, y: cy - halfL },
          { x: cx + frontHalfW, y: cy - halfL },
          { x: cx + rearHalfW, y: cy + halfL },
          { x: cx - rearHalfW, y: cy + halfL }
        ];
      } else if (formData.roadFacing === 'east') {
        vertices = [
          { x: cx - baseL / 2, y: cy - rearHalfW },
          { x: cx + baseL / 2, y: cy - frontHalfW },
          { x: cx + baseL / 2, y: cy + frontHalfW },
          { x: cx - baseL / 2, y: cy + rearHalfW }
        ];
      } else if (formData.roadFacing === 'west') {
        vertices = [
          { x: cx - baseL / 2, y: cy - frontHalfW },
          { x: cx + baseL / 2, y: cy - rearHalfW },
          { x: cx + baseL / 2, y: cy + rearHalfW },
          { x: cx - baseL / 2, y: cy + frontHalfW }
        ];
      } else {
        vertices = [
          { x: cx - rearHalfW, y: cy - halfL },
          { x: cx + rearHalfW, y: cy - halfL },
          { x: cx + frontHalfW, y: cy + halfL },
          { x: cx - frontHalfW, y: cy + halfL }
        ];
      }

      clampPolygonInsideGrid();
      updatePresetUI();
      syncInputsFromVertices(false);
      updateAreaMeter();
      scheduleDraw();
      return;
    }

    w = Math.min(maxSpan, Math.max(MIN_SIDE_FT, w));
    l = Math.min(maxSpan, Math.max(MIN_SIDE_FT, l));

    vertices = [
      { x: cx - w / 2, y: cy - l / 2 },
      { x: cx + w / 2, y: cy - l / 2 },
      { x: cx + w / 2, y: cy + l / 2 },
      { x: cx - w / 2, y: cy + l / 2 }
    ];

    clampPolygonInsideGrid();
    updatePresetUI();
    syncInputsFromVertices(false);
    updateAreaMeter();
    scheduleDraw();
  }

  function updatePresetUI() {
    const map = {
      square: 'preset-square',
      rectangle: 'preset-rectangle',
      deep: 'preset-deep',
      irregular: 'preset-irregular'
    };
    Object.keys(map).forEach(k => {
      document.getElementById(map[k])?.classList.toggle('active', k === currentPreset);
    });
    const hint = document.getElementById('preset-hint');
    if (hint) {
      hint.textContent = currentPreset === 'irregular'
        ? 'Irregular mode: drag any of the 4 corners independently to match tapered or angled boundaries.'
        : 'Drag corner handles or edges directly on the grid, or enter Length (ft) & Width (ft) below.';
    }
  }

  function resizeCanvas() {
    if (!containerEl || !canvas) return;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    const rect = containerEl.getBoundingClientRect();
    const cssSize = Math.max(260, Math.floor(rect.width));
    dpr = window.devicePixelRatio || 1;
    canvas.width = cssSize * dpr;
    canvas.height = cssSize * dpr;
    canvas.style.width = cssSize + 'px';
    canvas.style.height = cssSize + 'px';

    marginPx = Math.max(40, Math.round(cssSize * 0.11));
    const drawable = cssSize - marginPx * 2;
    pxPerFt = drawable / worldSize;
    scheduleDraw();
  }

  function toCanvas(pt) {
    return {
      x: marginPx + pt.x * pxPerFt,
      y: marginPx + pt.y * pxPerFt
    };
  }

  function toWorld(px, py) {
    return {
      x: (px - marginPx) / pxPerFt,
      y: (py - marginPx) / pxPerFt
    };
  }

  function scheduleDraw() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      draw();
    });
  }

  function draw() {
    if (!ctx || !canvas) return;
    const cssW = canvas.width / dpr;
    const cssH = canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, cssW, cssH);

    const gridEndX = marginPx + worldSize * pxPerFt;
    const gridEndY = marginPx + worldSize * pxPerFt;

    // 1. Fixed Gridlines (Minor 5 ft, Major 10 ft)
    for (let x = 0; x <= worldSize; x += 5) {
      const cx = marginPx + x * pxPerFt;
      const isMajor = x % 10 === 0;
      ctx.beginPath();
      ctx.moveTo(cx, marginPx);
      ctx.lineTo(cx, gridEndY);
      ctx.strokeStyle = isMajor ? '#CBD5E1' : '#F1F5F9';
      ctx.lineWidth = isMajor ? 1 : 0.75;
      ctx.stroke();

      if (isMajor && cx < cssW - 44) {
        ctx.fillStyle = '#94A3B8';
        ctx.font = '9px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(x + "'", cx, marginPx - 4);
      }
    }

    for (let y = 0; y <= worldSize; y += 5) {
      const cy = marginPx + y * pxPerFt;
      const isMajor = y % 10 === 0;
      ctx.beginPath();
      ctx.moveTo(marginPx, cy);
      ctx.lineTo(gridEndX, cy);
      ctx.strokeStyle = isMajor ? '#CBD5E1' : '#F1F5F9';
      ctx.lineWidth = isMajor ? 1 : 0.75;
      ctx.stroke();

      if (isMajor) {
        ctx.fillStyle = '#94A3B8';
        ctx.font = '9px Inter, system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(y + "'", marginPx - 6, cy);
      }
    }

    // 2. Road Strip(s)
    drawRoadStrips(cssW, cssH, gridEndX, gridEndY);

    // 3. Plot Polygon
    const cVerts = vertices.map(toCanvas);
    ctx.beginPath();
    ctx.moveTo(cVerts[0].x, cVerts[0].y);
    for (let i = 1; i < cVerts.length; i++) ctx.lineTo(cVerts[i].x, cVerts[i].y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(37, 99, 235, 0.12)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#2563EB';
    ctx.stroke();

    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.08)';
    ctx.lineWidth = 1;
    for (let d = -cssH; d < cssW + cssH; d += 14) {
      ctx.beginPath();
      ctx.moveTo(d, 0);
      ctx.lineTo(d + cssH, cssH);
      ctx.stroke();
    }
    ctx.restore();

    // 4. Side-length labels (Width / Length labeled clearly in feet-inches)
    const center = cVerts.reduce((acc, p) => ({ x: acc.x + p.x / 4, y: acc.y + p.y / 4 }), { x: 0, y: 0 });
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const sideFt = dist(vertices[i], vertices[j]);
      const prefix = (i === 0 || i === 2) ? 'W: ' : 'L: ';
      const label = prefix + fmtFtIn(sideFt);

      const mx = (cVerts[i].x + cVerts[j].x) / 2;
      const my = (cVerts[i].y + cVerts[j].y) / 2;
      let angle = Math.atan2(cVerts[j].y - cVerts[i].y, cVerts[j].x - cVerts[i].x);

      let nx = Math.sin(angle);
      let ny = -Math.cos(angle);
      if (nx * (center.x - mx) + ny * (center.y - my) > 0) {
        nx = -nx;
        ny = -ny;
      }
      if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;

      const lx = mx + nx * 16;
      const ly = my + ny * 16;

      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(angle);
      ctx.font = 'bold 10.5px "Courier New", monospace';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.fillRect(-tw / 2 - 4, -8, tw + 8, 16);
      ctx.fillStyle = '#1E293B';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }

    // 5. Edge Midpoints & Corner Handles
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const mx = (cVerts[i].x + cVerts[j].x) / 2;
      const my = (cVerts[i].y + cVerts[j].y) / 2;
      const isEdgeHover = hoverHandle && hoverHandle.type === 'edge' && hoverHandle.index === i;
      ctx.beginPath();
      ctx.arc(mx, my, isEdgeHover ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = isEdgeHover ? '#1D4ED8' : '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#2563EB';
      ctx.stroke();
    }

    for (let i = 0; i < 4; i++) {
      const isCornerHover = hoverHandle && hoverHandle.type === 'corner' && hoverHandle.index === i;
      ctx.beginPath();
      ctx.arc(cVerts[i].x, cVerts[i].y, isCornerHover ? 9 : 7, 0, Math.PI * 2);
      ctx.fillStyle = isCornerHover ? '#1D4ED8' : '#2563EB';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();
    }

    // 6. North Compass
    drawNorthCompass(cssW - 22, 22);

    ctx.restore();
  }

  function drawRoadStrips(cssW, cssH, gridEndX, gridEndY) {
    const primary = formData.roadFacing || 'east';
    const band = Math.max(24, marginPx - 8);
    drawSingleRoad(primary, band, gridEndX, gridEndY, '30\'-0" WIDE ROAD (' + primary.toUpperCase() + ')');

    if (formData.cornerPlot) {
      const secMap = { east: 'south', west: 'south', north: 'east', south: 'east' };
      const sec = secMap[primary];
      drawSingleRoad(sec, band, gridEndX, gridEndY, '20\'-0" SIDE ROAD (' + sec.toUpperCase() + ')');
    }
  }

  function drawSingleRoad(side, band, gridEndX, gridEndY, label) {
    ctx.save();
    ctx.fillStyle = '#E2E8F0';
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 1.5;

    const drawCenteredText = (tx, ty, rot) => {
      ctx.save();
      ctx.translate(tx, ty);
      if (rot) ctx.rotate(rot);
      ctx.font = 'bold 9.5px "Courier New", monospace';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(-tw / 2 - 6, -7, tw + 12, 14);
      ctx.fillStyle = '#334155';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, 0);
      ctx.restore();
    };

    if (side === 'east') {
      const rx = gridEndX + 2;
      ctx.fillRect(rx, marginPx, band, gridEndY - marginPx);
      ctx.beginPath();
      ctx.setLineDash([8, 6]);
      ctx.moveTo(rx + band / 2, marginPx);
      ctx.lineTo(rx + band / 2, gridEndY);
      ctx.stroke();
      ctx.setLineDash([]);
      drawCenteredText(rx + band / 2, (marginPx + gridEndY) / 2, -Math.PI / 2);
    } else if (side === 'west') {
      const rx = Math.max(2, marginPx - band - 2);
      ctx.fillRect(rx, marginPx, band, gridEndY - marginPx);
      ctx.beginPath();
      ctx.setLineDash([8, 6]);
      ctx.moveTo(rx + band / 2, marginPx);
      ctx.lineTo(rx + band / 2, gridEndY);
      ctx.stroke();
      ctx.setLineDash([]);
      drawCenteredText(rx + band / 2, (marginPx + gridEndY) / 2, -Math.PI / 2);
    } else if (side === 'north') {
      const ry = Math.max(2, marginPx - band - 2);
      ctx.fillRect(marginPx, ry, gridEndX - marginPx, band);
      ctx.beginPath();
      ctx.setLineDash([8, 6]);
      ctx.moveTo(marginPx, ry + band / 2);
      ctx.lineTo(gridEndX, ry + band / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      drawCenteredText((marginPx + gridEndX) / 2, ry + band / 2, 0);
    } else {
      const ry = gridEndY + 2;
      ctx.fillRect(marginPx, ry, gridEndX - marginPx, band);
      ctx.beginPath();
      ctx.setLineDash([8, 6]);
      ctx.moveTo(marginPx, ry + band / 2);
      ctx.lineTo(gridEndX, ry + band / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      drawCenteredText((marginPx + gridEndX) / 2, ry + band / 2, 0);
    }

    ctx.restore();
  }

  function drawNorthCompass(cx, cy) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 15, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.fill();
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, cy - 11);
    ctx.lineTo(cx - 5, cy + 4);
    ctx.lineTo(cx, cy + 1);
    ctx.lineTo(cx + 5, cy + 4);
    ctx.closePath();
    ctx.fillStyle = '#1E293B';
    ctx.fill();

    ctx.fillStyle = '#2563EB';
    ctx.font = 'bold 9px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('N', cx, cy + 5);
    ctx.restore();
  }

  function hitTest(canvasX, canvasY) {
    const cVerts = vertices.map(toCanvas);
    const hitRadius = 18;
    for (let i = 0; i < 4; i++) {
      if (Math.hypot(canvasX - cVerts[i].x, canvasY - cVerts[i].y) <= hitRadius) {
        return { type: 'corner', index: i };
      }
    }
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const mx = (cVerts[i].x + cVerts[j].x) / 2;
      const my = (cVerts[i].y + cVerts[j].y) / 2;
      if (Math.hypot(canvasX - mx, canvasY - my) <= hitRadius) {
        return { type: 'edge', index: i };
      }
    }
    return null;
  }

  function getPointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function clampWorld(val) {
    return Math.max(2, Math.min(worldSize - 2, val));
  }

  function snapHalf(val) {
    return Math.round(val * 2) / 2;
  }

  function onPointerDown(e) {
    const pos = getPointerPos(e);
    const hit = hitTest(pos.x, pos.y);
    if (!hit) return;
    e.preventDefault();
    dragState = {
      type: hit.type,
      index: hit.index,
      startWorld: toWorld(pos.x, pos.y),
      origVerts: vertices.map(v => ({ ...v }))
    };
  }

  function onPointerMove(e) {
    const pos = getPointerPos(e);

    if (!dragState) {
      const hit = hitTest(pos.x, pos.y);
      hoverHandle = hit;
      if (canvas) canvas.style.cursor = hit ? 'grab' : 'default';
      scheduleDraw();
      return;
    }

    e.preventDefault();
    if (canvas) canvas.style.cursor = 'grabbing';

    const curW = toWorld(pos.x, pos.y);
    const dx = curW.x - dragState.startWorld.x;
    const dy = curW.y - dragState.startWorld.y;
    const orig = dragState.origVerts;
    const isRectMode = currentPreset !== 'irregular';

    if (dragState.type === 'corner') {
      const idx = dragState.index;
      if (isRectMode) {
        const opp = (idx + 2) % 4;
        let nx = snapHalf(clampWorld(orig[idx].x + dx));
        let ny = snapHalf(clampWorld(orig[idx].y + dy));

        if (idx === 0 || idx === 3) nx = Math.min(nx, orig[opp].x - MIN_SIDE_FT);
        else nx = Math.max(nx, orig[opp].x + MIN_SIDE_FT);
        if (idx === 0 || idx === 1) ny = Math.min(ny, orig[opp].y - MIN_SIDE_FT);
        else ny = Math.max(ny, orig[opp].y + MIN_SIDE_FT);

        if (idx === 0) {
          vertices[0] = { x: nx, y: ny };
          vertices[1].y = ny;
          vertices[3].x = nx;
        } else if (idx === 1) {
          vertices[1] = { x: nx, y: ny };
          vertices[0].y = ny;
          vertices[2].x = nx;
        } else if (idx === 2) {
          vertices[2] = { x: nx, y: ny };
          vertices[3].y = ny;
          vertices[1].x = nx;
        } else {
          vertices[3] = { x: nx, y: ny };
          vertices[2].y = ny;
          vertices[0].x = nx;
        }
      } else {
        const nx = snapHalf(clampWorld(orig[idx].x + dx));
        const ny = snapHalf(clampWorld(orig[idx].y + dy));
        const candidate = vertices.map((v, k) => (k === idx ? { x: nx, y: ny } : { ...v }));
        const prev = (idx + 3) % 4;
        const next = (idx + 1) % 4;
        if (dist(candidate[idx], candidate[prev]) >= MIN_SIDE_FT &&
            dist(candidate[idx], candidate[next]) >= MIN_SIDE_FT &&
            computeArea(candidate) >= 200) {
          vertices[idx] = { x: nx, y: ny };
        }
      }
    } else if (dragState.type === 'edge') {
      const edgeIdx = dragState.index;
      const a = edgeIdx;
      const b = (edgeIdx + 1) % 4;

      if (isRectMode) {
        if (edgeIdx === 0 || edgeIdx === 2) {
          let ny = snapHalf(clampWorld(orig[a].y + dy));
          const oppY = edgeIdx === 0 ? orig[3].y : orig[0].y;
          ny = edgeIdx === 0 ? Math.min(ny, oppY - MIN_SIDE_FT) : Math.max(ny, oppY + MIN_SIDE_FT);
          vertices[a].y = ny;
          vertices[b].y = ny;
        } else {
          let nx = snapHalf(clampWorld(orig[a].x + dx));
          const oppX = edgeIdx === 1 ? orig[0].x : orig[1].x;
          nx = edgeIdx === 1 ? Math.max(nx, oppX + MIN_SIDE_FT) : Math.min(nx, oppX - MIN_SIDE_FT);
          vertices[a].x = nx;
          vertices[b].x = nx;
        }
      } else {
        const nxA = snapHalf(clampWorld(orig[a].x + dx));
        const nyA = snapHalf(clampWorld(orig[a].y + dy));
        const nxB = snapHalf(clampWorld(orig[b].x + dx));
        const nyB = snapHalf(clampWorld(orig[b].y + dy));
        const candidate = vertices.map((v, k) => {
          if (k === a) return { x: nxA, y: nyA };
          if (k === b) return { x: nxB, y: nyB };
          return { ...v };
        });
        const okSides = [0, 1, 2, 3].every(k => dist(candidate[k], candidate[(k + 1) % 4]) >= MIN_SIDE_FT);
        if (okSides && computeArea(candidate) >= 200) {
          vertices[a] = { x: nxA, y: nyA };
          vertices[b] = { x: nxB, y: nyB };
        }
      }
    }

    syncInputsFromVertices(false);
    updateAreaMeter();
    scheduleDraw();
  }

  function onPointerUp() {
    if (dragState) {
      dragState = null;
      if (canvas) canvas.style.cursor = hoverHandle ? 'grab' : 'default';
    }
  }

  /**
   * Sync Length & Width inputs/sliders from polygon vertices.
   * When respectFocus is true, never overwrite the text box the user is currently typing in.
   */
  function syncInputsFromVertices(respectFocus) {
    const dims = getPlotDims(vertices);
    const lRounded = Math.round(dims.length * 2) / 2;
    const wRounded = Math.round(dims.width * 2) / 2;

    const lInput = document.getElementById('length-input');
    const wInput = document.getElementById('width-input');
    const lSlider = document.getElementById('length-slider');
    const wSlider = document.getElementById('width-slider');
    const lFtin = document.getElementById('length-ftin');
    const wFtin = document.getElementById('width-ftin');

    const maxAllowed = Math.max(40, worldSize - 4);
    if (lSlider) lSlider.max = maxAllowed;
    if (wSlider) wSlider.max = maxAllowed;

    if (lInput && (!respectFocus || document.activeElement !== lInput)) {
      lInput.value = lRounded.toFixed(1);
    }
    if (wInput && (!respectFocus || document.activeElement !== wInput)) {
      wInput.value = wRounded.toFixed(1);
    }
    if (lSlider) lSlider.value = lRounded;
    if (wSlider) wSlider.value = wRounded;
    if (lFtin) lFtin.textContent = '(' + fmtFtIn(dims.length) + ')';
    if (wFtin) wFtin.textContent = '(' + fmtFtIn(dims.width) + ')';
  }

  /**
   * Apply new Length & Width onto the polygon ONLY — never zoom or rescale the grid!
   */
  function applyDimensionsFromInputs(newLength, newWidth, fromTyping) {
    const maxDim = worldSize - 4;
    const l = Math.max(10, Math.min(maxDim, newLength));
    const w = Math.max(10, Math.min(maxDim, newWidth));

    if (currentPreset === 'irregular') {
      const dims = getPlotDims(vertices);
      const scaleX = dims.width > 0 ? w / dims.width : 1;
      const scaleY = dims.length > 0 ? l / dims.length : 1;
      const cx = vertices.reduce((s, v) => s + v.x, 0) / 4;
      const cy = vertices.reduce((s, v) => s + v.y, 0) / 4;
      vertices = vertices.map(v => ({
        x: cx + (v.x - cx) * scaleX,
        y: cy + (v.y - cy) * scaleY
      }));
    } else {
      const cx = worldSize / 2;
      const cy = worldSize / 2;
      vertices = [
        { x: cx - w / 2, y: cy - l / 2 },
        { x: cx + w / 2, y: cy - l / 2 },
        { x: cx + w / 2, y: cy + l / 2 },
        { x: cx - w / 2, y: cy + l / 2 }
      ];
    }

    clampPolygonInsideGrid();
    syncInputsFromVertices(Boolean(fromTyping));
    updateAreaMeter();
    scheduleDraw();
  }

  function updateAreaMeter() {
    const targetArea = formData.landAreaSqFt || 2178;
    const currentArea = computeArea(vertices);
    const diffRatio = (currentArea - targetArea) / targetArea;
    const absPct = Math.abs(diffRatio) * 100;
    const isMatched = absPct <= 2.0;

    const targetEl = document.getElementById('target-area');
    const targetCentsEl = document.getElementById('target-area-cents');
    const currentEl = document.getElementById('current-area');
    const currentCentsEl = document.getElementById('current-area-cents');
    const progressEl = document.getElementById('area-progress');
    const statusEl = document.getElementById('area-status');
    const diffTextEl = document.getElementById('area-diff-text');
    const btnStep3 = document.getElementById('btn-to-step3');

    if (targetEl) targetEl.textContent = Math.round(targetArea).toLocaleString('en-IN') + ' Sq.Ft';
    if (targetCentsEl) targetCentsEl.textContent = (targetArea / SQFT_PER_CENT).toFixed(2) + ' Cents';
    if (currentEl) currentEl.textContent = Math.round(currentArea).toLocaleString('en-IN') + ' Sq.Ft';
    if (currentCentsEl) currentCentsEl.textContent = (currentArea / SQFT_PER_CENT).toFixed(2) + ' Cents';

    const ratioPct = Math.min(100, Math.max(0, (currentArea / targetArea) * 100));
    if (progressEl) {
      progressEl.style.width = ratioPct.toFixed(1) + '%';
      progressEl.style.background = isMatched ? '#10B981' : absPct <= 10 ? '#F59E0B' : '#EF4444';
    }

    if (diffTextEl) {
      const sign = diffRatio >= 0 ? '+' : '-';
      diffTextEl.textContent = `Difference: ${sign}${absPct.toFixed(1)}% (Need within ±2% to generate plan)`;
    }

    if (statusEl) {
      statusEl.className = 'area-status';
      if (isMatched) {
        statusEl.classList.add('badge-success');
        statusEl.textContent = 'Area Matched!';
      } else if (absPct <= 10) {
        statusEl.classList.add('badge-warning');
        statusEl.textContent = diffRatio > 0 ? 'Slightly Large' : 'Close — Keep Adjusting';
      } else {
        statusEl.classList.add('badge-error');
        statusEl.textContent = diffRatio > 0 ? 'Too Large' : 'Too Small';
      }
    }

    if (btnStep3) btnStep3.disabled = !isMatched;
  }

  function autoFitToExactArea() {
    const targetArea = formData.landAreaSqFt || 2178;
    const currentArea = computeArea(vertices);
    if (currentArea <= 0) return;

    const scale = Math.sqrt(targetArea / currentArea);
    const cx = vertices.reduce((s, v) => s + v.x, 0) / 4;
    const cy = vertices.reduce((s, v) => s + v.y, 0) / 4;

    vertices = vertices.map(v => ({
      x: cx + (v.x - cx) * scale,
      y: cy + (v.y - cy) * scale
    }));

    clampPolygonInsideGrid();
    syncInputsFromVertices(false);
    updateAreaMeter();
    scheduleDraw();
  }

  function handleDimensionTextInput(changedAxis) {
    const lInput = document.getElementById('length-input');
    const wInput = document.getElementById('width-input');
    if (!lInput || !wInput) return;

    const raw = (changedAxis === 'length' ? lInput.value : wInput.value).trim();
    // Allow clearing field completely or typing partial decimals without fighting cursor
    if (raw === '' || raw.endsWith('.')) return;

    const parsed = parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed < 10) return;

    const dims = getPlotDims(vertices);
    const curL = Number.isFinite(parseFloat(lInput.value)) && parseFloat(lInput.value) >= 10
      ? parseFloat(lInput.value)
      : dims.length;
    const curW = Number.isFinite(parseFloat(wInput.value)) && parseFloat(wInput.value) >= 10
      ? parseFloat(wInput.value)
      : dims.width;

    applyDimensionsFromInputs(
      changedAxis === 'length' ? parsed : curL,
      changedAxis === 'width' ? parsed : curW,
      true
    );
  }

  function commitDimensionTextInput(changedAxis) {
    const lInput = document.getElementById('length-input');
    const wInput = document.getElementById('width-input');
    if (!lInput || !wInput) return;

    const dims = getPlotDims(vertices);
    const maxDim = worldSize - 4;

    const parseOrDefault = (val, fallback) => {
      const n = parseFloat(String(val).trim());
      if (!Number.isFinite(n)) return fallback;
      return Math.max(MIN_SIDE_FT, Math.min(maxDim, n));
    };

    const nextL = changedAxis === 'length' ? parseOrDefault(lInput.value, dims.length) : dims.length;
    const nextW = changedAxis === 'width' ? parseOrDefault(wInput.value, dims.width) : dims.width;
    applyDimensionsFromInputs(nextL, nextW, false);
    syncInputsFromVertices(false);
  }

  function bindEvents() {
    if (listenersBound) return;
    listenersBound = true;

    document.getElementById('preset-square')?.addEventListener('click', () => applyPreset('square'));
    document.getElementById('preset-rectangle')?.addEventListener('click', () => applyPreset('rectangle'));
    document.getElementById('preset-deep')?.addEventListener('click', () => applyPreset('deep'));
    document.getElementById('preset-irregular')?.addEventListener('click', () => applyPreset('irregular'));

    document.getElementById('btn-autofit')?.addEventListener('click', autoFitToExactArea);

    const lInput = document.getElementById('length-input');
    const wInput = document.getElementById('width-input');
    const lSlider = document.getElementById('length-slider');
    const wSlider = document.getElementById('width-slider');

    lInput?.addEventListener('input', () => handleDimensionTextInput('length'));
    wInput?.addEventListener('input', () => handleDimensionTextInput('width'));

    lInput?.addEventListener('blur', () => commitDimensionTextInput('length'));
    wInput?.addEventListener('blur', () => commitDimensionTextInput('width'));

    lInput?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        commitDimensionTextInput('length');
        lInput.blur();
      }
    });
    wInput?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        commitDimensionTextInput('width');
        wInput.blur();
      }
    });

    lSlider?.addEventListener('input', () => {
      const val = parseFloat(lSlider.value);
      const dims = getPlotDims(vertices);
      if (Number.isFinite(val)) applyDimensionsFromInputs(val, dims.width, false);
    });
    wSlider?.addEventListener('input', () => {
      const val = parseFloat(wSlider.value);
      const dims = getPlotDims(vertices);
      if (Number.isFinite(val)) applyDimensionsFromInputs(dims.length, val, false);
    });

    resizeHandler = () => resizeCanvas();
    window.addEventListener('resize', resizeHandler);
  }

  function bindCanvasEvents() {
    if (!canvas) return;
    canvas.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);

    canvas.addEventListener('touchstart', onPointerDown, { passive: false });
    window.addEventListener('touchmove', onPointerMove, { passive: false });
    window.addEventListener('touchend', onPointerUp);
  }

  function unbindCanvasEvents() {
    window.removeEventListener('mousemove', onPointerMove);
    window.removeEventListener('mouseup', onPointerUp);
    window.removeEventListener('touchmove', onPointerMove);
    window.removeEventListener('touchend', onPointerUp);
  }

  return {
    init(canvasContainerId, incomingFormData) {
      formData = incomingFormData;
      containerEl = document.getElementById(canvasContainerId);
      if (!containerEl) return;

      const targetChanged = lockedTargetArea === null || Math.abs(lockedTargetArea - formData.landAreaSqFt) > 1;
      if (targetChanged) {
        lockedTargetArea = formData.landAreaSqFt;
        lockWorkspaceGrid(lockedTargetArea);
      }

      if (!canvas) {
        containerEl.innerHTML = '';
        canvas = document.createElement('canvas');
        containerEl.appendChild(canvas);
        ctx = canvas.getContext('2d');
        bindCanvasEvents();
      }

      bindEvents();

      if (targetChanged || vertices.length !== 4) {
        applyPreset(currentPreset);
      } else {
        updatePresetUI();
        syncInputsFromVertices(false);
        updateAreaMeter();
      }

      resizeCanvas();
    },

    getPlotData() {
      const dims = getPlotDims(vertices);
      const minX = Math.min(...vertices.map(v => v.x));
      const minY = Math.min(...vertices.map(v => v.y));
      const normVerts = vertices.map(v => ({
        x: Math.round((v.x - minX) * 100) / 100,
        y: Math.round((v.y - minY) * 100) / 100
      }));

      return {
        vertices: normVerts,
        width: Math.round(dims.width * 100) / 100,
        length: Math.round(dims.length * 100) / 100,
        depth: Math.round(dims.length * 100) / 100,
        area: Math.round(computeArea(normVerts) * 100) / 100,
        targetArea: formData.landAreaSqFt,
        isIrregular: checkIsIrregular(normVerts)
      };
    },

    destroy() {
      unbindCanvasEvents();
      if (resizeHandler) window.removeEventListener('resize', resizeHandler);
      if (rafId) cancelAnimationFrame(rafId);
      canvas = null;
      ctx = null;
      listenersBound = false;
    }
  };
})();
