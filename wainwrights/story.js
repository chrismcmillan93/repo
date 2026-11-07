// Instagram Story images (1080x1920) drawn on a canvas in the app's own look.
// Three cards: today's ticks, a hosted hike, a team's progress. Shared via the
// Web Share API (files) with a download fallback. A website can't open
// Instagram's Story composer directly, so the person picks Instagram in the
// share sheet (or saves the image and adds it from their camera roll).
(function(){
  "use strict";

  // Size and colours are set for each render by setStyle() (renders are queued one at a time, so these module-level values are safe).
  const THEMES = {
    paper:    { paper: "#e8e2d0", paperCard: "#f1ecdd", paperDeep: "#ddd4bb", ink: "#262a1f", inkSoft: "#5b5f4d", inkFaint: "#8b8d78", green: "#3c5a41", greenDeep: "#24392a", grid: "#c9c5b4" },
    dark:     { paper: "#151a17", paperCard: "#1d241f", paperDeep: "#2a332d", ink: "#ece6d4", inkSoft: "#b3b8a6", inkFaint: "#7d8374", green: "#8fcf9f", greenDeep: "#f3eedd", grid: "#222923" },
    forest:   { paper: "#24392a", paperCard: "#2b4431", paperDeep: "#35523b", ink: "#f1ecdd", inkSoft: "#c9d3c0", inkFaint: "#9bb09f", green: "#e0c27a", greenDeep: "#f6f1e2", grid: "#2d4733" },
    contrast: { paper: "#ffffff", paperCard: "#ffffff", paperDeep: "#e4e4e4", ink: "#000000", inkSoft: "#2a2a2a", inkFaint: "#6a6a6a", green: "#c2410c", greenDeep: "#000000", grid: "#ececec" }
  };
  // Instagram covers roughly the top and bottom 250px of a Story with its own UI; the feed sizes don't need that margin
  const SIZES = {
    story:  { w: 1080, h: 1920, top: 250, bottom: 1670, foot: 1752 },
    post:   { w: 1080, h: 1350, top: 96,  bottom: 1230, foot: 1300 },
    square: { w: 1080, h: 1080, top: 72,  bottom: 985,  foot: 1036 }
  };
  let W = 1080, H = 1920, M = 72, TOP = 250, BOTTOM = 1670, FOOT = 1752;
  let C = THEMES.paper;
  let PHOTO = null;   // a canvas holding the person's photo (only ever in memory on this device), for the photo layout
  function setStyle(st){
    const z = SIZES[st && st.size] || SIZES.story;
    W = z.w; H = z.h; TOP = z.top; BOTTOM = z.bottom; FOOT = z.foot;
    C = THEMES[st && st.theme] || THEMES.paper;
  }
  const SERIF = "'Fraunces', Georgia, serif";
  const MONO = "'JetBrains Mono', monospace";

  async function ensureFonts(){
    if(!(document.fonts && document.fonts.load)) return;
    try{
      await Promise.all([
        document.fonts.load("700 72px 'Fraunces'"), document.fonts.load("600 40px 'Fraunces'"),
        document.fonts.load("400 28px 'JetBrains Mono'"), document.fonts.load("700 26px 'JetBrains Mono'")
      ]);
    }catch(e){ /* system fallbacks */ }
  }

  function spaced(ctx, text, cx, y, spacing, align){
    const widths = Array.from(text).map(ch=> ctx.measureText(ch).width);
    const total = widths.reduce((a,b)=>a+b, 0) + spacing * Math.max(0, text.length - 1);
    let x = align === "left" ? cx : cx - total / 2;
    const prev = ctx.textAlign;
    ctx.textAlign = "left";
    Array.from(text).forEach((ch, i)=>{ ctx.fillText(ch, x, y); x += widths[i] + spacing; });
    ctx.textAlign = prev;
  }

  function wrap(ctx, text, maxW){
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    words.forEach(w=>{
      const t = line ? line + " " + w : w;
      if(ctx.measureText(t).width <= maxW || !line) line = t;
      else { lines.push(line); line = w; }
    });
    if(line) lines.push(line);
    return lines;
  }

  function fit(ctx, text, maxW){
    if(ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while(t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
    return t + "…";
  }

  function newCard(){
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    for(let x = -1; x < W; x += 34){ ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, H); ctx.stroke(); }
    for(let y = -1; y < H; y += 34){ ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(W, y + .5); ctx.stroke(); }
    ctx.textBaseline = "alphabetic";
    return { canvas, ctx };
  }

  function footer(ctx){
    ctx.fillStyle = C.inkSoft;
    ctx.font = "700 26px " + MONO;
    spaced(ctx, "THE WAINWRIGHTS", W / 2, FOOT, 3);
    siteUrl(ctx, C.inkSoft);
  }
  // the app's address, small and quiet under the name
  function siteUrl(ctx, color){
    ctx.save(); ctx.globalAlpha = 0.7; ctx.fillStyle = color; ctx.font = "400 21px " + MONO; ctx.textAlign = "center";
    ctx.fillText("wainwrights.walkinguphills.co.uk", W / 2, FOOT + 34); ctx.restore();
  }

  // kicker + (wrapped) title; returns the next y
  function heading(ctx, y, kicker, title, sub){
    ctx.fillStyle = C.green;
    ctx.font = "700 28px " + MONO;
    spaced(ctx, kicker, W / 2, y, 4);
    y += 40;
    let size = 84, lines;
    ctx.textAlign = "center";
    for(;;){
      ctx.font = "700 " + size + "px " + SERIF;
      lines = wrap(ctx, title, W - M * 2);
      if((lines.length <= 3 && lines.every(l=> ctx.measureText(l).width <= W - M * 2)) || size <= 48) break;
      size -= 6;
    }
    ctx.fillStyle = C.greenDeep;
    lines.slice(0, 3).forEach((l, i)=>{ y += size * 1.1; ctx.fillText(fit(ctx, l, W - M * 2), W / 2, y); });
    y += 28;
    if(sub){
      ctx.font = "400 30px " + MONO; ctx.fillStyle = C.inkSoft;
      ctx.fillText(fit(ctx, sub, W - M * 2), W / 2, y + 30);
      y += 48;
    }
    return y + 20;
  }

  function stats(ctx, y, items){
    const colW = (W - M * 2) / items.length;
    ctx.textAlign = "center";
    items.forEach((it, i)=>{
      const cx = M + colW * i + colW / 2;
      ctx.font = "700 70px " + SERIF; ctx.fillStyle = C.greenDeep;
      ctx.fillText(it.v, cx, y + 64);
      ctx.font = "400 22px " + MONO; ctx.fillStyle = C.inkSoft;
      spaced(ctx, it.l, cx, y + 102, 1.5);
    });
    return y + 150;
  }

  function panel(ctx, y, h){
    ctx.fillStyle = C.paperCard;
    ctx.fillRect(M - 16, y, W - (M - 16) * 2, h);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5;
    ctx.strokeRect(M - 16, y, W - (M - 16) * 2, h);
  }

  // rows of {left, right, sub}; picks a row height that fits, caps the count
  function list(ctx, y, rows, opts){
    opts = opts || {};
    const avail = BOTTOM - y - 20;
    const maxRows = opts.maxRows || 14;
    let shown = rows.slice(0, maxRows);
    let more = rows.length - shown.length;
    let rh = Math.min(opts.maxRowH || 64, Math.floor((avail - 30) / (shown.length + (more ? 1 : 0))));
    while(rh < 40 && shown.length > 1){
      shown = shown.slice(0, -1); more = rows.length - shown.length;
      rh = Math.min(opts.maxRowH || 64, Math.floor((avail - 30) / (shown.length + 1)));
    }
    const total = (shown.length + (more ? 1 : 0)) * rh + 30;
    panel(ctx, y, total);
    let ty = y + 15 + rh * 0.68;
    const fs = Math.max(24, Math.min(34, Math.floor(rh * 0.52)));
    shown.forEach(r=>{
      ctx.textAlign = "left"; ctx.fillStyle = C.ink;
      ctx.font = "600 " + fs + "px " + SERIF;
      const rightW = r.right ? (ctx.font = "400 " + (fs - 6) + "px " + MONO, ctx.measureText(r.right).width) : 0;
      ctx.font = "600 " + fs + "px " + SERIF;
      let left = r.left;
      const maxLeft = W - M * 2 - 24 - rightW - 20 - (r.sub ? 0 : 0);
      if(r.sub){
        ctx.font = "400 " + (fs - 8) + "px " + MONO;
        const subW = ctx.measureText(r.sub).width;
        ctx.font = "600 " + fs + "px " + SERIF;
        const nameW = Math.min(ctx.measureText(left).width, maxLeft - subW - 16);
        const nm = fit(ctx, left, Math.max(80, maxLeft - subW - 16));
        ctx.fillText(nm, M, ty);
        ctx.font = "400 " + (fs - 8) + "px " + MONO; ctx.fillStyle = C.green;
        ctx.fillText(r.sub, M + Math.max(nameW, ctx.measureText("").width) + 16, ty);
      } else {
        ctx.fillText(fit(ctx, left, maxLeft), M, ty);
      }
      if(r.right){
        ctx.textAlign = "right"; ctx.fillStyle = C.inkSoft;
        ctx.font = "400 " + (fs - 6) + "px " + MONO;
        ctx.fillText(r.right, W - M - 8, ty);
      }
      ty += rh;
    });
    if(more){
      ctx.textAlign = "center"; ctx.fillStyle = C.inkSoft;
      ctx.font = "italic 500 " + (fs - 4) + "px " + SERIF;
      ctx.fillText("+ " + more + " more", W / 2, ty);
    }
    return y + total + 24;
  }


  // ---------- route map panel ----------
  // A small map of the fells in the story, drawn on the canvas in the app's own style (no map tiles,
  // so there are no licence questions about putting it in a shared image). Only the fells are drawn:
  // they're public data. Nothing private goes on it, in particular never a hike's meeting point.
  // The line joins the summits in order. For today's ticks that is the order they were ticked
  // (numbered); for a hike nobody knows the real path, so the summits are joined in a short,
  // likely order and the caption says it isn't the exact route.
  const D2R = Math.PI / 180;
  let fellIdx = null;
  function fellByName(){
    if(fellIdx) return fellIdx;
    fellIdx = Object.create(null);
    if(typeof FELLS_DATA !== "undefined") FELLS_DATA.forEach(b=> b.fells.forEach(f=>{ fellIdx[f.name] = f; }));
    return fellIdx;
  }

  function resolveFells(list){
    const idx = fellByName();
    const seen = new Set();
    return (list || []).map(x=>{
      const name = typeof x === "string" ? x : x && x.name;
      const f = idx[name];
      if(!f || f.lat == null || f.lng == null || seen.has(name)) return null;
      seen.add(name);
      return { name, lat: f.lat, lng: f.lng, m: f.m, at: x && x.ticked_at ? Date.parse(x.ticked_at) : NaN };
    }).filter(Boolean);
  }

  // local flat coordinates in degrees of latitude (longitude scaled by cos(latitude))
  function flatten(pts, lat0){
    const k = Math.cos(lat0 * D2R);
    pts.forEach(p=>{ p.u = p.lng * k; p.v = -p.lat; });
    return k;
  }
  const dist2 = (a, b)=> (a.u - b.u) ** 2 + (a.v - b.v) ** 2;
  const dist = (a, b)=> Math.sqrt(dist2(a, b));

  // A sensible order to join summits: nearest-neighbour from a start, then 2-opt to remove crossings.
  // `hint` ({u,v}) is where the walk probably starts (used only for ordering, never drawn).
  function routeOrder(pts, hint){
    const n = pts.length;
    if(n < 3) return pts.slice();
    let startIdx = 0;
    if(hint){
      let best = Infinity;
      pts.forEach((p, i)=>{ const d = dist2(p, hint); if(d < best){ best = d; startIdx = i; } });
    } else {
      // one end of the walk: the western member of the two summits furthest apart
      let best = -1, a = 0, b = 0;
      for(let i = 0; i < n; i++) for(let j = i + 1; j < n; j++){ const d = dist2(pts[i], pts[j]); if(d > best){ best = d; a = i; b = j; } }
      startIdx = pts[a].u <= pts[b].u ? a : b;
    }
    const left = pts.map((p, i)=> i).filter(i=> i !== startIdx);
    const path = [pts[startIdx]];
    while(left.length){
      const last = path[path.length - 1];
      let bi = 0, bd = Infinity;
      left.forEach((idx, k)=>{ const d = dist2(pts[idx], last); if(d < bd){ bd = d; bi = k; } });
      path.push(pts[left.splice(bi, 1)[0]]);
    }
    for(let pass = 0, improved = true; improved && pass < 50; pass++){
      improved = false;
      for(let i = 1; i < n - 1; i++){
        for(let j = i + 1; j < n; j++){
          const before = dist(path[i - 1], path[i]) + (j + 1 < n ? dist(path[j], path[j + 1]) : 0);
          const after = dist(path[i - 1], path[j]) + (j + 1 < n ? dist(path[i], path[j + 1]) : 0);
          if(after + 1e-12 < before){ path.splice(i, j - i + 1, ...path.slice(i, j + 1).reverse()); improved = true; }
        }
      }
    }
    return path;
  }

  // Are these ticks spread over time enough for "the order you ticked them" to mean something?
  // (A hike ticked for everyone at once has the same time on every fell.)
  function tickOrderIsReal(pts){
    const ts = pts.map(p=> p.at);
    if(ts.length < 2 || ts.some(t=> !isFinite(t))) return false;
    const sorted = ts.slice().sort((a, b)=> a - b);
    return sorted[sorted.length - 1] - sorted[0] >= 10 * 60 * 1000;
  }

  function startHint(label){
    if(!label || typeof PLANNER_WALKS === "undefined") return null;
    const k = Object.keys(PLANNER_WALKS).find(id=> PLANNER_WALKS[id].label === label);
    const s = k && PLANNER_WALKS[k].start;
    return s && s.lat != null ? { lat: s.lat, lng: s.lng } : null;
  }

  function niceKm(maxKm){
    const steps = [0.5, 1, 2, 5, 10, 20];
    let pick = steps[0];
    steps.forEach(s=>{ if(s <= maxKm) pick = s; });
    return pick;
  }

  // Draws the panel at y with height h. Returns the y to continue from, or null if there is nothing to draw.
  function mapPanel(ctx, y, h, o){
    const sel = resolveFells(o.fells);
    if(!sel.length) return null;
    if(SKETCH) return sketchPanel(ctx, y, h, { fells: sel.map(p=> p.name), caption: o.caption || "Summits sketched in on the Lakeland map" });
    const lat0 = sel.reduce((s, p)=> s + p.lat, 0) / sel.length;
    const k = flatten(sel, lat0);
    let hint = null;
    if(o.hint){ hint = { u: o.hint.lng * k, v: -o.hint.lat }; }
    const ordered = o.ordered && sel.length > 1 && tickOrderIsReal(sel);
    const route = ordered ? sel.slice().sort((a, b)=> a.at - b.at) : routeOrder(sel, hint);

    const x0 = M - 16, w = W - x0 * 2;

    // fit
    const padX = 120, padTop = 84, padBottom = 96;
    const minU = Math.min(...sel.map(p=> p.u)), maxU = Math.max(...sel.map(p=> p.u));
    const minV = Math.min(...sel.map(p=> p.v)), maxV = Math.max(...sel.map(p=> p.v));
    const MIN_SPAN = 0.024;   // about 2.7 km, so a single fell isn't zoomed to nothing
    const cu = (minU + maxU) / 2, cv = (minV + maxV) / 2;
    const spanU = Math.max(maxU - minU, MIN_SPAN), spanV = Math.max(maxV - minV, MIN_SPAN);
    // a long north-south ridge wants a tall panel, an east-west one a short one (more room for the list below)
    if(!o.fixedH) h = Math.round(Math.max(Math.min(420, h), Math.min(h, padTop + padBottom + (w - padX * 2) * (spanV / spanU))));
    panel(ctx, y, h);
    ctx.save();
    ctx.beginPath(); ctx.rect(x0 + 2, y + 2, w - 4, h - 4); ctx.clip();
    const availW = w - padX * 2, availH = h - padTop - padBottom;
    const scale = Math.min(availW / spanU, availH / spanV);
    const ox = x0 + w / 2, oy = y + padTop + availH / 2;
    const px = p=> ({ x: ox + (p.u - cu) * scale, y: oy + (p.v - cv) * scale });
    osLayer(ctx, { x0, y, w, h, ox, oy, cu, cv, scale, k });   // optional OS map underneath (see "OS map backdrop")

    // the other fells nearby, as quiet dots for context
    const others = [];
    const idx = fellByName();
    Object.keys(idx).forEach(n=>{
      const f = idx[n];
      if(f.lat == null || sel.some(s=> s.name === n)) return;
      const p = { u: f.lng * k, v: -f.lat };
      const q = px(p);
      if(q.x > x0 + 14 && q.x < x0 + w - 14 && q.y > y + 14 && q.y < y + h - 14) others.push(q);
    });
    ctx.strokeStyle = C.inkFaint; ctx.lineWidth = 2; ctx.globalAlpha = 0.55;
    others.forEach(q=>{ ctx.beginPath(); ctx.arc(q.x, q.y, 6, 0, Math.PI * 2); ctx.stroke(); });
    ctx.globalAlpha = 1;

    // the line
    if(route.length > 1){
      ctx.strokeStyle = C.greenDeep; ctx.lineWidth = 5; ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.setLineDash(ordered ? [] : [18, 12]);
      ctx.beginPath();
      route.forEach((p, i)=>{ const q = px(p); if(i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // markers, then labels (labels avoid each other)
    const fs = route.length > 10 ? 22 : 26;
    const placed = [];
    const rects = [];
    const r = ordered ? 21 : 15;
    route.forEach((p, i)=>{
      const q = px(p);
      if(ordered){
        ctx.fillStyle = C.greenDeep; ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.paperCard; ctx.font = "700 22px " + MONO; ctx.textAlign = "center";
        ctx.fillText(String(i + 1), q.x, q.y + 8);
      } else {
        ctx.fillStyle = C.green; ctx.strokeStyle = C.greenDeep; ctx.lineWidth = 3; ctx.lineJoin = "round";
        ctx.beginPath(); ctx.moveTo(q.x - 17, q.y + 13); ctx.lineTo(q.x - 3, q.y - 15); ctx.lineTo(q.x + 5, q.y - 5); ctx.lineTo(q.x + 10, q.y - 11); ctx.lineTo(q.x + 19, q.y + 13); ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
      placed.push({ p, q });
      rects.push({ x: q.x - r, y: q.y - r, w: r * 2, h: r * 2 });
    });
    ctx.font = "600 " + fs + "px " + SERIF; ctx.textAlign = "left";
    const inside = b=> b.x > x0 + 12 && b.x + b.w < x0 + w - 12 && b.y > y + 12 && b.y + b.h < y + h - 40;
    const hit = (a, b)=> a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    placed.forEach(({ p, q })=>{
      const tw = ctx.measureText(p.name).width, th = fs;
      const gap = r + 8;
      const cands = [
        { x: q.x - tw / 2, y: q.y - gap - th },
        { x: q.x - tw / 2, y: q.y + gap },
        { x: q.x + gap, y: q.y - th / 2 },
        { x: q.x - gap - tw, y: q.y - th / 2 }
      ].map(c=> ({ x: c.x, y: c.y, w: tw, h: th }));
      const spot = cands.find(c=> inside(c) && !rects.some(b=> hit(c, b)));
      if(!spot) return;
      rects.push(spot);
      ctx.lineWidth = 7; ctx.strokeStyle = C.paperCard; ctx.lineJoin = "round";
      ctx.strokeText(p.name, spot.x, spot.y + th * 0.8);
      ctx.fillStyle = C.ink; ctx.fillText(p.name, spot.x, spot.y + th * 0.8);
    });

    // north arrow, scale bar, caption
    ctx.textAlign = "center"; ctx.fillStyle = C.ink;
    const nx = x0 + w - 50, ny = y + 62;
    ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(nx, ny - 34); ctx.moveTo(nx - 9, ny - 24); ctx.lineTo(nx, ny - 36); ctx.lineTo(nx + 9, ny - 24); ctx.stroke();
    ctx.font = "700 22px " + SERIF; ctx.fillText("N", nx, ny + 22);
    const pxPerKm = scale * (1 / 111.32);   // flat units are degrees of latitude, 111.32 km each
    const km = niceKm((w * 0.22) / pxPerKm);
    const bx = x0 + 44, by = y + h - 62, bw = km * pxPerKm;
    ctx.strokeStyle = C.ink; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(bx, by - 8); ctx.lineTo(bx, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by - 8); ctx.stroke();
    const halo = (text, tx, ty)=>{ ctx.lineWidth = 8; ctx.strokeStyle = C.paperCard; ctx.lineJoin = "round"; ctx.strokeText(text, tx, ty); };
    ctx.textAlign = "left"; ctx.font = "600 22px " + MONO; ctx.fillStyle = C.inkSoft;
    const kmText = km < 1 ? km * 1000 + " m" : km + " km";
    halo(kmText, bx, by - 16); ctx.fillText(kmText, bx, by - 16);
    ctx.textAlign = "center"; ctx.font = "400 21px " + MONO; ctx.fillStyle = C.inkSoft;
    const cap = fit(ctx, o.caption || (ordered ? "Numbered in the order they were ticked" : "Summits joined in a likely order, not the exact path"), w - 120);
    halo(cap, x0 + w / 2, y + h - 22); ctx.fillText(cap, x0 + w / 2, y + h - 22);
    ctx.restore();
    return y + h + 24;
  }

  const plural = (n, a, b)=> n + " " + (n === 1 ? a : b);
  const toBlob = c=> new Promise(res=> c.toBlob(res, "image/jpeg", 0.92));

  async function dayCard(d){
    await ensureFonts();
    const { canvas, ctx } = newCard();
    let y = heading(ctx, TOP, "TICKED TODAY", plural(d.fells.length, "fell", "fells"), d.dateLabel);
    y = stats(ctx, y, [
      { v: d.climbed + " / " + d.total, l: "FELLS CLIMBED" },
      { v: d.percent + "%", l: "COMPLETE" },
      { v: d.gain.toLocaleString() + "m", l: "SUMMIT HEIGHT" }
    ]);
    if(d.map !== false){
      const next = BOTTOM - y - 300 >= 340 ? mapPanel(ctx, y, Math.min(660, BOTTOM - y - 300), { fells: d.fells, ordered: true }) : null;
      if(next != null) y = next;
    }
    list(ctx, y, d.fells.map(f=> ({ left: f.name, right: f.m + "m" })), { maxRows: 12 });
    footer(ctx);
    return toBlob(canvas);
  }

  // the bottom list of the hike card: who hiked, or the fells with their heights (the person sharing picks)
  const hikeRows = d=> d.show === "fells" && d.fellRows
    ? d.fellRows.map(f=> ({ left: f.name, right: f.m ? f.m + "m" : "" }))
    : d.people.map(p=> ({ left: p.name, right: p.handle ? "@" + p.handle : "" }));
  async function hikeCard(d){
    await ensureFonts();
    const { canvas, ctx } = newCard();
    let y = heading(ctx, TOP, d.past ? "WE WALKED" : "WALKING TOGETHER", d.title, d.dateLabel);
    const bits = [plural(d.fells.length, "fell", "fells")];
    if(d.miles) bits.push(d.miles + " mi");
    if(d.ascent) bits.push(d.ascent + " metres up");
    y = stats(ctx, y, bits.map((b, i)=> ({ v: b.split(" ")[0], l: b.split(" ").slice(1).join(" ").toUpperCase() })));
    // a map of the fells, or (if none can be placed) the names as one wrapped line
    const mapped = d.map === false || BOTTOM - y - 300 < 340 ? null : mapPanel(ctx, y, Math.min(660, BOTTOM - y - 300), { fells: d.fells, hint: startHint(d.label) });
    if(mapped != null) y = mapped;
    else {
      ctx.textAlign = "center"; ctx.fillStyle = C.inkSoft;
      ctx.font = "italic 500 32px " + SERIF;
      const fl = wrap(ctx, d.fells.join(" · "), W - M * 2).slice(0, 4);
      fl.forEach(l=>{ ctx.fillText(l, W / 2, y); y += 44; });
      y += 14;
    }
    list(ctx, y, hikeRows(d), { maxRows: 12 });
    footer(ctx);
    return toBlob(canvas);
  }

  async function teamCard(d){
    await ensureFonts();
    const { canvas, ctx } = newCard();
    let y = heading(ctx, TOP, "TEAM PROGRESS", d.name, plural(d.members.length, "member", "members"));
    y = stats(ctx, y, [
      { v: d.union + " / " + d.total, l: "FELLS (TEAM)" },
      { v: d.percent + "%", l: "COMPLETE" },
      { v: d.elevation.toLocaleString() + "m", l: "ELEVATION" }
    ]);
    list(ctx, y, d.members.map(m=> ({ left: m.name, right: m.climbed + " / " + d.total })), { maxRows: 14, maxRowH: 58 });
    footer(ctx);
    return toBlob(canvas);
  }

  // invitation: "I'm hosting a hike, join me". No meeting point, no link in the
  // image (the link is the access token; it goes on as a link sticker instead).
  async function inviteCard(d){
    await ensureFonts();
    const { canvas, ctx } = newCard();
    let y = heading(ctx, TOP, "JOIN ME ON A HIKE", d.title, d.dateLabel);
    const bits = [{ v: String(d.fells.length), l: d.fells.length === 1 ? "FELL" : "FELLS" }];
    if(d.miles) bits.push({ v: String(d.miles), l: "MILES" });
    if(d.ascent) bits.push({ v: String(d.ascent), l: "METRES UP" });
    y = stats(ctx, y, bits);
    const mapped = d.map === false || BOTTOM - y - 340 < 340 ? null : mapPanel(ctx, y, Math.min(620, BOTTOM - y - 340), { fells: d.fells, hint: startHint(d.label) });
    if(mapped != null) y = mapped;
    else {
      ctx.textAlign = "center"; ctx.fillStyle = C.inkSoft;
      ctx.font = "italic 500 32px " + SERIF;
      wrap(ctx, d.fells.join(" · "), W - M * 2).slice(0, 4).forEach(l=>{ ctx.fillText(l, W / 2, y); y += 44; });
      y += 20;
    }
    const rows = [
      { left: "Hosted by", right: d.host },
      { left: "Area", right: d.area },
      { left: "Places left", right: d.left + " of " + d.spaces }
    ];
    if(d.start) rows.push({ left: "Starts", right: d.start });
    y = list(ctx, y, rows, { maxRowH: mapped != null ? 56 : 70 });
    ctx.fillStyle = C.green; ctx.font = "700 34px " + MONO;
    if(y + 90 < FOOT - 60) spaced(ctx, "TAP THE LINK TO ASK FOR A PLACE", W / 2, y + 50, 2);
    footer(ctx);
    return toBlob(canvas);
  }

  // returns "shared" | "downloaded" | "cancelled"
  async function share(blob, filename, title){
    const file = new File([blob], filename, { type: "image/jpeg" });
    if(navigator.canShare && navigator.canShare({ files: [file] })){
      try{ await navigator.share({ files: [file], title: title }); return "shared"; }
      catch(err){ if(err && err.name === "AbortError") return "cancelled"; console.error("Share failed", err); }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=> URL.revokeObjectURL(url), 1000);
    return "downloaded";
  }

  // wraps a button: shows progress, builds, shares, restores the label
  async function run(btn, build, filename, title){
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = "Preparing…";
    try{
      const blob = await build();
      const res = await share(blob, filename, title);
      btn.textContent = res === "downloaded" ? "Saved — add it to your story from photos" : label;
      setTimeout(()=>{ btn.textContent = label; btn.disabled = false; }, res === "downloaded" ? 3000 : 0);
      if(res !== "downloaded") btn.disabled = false;
    }catch(err){
      console.error("Story failed", err);
      btn.textContent = "Couldn't build image";
      setTimeout(()=>{ btn.textContent = label; btn.disabled = false; }, 2200);
    }
  }

  // milestones: your real count up top, then every milestone as a checklist (passed ones crossed out, the next one boxed) with the countdown.
  // d = { title, dateLabel, climbed, total, percent, elevation, milestones: [{ n, label }], next, nextLabel, toGo }
  async function milestoneCard(d){
    await ensureFonts();
    const { canvas, ctx } = newCard();
    let y = heading(ctx, TOP, "MILESTONES", d.title, d.dateLabel);
    // ring: share of the 214 done, percent inside
    const tight = BOTTOM - y < 1000;
    const cx = W / 2, R = tight ? 90 : 150, LW = tight ? 26 : 38, cy = y + R + 24;
    ctx.lineWidth = LW; ctx.lineCap = "round";
    ctx.strokeStyle = C.paperDeep; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    const frac = Math.max(0.004, Math.min(1, d.climbed / d.total));
    ctx.strokeStyle = C.green; ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
    ctx.lineCap = "butt";
    ctx.textAlign = "center"; ctx.fillStyle = C.greenDeep;
    ctx.font = "700 " + (tight ? 64 : 112) + "px " + SERIF; ctx.fillText(d.percent + "%", cx, cy + (tight ? 22 : 36));
    if(!tight){ ctx.fillStyle = C.inkSoft; ctx.font = "400 22px " + MONO; spaced(ctx, "COMPLETE", cx, cy + 78, 3); }
    y = cy + R + LW / 2 + (tight ? 36 : 52);
    ctx.fillStyle = C.inkSoft; ctx.font = "400 28px " + MONO; ctx.textAlign = "center";
    ctx.fillText((d.total - d.climbed) + " to go  ·  " + d.elevation.toLocaleString() + "m climbed", W / 2, y);
    y += 40;
    // the checklist panel
    const items = d.milestones || [], cols = 2, rows = Math.ceil(items.length / cols), rowH = tight ? 56 : 74, headH = tight ? 84 : 104;
    const ph = headH + rows * rowH + 22;
    panel(ctx, y, ph);
    ctx.textAlign = "left"; ctx.fillStyle = C.green; ctx.font = "700 26px " + MONO;
    spaced(ctx, d.next ? "NEXT UP" : "WAINWRIGHT COMPLETE", M + 8, y + 50, 4, "left");
    if(d.next){
      ctx.textAlign = "right"; ctx.font = "700 34px " + MONO; ctx.fillStyle = C.green;
      ctx.fillText(d.toGo + (d.toGo === 1 ? " fell to go" : " fells to go"), W - M - 8, y + 52);
    }
    const colW = (W - (M - 16) * 2 - 32) / cols, x0 = M - 16 + 16;
    items.forEach((m, i)=>{
      const col = Math.floor(i / rows), row = i % rows;
      const x = x0 + col * colW, ry = y + headH + row * rowH;
      const passed = d.climbed >= m.n, isNext = d.next === m.n;
      if(isNext){ ctx.strokeStyle = C.green; ctx.lineWidth = 4; ctx.strokeRect(x - 4, ry - 6, colW - 20, rowH - 8); }
      // tick for passed, empty circle otherwise
      const tx = x + 26, ty = ry + rowH / 2 - 8;
      ctx.lineWidth = 3.5; ctx.strokeStyle = passed ? C.green : C.inkFaint;
      ctx.beginPath(); ctx.arc(tx, ty, 17, 0, Math.PI * 2); ctx.stroke();
      if(passed){ ctx.beginPath(); ctx.moveTo(tx - 8, ty + 1); ctx.lineTo(tx - 2, ty + 8); ctx.lineTo(tx + 9, ty - 7); ctx.stroke(); }
      ctx.textAlign = "left";
      ctx.font = (isNext ? "700 " : "600 ") + "40px " + SERIF;
      ctx.fillStyle = passed ? C.inkFaint : isNext ? C.greenDeep : C.ink;
      const label = m.label, lx = x + 62, ly = ry + rowH / 2 + 4;
      ctx.fillText(label, lx, ly);
      if(passed){   // crossed out
        const w = ctx.measureText(label).width;
        ctx.strokeStyle = C.inkSoft; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(lx - 4, ly - 13); ctx.lineTo(lx + w + 4, ly - 13); ctx.stroke();
      }
    });
    footer(ctx);
    return toBlob(canvas);
  }

  // ======================================================================================
  // Layouts, sizes, themes, the new cards (challenge, summit, recap) and the share sheet.
  // Every card is described by a small "model" (kicker, title, sub, a big number, three stats, a list, a map spec); the Map, Photo
  // and Poster layouts draw any model, and the Classic layout is each card's own design (the functions above, plus three new ones).
  // ======================================================================================
  const LAYOUTS = [["classic", "Classic"], ["map", "Map"], ["photo", "Photo"], ["poster", "Poster"]];
  // layouts that make no sense for a card (the progress card's Poster just listed the regions)
  const SKIP_LAYOUT = { progress: ["poster"] };
  const SIZE_LABELS = [["story", "Story 9:16"], ["post", "Post 4:5"], ["square", "Square"]];
  const THEME_LABELS = [["paper", "Paper"], ["dark", "Dark"], ["forest", "Forest"], ["contrast", "Bold"]];

  const fmtM = n=> Math.round(n).toLocaleString() + "m";

  // ---- models ----
  function modelFor(kind, d){
    if(kind === "day") return {
      kicker: "TICKED TODAY", title: plural(d.fells.length, "fell", "fells"), sub: d.dateLabel,
      big: { v: String(d.fells.length), l: d.fells.length === 1 ? "FELL TODAY" : "FELLS TODAY" },
      stats: [{ v: d.climbed + " / " + d.total, l: "CLIMBED" }, { v: d.percent + "%", l: "COMPLETE" }, { v: d.gain.toLocaleString() + "m", l: "SUMMITS" }],
      rows: d.fells.map(f=> ({ left: f.name, right: f.m + "m" })), map: { fells: d.fells, ordered: true }
    };
    if(kind === "hike"){
      const bits = [{ v: String(d.fells.length), l: d.fells.length === 1 ? "FELL" : "FELLS" }];
      if(d.miles) bits.push({ v: String(d.miles), l: "MILES" });
      if(d.ascent) bits.push({ v: String(d.ascent), l: "METRES UP" });
      return { kicker: d.past ? "WE WALKED" : "WALKING TOGETHER", title: d.title, sub: d.dateLabel, big: { v: String(d.fells.length), l: d.fells.length === 1 ? "FELL" : "FELLS" },
        stats: bits, rows: hikeRows(d), rowsAre: d.show === "fells" ? "fells" : "people", map: { fells: d.fells, hint: startHint(d.label) } };
    }
    if(kind === "invite"){
      const bits = [{ v: String(d.fells.length), l: d.fells.length === 1 ? "FELL" : "FELLS" }];
      if(d.miles) bits.push({ v: String(d.miles), l: "MILES" });
      if(d.ascent) bits.push({ v: String(d.ascent), l: "METRES UP" });
      const rows = [{ left: "Hosted by", right: d.host }, { left: "Area", right: d.area }, { left: "Places left", right: d.left + " of " + d.spaces }];
      if(d.start) rows.push({ left: "Starts", right: d.start });
      return { kicker: "JOIN ME ON A HIKE", title: d.title, sub: d.dateLabel, big: { v: String(d.left), l: d.left === 1 ? "PLACE LEFT" : "PLACES LEFT" }, stats: bits, rows, map: { fells: d.fells, hint: startHint(d.label) } };
    }
    if(kind === "team") return {
      kicker: "TEAM PROGRESS", title: d.name, sub: plural(d.members.length, "member", "members"), big: { v: String(d.union), l: "FELLS (TEAM)" },
      stats: [{ v: d.union + " / " + d.total, l: "FELLS (TEAM)" }, { v: d.percent + "%", l: "COMPLETE" }, { v: d.elevation.toLocaleString() + "m", l: "ELEVATION" }],
      rows: d.members.map(m=> ({ left: m.name, right: m.climbed + " / " + d.total })), rowsAre: "people", map: null
    };
    if(kind === "milestone"){
      const rows = (d.milestones || []).map(m=> ({ left: m.label, right: d.climbed >= m.n ? "done" : (m.n - d.climbed) + " to go" }));
      return { kicker: "MILESTONES", title: d.title, sub: d.dateLabel, big: { v: d.percent + "%", l: "COMPLETE" },
        stats: [{ v: String(d.total - d.climbed), l: "TO GO" }, { v: d.percent + "%", l: "COMPLETE" }, { v: d.elevation.toLocaleString() + "m", l: "ELEVATION" }],
        rows: rows.filter(r=> r.right !== "done").slice(0, 5), map: { all: true, climbed: new Set(d.climbedNames || []) } };
    }
    if(kind === "progress") return {
      kicker: "MY PROGRESS", title: d.climbed + (d.climbed === 1 ? " fell" : " fells") + " climbed", sub: d.dateLabel, big: { v: d.percent + "%", l: "COMPLETE" },
      stats: [{ v: d.climbed + " / " + d.total, l: "FELLS CLIMBED" }, { v: d.percent + "%", l: "COMPLETE" }, { v: d.elevation.toLocaleString() + "m", l: "ELEVATION" }],
      rows: d.regions.map(r=> ({ left: r.name.replace(/^The /, ""), right: r.climbed + " / " + r.total })), map: { all: true, climbed: new Set(d.climbedNames || []) },
      regions: d.regions, maxRows: d.regions.length   // all the regions are shown (as rings on the Map layout, as rows on the Photo layout), never "+ n more"
    };
    if(kind === "challenge"){
      const items = d.items || [], todo = items.filter(i=> !i.done);
      return { kicker: "CHALLENGE", title: d.label, sub: d.done + " OF " + d.total + " DONE", big: { v: d.done + "/" + d.total, l: "DONE" },
        stats: [{ v: String(d.done), l: "DONE" }, { v: String(d.total - d.done), l: "TO GO" }, { v: d.percent + "%", l: "COMPLETE" }],
        rows: (todo.length ? todo : items).map(i=> ({ left: i.name, right: i.m + "m" })),
        map: { fells: items.map(i=> i.name), climbed: new Set(items.filter(i=> i.done).map(i=> i.name)), zoom: true, label: items.length <= 14 } };
    }
    if(kind === "summit") return {
      kicker: "SUMMIT" + (d.region ? " · " + d.region.toUpperCase() : ""), title: d.name, sub: d.tickedLabel || d.region || "", big: { v: d.m + "m", l: "HEIGHT" },
      stats: [{ v: d.m + "m", l: "HEIGHT" }, { v: Math.round(d.ft).toLocaleString() + "ft", l: "IN FEET" }, { v: d.gr, l: "GRID REF" }],
      rows: [], map: { fells: [d.name] }
    };
    if(kind === "recap"){
      const top = d.fells.slice().sort((a, b)=> b.m - a.m);
      return { kicker: d.kicker, title: plural(d.fells.length, "fell", "fells"), sub: d.range, big: { v: String(d.fells.length), l: d.fells.length === 1 ? "FELL" : "FELLS" },
        stats: [{ v: String(d.days), l: d.days === 1 ? "DAY OUT" : "DAYS OUT" }, { v: d.elevation.toLocaleString() + "m", l: "SUMMITS" }, { v: String(d.streak), l: d.streak === 1 ? "WEEK IN A ROW" : "WEEKS IN A ROW" }],
        rows: top.slice(0, 6).map(f=> ({ left: f.name, right: f.m + "m" })), rowsAre: "fells", map: null };
    }
    throw new Error("unknown card " + kind);
  }

  // ---- shared drawing helpers for the new layouts ----
  function bars(ctx, y, h, buckets){
    const x0 = M - 16, w = W - x0 * 2;
    panel(ctx, y, h);
    const n = Math.max(1, buckets.length), padX = 36, top = y + 70, base = y + h - 62, max = Math.max(1, ...buckets.map(b=> b.n));
    const slot = (w - padX * 2) / n, bw = Math.min(110, slot * 0.66);
    ctx.textAlign = "center";
    buckets.forEach((b, i)=>{
      const bx = x0 + padX + slot * i + (slot - bw) / 2, bh = b.n ? Math.max(10, (base - top) * (b.n / max)) : 6;
      ctx.fillStyle = b.n ? C.green : C.inkFaint; ctx.globalAlpha = b.n ? 1 : 0.35; ctx.fillRect(bx, base - bh, bw, bh); ctx.globalAlpha = 1;
      if(b.n){ ctx.fillStyle = C.greenDeep; ctx.font = "700 " + (n > 8 ? 34 : 46) + "px " + SERIF; ctx.fillText(String(b.n), bx + bw / 2, base - bh - 12); }
      ctx.fillStyle = C.inkSoft; ctx.font = "700 " + (n > 8 ? 20 : 26) + "px " + MONO; ctx.fillText(b.label, bx + bw / 2, base + 38);
    });
    return y + h + 24;
  }

  // a checklist in columns: ticked items crossed out
  function checklist(ctx, y, items, o){
    o = o || {};
    const avail = BOTTOM - y - 20, x0 = M - 16, w = W - x0 * 2;
    let cols = 1, rows = items.length, rh = 0;
    for(cols = 1; cols <= 3; cols++){ rows = Math.ceil(items.length / cols); rh = (avail - 40) / rows; if(rh >= 46) break; }
    cols = Math.min(cols, 3); rows = Math.ceil(items.length / cols); rh = Math.max(38, Math.min(64, Math.floor((avail - 40) / rows)));
    let shown = items;
    const cap = Math.floor((avail - 40) / rh) * cols;
    if(items.length > cap) shown = items.slice(0, Math.max(1, cap - 1));
    const more = items.length - shown.length;
    rows = Math.ceil((shown.length + (more ? 1 : 0)) / cols);
    const ph = rows * rh + 40;
    panel(ctx, y, ph);
    const colW = (w - 32) / cols, fs = Math.max(24, Math.min(36, Math.floor(rh * 0.56)));
    const all = more ? shown.concat([{ label: "+ " + more + " more", more: true }]) : shown;
    all.forEach((it, i)=>{
      const col = Math.floor(i / rows), row = i % rows, x = x0 + 16 + col * colW, ry = y + 20 + row * rh, cy = ry + rh / 2;
      if(it.more){ ctx.fillStyle = C.inkSoft; ctx.font = "italic 500 " + (fs - 2) + "px " + SERIF; ctx.textAlign = "left"; ctx.fillText(it.label, x + 8, cy + fs * 0.3); return; }
      const rad = Math.round(fs * 0.5);
      ctx.lineWidth = 3.5; ctx.strokeStyle = it.done ? C.green : C.inkFaint;
      ctx.beginPath(); ctx.arc(x + rad + 6, cy, rad, 0, Math.PI * 2); ctx.stroke();
      if(it.done){ ctx.beginPath(); ctx.moveTo(x + rad - 2, cy + 1); ctx.lineTo(x + rad + 4, cy + rad * 0.5); ctx.lineTo(x + rad + 15, cy - rad * 0.45); ctx.stroke(); }
      ctx.textAlign = "left"; ctx.font = "600 " + fs + "px " + SERIF; ctx.fillStyle = it.done ? C.inkFaint : C.ink;
      const tx = x + rad * 2 + 22, label = fit(ctx, it.label, colW - rad * 2 - 40);
      ctx.fillText(label, tx, cy + fs * 0.32);
      if(it.done){ const tw = ctx.measureText(label).width; ctx.strokeStyle = C.inkSoft; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(tx - 3, cy); ctx.lineTo(tx + tw + 3, cy); ctx.stroke(); }
    });
    return y + ph + 24;
  }

  // all 214 fells as dots (climbed ones filled); `zoom` crops to the chosen fells and names the nearby ones
  function allMap(ctx, y, h, o){
    if(SKETCH) return sketchPanel(ctx, y, h, { fells: (o.fells || []).map(n=> typeof n === "string" ? n : n.name), climbed: o.climbed, zoom: o.zoom, label: o.label, all: !o.zoom, caption: o.caption || (o.climbed ? "Inked in = climbed" : o.zoom ? "The fells around it" : "") });
    const idx = fellByName(), names = Object.keys(idx).filter(n=> idx[n].lat != null);
    const hi = (o.fells || []).map(n=> idx[typeof n === "string" ? n : n.name]).filter(Boolean);
    const lat0 = names.reduce((a, n)=> a + idx[n].lat, 0) / names.length, k = Math.cos(lat0 * D2R);
    const P = f=> ({ u: f.lng * k, v: -f.lat });
    const x0 = M - 16, w = W - x0 * 2;
    panel(ctx, y, h);
    let pts = names.map(n=> P(idx[n]));
    if(o.zoom && hi.length){ pts = hi.map(P); }
    let minU = Math.min(...pts.map(p=> p.u)), maxU = Math.max(...pts.map(p=> p.u)), minV = Math.min(...pts.map(p=> p.v)), maxV = Math.max(...pts.map(p=> p.v));
    if(o.zoom){ const pu = Math.max(0.03, (maxU - minU) * 0.25), pv = Math.max(0.03, (maxV - minV) * 0.25); minU -= pu; maxU += pu; minV -= pv; maxV += pv; }
    const padX = 40, padY = 56, aw = w - padX * 2, ah = h - padY * 2, scale = Math.min(aw / (maxU - minU), ah / (maxV - minV));
    const ox = x0 + w / 2 - ((minU + maxU) / 2) * scale, oy = y + h / 2 - ((minV + maxV) / 2) * scale;
    const Q = f=> { const p = P(f); return { x: ox + p.u * scale, y: oy + p.v * scale }; };
    ctx.save(); ctx.beginPath(); ctx.rect(x0 + 2, y + 2, w - 4, h - 4); ctx.clip();
    osLayer(ctx, { x0, y, w, h, ox, oy, cu: 0, cv: 0, scale, k });   // optional OS map underneath
    const hiSet = new Set((o.fells || []).map(n=> typeof n === "string" ? n : n.name));
    names.forEach(n=>{
      const q = Q(idx[n]), done = o.climbed && o.climbed.has(n), isHi = hiSet.has(n);
      const r = o.zoom ? (isHi ? 13 : 7) : 6.5;
      if(done){ ctx.fillStyle = C.green; ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.strokeStyle = isHi ? C.greenDeep : C.inkFaint; ctx.lineWidth = isHi ? 4 : 2; ctx.globalAlpha = isHi ? 1 : 0.6; ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
    });
    if(o.zoom){
      ctx.font = "600 24px " + SERIF; ctx.textAlign = "left";
      names.forEach(n=>{
        const isHi = hiSet.has(n); if(!isHi && hiSet.size > 3) return;
        if(isHi && o.label === false) return;
        const q = Q(idx[n]); if(q.x < x0 + 10 || q.x > x0 + w - 150 || q.y < y + 20 || q.y > y + h - 30) return;
        ctx.lineWidth = 6; ctx.strokeStyle = C.paperCard; ctx.strokeText(n, q.x + 18, q.y + 8); ctx.fillStyle = isHi ? C.ink : C.inkSoft; ctx.fillText(n, q.x + 18, q.y + 8);
      });
    }
    ctx.restore();
    ctx.fillStyle = C.inkSoft; ctx.font = "400 21px " + MONO; ctx.textAlign = "center";
    ctx.fillText(o.caption || (o.climbed ? "Filled = climbed" : o.zoom ? "The fells around it" : ""), x0 + w / 2, y + h - 18);
    return y + h + 24;
  }

  // ---- Classic for the three new cards ----
  function classicChallenge(m, d){
    const { canvas, ctx } = newCard();
    let y = heading(ctx, TOP, m.kicker, m.title, m.sub);
    if(H > 1200) y = stats(ctx, y, m.stats);
    checklist(ctx, y, (d.items || []).map(i=> ({ label: i.name, done: i.done })));
    footer(ctx); return canvas;
  }
  // one ring per region (the original progress card's design), in the current theme
  function regionRings(ctx, y, regions){
    const n = regions.length, ringD = Math.floor((W - M * 2) / n - 8), r = ringD / 2 - 8, gap = (W - M * 2 - ringD * n) / Math.max(1, n - 1);
    regions.forEach((rg, i)=>{
      const cx = M + ringD / 2 + i * (ringD + gap), cy = y + ringD / 2;
      ctx.lineWidth = 8; ctx.strokeStyle = C.paperDeep; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      if(rg.percent > 0){ ctx.strokeStyle = C.green; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (rg.percent / 100) * Math.PI * 2); ctx.stroke(); }
      ctx.textAlign = "center"; ctx.fillStyle = C.greenDeep; ctx.font = "700 30px " + SERIF; ctx.fillText(rg.percent + "%", cx, cy + 2);
      ctx.font = "400 15px " + MONO; ctx.fillStyle = C.inkFaint; ctx.fillText(rg.climbed + " / " + rg.total, cx, cy + 26);
      ctx.font = "600 18px " + SERIF; ctx.fillStyle = C.ink;
      const label = rg.name.replace(/^The /, "").replace(/ Fells$/, ""), words = label.split(" ");
      if(words.length > 1){ ctx.fillText(words.slice(0, -1).join(" "), cx, cy + ringD / 2 + 28); ctx.fillText(words[words.length - 1], cx, cy + ringD / 2 + 50); }
      else ctx.fillText(label, cx, cy + ringD / 2 + 28);
    });
    return y + ringD + 70;
  }
  function classicProgress(m, d){
    const { canvas, ctx } = newCard();
    let y = heading(ctx, TOP, m.kicker, m.title, m.sub);
    if(H > 1000) y = stats(ctx, y, m.stats);
    const ringsH = H > 1200 ? 190 : 0, mh = BOTTOM - y - ringsH - 10;
    if(mh >= 300) y = allMap(ctx, y, Math.min(760, mh), { climbed: new Set(d.climbedNames || []) });
    if(ringsH) regionRings(ctx, y, d.regions);
    footer(ctx); return canvas;
  }
  function classicSummit(m, d){
    const { canvas, ctx } = newCard();
    let y = heading(ctx, TOP, m.kicker, m.title, m.sub);
    const sh = Math.max(280, Math.min(720, BOTTOM - y - 260)), x0 = M - 16, w = W - x0 * 2;
    if(PHOTO){
      ctx.fillStyle = C.paperCard; ctx.fillRect(x0 - 8, y, w + 16, sh + 16); ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.strokeRect(x0 - 8, y, w + 16, sh + 16);
      ctx.save(); ctx.beginPath(); ctx.rect(x0, y + 8, w, sh); ctx.clip();
      const sc = Math.max(w / PHOTO.width, sh / PHOTO.height); ctx.drawImage(PHOTO, x0 + (w - PHOTO.width * sc) / 2, y + 8 + (sh - PHOTO.height * sc) / 2, PHOTO.width * sc, PHOTO.height * sc);
      ctx.restore(); y += sh + 40;
    } else {
      const next = mapPanel(ctx, y, sh, { fells: [d.name], fixedH: true, caption: "Where it is" });
      y = next != null ? next : y;
    }
    y = stats(ctx, y, m.stats);
    if(d.climbed != null){ ctx.textAlign = "center"; ctx.fillStyle = C.inkSoft; ctx.font = "italic 500 34px " + SERIF; ctx.fillText(d.climbed + " of " + d.total + " fells climbed", W / 2, y + 6); }
    footer(ctx); return canvas;
  }
  function classicRecap(m, d){
    const { canvas, ctx } = newCard();
    let y = heading(ctx, TOP, m.kicker, m.title, m.sub);
    const tall = H > 1500;
    y = bars(ctx, y, tall ? 500 : Math.max(300, Math.min(420, BOTTOM - y - 330)), d.buckets);
    y = stats(ctx, y, m.stats);
    if(m.rows.length && BOTTOM - y > 200){ ctx.textAlign = "center"; ctx.fillStyle = C.green; ctx.font = "700 24px " + MONO; spaced(ctx, "HIGHEST", W / 2, y + 14, 4); list(ctx, y + 30, m.rows, { maxRows: tall ? 6 : 3, maxRowH: 54 }); }
    footer(ctx); return canvas;
  }
  const CLASSIC_NEW = { challenge: classicChallenge, summit: classicSummit, recap: classicRecap, progress: classicProgress };
  const CLASSIC_OLD = { day: dayCard, hike: hikeCard, invite: inviteCard, team: teamCard, milestone: milestoneCard };

  // ---- the three generic layouts ----
  function landscape(ctx){
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.7); sky.addColorStop(0, "#2c3e5e"); sky.addColorStop(0.55, "#d89a6a"); sky.addColorStop(1, "#f0cf9a");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    [["#7a6a86", 0.46, 150, 3], ["#4d5a66", 0.54, 210, 5], ["#2f4338", 0.64, 270, 7], ["#1b2a22", 0.78, 330, 11]].forEach(([col, base, amp, seed], li)=>{
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H);
      for(let px = 0; px <= W; px += 20){ const t = px / W; ctx.lineTo(px, H * base - amp * (Math.sin(t * seed + li) * 0.5 + Math.sin(t * seed * 2.3 + li * 2) * 0.3 + Math.sin(t * seed * 5.1) * 0.12 + 0.6) * (H / 1920)); }
      ctx.lineTo(W, H); ctx.fill();
    });
  }
  function photoBase(){
    const { canvas, ctx } = newCard();
    if(PHOTO){ const sc = Math.max(W / PHOTO.width, H / PHOTO.height); ctx.drawImage(PHOTO, (W - PHOTO.width * sc) / 2, (H - PHOTO.height * sc) / 2, PHOTO.width * sc, PHOTO.height * sc); }
    else landscape(ctx);
    const bot = ctx.createLinearGradient(0, H * 0.3, 0, H); bot.addColorStop(0, "rgba(0,0,0,0)"); bot.addColorStop(1, "rgba(0,0,0,0.82)"); ctx.fillStyle = bot; ctx.fillRect(0, H * 0.3, W, H * 0.7);
    const top = ctx.createLinearGradient(0, 0, 0, 480); top.addColorStop(0, "rgba(0,0,0,0.5)"); top.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = top; ctx.fillRect(0, 0, W, 480);
    return { canvas, ctx };
  }
  function photoLayout(m){
    const { canvas, ctx } = photoBase();
    ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 16;
    const rowsN = H > 1500 ? Math.min(m.maxRows || 5, (m.rows || []).length) : H > 1200 ? Math.min(3, (m.rows || []).length) : 0, rowH = H > 1500 && m.maxRows > 5 ? 52 : 58, statsH = m.stats && H > 1000 ? 140 : 0;
    let size = 120, lines;
    ctx.textAlign = "left";
    for(;;){ ctx.font = "700 " + size + "px " + SERIF; lines = wrap(ctx, m.title, W - M * 2); if((lines.length <= 2 && lines.every(l=> ctx.measureText(l).width <= W - M * 2)) || size <= 56) break; size -= 6; }
    lines = lines.slice(0, 2);
    const blockH = 56 + lines.length * size * 1.08 + 70 + statsH + (rowsN ? rowsN * rowH + 24 : 0);
    let y = Math.max(TOP + 10, BOTTOM - blockH);
    ctx.fillStyle = "#e6d9b0"; ctx.font = "700 28px " + MONO; spaced(ctx, m.kicker, M, y + 20, 4, "left"); y += 56;
    ctx.fillStyle = "#ffffff"; ctx.font = "700 " + size + "px " + SERIF; lines.forEach(l=>{ y += size * 1.08; ctx.fillText(fit(ctx, l, W - M * 2), M, y); });
    ctx.fillStyle = "#f1ecdd"; ctx.font = "400 32px " + MONO; y += 54; ctx.fillText(fit(ctx, m.sub || "", W - M * 2), M, y); y += 24;
    if(statsH){
      const cw = (W - M * 2) / m.stats.length; y += 24;
      m.stats.forEach((st, i)=>{ const x = M + cw * i; ctx.fillStyle = "#ffffff"; ctx.font = "700 " + (st.v.length > 9 ? 40 : 58) + "px " + SERIF; ctx.fillText(st.v, x, y + 54); ctx.fillStyle = "#e6d9b0"; ctx.font = "400 20px " + MONO; spaced(ctx, st.l, x, y + 88, 1.5, "left"); });
      y += 116;
    }
    if(rowsN){
      y += 4;
      (m.rows || []).slice(0, rowsN).forEach(r=>{ ctx.fillStyle = "#ffffff"; ctx.font = "600 38px " + SERIF; ctx.textAlign = "left"; ctx.fillText(fit(ctx, r.left, W - M * 2 - 200), M, y + 40); if(r.right){ ctx.textAlign = "right"; ctx.fillStyle = "#e6d9b0"; ctx.font = "400 30px " + MONO; ctx.fillText(r.right, W - M, y + 38); } y += rowH; });
    }
    ctx.shadowBlur = 0; ctx.textAlign = "center"; ctx.fillStyle = "#e6d9b0"; ctx.font = "700 26px " + MONO; spaced(ctx, "THE WAINWRIGHTS", W / 2, FOOT, 3); siteUrl(ctx, "#e6d9b0");
    return canvas;
  }
  function posterLayout(m){
    const { canvas, ctx } = newCard();
    const IW = W - 180;
    // measure first, so the block can sit in the middle of the card
    let size = Math.min(H * 0.28, 420);
    for(;;){ ctx.font = "700 " + size + "px " + SERIF; if(ctx.measureText(m.big.v).width <= IW || size < 120) break; size -= 12; }
    const showTitle = !String(m.title).toLowerCase().startsWith(String(m.big.v).toLowerCase());
    let ts = 60, tl = [];
    if(showTitle){ for(;;){ ctx.font = "700 " + ts + "px " + SERIF; tl = wrap(ctx, m.title, IW); if(tl.length <= 2 || ts <= 40) break; ts -= 6; } tl = tl.slice(0, 2); }
    ctx.font = "italic 500 42px " + SERIF;
    const names = (m.rows || []).map(r=> r.left).filter(n=> !/^(Hosted by|Area|Places left|Starts)$/.test(n)).slice(0, 8);
    const stacked = !!m.rowsAre && (m.rows || []).length && H > 1200;   // people (or a hike's fells with heights) stack one per line
    const stackRows = stacked ? (m.rows || []).slice(0, H > 1500 ? 6 : 3) : [];
    const nl = !stacked && names.length && H > 1200 ? wrap(ctx, names.join("  ·  "), IW).slice(0, H > 1500 ? 4 : 2) : [];
    const statsH = m.stats && H > 1000 ? 130 : 0;
    const total = 90 + size * 0.82 + 110 + (showTitle ? tl.length * ts * 1.15 + 20 : 0) + (nl.length ? nl.length * 56 + 20 : 0) + (stackRows.length ? stackRows.length * 54 + 30 : 0) + statsH;
    let y = TOP + Math.max(0, (BOTTOM - TOP - total) / 2 - 30);
    ctx.textAlign = "left"; ctx.fillStyle = C.green; ctx.font = "700 30px " + MONO; spaced(ctx, m.kicker, 90, y + 30, 4, "left");
    ctx.fillStyle = C.inkSoft; ctx.font = "400 28px " + MONO; ctx.fillText(fit(ctx, m.sub || "", IW), 90, y + 80);
    y += 90 + size * 0.82;
    ctx.font = "700 " + size + "px " + SERIF; ctx.fillStyle = C.greenDeep; ctx.fillText(m.big.v, 80, y);
    ctx.fillStyle = C.inkSoft; ctx.font = "400 34px " + MONO; spaced(ctx, m.big.l, 90, y + 56, 4, "left");
    y += 100; ctx.fillStyle = C.green; ctx.fillRect(90, y, 220, 10); y += 20;
    if(showTitle){ y += ts * 0.9; ctx.fillStyle = C.ink; tl.forEach(l=>{ ctx.font = "700 " + ts + "px " + SERIF; ctx.fillText(fit(ctx, l, IW), 90, y); y += ts * 1.15; }); y += 10; }
    if(stackRows.length){
      y += 34;
      stackRows.forEach(r=>{
        ctx.textAlign = "left"; ctx.fillStyle = C.ink; ctx.font = "600 38px " + SERIF; ctx.fillText(fit(ctx, r.left, IW - 260), 90, y);
        if(r.right){ ctx.textAlign = "right"; ctx.fillStyle = C.inkSoft; ctx.font = "400 28px " + MONO; ctx.fillText(r.right, W - 90, y - 4); }
        y += 54;
      });
      ctx.textAlign = "left"; y += 4;
    }
    if(nl.length){ y += 36; ctx.fillStyle = C.inkSoft; ctx.font = "italic 500 42px " + SERIF; nl.forEach(l=>{ ctx.fillText(l, 90, y); y += 56; }); y += 6; }
    if(statsH){
      y += 30; const cw = IW / m.stats.length;
      m.stats.forEach((st, i)=>{ const x = 90 + cw * i; ctx.fillStyle = C.greenDeep; ctx.font = "700 " + (st.v.length > 9 ? 36 : 52) + "px " + SERIF; ctx.textAlign = "left"; ctx.fillText(st.v, x, y + 46); ctx.fillStyle = C.inkSoft; ctx.font = "400 19px " + MONO; spaced(ctx, st.l, x, y + 80, 1.5, "left"); });
    }
    footer(ctx); return canvas;
  }
  function mapLayout(m){
    const { canvas, ctx } = newCard();
    let y = heading(ctx, TOP, m.kicker, m.title, m.sub);
    const ringsH = m.regions && H > 1200 ? 190 : 0;
    const statsH = m.stats && H > 1200 ? 150 : 0;
    // as many list rows as fit under a decent-sized map (so a four-fell day shows all four, not "+ 1 more")
    let rowsN = !ringsH && m.rows && H > 1500 ? Math.min(m.rows.length, 6) : 0;
    const rowsHFor = n=> n ? n * 56 + 56 : 0;
    while(rowsN > 0 && BOTTOM - y - statsH - rowsHFor(rowsN) - 10 < 460) rowsN--;
    const rowsH = ringsH || rowsHFor(rowsN);
    const mh = BOTTOM - y - statsH - rowsH - 10;
    if(!m.map){
      list(ctx, y, m.rows || [], { maxRows: 14, maxRowH: 62 });
    } else {
      if(mh >= 280){
        let next = null;
        if(m.map.all || m.map.zoom || !m.map.fells) next = allMap(ctx, y, mh, m.map.all ? { climbed: m.map.climbed } : m.map);
        else next = mapPanel(ctx, y, mh, { fells: m.map.fells, hint: m.map.hint, ordered: m.map.ordered, fixedH: true });
        y = next != null ? next : allMap(ctx, y, mh, {});
      }
      if(statsH) y = stats(ctx, y, m.stats);
      if(ringsH) regionRings(ctx, y, m.regions);
      else if(rowsN) list(ctx, y, m.rows, { maxRows: rowsN, maxRowH: 56 });
    }
    footer(ctx); return canvas;
  }

  // ---- Sketch map style (optional) ----
  // The tracker page's engraved look: little mountain glyphs at each summit's position on the sketch map (the x/y in fells-data.js, the same
  // coordinates the tracker uses), the fells in the card inked in and named, the rest faint. Pure drawing, no map data, so no licence question.
  let SKETCH = false;
  function sketchGlyph(ctx, x, y, t, gs, inked){
    const w = (5 + t * 7) * gs, h = (7 + t * 11) * gs;
    ctx.beginPath(); ctx.moveTo(x - w, y); ctx.lineTo(x - w * 0.25, y - h * 0.72); ctx.lineTo(x, y - h); ctx.lineTo(x + w * 0.4, y - h * 0.55); ctx.lineTo(x + w, y); ctx.closePath();
    if(inked){ ctx.fill(); }
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - w * 0.45, y - h * 0.12); ctx.lineTo(x, y - h * 0.78); ctx.stroke();
  }
  function sketchPanel(ctx, y, h, o){
    const idx = fellByName(), names = Object.keys(idx).filter(n=> idx[n].x != null);
    if(!names.length) return y + h + 24;
    const hs = names.map(n=> idx[n].m), hmin = Math.min(...hs), hmax = Math.max(...hs);
    const hiSet = new Set((o.fells || []).filter(n=> idx[n] && idx[n].x != null));
    const x0 = M - 16, w = W - x0 * 2;
    panel(ctx, y, h);
    let pool = o.all || !hiSet.size ? names : [...hiSet];
    let minX = Math.min(...pool.map(n=> idx[n].x)), maxX = Math.max(...pool.map(n=> idx[n].x)), minY = Math.min(...pool.map(n=> idx[n].y)), maxY = Math.max(...pool.map(n=> idx[n].y));
    const pad = o.all || !hiSet.size ? 0 : 0.25;
    const sx = Math.max(maxX - minX, 110), sy = Math.max(maxY - minY, 110);
    minX -= (sx - (maxX - minX)) / 2 + sx * pad; maxX = minX + sx * (1 + 2 * pad); minY -= (sy - (maxY - minY)) / 2 + sy * pad; maxY = minY + sy * (1 + 2 * pad);
    const padX = o.all ? 44 : 110, padT = o.all ? 60 : 90, padB = o.all ? 66 : 100;
    const scale = Math.min((w - padX * 2) / (maxX - minX), (h - padT - padB) / (maxY - minY));
    const ox = x0 + w / 2 - ((minX + maxX) / 2) * scale, oy = y + padT + (h - padT - padB) / 2 - ((minY + maxY) / 2) * scale;
    const Q = n=> ({ x: ox + idx[n].x * scale, y: oy + idx[n].y * scale });
    const gs = o.all ? 1.5 : 2.3, zoomed = !o.all;
    ctx.save(); ctx.beginPath(); ctx.rect(x0 + 2, y + 2, w - 4, h - 4); ctx.clip();
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    if(o.all && typeof FELLS_DATA !== "undefined"){
      ctx.fillStyle = C.inkFaint; ctx.font = "700 20px " + MONO; ctx.textAlign = "center"; ctx.globalAlpha = 0.7;
      FELLS_DATA.forEach(a=>{ const xs = a.fells.map(f=> f.x), ys = a.fells.map(f=> f.y); if(xs.some(v=> v == null)) return;
        spaced(ctx, a.name.replace(/^The /, "").toUpperCase(), ox + xs.reduce((p, q)=> p + q, 0) / xs.length * scale, oy + (ys.reduce((p, q)=> p + q, 0) / ys.length - 52) * scale, 2); });
      ctx.globalAlpha = 1;
    }
    const order = names.slice().sort((a, b)=> idx[a].y - idx[b].y);
    order.forEach(n=>{
      const q = Q(n); if(q.x < x0 - 20 || q.x > x0 + w + 20 || q.y < y - 20 || q.y > y + h + 20) return;
      const isHi = hiSet.has(n), done = !!(o.climbed && o.climbed.has(n)), t = (idx[n].m - hmin) / (hmax - hmin || 1);
      const inked = isHi ? !o.climbed || done : done;
      ctx.lineWidth = isHi ? 3 : 2; ctx.strokeStyle = isHi || done ? C.greenDeep : C.inkFaint; ctx.fillStyle = C.green; ctx.globalAlpha = isHi || done ? 1 : 0.55;
      sketchGlyph(ctx, q.x, q.y + 6 * gs, t, isHi && zoomed ? gs * 1.15 : gs, inked);
    });
    ctx.globalAlpha = 1;
    // names for the fells in the card, avoiding each other
    if(hiSet.size && o.label !== false && (zoomed || hiSet.size <= 3)){
      const fs = hiSet.size > 10 ? 22 : 26; ctx.font = "600 " + fs + "px " + SERIF; ctx.textAlign = "left";
      const rects = [];
      [...hiSet].forEach(n=>{
        const q = Q(n), tw = ctx.measureText(n).width, hh = 20 * gs / 2 + 8;
        const cands = [{ x: q.x + 18 + gs * 6, y: q.y - fs * 0.6 }, { x: q.x - 18 - gs * 6 - tw, y: q.y - fs * 0.6 }, { x: q.x - tw / 2, y: q.y + hh }, { x: q.x - tw / 2, y: q.y - hh - fs - 12 }].map(c=> ({ x: c.x, y: c.y, w: tw, h: fs }));
        const ok = c=> c.x > x0 + 12 && c.x + c.w < x0 + w - 12 && c.y > y + 12 && c.y + c.h < y + h - 40 && !rects.some(b=> c.x < b.x + b.w && c.x + c.w > b.x && c.y < b.y + b.h && c.y + c.h > b.y);
        const spot = cands.find(ok); if(!spot) return; rects.push(spot);
        ctx.lineWidth = 7; ctx.strokeStyle = C.paperCard; ctx.strokeText(n, spot.x, spot.y + fs * 0.8); ctx.fillStyle = C.ink; ctx.fillText(n, spot.x, spot.y + fs * 0.8);
      });
    }
    // north arrow and caption
    const nx = x0 + w - 50, ny = y + 62; ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.textAlign = "center"; ctx.fillStyle = C.ink;
    ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(nx, ny - 34); ctx.moveTo(nx - 9, ny - 24); ctx.lineTo(nx, ny - 36); ctx.lineTo(nx + 9, ny - 24); ctx.stroke();
    ctx.font = "700 22px " + SERIF; ctx.fillText("N", nx, ny + 22);
    ctx.restore();
    if(o.caption){ ctx.fillStyle = C.inkSoft; ctx.font = "400 21px " + MONO; ctx.textAlign = "center"; const ct = fit(ctx, o.caption, w - 120); ctx.lineWidth = 8; ctx.strokeStyle = C.paperCard; ctx.lineJoin = "round"; ctx.strokeText(ct, x0 + w / 2, y + h - 18); ctx.fillText(ct, x0 + w / 2, y + h - 18); }
    return y + h + 24;
  }

  // ---- OS map backdrop (optional) ----
  // An extra "Map" choice in the share sheet: OS Outdoor tiles drawn under the fells instead of the plain drawn map. Only OS OpenData is used
  // (Open Zoomstack, zoom 7 to 16: free to everyone under the Open Government Licence, so a picture of it may be shared) and every map panel carries
  // "Contains OS data (c) Crown copyright and database right <year>" on the image itself, as the OS API terms require for copies of the data.
  // How it works: a first, discarded pass records where each map panel sits and how it is scaled; the tiles that cover those panels are fetched
  // (with the signed-in user's OS token, never more than 16 per panel); then the card is drawn again with the tiles under the markers.
  let OSCAP = null, OSLAYERS = null, OSIDX = 0, OSFAILED = false;
  const osTiles = new Map();   // "z/x/y" -> ImageBitmap, kept while the page is open so flipping options doesn't refetch
  function osLayer(ctx, g){
    if(OSCAP){ OSCAP.push(g); return; }
    if(OSLAYERS){ const layer = OSLAYERS[OSIDX++]; if(layer) drawOSLayer(ctx, g, layer); }
  }
  const gLng = (g, x)=> (g.cu + (x - g.ox) / g.scale) / g.k, gLat = (g, y)=> -(g.cv + (y - g.oy) / g.scale);
  const gX = (g, lng)=> g.ox + (lng * g.k - g.cu) * g.scale, gY = (g, lat)=> g.oy + (-lat - g.cv) * g.scale;
  const tileXY = (z, lat, lng)=> { const n = 2 ** z, r = lat * D2R; return { x: (lng + 180) / 360 * n, y: (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n }; };
  const tileLng = (z, x)=> x / 2 ** z * 360 - 180;
  const tileLat = (z, y)=> { const n = Math.PI - 2 * Math.PI * y / 2 ** z; return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };
  function osPlan(g){
    const west = gLng(g, g.x0), east = gLng(g, g.x0 + g.w), north = gLat(g, g.y), south = gLat(g, g.y + g.h);
    let z = Math.min(16, Math.max(7, Math.round(Math.log2(g.scale * g.k * 360 / 256))));
    for(;; z--){
      const a = tileXY(z, north, west), b = tileXY(z, south, east);
      const x0 = Math.floor(a.x), x1 = Math.floor(b.x), y0 = Math.floor(a.y), y1 = Math.floor(b.y);
      if((x1 - x0 + 1) * (y1 - y0 + 1) <= 16 || z <= 7) return { z, x0, x1, y0, y1 };
    }
  }
  async function osTile(z, x, y, retried){
    const key = z + "/" + x + "/" + y;
    if(osTiles.has(key)) return osTiles.get(key);
    const t = await OSMap.getToken(!!retried);
    const res = await fetch("https://api.os.uk/maps/raster/v1/zxy/Outdoor_3857/" + key + ".png", { headers: { Authorization: "Bearer " + t } });
    if(res.status === 401 && !retried) return osTile(z, x, y, true);
    if(!res.ok) throw new Error("tile_" + res.status);
    const bmp = await createImageBitmap(await res.blob());
    osTiles.set(key, bmp);
    return bmp;
  }
  async function buildOSLayers(caps){
    const layers = []; let loaded = 0;
    for(const g of caps){
      const p = osPlan(g), todo = [];
      for(let ty = p.y0; ty <= p.y1; ty++) for(let tx = p.x0; tx <= p.x1; tx++) todo.push({ x: tx, y: ty, img: null });
      let next = 0;
      await Promise.all(Array.from({ length: 5 }, async ()=>{
        while(next < todo.length){ const t = todo[next++]; try{ t.img = await osTile(p.z, t.x, t.y); loaded++; }catch(e){ /* a missing tile just leaves the paper colour */ } }
      }));
      layers.push({ z: p.z, tiles: todo });
    }
    if(!loaded) throw new Error("os_unavailable");
    return layers;
  }
  function drawOSLayer(ctx, g, L){
    L.tiles.forEach(t=>{
      if(!t.img) return;
      const x0 = gX(g, tileLng(L.z, t.x)), x1 = gX(g, tileLng(L.z, t.x + 1)), y0 = gY(g, tileLat(L.z, t.y)), y1 = gY(g, tileLat(L.z, t.y + 1));
      ctx.drawImage(t.img, x0, y0, x1 - x0 + 0.7, y1 - y0 + 0.7);
    });
    ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(g.x0, g.y, g.w, g.h);   // a light wash so the markers and labels stay readable
    const txt = "Contains OS data \u00a9 Crown copyright and database right " + new Date().getFullYear();
    ctx.save(); ctx.font = "600 21px " + MONO; const tw = ctx.measureText(txt).width;
    ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.fillRect(g.x0 + 8, g.y + 8, tw + 22, 36);
    ctx.fillStyle = "#1f2a22"; ctx.textAlign = "left"; ctx.fillText(txt, g.x0 + 19, g.y + 33); ctx.restore();
  }

  // ---- render (one at a time) ----
  let renderQueue = Promise.resolve();
  async function drawCard(kind, data, style){
    const layout = (style && style.layout) || "classic";
    if(layout === "classic"){
      if(CLASSIC_OLD[kind]) return CLASSIC_OLD[kind](data);
      const m = modelFor(kind, data);
      return toBlob(CLASSIC_NEW[kind](m, data));
    }
    const m = modelFor(kind, data);
    return toBlob(layout === "map" ? mapLayout(m) : layout === "photo" ? photoLayout(m) : posterLayout(m));
  }
  function renderCard(kind, data, style, photo){
    const job = renderQueue.then(async ()=>{
      await ensureFonts();
      setStyle(style); PHOTO = photo || null; OSFAILED = false; OSCAP = OSLAYERS = null;
      SKETCH = !!(style && style.mapStyle === "sketch" && (((style.layout) || "classic") === "classic" || style.layout === "map"));
      const layout = (style && style.layout) || "classic";
      if(style && style.mapStyle === "os" && window.OSMap && (layout === "classic" || layout === "map")){
        try{
          OSCAP = []; await drawCard(kind, data, style);          // first pass: just notes where the map panels are
          const caps = OSCAP; OSCAP = null;
          if(caps.length){ OSLAYERS = await buildOSLayers(caps); OSIDX = 0; }
        }catch(e){ console.warn("OS map unavailable for this card", e); OSCAP = OSLAYERS = null; OSFAILED = true; }
      }
      try{ return await drawCard(kind, data, style); }
      finally{ OSCAP = OSLAYERS = null; }
    });
    renderQueue = job.catch(()=>{});
    return job;
  }

  // ---- the photo: read on this device, drawn into the card, never uploaded ----
  const PREF_KEY = "ww_story_style", PHOTO_KEY = "ww_story_photo";
  async function photoFromFile(file){
    let src;
    try{ src = await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch(e){ src = await new Promise((res, rej)=>{ const im = new Image(); im.onload = ()=> res(im); im.onerror = rej; im.src = URL.createObjectURL(file); }); }
    const sw = src.width || src.naturalWidth, sh = src.height || src.naturalHeight, sc = Math.min(1, 1600 / Math.max(sw, sh));
    const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(sw * sc)); c.height = Math.max(1, Math.round(sh * sc));
    c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
    if(src.close) src.close();
    return c;   // re-drawing on a canvas drops the photo's metadata (including where it was taken)
  }
  async function photoFromDataUrl(u){
    return new Promise(res=>{ const im = new Image(); im.onload = ()=>{ const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; c.getContext("2d").drawImage(im, 0, 0); res(c); }; im.onerror = ()=> res(null); im.src = u; });
  }
  function rememberPhoto(c){
    try{
      if(!c){ localStorage.removeItem(PHOTO_KEY); return; }
      const sc = Math.min(1, 1200 / Math.max(c.width, c.height)), s = document.createElement("canvas"); s.width = Math.round(c.width * sc); s.height = Math.round(c.height * sc);
      s.getContext("2d").drawImage(c, 0, 0, s.width, s.height); localStorage.setItem(PHOTO_KEY, s.toDataURL("image/jpeg", 0.78));
    }catch(e){ /* storage full or blocked: just don't remember it */ }
  }

  // ---- the share sheet ----
  function loadPrefs(){
    let p = {}; try{ p = JSON.parse(localStorage.getItem(PREF_KEY) || "{}") || {}; }catch(e){}
    const ok = (list, v, d)=> list.some(x=> x[0] === v) ? v : d;
    return { layout: ok(LAYOUTS, p.layout, "classic"), size: ok(SIZE_LABELS, p.size, "story"), theme: ok(THEME_LABELS, p.theme, "paper"), mapStyle: p.mapStyle === "os" ? "os" : p.mapStyle === "sketch" ? "sketch" : "drawn" };
  }
  const el = (tag, cls, html)=>{ const e = document.createElement(tag); if(cls) e.className = cls; if(html != null) e.innerHTML = html; return e; };
  const escH = s=> String(s).replace(/[&<>"']/g, c=> ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // o = { kind, title, filename, data: object | (controls) => object | Promise, controls: [{ id, label, options: [[value, label]], value }] }
  async function open(o){
    const prefs = loadPrefs(), ctl = {};
    const layoutList = LAYOUTS.filter(l=> (SKIP_LAYOUT[o.kind] || []).indexOf(l[0]) === -1);
    if(!layoutList.some(l=> l[0] === prefs.layout)) prefs.layout = "classic";
    (o.controls || []).forEach(c=> { ctl[c.id] = c.value; });
    let photo = null, keepPhoto = false, token = 0, blob = null, url = null, data = null, closed = false;
    try{ const u = localStorage.getItem(PHOTO_KEY); if(u){ photo = await photoFromDataUrl(u); keepPhoto = !!photo; } }catch(e){}

    const back = el("div", "terms-modal story-sheet"); back.style.display = "flex"; back.setAttribute("role", "dialog"); back.setAttribute("aria-modal", "true");
    const card = el("div", "terms-card");
    card.innerHTML = '<h3>' + escH(o.title || "Share a card") + '</h3>';
    const body = el("div", "terms-body");
    const prev = el("div", "story-prev-wrap"); const img = el("img", "story-prev"); img.alt = "Preview of the card"; const wait = el("p", "chart-note story-wait", "Making your card…"); prev.append(wait, img);
    body.appendChild(prev);
    const rows = el("div", "story-rows");
    function chips(label, list, get, set, id){
      const row = el("div", "story-row"); row.appendChild(el("div", "story-row-label", escH(label)));
      const grp = el("div", "map-modes"); grp.setAttribute("role", "group"); grp.setAttribute("aria-label", label);
      list.forEach(([v, l])=>{ const b = el("button", "map-mode" + (get() === v ? " is-on" : ""), escH(l)); b.type = "button"; b.dataset.v = v; b.setAttribute("aria-pressed", String(get() === v));
        b.onclick = ()=>{ set(v); grp.querySelectorAll("button").forEach(x=>{ const on = x.dataset.v === v; x.classList.toggle("is-on", on); x.setAttribute("aria-pressed", String(on)); }); changed(id === "ctl"); };
        grp.appendChild(b); });
      row.appendChild(grp); rows.appendChild(row); return row;
    }
    (o.controls || []).forEach(c=> chips(c.label, c.options, ()=> ctl[c.id], v=> { ctl[c.id] = v; }, "ctl"));
    chips("Layout", layoutList, ()=> prefs.layout, v=> { prefs.layout = v; syncPhotoRow(); }, "p");
    chips("Size", SIZE_LABELS, ()=> prefs.size, v=> { prefs.size = v; }, "p");
    chips("Colours", THEME_LABELS, ()=> prefs.theme, v=> { prefs.theme = v; }, "p");
    const themeNote = el("p", "chart-note story-note", "The Photo layout keeps its own colours.");
    // optional: an Ordnance Survey map under the fells (only where OS maps are loaded and the card has a map)
    const hasMap = o.kind !== "team" && o.kind !== "recap";
    const mapRow = hasMap ? chips("Map", [["drawn", "Drawn"], ["sketch", "Sketch"]].concat(window.OSMap ? [["os", "OS map"]] : []), ()=> prefs.mapStyle, v=> { prefs.mapStyle = v; }, "p") : null;
    const mapNote = hasMap ? el("p", "chart-note story-note", "The OS map is Ordnance Survey data (Open Government Licence) and is credited on the card. It shows on the Classic and Map layouts, and needs a connection.") : null;
    if(mapNote) rows.appendChild(mapNote);
    // photo row
    const prow = el("div", "story-row"); prow.appendChild(el("div", "story-row-label", "Your photo"));
    const pbar = el("div", "story-photo-bar");
    const file = el("input"); file.type = "file"; file.accept = "image/*"; file.style.display = "none";
    const addBtn = el("button", "btn hike-small", "Add a photo"); addBtn.type = "button";
    const rmBtn = el("button", "btn hike-small", "Remove photo"); rmBtn.type = "button";
    const keepLab = el("label", "plan-check story-keep"); const keepBox = el("input"); keepBox.type = "checkbox"; keepBox.checked = keepPhoto; keepLab.append(keepBox, document.createTextNode(" Remember it on this device"));
    pbar.append(addBtn, rmBtn, file, keepLab); prow.appendChild(pbar);
    prow.appendChild(el("p", "chart-note story-note", "Your photo stays on this device. It is read by your browser and drawn into the card here; it is never uploaded. Only the finished card goes where you choose to share it."));
    rows.append(prow); rows.appendChild(themeNote);
    body.appendChild(rows);
    const msg = el("p", "chart-note story-msg"); body.appendChild(msg);
    card.appendChild(body);
    const act = el("div", "story-actions");
    const shareBtn = el("button", "btn", "Share"); shareBtn.type = "button"; shareBtn.disabled = true;
    const saveBtn = el("button", "btn", "Save image"); saveBtn.type = "button"; saveBtn.disabled = true;
    const closeBtn = el("button", "btn", "Close"); closeBtn.type = "button";
    act.append(shareBtn, saveBtn, closeBtn); card.appendChild(act);
    back.appendChild(card); document.body.appendChild(back);

    function syncPhotoRow(){
      const photoUsed = prefs.layout === "photo" || o.kind === "summit";
      prow.style.display = photoUsed ? "" : "none";
      themeNote.style.display = prefs.layout === "photo" ? "" : "none";
      if(mapRow){ const show = prefs.layout === "classic" || prefs.layout === "map"; mapRow.style.display = show ? "" : "none"; mapNote.style.display = show && prefs.mapStyle === "os" ? "" : "none"; }
      rmBtn.style.display = photo ? "" : "none"; addBtn.textContent = photo ? "Change photo" : "Add a photo"; keepLab.style.display = photo ? "" : "none";
    }
    async function refresh(refetch){
      const my = ++token; wait.style.display = ""; wait.textContent = "Making your card…"; img.style.opacity = "0.35"; shareBtn.disabled = saveBtn.disabled = true; msg.textContent = "";
      try{
        if(refetch || data == null) data = typeof o.data === "function" ? await o.data(Object.assign({}, ctl)) : o.data;
        if(my !== token) return;
        const b = await renderCard(o.kind, data, prefs, photo);
        if(my !== token || closed) return;
        blob = b; if(url) URL.revokeObjectURL(url); url = URL.createObjectURL(b); img.src = url; img.style.opacity = "1"; wait.style.display = "none";
        shareBtn.disabled = saveBtn.disabled = false;
        if(OSFAILED && prefs.mapStyle === "os" && (prefs.layout === "classic" || prefs.layout === "map")) msg.textContent = "The OS map isn't available right now, so this card uses the drawn map.";
      }catch(err){
        console.error("Card failed", err); if(my !== token) return;
        // a card with nothing to show explains why, in the preview area (a blank box looks broken)
        img.removeAttribute("src"); img.style.opacity = "1";
        wait.style.display = ""; wait.textContent = err && err.message === "empty" ? (err.userMessage || "There's nothing to show for that yet.") : "Couldn't build that card. Try another option.";
      }
    }
    function changed(refetch){ try{ localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); }catch(e){} syncPhotoRow(); refresh(!!refetch); }
    addBtn.onclick = ()=> file.click();
    file.onchange = async ()=>{ const f = file.files && file.files[0]; if(!f) return; try{ photo = await photoFromFile(f); }catch(e){ msg.textContent = "Couldn't read that photo."; return; } if(keepBox.checked) rememberPhoto(photo); file.value = ""; syncPhotoRow(); if(prefs.layout !== "photo" && o.kind !== "summit"){ prefs.layout = "photo"; rows.querySelectorAll(".story-row")[(o.controls || []).length].querySelectorAll("button").forEach(x=>{ const on = x.dataset.v === "photo"; x.classList.toggle("is-on", on); x.setAttribute("aria-pressed", String(on)); }); try{ localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); }catch(e){} syncPhotoRow(); } refresh(false); };
    rmBtn.onclick = ()=>{ photo = null; rememberPhoto(null); keepBox.checked = false; syncPhotoRow(); refresh(false); };
    keepBox.onchange = ()=> rememberPhoto(keepBox.checked ? photo : null);
    const filename = ()=> (o.filename || "wainwrights-card").replace(/\.jpg$/, "") + "-" + prefs.size + ".jpg";
    shareBtn.onclick = async ()=>{ if(!blob) return; shareBtn.disabled = true; const r = await share(blob, filename(), o.title || "The Wainwrights"); msg.textContent = r === "downloaded" ? "Saved. Add it to your story from your photos." : ""; shareBtn.disabled = false; };
    saveBtn.onclick = ()=>{ if(!blob) return; const a = document.createElement("a"); a.href = url; a.download = filename(); document.body.appendChild(a); a.click(); a.remove(); msg.textContent = "Saved."; };
    function close(){ closed = true; token++; if(url) URL.revokeObjectURL(url); back.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e){ if(e.key === "Escape") close(); }
    closeBtn.onclick = close; back.onclick = e=>{ if(e.target === back) close(); }; document.addEventListener("keydown", onKey);
    syncPhotoRow(); refresh(true);
    return { close };
  }

  window.WWStory = { dayCard, hikeCard, teamCard, inviteCard, milestoneCard, share, run, open, render: renderCard, _test: { routeOrder, resolveFells, flatten, tickOrderIsReal } };
})();
