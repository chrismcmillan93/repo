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
    // fells, wrapped as one line of text
    ctx.textAlign = "center"; ctx.fillStyle = C.inkSoft;
    ctx.font = "italic 500 32px " + SERIF;
    const fl = wrap(ctx, d.fells.join(" · "), W - M * 2).slice(0, 4);
    fl.forEach(l=>{ ctx.fillText(l, W / 2, y); y += 44; });
    y += 14;
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

  window.WWStory = { dayCard, hikeCard, teamCard, share, run };
})();
