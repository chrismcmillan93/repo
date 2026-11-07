// Instagram Story images (1080x1920) drawn on a canvas in the app's own look.
// Three cards: today's ticks, a hosted hike, a team's progress. Shared via the
// Web Share API (files) with a download fallback. A website can't open
// Instagram's Story composer directly, so the person picks Instagram in the
// share sheet (or saves the image and adds it from their camera roll).
(function(){
  "use strict";

  const W = 1080, H = 1920, M = 72;
  const C = {
    paper: "#e8e2d0", paperCard: "#f1ecdd", paperDeep: "#ddd4bb",
    ink: "#262a1f", inkSoft: "#5b5f4d", inkFaint: "#8b8d78",
    green: "#3c5a41", greenDeep: "#24392a", grid: "#c9c5b4"
  };
  const SERIF = "'Fraunces', Georgia, serif";
  const MONO = "'JetBrains Mono', monospace";
  // Instagram covers roughly the top and bottom 250px of a Story with its own UI
  const TOP = 250, BOTTOM = 1670;

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
    spaced(ctx, "THE WAINWRIGHTS", W / 2, 1752, 3);
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
    h = Math.round(Math.max(Math.min(420, h), Math.min(h, padTop + padBottom + (w - padX * 2) * (spanV / spanU))));
    panel(ctx, y, h);
    ctx.save();
    ctx.beginPath(); ctx.rect(x0 + 2, y + 2, w - 4, h - 4); ctx.clip();
    const availW = w - padX * 2, availH = h - padTop - padBottom;
    const scale = Math.min(availW / spanU, availH / spanV);
    const ox = x0 + w / 2, oy = y + padTop + availH / 2;
    const px = p=> ({ x: ox + (p.u - cu) * scale, y: oy + (p.v - cv) * scale });

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
      const next = mapPanel(ctx, y, 660, { fells: d.fells, ordered: true });
      if(next != null) y = next;
    }
    list(ctx, y, d.fells.map(f=> ({ left: f.name, right: f.m + "m" })), { maxRows: 12 });
    footer(ctx);
    return toBlob(canvas);
  }

  async function hikeCard(d){
    await ensureFonts();
    const { canvas, ctx } = newCard();
    let y = heading(ctx, TOP, d.past ? "WE WALKED" : "WALKING TOGETHER", d.title, d.dateLabel);
    const bits = [plural(d.fells.length, "fell", "fells")];
    if(d.miles) bits.push(d.miles + " mi");
    if(d.ascent) bits.push(d.ascent + " metres up");
    y = stats(ctx, y, bits.map((b, i)=> ({ v: b.split(" ")[0], l: b.split(" ").slice(1).join(" ").toUpperCase() })));
    // a map of the fells, or (if none can be placed) the names as one wrapped line
    const mapped = d.map === false ? null : mapPanel(ctx, y, 660, { fells: d.fells, hint: startHint(d.label) });
    if(mapped != null) y = mapped;
    else {
      ctx.textAlign = "center"; ctx.fillStyle = C.inkSoft;
      ctx.font = "italic 500 32px " + SERIF;
      const fl = wrap(ctx, d.fells.join(" · "), W - M * 2).slice(0, 4);
      fl.forEach(l=>{ ctx.fillText(l, W / 2, y); y += 44; });
      y += 14;
    }
    list(ctx, y, d.people.map(p=> ({ left: p.name, right: p.handle ? "@" + p.handle : "" })), { maxRows: 12 });
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
    const mapped = d.map === false ? null : mapPanel(ctx, y, 620, { fells: d.fells, hint: startHint(d.label) });
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
    spaced(ctx, "TAP THE LINK TO ASK FOR A PLACE", W / 2, y + 50, 2);
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

  // milestone: your real count in a big ring, a heading that names the milestone you have just reached or passed (10, 25, 50 ... halfway,
  // all 214), and a countdown to the next one.
  // d = { reached, title, dateLabel, climbed, total, percent, elevation, next, nextLabel, toGo, prev }
  async function milestoneCard(d){
    await ensureFonts();
    const { canvas, ctx } = newCard();
    let y = heading(ctx, TOP, "MILESTONE", d.title, d.dateLabel);
    // the ring: how much of the 214 is done, with the milestone number inside
    const cx = W / 2, R = 230, cy = y + R + 40, LW = 44;
    ctx.lineWidth = LW; ctx.lineCap = "round";
    ctx.strokeStyle = C.paperDeep; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    const frac = Math.max(0.004, Math.min(1, d.climbed / d.total));
    ctx.strokeStyle = C.green; ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
    ctx.lineCap = "butt";
    ctx.textAlign = "center"; ctx.fillStyle = C.greenDeep;
    ctx.font = "700 210px " + SERIF; ctx.fillText(String(d.climbed), cx, cy + 62);   // your real count, so the card never disagrees with your tracker
    ctx.fillStyle = C.inkSoft; ctx.font = "400 26px " + MONO;
    spaced(ctx, d.climbed === d.total ? "ALL CLIMBED" : "FELLS CLIMBED", cx, cy + 118, 3);
    y = cy + R + LW / 2 + 36;
    y = stats(ctx, y, [
      { v: String(d.total - d.climbed), l: "TO GO" },
      { v: d.percent + "%", l: "COMPLETE" },
      { v: d.elevation.toLocaleString() + "m", l: "ELEVATION" }
    ]);
    // countdown to the next milestone
    const ph = 228;
    panel(ctx, y, ph);
    ctx.textAlign = "left"; ctx.fillStyle = C.green; ctx.font = "700 26px " + MONO;
    spaced(ctx, d.next ? "NEXT UP" : "WAINWRIGHT COMPLETE", M + 8, y + 52, 4, "left");
    if(d.next){
      ctx.font = "700 62px " + SERIF; ctx.fillStyle = C.greenDeep; ctx.textAlign = "left";
      ctx.fillText(d.nextLabel, M + 8, y + 128);
      ctx.textAlign = "right"; ctx.font = "700 40px " + MONO; ctx.fillStyle = C.green;
      ctx.fillText(d.toGo + " to go", W - M - 8, y + 124);
      const bx = M + 8, bw = W - (M + 8) * 2, by = y + 164;
      ctx.fillStyle = C.paperDeep; ctx.fillRect(bx, by, bw, 30);
      const span = Math.max(1, d.next - d.prev), done = Math.max(0, Math.min(1, (d.climbed - d.prev) / span));
      ctx.fillStyle = C.green; ctx.fillRect(bx, by, Math.max(8, bw * done), 30);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(bx, by, bw, 30);
    } else {
      ctx.textAlign = "left"; ctx.font = "italic 500 40px " + SERIF; ctx.fillStyle = C.inkSoft;
      ctx.fillText("Every fell in the Lakeland guides.", M + 8, y + 130);
    }
    footer(ctx);
    return toBlob(canvas);
  }

  window.WWStory = { dayCard, hikeCard, teamCard, inviteCard, milestoneCard, share, run, _test: { routeOrder, resolveFells, flatten, tickOrderIsReal } };
})();
