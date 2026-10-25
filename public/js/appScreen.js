/**
 * Tablet-Komfort (21.10.2026, Hendriks Entscheidung):
 * Bildschirm wach halten + Vollbild. Einstellungen gelten je Gerät (localStorage), nicht global --
 * das Tablet neben der Armlehne soll wach bleiben, der PC-Browser nicht unbedingt.
 *
 * Wach halten, zwei Wege:
 *  1. Screen Wake Lock API (navigator.wakeLock) -- gibt es nur in "sicheren Kontexten" (HTTPS oder
 *     localhost). Das Tablet öffnet ControlHub aber über http://<PC-IP>:3000 im WLAN, dort fehlt sie meist.
 *  2. Ersatzweg: ein winziges, stummes Endlos-Video (media/wach.mp4, 16×16 px schwarz, 1,5 KB) läuft
 *     unsichtbar mit -- Browser lassen das Display während laufender Videos an. Startet erst nach der
 *     ersten Berührung, weil Browser Videos sonst nicht abspielen lassen.
 * Nach dem Zurückkehren in den Tab (visibilitychange) wird beides neu angefordert.
 *
 * Vollbild: Fullscreen API (braucht ebenfalls eine Berührung). Vom Home-Bildschirm gestartet läuft
 * ControlHub auf iPad/iPhone ohnehin ohne Browserleisten (Meta-Tags in index.html).
 */
(function () {
  const KEY_WAKE = 'appScreen.wake';
  const KEY_FULL = 'appScreen.fullscreen';
  const read = (k, def) => { try { return localStorage.getItem(k) ?? def; } catch { return def; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* privat/gesperrt -- egal */ } };

  let lock = null;
  let video = null;
  let waitingForTouch = false;
  const standalone = window.matchMedia?.('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true;

  function wakeWanted() { return read(KEY_WAKE, 'on') === 'on'; }

  async function startWake() {
    if (!wakeWanted() || document.visibilityState !== 'visible') return;
    if (navigator.wakeLock && window.isSecureContext) {
      try {
        if (!lock) {
          lock = await navigator.wakeLock.request('screen');
          lock.addEventListener('release', () => { lock = null; });
        }
        return;
      } catch { /* abgelehnt -> Ersatzweg */ }
    }
    if (!video) {
      video = document.createElement('video');
      video.src = 'media/wach.mp4';
      video.muted = true;
      video.loop = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('muted', '');
      video.setAttribute('aria-hidden', 'true');
      video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:0;top:0;';
      document.body.appendChild(video);
    }
    try {
      await video.play();
    } catch {
      // Browser will erst eine Berührung -- dann einmalig nachholen
      if (!waitingForTouch) {
        waitingForTouch = true;
        const once = () => { waitingForTouch = false; startWake(); };
        document.addEventListener('pointerdown', once, { once: true, capture: true });
      }
    }
  }

  async function stopWake() {
    try { await lock?.release(); } catch { /* egal */ }
    lock = null;
    video?.pause();
  }

  function isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }

  async function enterFullscreen() {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req || isFullscreen()) return;
    try { await req.call(el); } catch { /* braucht eine Berührung -- s. unten */ }
  }

  function exitFullscreen() {
    const ex = document.exitFullscreen || document.webkitExitFullscreen;
    if (ex && isFullscreen()) ex.call(document);
  }

  function renderSettings() {
    const w = document.getElementById('wake-select');
    if (w) w.value = read(KEY_WAKE, 'on');
    const f = document.getElementById('fullscreen-select');
    if (f) f.value = read(KEY_FULL, 'off');
    const hint = document.getElementById('app-screen-hint');
    if (hint) {
      const parts = [];
      if (!standalone) parts.push('Tipp: Über „Zum Home-Bildschirm“ (iPad: Teilen-Menü, Android: Browser-Menü) startet ControlHub wie eine App.');
      if (!(navigator.wakeLock && window.isSecureContext)) parts.push('Wach halten läuft hier über den Ersatzweg und startet nach der ersten Berührung.');
      if (!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)) parts.push('Vollbild kann dieser Browser nicht (iPhone) – dann vom Home-Bildschirm starten.');
      hint.textContent = parts.join(' ');
    }
  }

  window.appScreen = {
    setWake(v) { write(KEY_WAKE, v); v === 'on' ? startWake() : stopWake(); },
    setFullscreen(v) { write(KEY_FULL, v); v === 'on' ? enterFullscreen() : exitFullscreen(); },
    get wakeActive() { return !!lock || (!!video && !video.paused); }
  };

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') startWake(); });
  // Vollbild geht nur nach einer Berührung: bei eingeschalteter Option bei jeder Berührung prüfen
  // (Browser beendet Vollbild z. B. beim App-Wechsel)
  document.addEventListener('pointerdown', () => { if (read(KEY_FULL, 'off') === 'on' && !isFullscreen()) enterFullscreen(); }, { capture: true });
  document.addEventListener('DOMContentLoaded', () => { renderSettings(); startWake(); });
})();
