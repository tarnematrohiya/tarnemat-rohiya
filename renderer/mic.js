// Mic capture -> real-time recognizer (Vosk) -> words while they are being spoken.
//  partial(text): the sentence so far (updates several times a second)
//  text(text):    the finished sentence (after a short pause)
window.Mic = (function () {
  const SR = 16000;
  let ctx = null, stream = null, node = null, hooked = false, loaded = false;
  let state = 'off', batch = [], batchLen = 0;
  let ring = [], ringLen = 0, wReady = false, wid = 0;           // last 15 s of audio, for Whisper
  const cb = { status: () => {}, text: () => {}, partial: () => {}, level: () => {}, exact: () => {}, seg: () => {} };
  // voice activity: Whisper also hears sentences the live recognizer missed (singing, unclear words)
  let nf = 0.004, inSp = false, segStart = 0, lastVoice = 0, voiced = 0;
  function setState(s, extra) { state = s; cb.status(s, extra || {}); }

  function ensureLoaded() {
    if (loaded) return;
    loaded = true;
    if (!hooked) {
      hooked = true;
      window.bp.on('asr', m => {
        if (m.type === 'loading') setState('loading', { pct: m.pct });
        else if (m.type === 'ready') setState(stream ? 'on' : 'ready', { device: m.device });
        else if (m.type === 'partial') cb.partial(m.text);
        else if (m.type === 'final') cb.text(m.text);
        else if (m.type === 'error') { console.error(m.msg); if (m.fatal) { loaded = false; setState('error', { msg: 'الميكروفون وقف — دوس تاني' }); } }
        else if (m.type === 'wready') { wReady = true; console.log('whisper ready on', m.device); cb.status(state, { exact: 'ready' }); }
        else if (m.type === 'wloading') cb.status(state, { exact: 'loading', wpct: m.pct });
        else if (m.type === 'wtext') cb.exact(m.text, m.id, m.ms);
        else if (m.type === 'werror') { console.error('whisper', m.msg); cb.status(state, { exact: 'error' }); }
        else if (m.type === 'log') console.log(m.msg);
      });
    }
    setState('loading', { pct: 0 });
    window.bp.asrLoad();
  }

  function onFrame(f) {
    let s = 0; for (let i = 0; i < f.length; i++) s += f[i] * f[i];
    const rms = Math.sqrt(s / f.length);
    cb.level(Math.min(1, rms / 0.12));
    if (state !== 'on') return;
    const now = performance.now();
    ring.push({ t: now, f }); ringLen += f.length;
    nf = rms < nf ? nf * 0.9 + rms * 0.1 : nf * 0.9995 + rms * 0.0005;      // noise floor follows quiet parts
    const voice = rms > Math.max(nf * 3, 0.008);
    if (voice) { if (!inSp) { inSp = true; segStart = now - 250; voiced = 0; } lastVoice = now; voiced += 32; }
    if (inSp && now - lastVoice > 600) { inSp = false; if (voiced >= 300) cb.seg(segStart, lastVoice, 'pause'); }
    else if (inSp && now - segStart > 6000) { cb.seg(segStart, now, 'long'); segStart = now - 2000; voiced = 0; }
    while (ringLen > SR * 15) ringLen -= ring.shift().f.length;
    batch.push(f); batchLen += f.length;
    if (batchLen >= 1536) {                                    // ~100 ms
      const a = new Int16Array(batchLen); let o = 0;
      for (const fr of batch) for (let i = 0; i < fr.length; i++) { const v = Math.max(-1, Math.min(1, fr[i])); a[o++] = v < 0 ? v * 0x8000 : v * 0x7fff; }
      batch = []; batchLen = 0;
      window.bp.asrAudio(a);
    }
  }

  async function start(deviceId) {
    ensureLoaded();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, channelCount: 1, echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
    } catch (e) { setState('error', { msg: 'مش قادر أوصل للميكروفون' }); return; }
    ctx = new AudioContext({ sampleRate: SR });
    await ctx.audioWorklet.addModule('mic-worklet.js');
    const src = ctx.createMediaStreamSource(stream);
    node = new AudioWorkletNode(ctx, 'grab');
    node.port.onmessage = e => onFrame(e.data);
    src.connect(node);
    if (state === 'ready' || state === 'off') setState('on'); else cb.status(state, {});
  }
  function stop() {
    if (node) node.disconnect(); if (ctx) ctx.close(); if (stream) stream.getTracks().forEach(t => t.stop());
    node = ctx = stream = null; batch = []; batchLen = 0; ring = []; ringLen = 0;
    setState(loaded ? 'ready' : 'off'); cb.level(0);
  }
  async function devices() {
    try { return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput'); } catch (e) { return []; }
  }
  return {
    start, stop, devices,
    reset: () => { if (window.bp) window.bp.asrReset(); },
    get exactReady() { return wReady; },
    get voiceAt() { return lastVoice; },          // last time someone was singing / talking
    get speaking() { return inSp; },
    // send the audio heard since time t (performance.now()) to Whisper; result comes back on 'exact'
    exactSince(t) {
      const parts = ring.filter(r => r.t >= t - 250);
      const len = parts.reduce((n, r) => n + r.f.length, 0);
      if (!wReady || len < SR * 0.5) return 0;
      const a = new Float32Array(Math.min(len, SR * 12)); let o = 0;
      for (const r of parts.slice(-Math.ceil(a.length / 512))) { if (o + r.f.length > a.length) break; a.set(r.f, o); o += r.f.length; }
      window.bp.whisper(a.slice(0, o), ++wid); return wid;
    },                          // forget the sentence so far (after we acted on it)
    get state() { return state; }, get live() { return !!stream; },
    on(ev, f) { cb[ev] = f; },
    _emit(ev, ...a) { cb[ev](...a); }
  };
})();
