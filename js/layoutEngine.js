/**
 * HomeBrief — Parametric Architectural Layout Engine (Step 3)
 * Five distinct architectural layout builders (Independent House, Duplex House,
 * Luxury Villa, Commercial + Residential, Rental Apartments) with Option A & Option B.
 *
 * Enforces strict core dimensions:
 *  - Bathrooms / Common Toilets: 4'-6" x 7'-0" to 5'-6" x 8'-0"
 *  - Utility / Wash: 4'-6" to 6'-0" deep
 *  - Dog-leg Staircase: 7'-6" x 12'-0" to 8'-0" x 14'-0", vertically aligned across floors
 *  - Hallway / Passage: 3'-6" to 4'-6" wide
 */
window.HomeBrief = window.HomeBrief || {};

window.HomeBrief.LayoutEngine = (function () {
  'use strict';

  const SQFT_PER_CENT = 435.6;

  function roundHalf(v) {
    return Math.round(v * 2) / 2;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  /**
   * Shared single source of truth for space efficiency metrics across
   * Plan Summary bar, Sidebar Cards, Cost Estimate, and PDF Brief.
   */
  function computeSpaceMetrics(formData, plotData, layoutData) {
    const plotSqFt = Math.round(plotData.area || formData.landAreaSqFt || 0);
    const plotCents = (plotSqFt / SQFT_PER_CENT).toFixed(2);
    const builtUpSqFt = Math.round(layoutData.totalBuiltUpArea || 0);
    const carpetSqFt = Math.round(builtUpSqFt * 0.77);
    const groundFootprint = layoutData.groundFootprintArea || (layoutData.buildableEnvelope.width * layoutData.buildableEnvelope.height);
    const openSqFt = Math.max(0, Math.round(plotSqFt - groundFootprint));
    const openPct = plotSqFt > 0 ? Math.round((openSqFt / plotSqFt) * 100) : 0;

    return {
      plotSqFt,
      plotCents,
      builtUpSqFt,
      carpetSqFt,
      openSqFt,
      openPct
    };
  }

  function pointInPoly(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > py) !== (yj > py)) &&
        (px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function minDistToEdges(px, py, poly) {
    let minD = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      let t = len2 > 0 ? ((px - a.x) * dx + (py - a.y) * dy) / len2 : 0;
      t = clamp(t, 0, 1);
      minD = Math.min(minD, Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy)));
    }
    return minD;
  }

  function computeSetbacks(formData, plotData) {
    const isCompact = plotData.area < 1306.8; // < 3 cents
    const isVilla = formData.buildingType === 'villa';
    const isComm = formData.buildingType === 'commercial_residential';

    let front = isVilla ? 7.5 : isComm ? 4.5 : 5.5;
    let rear = isVilla ? 4.5 : 3.5;
    let left = isVilla ? 4.0 : 3.0;
    let right = isVilla ? 4.0 : 3.0;

    if (isCompact) {
      front = Math.max(3, front - 2);
      rear = Math.max(2, rear - 1.5);
      left = Math.max(2, left - 1);
      right = Math.max(2, right - 1);
    }

    if (formData.cornerPlot) {
      right = Math.max(right, 4.0);
    }

    return {
      front: roundHalf(front),
      rear: roundHalf(rear),
      left: roundHalf(left),
      right: roundHalf(right)
    };
  }

  function computeBuildableEnvelope(plotData, setbacks, roadFacing) {
    const verts = plotData.vertices;
    const minX = Math.min(...verts.map(v => v.x));
    const maxX = Math.max(...verts.map(v => v.x));
    const minY = Math.min(...verts.map(v => v.y));
    const maxY = Math.max(...verts.map(v => v.y));

    let padTop, padBottom, padLeft, padRight;
    if (roadFacing === 'south') {
      padBottom = setbacks.front; padTop = setbacks.rear; padLeft = setbacks.left; padRight = setbacks.right;
    } else if (roadFacing === 'north') {
      padTop = setbacks.front; padBottom = setbacks.rear; padLeft = setbacks.left; padRight = setbacks.right;
    } else if (roadFacing === 'east') {
      padRight = setbacks.front; padLeft = setbacks.rear; padTop = setbacks.left; padBottom = setbacks.right;
    } else {
      padLeft = setbacks.front; padRight = setbacks.rear; padTop = setbacks.left; padBottom = setbacks.right;
    }

    if (!plotData.isIrregular) {
      return {
        x: roundHalf(minX + padLeft),
        y: roundHalf(minY + padTop),
        width: Math.max(18, roundHalf((maxX - minX) - padLeft - padRight)),
        height: Math.max(20, roundHalf((maxY - minY) - padTop - padBottom))
      };
    }

    const minPad = Math.min(padTop, padBottom, padLeft, padRight);
    let bestRect = null;
    let bestArea = -1;

    for (let y1 = minY + padTop; y1 < maxY - padBottom - 16; y1 += 1) {
      for (let x1 = minX + padLeft; x1 < maxX - padRight - 16; x1 += 1) {
        if (!pointInPoly(x1, y1, verts)) continue;
        for (let y2 = y1 + 18; y2 <= maxY - padBottom; y2 += 1) {
          if (!pointInPoly(x1, y2, verts)) break;
          for (let x2 = x1 + 18; x2 <= maxX - padRight; x2 += 1) {
            if (!pointInPoly(x2, y1, verts) || !pointInPoly(x2, y2, verts)) break;
            const ok =
              minDistToEdges(x1, y1, verts) >= minPad * 0.8 &&
              minDistToEdges(x2, y1, verts) >= minPad * 0.8 &&
              minDistToEdges(x2, y2, verts) >= minPad * 0.8 &&
              minDistToEdges(x1, y2, verts) >= minPad * 0.8;
            if (!ok) continue;
            const area = (x2 - x1) * (y2 - y1);
            if (area > bestArea) {
              bestArea = area;
              bestRect = {
                x: roundHalf(x1),
                y: roundHalf(y1),
                width: roundHalf(x2 - x1),
                height: roundHalf(y2 - y1)
              };
            }
          }
        }
      }
    }

    return bestRect || {
      x: roundHalf(minX + padLeft + 2),
      y: roundHalf(minY + padTop + 2),
      width: Math.max(18, roundHalf((maxX - minX) - padLeft - padRight - 4)),
      height: Math.max(20, roundHalf((maxY - minY) - padTop - padBottom - 4))
    };
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * Orientation Helpers: Canonical Frame (Road = South / Bottom: v = H) -> Plot
   * ─────────────────────────────────────────────────────────────────────────── */
  function getCanonicalDims(env, roadFacing) {
    if (roadFacing === 'east' || roadFacing === 'west') {
      return { W: env.height, H: env.width };
    }
    return { W: env.width, H: env.height };
  }

  function mapWallDir(dir, roadFacing) {
    if (roadFacing === 'south') return dir;
    if (roadFacing === 'north') {
      return { north: 'south', south: 'north', east: 'east', west: 'west' }[dir] || dir;
    }
    if (roadFacing === 'east') {
      return { south: 'east', north: 'west', west: 'north', east: 'south' }[dir] || dir;
    }
    return { south: 'west', north: 'east', west: 'north', east: 'south' }[dir] || dir;
  }

  function mapRect(u, v, rw, rh, env, W, H, roadFacing) {
    if (roadFacing === 'south') {
      return { x: roundHalf(env.x + u), y: roundHalf(env.y + v), width: roundHalf(rw), height: roundHalf(rh) };
    }
    if (roadFacing === 'north') {
      return { x: roundHalf(env.x + u), y: roundHalf(env.y + (H - v - rh)), width: roundHalf(rw), height: roundHalf(rh) };
    }
    if (roadFacing === 'east') {
      return { x: roundHalf(env.x + v), y: roundHalf(env.y + u), width: roundHalf(rh), height: roundHalf(rw) };
    }
    return { x: roundHalf(env.x + (H - v - rh)), y: roundHalf(env.y + u), width: roundHalf(rh), height: roundHalf(rw) };
  }

  function mapPoint(u, v, env, W, H, roadFacing) {
    if (roadFacing === 'south') return { x: roundHalf(env.x + u), y: roundHalf(env.y + v) };
    if (roadFacing === 'north') return { x: roundHalf(env.x + u), y: roundHalf(env.y + (H - v)) };
    if (roadFacing === 'east') return { x: roundHalf(env.x + v), y: roundHalf(env.y + u) };
    return { x: roundHalf(env.x + (H - v)), y: roundHalf(env.y + u) };
  }

  function transformFloor(canFloor, env, W, H, roadFacing) {
    const mappedRooms = canFloor.rooms.map(r => {
      const rect = mapRect(r.x, r.y, r.width, r.height, env, W, H, roadFacing);

      const doors = (r.doors || []).map(d => {
        const ptA = mapPoint(d.x, d.y, env, W, H, roadFacing);
        const ptB = (d.wall === 'north' || d.wall === 'south')
          ? mapPoint(d.x + d.width, d.y, env, W, H, roadFacing)
          : mapPoint(d.x, d.y + d.width, env, W, H, roadFacing);
        return {
          x: Math.min(ptA.x, ptB.x),
          y: Math.min(ptA.y, ptB.y),
          wall: mapWallDir(d.wall, roadFacing),
          width: d.width,
          type: d.type,
          swingDir: d.swingDir
        };
      });

      const windows = (r.windows || []).map(w => {
        const ptA = mapPoint(w.x, w.y, env, W, H, roadFacing);
        const ptB = (w.wall === 'north' || w.wall === 'south')
          ? mapPoint(w.x + w.width, w.y, env, W, H, roadFacing)
          : mapPoint(w.x, w.y + w.width, env, W, H, roadFacing);
        return {
          x: Math.min(ptA.x, ptB.x),
          y: Math.min(ptA.y, ptB.y),
          wall: mapWallDir(w.wall, roadFacing),
          width: w.width,
          type: w.type
        };
      });

      const furniture = (r.furniture || []).map(f => {
        const fRect = mapRect(r.x + f.x, r.y + f.y, f.width, f.height, env, W, H, roadFacing);
        return {
          type: f.type,
          x: roundHalf(fRect.x - rect.x),
          y: roundHalf(fRect.y - rect.y),
          width: fRect.width,
          height: fRect.height,
          orient: mapWallDir(f.orient || 'south', roadFacing)
        };
      });

      return {
        id: r.id,
        name: r.name,
        type: r.type,
        openEdge: r.openEdge ? mapWallDir(r.openEdge, roadFacing) : null,
        shutterEdge: r.shutterEdge ? mapWallDir(r.shutterEdge, roadFacing) : null,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        doors,
        windows,
        furniture
      };
    });

    let mappedStairs = null;
    if (canFloor.stairs) {
      const s = canFloor.stairs;
      const sRect = mapRect(s.x, s.y, s.width, s.height, env, W, H, roadFacing);
      mappedStairs = {
        x: sRect.x,
        y: sRect.y,
        width: sRect.width,
        height: sRect.height,
        direction: s.direction
      };
    }

    return {
      name: canFloor.name,
      rooms: mappedRooms,
      stairs: mappedStairs,
      totalBuiltUpArea: canFloor.totalBuiltUpArea
    };
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * Shared Room / Door / Window / Furniture Primitives
   * ─────────────────────────────────────────────────────────────────────────── */
  function makeRoom(id, name, type, x, y, width, height, extra = {}) {
    return {
      id,
      name,
      type,
      openEdge: extra.openEdge || null,
      shutterEdge: extra.shutterEdge || null,
      x: roundHalf(x),
      y: roundHalf(y),
      width: Math.max(3.5, roundHalf(width)),
      height: Math.max(3.5, roundHalf(height)),
      doors: [],
      windows: [],
      furniture: []
    };
  }

  /**
   * Place a door strictly on the shared wall between roomA and roomB.
   * Swings inward into targetRoom (the room being entered).
   */
  function connectRooms(roomA, roomB, targetRoom, doorType = 'single') {
    if (!roomA || !roomB) return false;
    const target = targetRoom || roomB;
    const EPS = 0.25;
    const desiredW = doorType === 'double' ? 4.0 : (target.type === 'bathroom' || target.type === 'toilet' ? 2.5 : 3.0);

    // Horizontal shared wall
    if (Math.abs((roomA.y + roomA.height) - roomB.y) < EPS || Math.abs((roomB.y + roomB.height) - roomA.y) < EPS) {
      const start = Math.max(roomA.x, roomB.x);
      const end = Math.min(roomA.x + roomA.width, roomB.x + roomB.width);
      const overlap = end - start;
      const dw = Math.min(desiredW, overlap - 0.6);
      if (dw < 2.2) return false;
      const wallY = Math.abs((roomA.y + roomA.height) - roomB.y) < EPS ? roomA.y + roomA.height : roomB.y + roomB.height;
      const wallDir = Math.abs((target.y + target.height) - wallY) < EPS ? 'south' : 'north';
      const dx = roundHalf(start + (overlap - dw) / 2);
      if (hasDoorCollision(target, wallDir, dx, dw)) return false;
      target.doors.push({ x: dx, y: roundHalf(wallY), wall: wallDir, width: roundHalf(dw), type: doorType, swingDir: 'in' });
      return true;
    }

    // Vertical shared wall
    if (Math.abs((roomA.x + roomA.width) - roomB.x) < EPS || Math.abs((roomB.x + roomB.width) - roomA.x) < EPS) {
      const start = Math.max(roomA.y, roomB.y);
      const end = Math.min(roomA.y + roomA.height, roomB.y + roomB.height);
      const overlap = end - start;
      const dw = Math.min(desiredW, overlap - 0.6);
      if (dw < 2.2) return false;
      const wallX = Math.abs((roomA.x + roomA.width) - roomB.x) < EPS ? roomA.x + roomA.width : roomB.x + roomB.width;
      const wallDir = Math.abs((target.x + target.width) - wallX) < EPS ? 'east' : 'west';
      const dy = roundHalf(start + (overlap - dw) / 2);
      if (hasDoorCollision(target, wallDir, dy, dw)) return false;
      target.doors.push({ x: roundHalf(wallX), y: dy, wall: wallDir, width: roundHalf(dw), type: doorType, swingDir: 'in' });
      return true;
    }

    return false;
  }

  function addExteriorEntryDoor(room, wallDir, doorType = 'double') {
    if (!room) return;
    const dw = doorType === 'double' ? Math.min(4.0, room.width - 1.5) : 3.0;
    if (dw < 2.5) return;
    if (wallDir === 'south' || wallDir === 'north') {
      const y = wallDir === 'south' ? room.y + room.height : room.y;
      const x = roundHalf(room.x + (room.width - dw) / 2);
      if (!hasDoorCollision(room, wallDir, x, dw)) {
        room.doors.push({ x, y: roundHalf(y), wall: wallDir, width: roundHalf(dw), type: doorType, swingDir: 'in' });
      }
    } else {
      const x = wallDir === 'east' ? room.x + room.width : room.x;
      const y = roundHalf(room.y + (room.height - dw) / 2);
      if (!hasDoorCollision(room, wallDir, y, dw)) {
        room.doors.push({ x: roundHalf(x), y, wall: wallDir, width: roundHalf(dw), type: doorType, swingDir: 'in' });
      }
    }
  }

  function hasDoorCollision(room, wallDir, pos, width) {
    return room.doors.some(d => {
      if (d.wall !== wallDir) return false;
      const dPos = (wallDir === 'north' || wallDir === 'south') ? d.x : d.y;
      return pos < dPos + d.width + 0.8 && pos + width + 0.8 > dPos;
    });
  }

  /**
   * Place windows strictly on exterior walls facing setbacks/road (never party walls).
   */
  function assignWindows(rooms, W, H) {
    const EPS = 0.25;
    rooms.forEach(r => {
      if (r.type === 'porch' || r.type === 'balcony' || r.type === 'passage') return;

      const onNorth = Math.abs(r.y) < EPS;
      const onSouth = Math.abs(r.y + r.height - H) < EPS;
      const onWest = Math.abs(r.x) < EPS;
      const onEast = Math.abs(r.x + r.width - W) < EPS;

      const isBath = r.type === 'bathroom' || r.type === 'toilet';
      const isUtility = r.type === 'utility' || r.type === 'wardrobe';
      if (r.type === 'wardrobe') return;

      const winType = isBath ? 'ventilator' : 'window';
      const winW = isBath ? 2.0 : isUtility ? 2.5 : (r.type === 'living' || r.type === 'shop' ? 4.5 : 3.5);

      const tryWall = (wallDir) => {
        if (r.shutterEdge === wallDir || r.openEdge === wallDir) return;
        const span = (wallDir === 'north' || wallDir === 'south') ? r.width : r.height;
        if (span < winW + 1.5) return;
        const offset = roundHalf((span - winW) / 2);
        const wx = wallDir === 'west' ? r.x : wallDir === 'east' ? r.x + r.width : roundHalf(r.x + offset);
        const wy = wallDir === 'north' ? r.y : wallDir === 'south' ? r.y + r.height : roundHalf(r.y + offset);

        const collidesDoor = r.doors.some(d => {
          if (d.wall !== wallDir) return false;
          const dPos = (wallDir === 'north' || wallDir === 'south') ? d.x : d.y;
          const wPos = (wallDir === 'north' || wallDir === 'south') ? wx : wy;
          return wPos < dPos + d.width + 0.8 && wPos + winW + 0.8 > dPos;
        });

        if (!collidesDoor) {
          r.windows.push({ x: wx, y: wy, wall: wallDir, width: winW, type: winType });
        }
      };

      if (onNorth) tryWall('north');
      if (onSouth) tryWall('south');
      if (onEast) tryWall('east');
      if (onWest) tryWall('west');
    });
  }

  /**
   * Proportional minimalist furniture blocks scaled to room dimensions.
   * Skips optional items in compact rooms so furniture never overlaps walls, doors, or labels.
   */
  function assignFurniture(rooms, formData) {
    rooms.forEach(r => {
      const rw = r.width;
      const rh = r.height;
      const items = [];

      if (r.type === 'master_bed' || r.type === 'bedroom') {
        const bedW = r.type === 'master_bed' ? Math.min(6.0, rw - 3.5) : Math.min(5.0, rw - 3.0);
        const bedH = Math.min(6.5, rh - 3.2);
        if (bedW >= 4.0 && bedH >= 5.5) {
          const bx = roundHalf((rw - bedW) / 2);
          const by = 0.7;
          items.push({ type: 'bed', x: bx, y: by, width: bedW, height: bedH });
          if (bx >= 2.0) {
            items.push({ type: 'sidetable', x: roundHalf(bx - 1.7), y: by, width: 1.4, height: 1.4 });
            items.push({ type: 'sidetable', x: roundHalf(bx + bedW + 0.3), y: by, width: 1.4, height: 1.4 });
          }
          if (rh >= bedH + 4.0 && rw >= 9.0) {
            items.push({ type: 'wardrobe', x: 0.6, y: roundHalf(rh - 2.1), width: Math.min(5.5, rw - 2.0), height: 1.6 });
          }
        }
      } else if (r.type === 'living') {
        if (rw >= 9.5 && rh >= 9.5) {
          const sofaW = Math.min(7.5, rw - 3.0);
          items.push({ type: 'sofa', x: 1.0, y: 1.0, width: sofaW, height: 2.8 });
          if (rh >= 11.0) {
            items.push({ type: 'coffeetable', x: 2.0, y: 4.5, width: Math.min(3.8, sofaW - 1.5), height: 1.8 });
            items.push({ type: 'tv_unit', x: roundHalf((rw - Math.min(4.5, rw - 4)) / 2), y: roundHalf(rh - 1.5), width: Math.min(4.5, rw - 4), height: 1.0 });
          }
        }
      } else if (r.type === 'dining') {
        if (rw >= 7.5 && rh >= 7.5) {
          const tw = Math.min(4.8, rw - 3.2);
          const th = Math.min(3.2, rh - 3.2);
          items.push({ type: 'dining_table', x: roundHalf((rw - tw) / 2), y: roundHalf((rh - th) / 2), width: tw, height: th });
        }
      } else if (r.type === 'kitchen') {
        if (rw >= 6.5 && rh >= 6.5) {
          items.push({ type: 'kitchen_counter', x: 0.4, y: 0.4, width: roundHalf(rw - 0.8), height: 2.0 });
          items.push({ type: 'sink', x: 0.8, y: 0.6, width: 1.6, height: 1.4 });
          items.push({ type: 'hob', x: roundHalf(rw - 3.0), y: 0.6, width: 2.2, height: 1.4 });
        }
      } else if (r.type === 'bathroom' || r.type === 'toilet') {
        if (rw >= 4.2 && rh >= 6.0) {
          items.push({ type: 'wc', x: 0.5, y: 0.5, width: 1.4, height: 1.9 });
          items.push({ type: 'washbasin', x: roundHalf(rw - 2.0), y: 0.5, width: 1.4, height: 1.3 });
          items.push({ type: 'shower', x: 0.5, y: roundHalf(rh - 3.0), width: Math.min(2.6, rw - 1.2), height: 2.4 });
        }
      } else if (r.type === 'porch') {
        if (formData.parking !== 'bikes' && rw >= 8.5 && rh >= 11.5) {
          const carW = 5.8;
          const carH = Math.min(13.5, rh - 2.0);
          if (formData.parking === '2cars' && rw >= 15.5) {
            items.push({ type: 'car', x: roundHalf(rw * 0.25 - carW / 2), y: roundHalf((rh - carH) / 2), width: carW, height: carH });
            items.push({ type: 'car', x: roundHalf(rw * 0.75 - carW / 2), y: roundHalf((rh - carH) / 2), width: carW, height: carH });
          } else {
            items.push({ type: 'car', x: roundHalf((rw - carW) / 2), y: roundHalf((rh - carH) / 2), width: carW, height: carH });
          }
        }
      } else if (r.type === 'shop' || r.type === 'office') {
        if (rw >= 7.5 && rh >= 7.5) {
          const dw = Math.min(5.0, rw - 2.5);
          items.push({ type: 'desk', x: roundHalf((rw - dw) / 2), y: 1.6, width: dw, height: 2.2 });
        }
      } else if (r.type === 'wardrobe') {
        if (rw >= 4.0 && rh >= 4.0) {
          items.push({ type: 'wardrobe', x: 0.4, y: 0.4, width: roundHalf(rw - 0.8), height: 1.6 });
        }
      }

      r.furniture = items;
    });
  }

  /**
   * Helper: Carve a bedroom + locked attached bathroom (<= 5.5' x 8.0') cleanly
   * along an exterior corner, filling any leftover strip with wardrobe/study/alcove.
   */
  function addBedroomWithLockedBath(rooms, idPrefix, bedLabel, x, y, totalW, totalH, bathOnRight, includeWardrobe) {
    const bathW = clamp(roundHalf(totalW * 0.30), 4.5, 5.5);
    const bathH = clamp(roundHalf(totalH * 0.62), 7.0, 8.0);
    const bedW = roundHalf(totalW - bathW);

    if (bedW < 8.5) {
      // Too narrow to carve side bath: place bedroom across width
      const bed = makeRoom(idPrefix + '_bed', bedLabel, idPrefix.includes('master') ? 'master_bed' : 'bedroom', x, y, totalW, totalH);
      rooms.push(bed);
      return { bed, bath: null, extra: null };
    }

    const bedX = bathOnRight ? x : x + bathW;
    const bathX = bathOnRight ? x + bedW : x;

    const bed = makeRoom(idPrefix + '_bed', bedLabel, idPrefix.includes('master') ? 'master_bed' : 'bedroom', bedX, y, bedW, totalH);
    const bath = makeRoom(idPrefix + '_bath', 'ATTACHED BATH', 'bathroom', bathX, y, bathW, bathH);
    rooms.push(bed, bath);

    const remH = roundHalf(totalH - bathH);
    let extra = null;
    if (remH >= 3.5) {
      extra = makeRoom(
        idPrefix + '_extra',
        includeWardrobe ? 'WALK-IN WARDROBE' : 'DRESSING',
        'wardrobe',
        bathX,
        y + bathH,
        bathW,
        remH
      );
      rooms.push(extra);
      connectRooms(bed, extra, extra);
      connectRooms(extra, bath, bath);
    } else {
      // Stretch bed if needed or connect directly
      connectRooms(bed, bath, bath);
    }

    return { bed, bath, extra };
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * BUILDER 1: INDEPENDENT HOUSE
   * Option A: Open Living-Dining | Option B: Formal Living + Private Dining
   * ─────────────────────────────────────────────────────────────────────────── */
  function buildIndependentHouse(formData, W, H, isOptionB) {
    const floorCount = formData.floors === 'G+2' ? 3 : formData.floors === 'G+1' ? 2 : 1;
    const isMulti = floorCount > 1;
    const config = formData.config || '3BHK';

    // Locked core dimensions
    const stairW = isMulti ? clamp(roundHalf(W * 0.24), 7.5, 8.0) : 0;
    const stairH = isMulti ? clamp(roundHalf(H * 0.30), 12.0, 13.5) : 0;
    const stairX = isMulti ? roundHalf(W - stairW) : 0;

    const hFront = roundHalf(clamp(H * 0.34, 12.0, 15.0));
    const hRear = roundHalf(clamp(H * 0.34, 10.5, 14.0));
    const hMid = roundHalf(H - hFront - hRear);
    const stairY = isMulti ? roundHalf(Math.max(hRear, hRear + (hMid - stairH) / 2)) : hRear;

    const porchW = formData.parking === '2cars'
      ? clamp(roundHalf(W * 0.46), 14.0, 18.0)
      : formData.parking === '1car'
        ? clamp(roundHalf(W * 0.34), 9.5, 12.5)
        : clamp(roundHalf(W * 0.24), 6.0, 8.0);

    const floors = [];
    const names = ['Ground Floor', 'First Floor', 'Second Floor'];

    for (let f = 0; f < floorCount; f++) {
      const rooms = [];
      let stairsObj = null;

      if (f === 0) {
        // FRONT ZONE: Car Porch (open driveway) + Living / Drawing Room
        const porch = makeRoom('gf_porch', formData.parking === 'bikes' ? 'BIKE PORCH' : 'CAR PORCH', 'porch', 0, hRear + hMid, porchW, hFront, { openEdge: 'south' });
        rooms.push(porch);

        const livW = roundHalf(W - porchW);
        let foyer = null;
        let living = null;
        if (isOptionB && livW >= 16) {
          const foyerW = clamp(roundHalf(livW * 0.30), 5.5, 7.5);
          foyer = makeRoom('gf_foyer', 'ENTRY FOYER', 'foyer', porchW, hRear + hMid, foyerW, hFront);
          living = makeRoom('gf_living', 'FORMAL LIVING', 'living', porchW + foyerW, hRear + hMid, roundHalf(livW - foyerW), hFront);
          rooms.push(foyer, living);
          addExteriorEntryDoor(foyer, 'south', 'double');
          connectRooms(porch, foyer, foyer);
          connectRooms(foyer, living, living);
        } else {
          living = makeRoom('gf_living', isOptionB ? 'FORMAL DRAWING' : 'LIVING HALL', 'living', porchW, hRear + hMid, livW, hFront);
          rooms.push(living);
          addExteriorEntryDoor(living, 'south', 'double');
          connectRooms(porch, living, living);
        }

        // MIDDLE SERVICE ZONE
        // Left: Kitchen + Utility (4.5-6 ft deep along exterior west wall!)
        const utilD = clamp(roundHalf(hMid * 0.36), 4.5, 6.0);
        const kitW = clamp(roundHalf(W * 0.28), 8.0, 10.5);
        const kitH = roundHalf(hMid - utilD);
        const utility = makeRoom('gf_utility', 'UTILITY / WASH', 'utility', 0, hRear, kitW, utilD);
        const kitchen = makeRoom('gf_kitchen', 'KITCHEN', 'kitchen', 0, hRear + utilD, kitW, kitH);
        rooms.push(utility, kitchen);
        connectRooms(kitchen, utility, utility);

        // Central Dining + Passage + Common Toilet + Staircase (if multi-floor)
        const toiletW = clamp(roundHalf(W * 0.16), 4.5, 5.5);
        const toiletH = clamp(roundHalf(hMid * 0.62), 7.0, 8.0);
        const passageW = clamp(roundHalf(W * 0.12), 3.5, 4.5);

        const rightEdge = isMulti ? stairX : W;
        const midFreeW = roundHalf(rightEdge - kitW);

        let dining = null;
        let passage = null;
        let cToilet = null;

        if (isMulti) {
          const stairRoom = makeRoom('gf_stair', 'STAIRCASE', 'staircase', stairX, hRear, stairW, hMid);
          stairsObj = { x: stairX, y: stairY, width: stairW, height: Math.min(stairH, hMid), direction: 'up' };
          rooms.push(stairRoom);

          // Split midFreeW into Dining (south/east) + Passage & Common Toilet (north/west)
          const dinW = roundHalf(Math.max(8.0, midFreeW - toiletW));
          const pasH = roundHalf(hMid - toiletH);
          dining = makeRoom('gf_dining', isOptionB ? 'PRIVATE DINING' : 'OPEN DINING', 'dining', kitW, hRear, dinW, hMid);
          cToilet = makeRoom('gf_ctoilet', 'COMMON TOILET', 'toilet', kitW + dinW, hRear, toiletW, toiletH);
          rooms.push(dining, cToilet);

          if (pasH >= 3.5) {
            passage = makeRoom('gf_passage', 'PASSAGE', 'passage', kitW + dinW, hRear + toiletH, toiletW, pasH);
            rooms.push(passage);
            connectRooms(dining, passage, passage);
            connectRooms(passage, cToilet, cToilet);
            connectRooms(passage, stairRoom, stairRoom);
          } else {
            connectRooms(dining, cToilet, cToilet);
          }
          connectRooms(dining, stairRoom, stairRoom);
        } else {
          // Single floor: Common toilet on East exterior wall + Dining + Passage
          const dinW = roundHalf(midFreeW - toiletW);
          const pasH = roundHalf(hMid - toiletH);
          dining = makeRoom('gf_dining', isOptionB ? 'PRIVATE DINING' : 'OPEN DINING', 'dining', kitW, hRear, dinW, hMid);
          cToilet = makeRoom('gf_ctoilet', 'COMMON TOILET', 'toilet', kitW + dinW, hRear, toiletW, toiletH);
          rooms.push(dining, cToilet);
          if (pasH >= 3.5) {
            passage = makeRoom('gf_passage', 'PASSAGE', 'passage', kitW + dinW, hRear + toiletH, toiletW, pasH);
            rooms.push(passage);
            connectRooms(dining, passage, passage);
            connectRooms(passage, cToilet, cToilet);
          } else {
            connectRooms(dining, cToilet, cToilet);
          }
        }

        // Connect Living/Foyer <-> Dining, and Dining <-> Kitchen
        if (foyer) connectRooms(foyer, dining, dining);
        connectRooms(living, dining, isOptionB ? dining : null);
        if (isOptionB) {
          connectRooms(dining, kitchen, kitchen);
        } else {
          // Open Concept: direct wide passage/doorway between Kitchen & Dining
          connectRooms(dining, kitchen, kitchen);
        }

        // REAR PRIVATE ZONE
        if (floorCount === 1) {
          const leftW = roundHalf(W * 0.54);
          const rightW = roundHalf(W - leftW);
          const mRes = addBedroomWithLockedBath(rooms, 'gf_master', 'MASTER BEDROOM', 0, 0, leftW, hRear, true, false);
          const b2 = makeRoom('gf_bed2', config === '3BHK' || config === '4BHK' ? 'BEDROOM 2 & 3' : 'BEDROOM 2', 'bedroom', leftW, 0, rightW, hRear);
          rooms.push(b2);
          connectRooms(dining, mRes.bed, mRes.bed);
          connectRooms(dining, b2, b2);
          if (passage) connectRooms(passage, b2, b2);
        } else {
          const leftW = roundHalf(W * 0.62);
          const rightW = roundHalf(W - leftW);
          const mRes = addBedroomWithLockedBath(rooms, 'gf_master', 'MASTER BEDROOM', 0, 0, leftW, hRear, true, false);
          const guest = makeRoom('gf_bed_guest', 'GUEST / PARENTS BED', 'bedroom', leftW, 0, rightW, hRear);
          rooms.push(guest);
          connectRooms(dining, mRes.bed, mRes.bed);
          connectRooms(dining, guest, guest);
          if (passage) connectRooms(passage, guest, guest);
        }
      } else {
        // UPPER FLOORS (First / Second Floor)
        const isTop = f === floorCount - 1;
        const balcW = clamp(roundHalf(W * 0.28), 6.0, 9.0);
        const balc = makeRoom(`f${f}_balc`, 'BALCONY', 'balcony', 0, hRear + hMid, balcW, hFront, { openEdge: 'south' });
        const loungeW = roundHalf((W - balcW) * 0.45);
        const bedFrontW = roundHalf(W - balcW - loungeW);
        const lounge = makeRoom(`f${f}_lounge`, f === 1 ? 'FAMILY LOUNGE' : 'TERRACE LOUNGE', 'living', balcW, hRear + hMid, loungeW, hFront);
        const frontBed = makeRoom(`f${f}_bed_front`, f === 1 ? 'BEDROOM 2' : (config === '4BHK' ? 'BEDROOM 4' : 'STUDY / BEDROOM'), f === 2 && config !== '4BHK' ? 'office' : 'bedroom', balcW + loungeW, hRear + hMid, bedFrontW, hFront);
        rooms.push(balc, lounge, frontBed);
        connectRooms(lounge, balc, balc);
        connectRooms(lounge, frontBed, frontBed);

        // Middle: Lobby + Common Bath (locked <= 5.5x8) + Aligned Staircase
        const stairRoom = makeRoom(`f${f}_stair`, 'STAIRCASE', 'staircase', stairX, hRear, stairW, hMid);
        stairsObj = { x: stairX, y: stairY, width: stairW, height: Math.min(stairH, hMid), direction: isTop ? 'down' : 'up' };
        const cBathW = clamp(roundHalf(W * 0.16), 4.5, 5.5);
        const cBathH = clamp(roundHalf(hMid * 0.65), 7.0, 8.0);
        const lobbyW = roundHalf(stairX - cBathW);
        const lobby = makeRoom(`f${f}_lobby`, 'UPPER LOBBY', 'foyer', cBathW, hRear, lobbyW, hMid);
        const cBath = makeRoom(`f${f}_cbath`, 'COMMON BATH', 'toilet', 0, hRear, cBathW, cBathH);
        rooms.push(cBath, lobby, stairRoom);
        if (hMid - cBathH >= 3.5) {
          const store = makeRoom(`f${f}_linen`, 'LINEN / STORE', 'utility', 0, hRear + cBathH, cBathW, roundHalf(hMid - cBathH));
          rooms.push(store);
          connectRooms(lobby, store, store);
        }
        connectRooms(lobby, stairRoom, stairRoom);
        connectRooms(lobby, cBath, cBath);
        connectRooms(lobby, lounge, lounge);
        connectRooms(lobby, frontBed, frontBed);

        // Rear: Master Suite / Bedroom 3 + Locked Attached Bath
        const rearBedRes = addBedroomWithLockedBath(rooms, `f${f}_rear`, f === 1 ? 'BEDROOM 3' : 'GUEST SUITE', 0, 0, W, hRear, true, false);
        connectRooms(lobby, rearBedRes.bed, rearBedRes.bed);
      }

      assignWindows(rooms, W, H);
      assignFurniture(rooms, formData);

      const floorBuiltUp = rooms.reduce((s, r) => s + r.width * r.height, 0);
      floors.push({ name: names[f], rooms, stairs: stairsObj, totalBuiltUpArea: Math.round(floorBuiltUp) });
    }

    return floors;
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * BUILDER 2: DUPLEX HOUSE
   * Internal staircase integrated into the double-height living/dining core
   * ─────────────────────────────────────────────────────────────────────────── */
  function buildDuplexHouse(formData, W, H, isOptionB) {
    const floorCount = formData.floors === 'G+2' ? 3 : 2; // Duplex always at least G+1 visually
    const config = formData.config || '3BHK';

    const stairW = clamp(roundHalf(W * 0.24), 7.5, 8.0);
    const stairH = clamp(roundHalf(H * 0.30), 12.0, 13.5);
    // Duplex places internal staircase centrally along the west/left side of Living-Dining core
    const stairX = 0;

    const hFront = roundHalf(clamp(H * 0.36, 12.5, 16.0));
    const hRear = roundHalf(clamp(H * 0.34, 11.0, 14.0));
    const hMid = roundHalf(H - hFront - hRear);
    const stairY = hRear;

    const porchW = formData.parking === '2cars'
      ? clamp(roundHalf(W * 0.46), 14.0, 18.0)
      : formData.parking === '1car'
        ? clamp(roundHalf(W * 0.34), 9.5, 12.5)
        : clamp(roundHalf(W * 0.22), 6.0, 8.0);

    const floors = [];
    const names = ['Ground Floor', 'First Floor', 'Second Floor'];

    for (let f = 0; f < floorCount; f++) {
      const rooms = [];
      let stairsObj = null;

      if (f === 0) {
        const porch = makeRoom('dx_gf_porch', 'CAR PORCH', 'porch', 0, hRear + hMid, porchW, hFront, { openEdge: 'south' });
        const livW = roundHalf(W - porchW);
        const living = makeRoom('dx_gf_living', isOptionB ? 'DOUBLE-HT LIVING' : 'OPEN DUPLEX LIVING', 'living', porchW, hRear + hMid, livW, hFront);
        rooms.push(porch, living);
        addExteriorEntryDoor(living, 'south', 'double');
        connectRooms(porch, living, living);

        // Middle: Internal Duplex Staircase (Left) + Dining Hall (Center) + Kitchen & Utility (Right East wall)
        const stairRoom = makeRoom('dx_gf_stair', 'INTERNAL STAIR', 'staircase', stairX, stairY, stairW, hMid);
        stairsObj = { x: stairX, y: stairY, width: stairW, height: Math.min(stairH, hMid), direction: 'up' };
        const kitW = clamp(roundHalf(W * 0.28), 8.0, 10.5);
        const utilD = clamp(roundHalf(hMid * 0.35), 4.5, 6.0);
        const dinW = roundHalf(W - stairW - kitW);

        const dining = makeRoom('dx_gf_dining', isOptionB ? 'DINING ROOM' : 'LIVING & DINING', 'dining', stairW, hRear, dinW, hMid);
        const utility = makeRoom('dx_gf_util', 'UTILITY', 'utility', W - kitW, hRear, kitW, utilD);
        const kitchen = makeRoom('dx_gf_kit', 'KITCHEN', 'kitchen', W - kitW, hRear + utilD, kitW, roundHalf(hMid - utilD));
        rooms.push(stairRoom, dining, utility, kitchen);

        connectRooms(living, dining, isOptionB ? dining : null);
        connectRooms(dining, stairRoom, stairRoom);
        connectRooms(dining, kitchen, kitchen);
        connectRooms(kitchen, utility, utility);

        // Rear: Guest / Parents Bedroom + Common Bath (locked <= 5.5x8) off Passage
        const bathW = clamp(roundHalf(W * 0.16), 4.5, 5.5);
        const bathH = clamp(roundHalf(hRear * 0.65), 7.0, 8.0);
        const bedW = roundHalf(W - bathW - 4.0);
        const pas = makeRoom('dx_gf_pas', 'PASSAGE', 'passage', bedW, 0, 4.0, hRear);
        const guest = makeRoom('dx_gf_guest', 'PARENTS BEDROOM', 'bedroom', 0, 0, bedW, hRear);
        const cBath = makeRoom('dx_gf_cbath', 'COMMON BATH', 'toilet', bedW + 4.0, 0, bathW, bathH);
        rooms.push(guest, pas, cBath);
        if (hRear - bathH >= 3.5) {
          const store = makeRoom('dx_gf_store', 'STORE', 'utility', bedW + 4.0, bathH, bathW, roundHalf(hRear - bathH));
          rooms.push(store);
          connectRooms(pas, store, store);
        }
        connectRooms(dining, pas, pas);
        connectRooms(pas, guest, guest);
        connectRooms(pas, cBath, cBath);
      } else {
        const isTop = f === floorCount - 1;
        // Upper Floor: Front Balcony + Upper Family Lounge + Kids Bedroom
        const balcW = clamp(roundHalf(W * 0.30), 6.0, 10.0);
        const balc = makeRoom(`dx_f${f}_balc`, 'ROAD BALCONY', 'balcony', 0, hRear + hMid, balcW, hFront, { openEdge: 'south' });
        const loungeW = roundHalf((W - balcW) * 0.48);
        const kidsW = roundHalf(W - balcW - loungeW);
        const lounge = makeRoom(`dx_f${f}_lounge`, 'FAMILY LOUNGE', 'living', balcW, hRear + hMid, loungeW, hFront);
        const kids = makeRoom(`dx_f${f}_kids`, f === 1 ? 'KIDS BEDROOM' : 'BEDROOM 4', 'bedroom', balcW + loungeW, hRear + hMid, kidsW, hFront);
        rooms.push(balc, lounge, kids);
        connectRooms(lounge, balc, balc);
        connectRooms(lounge, kids, kids);

        // Middle: Aligned Staircase + Upper Passage + Kids Attached/Common Bath (locked <= 5.5x8)
        const stairRoom = makeRoom(`dx_f${f}_stair`, 'INTERNAL STAIR', 'staircase', stairX, stairY, stairW, hMid);
        stairsObj = { x: stairX, y: stairY, width: stairW, height: Math.min(stairH, hMid), direction: isTop ? 'down' : 'up' };
        const bathW = clamp(roundHalf(W * 0.16), 4.5, 5.5);
        const bathH = clamp(roundHalf(hMid * 0.65), 7.0, 8.0);
        const lobbyW = roundHalf(W - stairW - bathW);
        const lobby = makeRoom(`dx_f${f}_lobby`, 'UPPER HALL', 'foyer', stairW, hRear, lobbyW, hMid);
        const bath2 = makeRoom(`dx_f${f}_bath2`, 'COMMON BATH', 'toilet', W - bathW, hRear, bathW, bathH);
        rooms.push(stairRoom, lobby, bath2);
        connectRooms(stairRoom, lobby, lobby);
        connectRooms(lobby, lounge, lounge);
        connectRooms(lobby, kids, kids);
        connectRooms(lobby, bath2, bath2);

        // Rear: Master Suite + Locked Attached Bath
        const mRes = addBedroomWithLockedBath(rooms, `dx_f${f}_master`, f === 1 ? 'MASTER SUITE' : (config === '4BHK' ? 'BEDROOM 3' : 'HOME STUDIO'), 0, 0, W, hRear, true, f === 1);
        connectRooms(lobby, mRes.bed, mRes.bed);
      }

      assignWindows(rooms, W, H);
      assignFurniture(rooms, formData);

      const floorBuiltUp = rooms.reduce((s, r) => s + r.width * r.height, 0);
      floors.push({ name: names[f], rooms, stairs: stairsObj, totalBuiltUpArea: Math.round(floorBuiltUp) });
    }

    return floors;
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * BUILDER 3: LUXURY VILLA
   * Double-car porch, Verandah Sit-out, Foyer, Kitchen+Pantry, Master Walk-in Wardrobe
   * ─────────────────────────────────────────────────────────────────────────── */
  function buildLuxuryVilla(formData, W, H, isOptionB) {
    const floorCount = formData.floors === 'G+2' ? 3 : formData.floors === 'G+1' ? 2 : 1;
    const isMulti = floorCount > 1;
    const config = formData.config || '3BHK';

    const stairW = isMulti ? clamp(roundHalf(W * 0.24), 7.5, 8.0) : 0;
    const stairH = isMulti ? clamp(roundHalf(H * 0.28), 12.0, 14.0) : 0;

    const hFront = roundHalf(clamp(H * 0.35, 13.0, 17.0));
    const hRear = roundHalf(clamp(H * 0.34, 11.5, 15.0));
    const hMid = roundHalf(H - hFront - hRear);
    const stairX = isMulti ? roundHalf(W - stairW) : 0;
    const stairY = hRear;

    const porchW = formData.parking === 'bikes'
      ? 8.0
      : formData.parking === '1car'
        ? clamp(roundHalf(W * 0.36), 11.0, 14.0)
        : clamp(roundHalf(W * 0.48), 15.0, 19.0);

    const floors = [];
    const names = ['Ground Floor', 'First Floor', 'Second Floor'];

    for (let f = 0; f < floorCount; f++) {
      const rooms = [];
      let stairsObj = null;

      if (f === 0) {
        // Front: Grand Car Porch + Verandah Sit-out + Entry Foyer / Formal Living
        const porch = makeRoom('vl_gf_porch', formData.parking === '2cars' ? 'DOUBLE CAR PORCH' : 'GRAND PORCH', 'porch', 0, hRear + hMid, porchW, hFront, { openEdge: 'south' });
        const remFrontW = roundHalf(W - porchW);
        const sitoutH = clamp(roundHalf(hFront * 0.28), 4.0, 5.5);
        const sitout = makeRoom('vl_gf_sitout', 'VERANDAH SIT-OUT', 'balcony', porchW, hRear + hMid + (hFront - sitoutH), remFrontW, sitoutH, { openEdge: 'south' });

        const foyerW = clamp(roundHalf(remFrontW * 0.34), 6.0, 8.0);
        const foyer = makeRoom('vl_gf_foyer', 'ENTRY FOYER', 'foyer', porchW, hRear + hMid, foyerW, roundHalf(hFront - sitoutH));
        const living = makeRoom('vl_gf_living', isOptionB ? 'FORMAL LIVING' : 'GRAND LIVING', 'living', porchW + foyerW, hRear + hMid, roundHalf(remFrontW - foyerW), roundHalf(hFront - sitoutH));
        rooms.push(porch, sitout, foyer, living);
        connectRooms(sitout, foyer, foyer);
        connectRooms(porch, foyer, foyer);
        connectRooms(foyer, living, living);

        // Middle: Kitchen + Pantry/Utility (West) + Dining Hall + Staircase (East)
        const kitW = clamp(roundHalf(W * 0.28), 8.5, 11.0);
        const pantryD = clamp(roundHalf(hMid * 0.38), 4.5, 6.0);
        const pantry = makeRoom('vl_gf_pantry', 'PANTRY / UTILITY', 'utility', 0, hRear, kitW, pantryD);
        const kitchen = makeRoom('vl_gf_kit', 'DESIGNER KITCHEN', 'kitchen', 0, hRear + pantryD, kitW, roundHalf(hMid - pantryD));
        rooms.push(pantry, kitchen);
        connectRooms(kitchen, pantry, pantry);

        const dinW = roundHalf(W - kitW - stairW);
        const dining = makeRoom('vl_gf_dining', isOptionB ? 'FORMAL DINING' : 'OPEN DINING HALL', 'dining', kitW, hRear, dinW, hMid);
        rooms.push(dining);
        connectRooms(dining, kitchen, kitchen);
        connectRooms(foyer, dining, dining);
        if (!isOptionB) connectRooms(living, dining, null);
        else connectRooms(living, dining, dining);

        if (isMulti) {
          const stairRoom = makeRoom('vl_gf_stair', 'STAIRCASE', 'staircase', stairX, stairY, stairW, hMid);
          stairsObj = { x: stairX, y: stairY, width: stairW, height: Math.min(stairH, hMid), direction: 'up' };
          rooms.push(stairRoom);
          connectRooms(dining, stairRoom, stairRoom);
        }

        // Rear: Master Suite + Walk-in Wardrobe + Attached Bath (locked <= 5.5x8) + Guest Room / Common Bath
        const guestW = floorCount === 1 ? roundHalf(W * 0.42) : roundHalf(W * 0.34);
        const masterTotalW = roundHalf(W - guestW);
        const mRes = addBedroomWithLockedBath(rooms, 'vl_gf_master', 'MASTER SUITE', 0, 0, masterTotalW, hRear, true, true);
        connectRooms(dining, mRes.bed, mRes.bed);

        const cBathW = clamp(roundHalf(guestW * 0.45), 4.5, 5.5);
        const cBathH = clamp(roundHalf(hRear * 0.65), 7.0, 8.0);
        const guestBed = makeRoom('vl_gf_guest', floorCount === 1 ? 'BEDROOM 2' : 'GUEST SUITE', 'bedroom', masterTotalW, 0, roundHalf(guestW - cBathW), hRear);
        const cBath = makeRoom('vl_gf_cbath', 'POWDER / BATH', 'toilet', W - cBathW, 0, cBathW, cBathH);
        rooms.push(guestBed, cBath);
        connectRooms(dining, guestBed, guestBed);
        connectRooms(dining, cBath, cBath);
      } else {
        const isTop = f === floorCount - 1;
        // Upper Floor: Terrace Balcony + Family Lounge + Home Office / Study
        const balcW = clamp(roundHalf(W * 0.32), 7.0, 11.0);
        const balc = makeRoom(`vl_f${f}_balc`, 'TERRACE BALCONY', 'balcony', 0, hRear + hMid, balcW, hFront, { openEdge: 'south' });
        const loungeW = roundHalf((W - balcW) * 0.52);
        const studyW = roundHalf(W - balcW - loungeW);
        const lounge = makeRoom(`vl_f${f}_lounge`, 'FAMILY LOUNGE', 'living', balcW, hRear + hMid, loungeW, hFront);
        const study = makeRoom(`vl_f${f}_study`, f === 1 ? 'HOME OFFICE / STUDY' : 'GYM / MEDIA ROOM', 'office', balcW + loungeW, hRear + hMid, studyW, hFront);
        rooms.push(balc, lounge, study);
        connectRooms(lounge, balc, balc);
        connectRooms(lounge, study, study);

        // Middle: Lobby + Common Bath + Aligned Staircase
        const cBathW = clamp(roundHalf(W * 0.16), 4.5, 5.5);
        const cBathH = clamp(roundHalf(hMid * 0.65), 7.0, 8.0);
        const lobbyW = roundHalf(W - stairW - cBathW);
        const cBath = makeRoom(`vl_f${f}_cbath`, 'COMMON BATH', 'toilet', 0, hRear, cBathW, cBathH);
        const lobby = makeRoom(`vl_f${f}_lobby`, 'UPPER FOYER', 'foyer', cBathW, hRear, lobbyW, hMid);
        const stairRoom = makeRoom(`vl_f${f}_stair`, 'STAIRCASE', 'staircase', stairX, stairY, stairW, hMid);
        stairsObj = { x: stairX, y: stairY, width: stairW, height: Math.min(stairH, hMid), direction: isTop ? 'down' : 'up' };
        rooms.push(cBath, lobby, stairRoom);
        connectRooms(lobby, stairRoom, stairRoom);
        connectRooms(lobby, cBath, cBath);
        connectRooms(lobby, lounge, lounge);

        // Rear: Two Bedroom Suites or 1 Large Suite + Walk-in Wardrobe
        if (config === '4BHK' || config === '3BHK') {
          const b2W = roundHalf(W * 0.50);
          const b3W = roundHalf(W - b2W);
          const r2 = addBedroomWithLockedBath(rooms, `vl_f${f}_b2`, f === 1 ? 'BEDROOM 2' : 'BEDROOM 4', 0, 0, b2W, hRear, true, false);
          const r3 = makeRoom(`vl_f${f}_b3`, f === 1 ? 'BEDROOM 3' : 'GUEST SUITE', 'bedroom', b2W, 0, b3W, hRear);
          rooms.push(r3);
          connectRooms(lobby, r2.bed, r2.bed);
          connectRooms(lobby, r3, r3);
        } else {
          const r2 = addBedroomWithLockedBath(rooms, `vl_f${f}_b2`, 'BEDROOM 2', 0, 0, W, hRear, true, true);
          connectRooms(lobby, r2.bed, r2.bed);
        }
      }

      assignWindows(rooms, W, H);
      assignFurniture(rooms, formData);

      const floorBuiltUp = rooms.reduce((s, r) => s + r.width * r.height, 0);
      floors.push({ name: names[f], rooms, stairs: stairsObj, totalBuiltUpArea: Math.round(floorBuiltUp) });
    }

    return floors;
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * BUILDER 4: COMMERCIAL + RESIDENTIAL
   * Ground Floor: Wide Shop/Showroom bays with road shutter + separate side residential entry
   * Upper Floors: Complete 2BHK/3BHK Residential Home with road balcony
   * ─────────────────────────────────────────────────────────────────────────── */
  function buildCommercialResidential(formData, W, H, isOptionB) {
    const floorCount = formData.floors === 'G+2' ? 3 : formData.floors === 'G+1' ? 2 : 1;
    const config = formData.config || '3BHK';

    const stairW = clamp(roundHalf(W * 0.24), 7.5, 8.0);
    const stairH = clamp(roundHalf(H * 0.30), 12.0, 13.5);
    const stairX = 0; // Side residential entry strip on West edge

    const hFront = roundHalf(clamp(H * 0.40, 13.5, 18.0));
    const hRear = roundHalf(clamp(H * 0.32, 10.5, 13.5));
    const hMid = roundHalf(H - hFront - hRear);
    const stairY = hRear;

    const sideStripW = clamp(roundHalf(W * 0.26), 8.0, 10.5);
    const shopTotalW = roundHalf(W - sideStripW);

    const floors = [];
    const names = ['Ground Floor', 'First Floor', 'Second Floor'];

    for (let f = 0; f < floorCount; f++) {
      const rooms = [];
      let stairsObj = null;

      if (f === 0) {
        // Left Front: Side Parking / Driveway Strip leading straight to Residential Stair Foyer
        const parkStrip = makeRoom('cr_gf_park', 'PARKING / DRIVEWAY', 'porch', 0, hRear + hMid, sideStripW, hFront, { openEdge: 'south' });
        rooms.push(parkStrip);

        // Right Front: Option A = 1 Large Open Showroom, Option B = 2 Independent Commercial Shops
        if (isOptionB && shopTotalW >= 18) {
          const s1W = roundHalf(shopTotalW / 2);
          const s2W = roundHalf(shopTotalW - s1W);
          const shop1 = makeRoom('cr_gf_shop1', 'SHOP 1', 'shop', sideStripW, hRear + hMid, s1W, hFront, { shutterEdge: 'south' });
          const shop2 = makeRoom('cr_gf_shop2', 'SHOP 2', 'shop', sideStripW + s1W, hRear + hMid, s2W, hFront, { shutterEdge: 'south' });
          rooms.push(shop1, shop2);
        } else {
          const showroom = makeRoom('cr_gf_showroom', 'SHOWROOM / SHOP', 'shop', sideStripW, hRear + hMid, shopTotalW, hFront, { shutterEdge: 'south' });
          rooms.push(showroom);
        }

        if (floorCount === 1) {
          // Single Floor C+R: Back Office/Passage + Residential 1BHK behind shop
          const pas = makeRoom('cr_gf_pas', 'RES. ENTRY PASSAGE', 'passage', 0, hRear, 4.5, hMid);
          const liv = makeRoom('cr_gf_liv', 'LIVING & KITCHEN', 'living', 4.5, hRear, roundHalf(W - 4.5), hMid);
          const mRes = addBedroomWithLockedBath(rooms, 'cr_gf_bed', 'BEDROOM 1', 0, 0, W, hRear, true, false);
          rooms.push(pas, liv);
          connectRooms(parkStrip, pas, pas);
          connectRooms(pas, liv, liv);
          connectRooms(liv, mRes.bed, mRes.bed);
        } else {
          // Multi-floor C+R: Side Staircase + Residential Foyer + Back Store + Common Toilet off Rear Passage (NEVER directly from shop floor!)
          const stairRoom = makeRoom('cr_gf_stair', 'RES. STAIRCASE', 'staircase', stairX, stairY, Math.max(stairW, sideStripW), hMid);
          stairsObj = { x: stairX, y: stairY, width: Math.max(stairW, sideStripW), height: Math.min(stairH, hMid), direction: 'up' };
          const actualStairW = Math.max(stairW, sideStripW);

          const cToiletW = clamp(roundHalf(W * 0.16), 4.5, 5.5);
          const cToiletH = clamp(roundHalf(hMid * 0.65), 7.0, 8.0);
          const corW = roundHalf(W - actualStairW - cToiletW);
          const backLobby = makeRoom('cr_gf_lobby', 'BACK PASSAGE', 'foyer', actualStairW, hRear, corW, hMid);
          const cToilet = makeRoom('cr_gf_toilet', 'STAFF TOILET', 'toilet', W - cToiletW, hRear, cToiletW, cToiletH);
          rooms.push(stairRoom, backLobby, cToilet);

          connectRooms(parkStrip, stairRoom, stairRoom);
          connectRooms(stairRoom, backLobby, backLobby);
          connectRooms(backLobby, cToilet, cToilet);

          // Rear Store / Back Office
          const storeW = roundHalf(W * 0.55);
          const backOffice = makeRoom('cr_gf_office', 'BACK OFFICE', 'office', 0, 0, storeW, hRear);
          const store = makeRoom('cr_gf_store', 'STORAGE / UTILITY', 'utility', storeW, 0, roundHalf(W - storeW), hRear);
          rooms.push(backOffice, store);
          connectRooms(backLobby, backOffice, backOffice);
          connectRooms(backLobby, store, store);
        }
      } else {
        // Upper Floors: Complete Residential Home
        const isTop = f === floorCount - 1;
        const actualStairW = Math.max(stairW, sideStripW);
        const balcW = clamp(roundHalf(W * 0.30), 7.0, 10.0);
        const balc = makeRoom(`cr_f${f}_balc`, 'ROAD BALCONY', 'balcony', 0, hRear + hMid, balcW, hFront, { openEdge: 'south' });
        const livW = roundHalf((W - balcW) * 0.55);
        const dinW = roundHalf(W - balcW - livW);
        const living = makeRoom(`cr_f${f}_living`, 'LIVING ROOM', 'living', balcW, hRear + hMid, livW, hFront);
        const dining = makeRoom(`cr_f${f}_dining`, 'DINING HALL', 'dining', balcW + livW, hRear + hMid, dinW, hFront);
        rooms.push(balc, living, dining);
        connectRooms(living, balc, balc);
        if (isOptionB) connectRooms(living, dining, dining);

        // Middle: Aligned Staircase + Passage + Kitchen + Utility
        const stairRoom = makeRoom(`cr_f${f}_stair`, 'STAIRCASE', 'staircase', stairX, stairY, actualStairW, hMid);
        stairsObj = { x: stairX, y: stairY, width: actualStairW, height: Math.min(stairH, hMid), direction: isTop ? 'down' : 'up' };
        const kitW = clamp(roundHalf(W * 0.30), 8.5, 11.0);
        const utilD = clamp(roundHalf(hMid * 0.36), 4.5, 6.0);
        const hallW = roundHalf(W - actualStairW - kitW);

        const hall = makeRoom(`cr_f${f}_hall`, 'CENTRAL HALL', 'foyer', actualStairW, hRear, hallW, hMid);
        const utility = makeRoom(`cr_f${f}_util`, 'UTILITY', 'utility', W - kitW, hRear, kitW, utilD);
        const kitchen = makeRoom(`cr_f${f}_kit`, 'KITCHEN', 'kitchen', W - kitW, hRear + utilD, kitW, roundHalf(hMid - utilD));
        rooms.push(stairRoom, hall, utility, kitchen);
        connectRooms(stairRoom, hall, hall);
        connectRooms(hall, living, living);
        connectRooms(hall, dining, dining);
        connectRooms(hall, kitchen, kitchen);
        connectRooms(kitchen, utility, utility);

        // Rear: 2 Bedrooms + Locked Attached Bath & Common Bath
        const b1W = roundHalf(W * 0.52);
        const b2W = roundHalf(W - b1W);
        const mRes = addBedroomWithLockedBath(rooms, `cr_f${f}_master`, f === 1 ? 'MASTER BEDROOM' : 'BEDROOM 3', 0, 0, b1W, hRear, true, false);
        const b2Res = addBedroomWithLockedBath(rooms, `cr_f${f}_bed2`, f === 1 ? (config === '4BHK' ? 'BEDROOM 2' : 'BEDROOM 2') : 'BEDROOM 4', b1W, 0, b2W, hRear, false, false);
        connectRooms(hall, mRes.bed, mRes.bed);
        connectRooms(hall, b2Res.bed, b2Res.bed);
      }

      assignWindows(rooms, W, H);
      assignFurniture(rooms, formData);

      const floorBuiltUp = rooms.reduce((s, r) => s + r.width * r.height, 0);
      floors.push({ name: names[f], rooms, stairs: stairsObj, totalBuiltUpArea: Math.round(floorBuiltUp) });
    }

    return floors;
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * BUILDER 5: RENTAL APARTMENTS (MULTI-UNIT)
   * Central Common Staircase + Corridor splitting each floor into Unit 1 (Front) & Unit 2 (Rear)
   * ─────────────────────────────────────────────────────────────────────────── */
  function buildRentalApartments(formData, W, H, isOptionB) {
    const floorCount = formData.floors === 'G+2' ? 3 : formData.floors === 'G+1' ? 2 : 1;
    const isMulti = floorCount > 1;

    const stairW = isMulti ? clamp(roundHalf(W * 0.24), 7.5, 8.0) : 0;
    const corridorH = 4.5; // Locked 4'-6" hallway width
    const unitRearH = roundHalf((H - corridorH) * (isOptionB ? 0.46 : 0.50));
    const corridorY = unitRearH;
    const unitFrontY = roundHalf(unitRearH + corridorH);
    const unitFrontH = roundHalf(H - unitFrontY);

    // Dog-leg staircase 8'-0" x 12'-0" straddling the 4'-6" corridor cleanly
    const stairH = isMulti ? clamp(roundHalf(H * 0.30), 11.5, 13.0) : 0;
    const stairY = isMulti ? roundHalf(clamp(unitRearH - (stairH - corridorH) / 2, 7.5, unitRearH)) : unitRearH;
    const stairBottom = roundHalf(stairY + stairH);

    const floors = [];
    const names = ['Ground Floor', 'First Floor', 'Second Floor'];

    for (let f = 0; f < floorCount; f++) {
      const rooms = [];
      let stairsObj = null;
      const isTop = f === floorCount - 1;

      // CENTRAL COMMON SPINE: 8'-0" x 12'-0" Staircase + 4'-6" Common Corridor
      let lobby = null;
      if (isMulti) {
        const stairRoom = makeRoom(`apt_f${f}_stair`, 'COMMON STAIR', 'staircase', 0, stairY, stairW, stairH);
        stairsObj = { x: 0, y: stairY, width: stairW, height: stairH, direction: f === 0 ? 'up' : (isTop ? 'down' : 'up') };
        lobby = makeRoom(`apt_f${f}_lobby`, 'COMMON CORRIDOR', 'passage', stairW, corridorY, roundHalf(W - stairW), corridorH);
        rooms.push(stairRoom, lobby);
        connectRooms(stairRoom, lobby, lobby);
      } else {
        lobby = makeRoom(`apt_f${f}_lobby`, 'COMMON CORRIDOR', 'passage', 0, corridorY, W, corridorH);
        rooms.push(lobby);
      }

      // UNIT 1 (FRONT — Road Side)
      const u1LeftX = isMulti ? stairW : 0;
      const u1RightSpan = roundHalf(W - u1LeftX);
      const u1LivW = roundHalf(u1RightSpan * 0.42);
      const u1BedTotalW = roundHalf(u1RightSpan - u1LivW);

      const u1Liv = makeRoom(`apt_f${f}_u1_liv`, f === 0 && formData.parking !== 'bikes' ? 'UNIT 1: LIVING/KIT' : 'UNIT 1: LIVING', 'living', u1LeftX, unitFrontY, u1LivW, unitFrontH);
      rooms.push(u1Liv);
      const u1Res = addBedroomWithLockedBath(rooms, `apt_f${f}_u1`, 'UNIT 1: BEDROOM', u1LeftX + u1LivW, unitFrontY, u1BedTotalW, unitFrontH, true, false);
      connectRooms(lobby, u1Liv, u1Liv);
      connectRooms(u1Liv, u1Res.bed, u1Res.bed);

      if (isMulti && H - stairBottom >= 6.0) {
        const leftFrontH = roundHalf(H - stairBottom);
        if (f === 0) {
          const park = makeRoom('apt_gf_park', formData.parking === 'bikes' ? 'BIKE PARKING' : 'TENANT PARKING', 'porch', 0, stairBottom, stairW, leftFrontH, { openEdge: 'south' });
          rooms.push(park);
          // Connect parking bay into Unit 1 side or stair entry
          connectRooms(park, u1Liv, u1Liv);
        } else {
          const u1Kit = makeRoom(`apt_f${f}_u1_kit`, 'U1 KITCHEN', 'kitchen', 0, stairBottom, stairW, leftFrontH);
          rooms.push(u1Kit);
          connectRooms(u1Liv, u1Kit, u1Kit);
        }
      }

      // UNIT 2 (REAR)
      const u2LeftX = isMulti ? stairW : 0;
      const u2RightSpan = roundHalf(W - u2LeftX);
      const u2LivW = roundHalf(u2RightSpan * 0.42);
      const u2BedTotalW = roundHalf(u2RightSpan - u2LivW);

      const u2Liv = makeRoom(`apt_f${f}_u2_liv`, isMulti ? 'UNIT 2: LIVING' : 'UNIT 2: LIVING/KIT', 'living', u2LeftX, 0, u2LivW, unitRearH);
      rooms.push(u2Liv);
      const u2Res = addBedroomWithLockedBath(rooms, `apt_f${f}_u2`, 'UNIT 2: BEDROOM', u2LeftX + u2LivW, 0, u2BedTotalW, unitRearH, true, false);
      connectRooms(lobby, u2Liv, u2Liv);
      connectRooms(u2Liv, u2Res.bed, u2Res.bed);

      if (isMulti && stairY >= 6.0) {
        const u2Kit = makeRoom(`apt_f${f}_u2_kit`, 'U2 KITCHEN', 'kitchen', 0, 0, stairW, stairY);
        rooms.push(u2Kit);
        connectRooms(u2Liv, u2Kit, u2Kit);
      }

      assignWindows(rooms, W, H);
      assignFurniture(rooms, formData);

      const floorBuiltUp = rooms.reduce((s, r) => s + r.width * r.height, 0);
      floors.push({ name: names[f], rooms, stairs: stairsObj, totalBuiltUpArea: Math.round(floorBuiltUp) });
    }

    return floors;
  }

  /**
   * Dispatch to the selected Building Type's architectural builder.
   */
  function buildFloorsForType(formData, W, H, isOptionB) {
    switch (formData.buildingType) {
      case 'duplex':
        return buildDuplexHouse(formData, W, H, isOptionB);
      case 'villa':
        return buildLuxuryVilla(formData, W, H, isOptionB);
      case 'commercial_residential':
        return buildCommercialResidential(formData, W, H, isOptionB);
      case 'rental_apartments':
        return buildRentalApartments(formData, W, H, isOptionB);
      case 'independent':
      default:
        return buildIndependentHouse(formData, W, H, isOptionB);
    }
  }

  function getOptionLabels(buildingType) {
    switch (buildingType) {
      case 'duplex':
        return ['Option A: Open Duplex Core', 'Option B: Double-Height Formal'];
      case 'villa':
        return ['Option A: Open Resort Pavilion', 'Option B: Classical Winged Villa'];
      case 'commercial_residential':
        return ['Option A: Single Wide Showroom', 'Option B: Twin Shop Bays'];
      case 'rental_apartments':
        return ['Option A: Symmetric 2-Unit Floor', 'Option B: Large Front + Rear Unit'];
      case 'independent':
      default:
        return ['Option A: Open Living-Dining', 'Option B: Formal Living + Private Dining'];
    }
  }

  return {
    computeSpaceMetrics,

    generate(formData, plotData) {
      const roadFacing = formData.roadFacing || 'east';
      const setbacks = computeSetbacks(formData, plotData);
      const env = computeBuildableEnvelope(plotData, setbacks, roadFacing);
      const { W, H } = getCanonicalDims(env, roadFacing);

      const canFloorsA = buildFloorsForType(formData, W, H, false);
      const canFloorsB = buildFloorsForType(formData, W, H, true);

      const floorsA = canFloorsA.map(cf => transformFloor(cf, env, W, H, roadFacing));
      const floorsB = canFloorsB.map(cf => transformFloor(cf, env, W, H, roadFacing));

      const optLabels = getOptionLabels(formData.buildingType);
      const totalBuiltUpArea = floorsA.reduce((sum, fl) => sum + fl.totalBuiltUpArea, 0);
      const groundFootprintArea = floorsA[0] ? floorsA[0].totalBuiltUpArea : env.width * env.height;
      const carpetArea = Math.round(totalBuiltUpArea * 0.77);
      const openArea = Math.max(0, Math.round(plotData.area - groundFootprintArea));

      return {
        plotVertices: plotData.vertices,
        plotWidth: plotData.width,
        plotLength: plotData.length || plotData.depth,
        plotDepth: plotData.length || plotData.depth,
        roadFacing,
        setbacks,
        buildableEnvelope: env,
        groundFootprintArea,
        options: [
          { name: optLabels[0], floors: floorsA },
          { name: optLabels[1], floors: floorsB }
        ],
        totalBuiltUpArea,
        carpetArea,
        openArea
      };
    }
  };
})();
