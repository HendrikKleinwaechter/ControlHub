/**
 * Fahrzeugmodelle für die Karte (Hendrik 23.10.2026: „Die Modelle von den angezeigten Fahrzeugen müssen besser werden“).
 * Draufsicht in echter Größe, gezeichnet in 0,1-m-Einheiten: Nullpunkt = Fahrzeugposition, vorne = −y, rechts = +x.
 * Karosserie in der Farbe der Marke (Mod: hud#brand), Reifen mit Profil, Kabine mit Scheiben, weicher Schatten.
 * Benutzt von dashboardMap.js (drawVehicleSymbol); die Vorschau im GPS-Menü hat eigene, einfache SVG-Formen.
 */
(function () {
  // Markenfarben (Haube/Karosserie); Schlüssel klein und ohne Leer-/Bindestriche. Unbekannt = hellgrau.
  const MARKEN = {
    fendt: '#4c7d3a', johndeere: '#367c2b', claas: '#a4bd36', caseih: '#b3141c', case: '#b3141c', newholland: '#1f55a8',
    masseyferguson: '#c4161c', deutzfahr: '#7cb342', valtra: '#c8102e', kubota: '#e5641e', steyr: '#c1121f', lindner: '#2f6d3c',
    jcb: '#f2b600', mccormick: '#c8102e', landini: '#1c56a6', zetor: '#c8102e', same: '#c8102e', krone: '#2f8a3f',
    holmer: '#2f8a3f', ropa: '#3d6fb5', grimme: '#d32f2f', manitou: '#d0412a', merlo: '#2e7d32', schaeffer: '#f2b600',
    weidemann: '#f2b600', kramer: '#2e7d32', antoniocarraro: '#d32f2f', mercedesbenz: '#b0b6bd', man: '#b0b6bd', volvo: '#2a4a7f'
  };
  const FELGE = { johndeere: '#f4c400', fendt: '#9da3a8', claas: '#d0d4d8' };
  const key = b => String(b || '').toLowerCase().replace(/[\s_\-.]+/g, '');

  function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function shade(c, f) {   // f < 0 dunkler, f > 0 heller
    const [r, g, b] = hex(c);
    const m = v => Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f);
    return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
  }

  function rr(ctx, x, y, w, h, r) {
    const q = Math.max(0, Math.min(r || 0, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + q, y);
    ctx.arcTo(x + w, y, x + w, y + h, q);
    ctx.arcTo(x + w, y + h, x, y + h, q);
    ctx.arcTo(x, y + h, x, y, q);
    ctx.arcTo(x, y, x + w, y, q);
    ctx.closePath();
  }
  // Fläche mit Wölbung: quer dunkler am Rand, heller in der Mitte
  function koerper(ctx, x, y, w, h, r, farbe) {
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, shade(farbe, -0.35));
    g.addColorStop(0.35, shade(farbe, 0.12));
    g.addColorStop(0.65, shade(farbe, 0.05));
    g.addColorStop(1, shade(farbe, -0.4));
    rr(ctx, x, y, w, h, r);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = shade(farbe, -0.55);
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
  // Reifen mit Stollen (Pfeilprofil), optional Felgenrand innen
  function reifen(ctx, x, y, w, h, felge) {
    rr(ctx, x, y, w, h, Math.min(w, h) * 0.35);
    ctx.fillStyle = '#1b1e23';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = '#3d434c';
    ctx.lineWidth = 0.7;
    for (let yy = y + 0.8; yy < y + h; yy += 1.6) {
      ctx.beginPath();
      ctx.moveTo(x + 0.4, yy);
      ctx.lineTo(x + w / 2, yy + 0.9);
      ctx.lineTo(x + w - 0.4, yy);
      ctx.stroke();
    }
    ctx.restore();
    if (felge) { ctx.fillStyle = felge; ctx.fillRect(x + (x < 0 ? w - 0.9 : 0), y + h * 0.3, 0.9, h * 0.4); }
  }
  function kabine(ctx, x, y, w, h, dach = '#eceff2') {
    rr(ctx, x - 0.8, y - 0.8, w + 1.6, h + 1.6, 3);   // Scheiben rundum (von oben dunkel)
    ctx.fillStyle = '#25303b';
    ctx.fill();
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, dach);
    rr(ctx, x, y, w, h, 2.6);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 0.4;
    ctx.stroke();
    rr(ctx, x + w * 0.3, y + h * 0.3, w * 0.4, h * 0.35, 1);   // Dachluke
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(120, 190, 255, 0.35)';                 // Spiegelung der Frontscheibe
    rr(ctx, x - 0.6, y - 0.9, w + 1.2, 1.2, 0.6);
    ctx.fill();
  }
  function schatten(ctx, x, y, w, h, r) {
    rr(ctx, x + 1.2, y + 1.8, w, h, r);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    ctx.fill();
  }
  function rundumleuchte(ctx, x, y) {
    ctx.beginPath();
    ctx.arc(x, y, 1.1, 0, Math.PI * 2);
    ctx.fillStyle = '#f5a623';
    ctx.fill();
  }

  // ---------- Modelle ----------
  // Traktor 2,8 × 5,0 m (mit Frontgewicht und Heckhydraulik)
  function traktor(ctx, farbe, felge) {
    schatten(ctx, -14, -31, 28, 50, 6);
    reifen(ctx, -14.4, -1.5, 6, 17, felge);
    reifen(ctx, 8.4, -1.5, 6, 17, felge);
    ctx.strokeStyle = '#3a4048'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-9, -21.5); ctx.lineTo(9, -21.5); ctx.stroke();
    reifen(ctx, -12.4, -26.5, 4.4, 10, felge);
    reifen(ctx, 8, -26.5, 4.4, 10, felge);
    rr(ctx, -6.5, -32, 13, 3.2, 1); ctx.fillStyle = '#4b525c'; ctx.fill();              // Frontgewicht
    koerper(ctx, -5, -29.5, 10, 24, 3.5, farbe);                                           // Haube
    rr(ctx, -4, -30, 8, 1.6, 0.8); ctx.fillStyle = '#1f2328'; ctx.fill();                 // Kühlergrill
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(0, -27.5); ctx.lineTo(0, -8); ctx.stroke();
    ctx.beginPath(); ctx.arc(3, -9.5, 1.1, 0, Math.PI * 2); ctx.fillStyle = '#2a2e34'; ctx.fill();   // Auspuff
    koerper(ctx, -15, 0.5, 6.8, 12, 2.5, farbe);                                           // Kotflügel
    koerper(ctx, 8.2, 0.5, 6.8, 12, 2.5, farbe);
    rr(ctx, -3.2, 12, 6.4, 6.5, 1); ctx.fillStyle = '#4b525c'; ctx.fill();               // Heckhydraulik
    ctx.strokeStyle = '#6b7380'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-3, 17); ctx.lineTo(-5, 21); ctx.moveTo(3, 17); ctx.lineTo(5, 21); ctx.stroke();
    ctx.fillStyle = '#3a4048';                                                             // Spiegel
    ctx.fillRect(-11.6, -7.2, 2.4, 1.1); ctx.fillRect(9.2, -7.2, 2.4, 1.1);
    kabine(ctx, -7.2, -7, 14.4, 17);
    rundumleuchte(ctx, 0, 8.6);
  }

  // Mähdrescher 4,2 × 6,4 m ohne Schneidwerk (das kommt als eigenes Gerät mit Arbeitsbreite)
  function drescher(ctx, farbe, felge) {
    schatten(ctx, -21, -40, 42, 62, 6);
    reifen(ctx, -21.5, -31, 8.5, 22, felge);
    reifen(ctx, 13, -31, 8.5, 22, felge);
    reifen(ctx, -17, 8, 6, 12, felge);
    reifen(ctx, 11, 8, 6, 12, felge);
    koerper(ctx, -13, -35, 26, 55, 4, farbe);
    rr(ctx, -10.5, -22, 21, 23, 2.5); ctx.fillStyle = '#2a2f36'; ctx.fill();              // Korntank offen
    const g = ctx.createLinearGradient(0, -22, 0, 1);
    g.addColorStop(0, '#d9b45a'); g.addColorStop(1, '#b38f3a');
    rr(ctx, -9.3, -20.8, 18.6, 20.6, 2); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(80, 60, 20, 0.35)'; ctx.lineWidth = 0.5;
    for (let yy = -18; yy < 0; yy += 3) { ctx.beginPath(); ctx.moveTo(-8, yy); ctx.lineTo(8, yy + 1); ctx.stroke(); }
    rr(ctx, -9, 4, 18, 13, 2); ctx.fillStyle = shade(farbe, -0.25); ctx.fill();           // Motorraum mit Gitter
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    for (let xx = -7; xx <= 7; xx += 2) { ctx.beginPath(); ctx.moveTo(xx, 6); ctx.lineTo(xx, 15); ctx.stroke(); }
    rr(ctx, -16.5, -19, 3.2, 33, 1.6); ctx.fillStyle = '#9aa1aa'; ctx.fill();            // Abtankrohr eingeklappt
    rr(ctx, -9, 19.5, 18, 3.2, 1.2); ctx.fillStyle = '#4b525c'; ctx.fill();              // Häcksler/Streuer
    ctx.fillStyle = '#3a4048';
    ctx.fillRect(-12.8, -37.2, 2.6, 1.2); ctx.fillRect(10.2, -37.2, 2.6, 1.2);
    kabine(ctx, -8, -39, 16, 12);
    rundumleuchte(ctx, -5, -28.5); rundumleuchte(ctx, 5, -28.5);
  }

  function pfeil(ctx, farbe) {
    ctx.beginPath();
    ctx.moveTo(0, -41); ctx.lineTo(18, 12); ctx.lineTo(0, 2); ctx.lineTo(-18, 12); ctx.closePath();
    const g = ctx.createLinearGradient(-18, 0, 18, 0);
    g.addColorStop(0, shade(farbe, -0.3)); g.addColorStop(0.5, shade(farbe, 0.25)); g.addColorStop(1, shade(farbe, -0.35));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#11161c'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
    ctx.stroke();
  }

  const MODELLE = { traktor, drescher, pfeil };   // Häcksler entfällt (Hendrik 23.10.2026), er erscheint als Mähdrescher

  // ---------- Gerenderte Bilder (Hendrik 23.10.2026: „die Abbildungen hübscher machen“) ----------
  // Aus Hendriks 3D-Modell (Meshy, grau) einmal gerendert: von oben (2D) und von hinten aus 32° über dem Boden (3D-Ansicht,
  // passend zu TILT.deg = 58° in dashboardMap.js: 90° − 58°). ppm = Bildpunkte je Meter; ox/oy = Fahrzeugposition aus dem Spiel im Bild (wie beim
  // gezeichneten Symbol 0,7 m vor der Hinterachse; Hinterachse oben bei Zeile 752).
  const BILDER = {
    traktor: {
      oben: { src: 'img/fahrzeuge/traktor-oben.png', w: 512, h: 1024, ppm: 170, ox: 256, oy: 633 },
      schraeg: { src: 'img/fahrzeuge/traktor-schraeg.png', w: 1024, h: 760, ppm: 170, ox: 512, oy: 624 },
      laenge: 4.8, breite: 2.9
    },
    // Mähdrescher ohne Schneidwerk (das kommt als eigenes Gerät), 8,6 m lang; Fahrzeugposition in der Mitte zwischen den
    // Achsen (vorne Zeile 340, hinten 930) wie beim gezeichneten Mähdrescher
    drescher: {
      oben: { src: 'img/fahrzeuge/drescher-oben.png', w: 768, h: 1600, ppm: 170, ox: 384, oy: 635 },
      schraeg: { src: 'img/fahrzeuge/drescher-schraeg.png', w: 1024, h: 1500, ppm: 170, ox: 512, oy: 993 },
      laenge: 8.6, breite: 3.9
    }
  };
  const geladen = {};   // src → HTMLImageElement, sobald fertig geladen
  function bild(b) {
    if (!b || typeof Image === 'undefined') return null;
    if (geladen[b.src] === undefined) {
      geladen[b.src] = null;
      const img = new Image();
      img.onload = () => { geladen[b.src] = img; };
      img.src = b.src;
    }
    return geladen[b.src];
  }
  // Bild von schräg hinten für die 3D-Ansicht (null = keins oder noch nicht geladen)
  function schraeg(art) {
    const b = BILDER[art]?.schraeg;
    const img = bild(b);
    return img ? { ...b, img, laenge: BILDER[art].laenge } : null;
  }
  // weicher Schatten unter dem Fahrzeug (Bodenebene), Maße in Metern
  function schattenBoden(ctx, pxPerM, laenge, breite, vorn) {
    ctx.save();
    ctx.translate(0, -vorn * pxPerM);
    ctx.scale(breite / laenge, 1);
    const r = (laenge / 2) * pxPerM;
    const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.05);
    g.addColorStop(0, 'rgba(0, 0, 0, 0.42)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.05, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /**
   * @param {CanvasRenderingContext2D} ctx  Nullpunkt = Fahrzeugposition, nicht gedreht oder schon gedreht
   * @param {string} art      traktor | drescher | pfeil
   * @param {number} pxPerM   Kartenmaßstab
   * @param {string} [marke]  Marke aus dem Spiel (hud#brand) für die Farbe
   */
  function zeichne(ctx, art, pxPerM, marke, opts = {}) {
    // gerendertes Bild von oben, wenn vorhanden; opts.nurSchatten: in der 3D-Ansicht steht das Fahrzeug als eigenes Bild darüber
    const b = BILDER[art];
    const img = bild(b?.oben);
    if (img) {
      const ppm = Math.max(pxPerM, 20 / b.laenge);   // weit herausgezoomt mindestens ~20 px lang
      const mitte = (b.oben.oy - b.oben.h / 2) / b.oben.ppm;   // Bildmitte liegt so viele Meter vor der Fahrzeugposition
      schattenBoden(ctx, ppm, b.laenge * 1.02, b.breite * 1.05, mitte);
      if (opts.nurSchatten) return;
      const k = ppm / b.oben.ppm;
      ctx.drawImage(img, -b.oben.ox * k, -b.oben.oy * k, b.oben.w * k, b.oben.h * k);
      return;
    }
    const k = Math.max(pxPerM / 10, 20 / 50);   // weit herausgezoomt mindestens ~20 px lang
    const farbe = MARKEN[key(marke)] || '#c9ced5';
    ctx.save();
    ctx.scale(k, k);
    (MODELLE[art] || traktor)(ctx, farbe, FELGE[key(marke)]);
    ctx.restore();
  }

  window.KartenFahrzeuge = { zeichne, schraeg, MODELLE, BILDER };
})();
