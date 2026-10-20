// Sons synthétisés avec l'API Web Audio (aucun fichier audio, aucune
// dépendance). Le contexte n'est créé qu'au premier geste du joueur.
// Rendu / interface uniquement : n'interagit pas avec la simulation.

class Son {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.lastPlayed = {};
    this.drone = null;
    this.volume = 0.5;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
    this.noiseBuffer = this.makeNoise();
    this.startDrone();
    this.startWind();
  }

  // Flux audio du jeu (pour enregistrer une vidéo avec le son) ; null si le son n'est pas démarré
  recordingStream() {
    if (!this.ctx) return null;
    if (!this.recDest) {
      this.recDest = this.ctx.createMediaStreamDestination();
      this.master.connect(this.recDest);
    }
    return this.recDest.stream;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : this.volume;
  }

  makeNoise() {
    const length = this.ctx.sampleRate * 0.6;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  // Nappe grave et continue ; la tension (0..1) l'ouvre et la rend plus présente.
  startDrone() {
    const ctx = this.ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    filter.connect(gain);
    gain.connect(this.master);
    const oscs = [55, 82.41, 110.5].map((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 2 ? 'triangle' : 'sawtooth';
      o.frequency.value = f;
      o.detune.value = (i - 1) * 6;
      o.connect(filter);
      o.start();
      return o;
    });
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 60;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
    this.drone = { filter, gain, oscs };
  }

  // Vent continu : bruit filtré dont le souffle varie lentement ; plus fort dans la tempête
  startWind() {
    const ctx = this.ctx;
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; data[i] = last * 3.5; }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 520;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0.0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.18;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
    lfo.start();
    this.wind = { filter, gain };
  }

  // Ambiance liée à la partie (appelée à chaque image) : vent, corbeaux, pas du joueur
  ambiance(match) {
    if (!this.ctx || this.muted || !match) return;
    const p = match.joueur;
    const outside = match.stormStarted && p.alive && !match.storm.inside(p.pos);
    if (this.wind) {
      const now = this.ctx.currentTime;
      this.wind.gain.gain.setTargetAtTime(outside ? 0.06 : 0.022, now, 0.6);
      this.wind.filter.frequency.setTargetAtTime(outside ? 900 : 520, now, 0.8);
    }
    if (match.pings.length > 0 && this.allowed('caw', 2200 + Math.random() * 1500)) {
      const k = Son.falloff(match.pings[0], p.pos);
      if (k > 0.05) {
        this.tone(560, { to: 380, dur: 0.16, type: 'sawtooth', gain: 0.035 * k + 0.005 });
        this.tone(520, { to: 340, dur: 0.18, type: 'sawtooth', gain: 0.03 * k + 0.005, delay: 0.22 });
      }
    }
    if (p.alive && p.phase === 'sol' && p.vel.mag() > 1.2 && this.allowed('pas', p.vel.mag() > 3.5 ? 240 : 380)) {
      this.noise({ dur: 0.07, from: 900, to: 300, gain: 0.018 });
    }
  }

  setTension(t) {
    if (!this.drone) return;
    const now = this.ctx.currentTime;
    this.drone.filter.frequency.setTargetAtTime(200 + 700 * t, now, 0.4);
    this.drone.gain.gain.setTargetAtTime(0.045 + 0.05 * t, now, 0.4);
  }

  tone(freq, { to = freq, dur = 0.2, type = 'sine', gain = 0.08, delay = 0 } = {}) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp);
    amp.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  noise({ dur = 0.4, from = 4000, to = 300, gain = 0.1, delay = 0 } = {}) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(from, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  // limite la fréquence d'un même son
  allowed(name, minGap) {
    const now = performance.now();
    if (this.lastPlayed[name] && now - this.lastPlayed[name] < minGap) return false;
    this.lastPlayed[name] = now;
    return true;
  }

  // Volume d'un son localisé selon la distance à l'auditeur (0 loin, 1 tout près)
  static falloff(pos, listener) {
    if (!pos || !listener) return 1;
    const d = Math.hypot(pos.x - listener.x, pos.y - listener.y);
    return Math.max(0, 1 - d / 1100);
  }

  click() { this.tone(880, { to: 1180, dur: 0.06, type: 'square', gain: 0.03 }); }

  // event : événement du Match ; listener : position de la caméra
  play(event, listener) {
    if (!this.ctx || this.muted) return;
    const k = Son.falloff(event.pos, listener);
    switch (event.type) {
      case 'shot': {
        if (k <= 0.02 || !this.allowed('shot' + (event.by ? event.by.name : ''), 45)) break;
        const w = event.weapon;
        const g = 0.05 * k + 0.008;
        if (w === 'sniper') { this.noise({ dur: 0.35, from: 3000, to: 120, gain: 0.2 * k + 0.02 }); this.tone(140, { to: 40, dur: 0.3, type: 'sawtooth', gain: 0.14 * k }); }
        else if (w === 'pompe') { this.noise({ dur: 0.25, from: 2500, to: 150, gain: 0.18 * k + 0.02 }); this.tone(110, { to: 50, dur: 0.2, type: 'sawtooth', gain: 0.12 * k }); }
        else if (w === 'pistolet') this.tone(520, { to: 160, dur: 0.09, type: 'square', gain: g });
        else if (w === 'mitraillette') this.tone(640, { to: 220, dur: 0.05, type: 'square', gain: g * 0.8 });
        else this.tone(420, { to: 120, dur: 0.07, type: 'sawtooth', gain: g });
        break;
      }
      case 'ordre':
        [660, 880].forEach((f, i) => this.tone(f, { dur: 0.12, type: 'square', gain: 0.05, delay: i * 0.08 }));
        break;
      case 'howl':
        if (k > 0.03 && this.allowed('howl', 2500)) {
          this.tone(260, { to: 540, dur: 0.7, type: 'sine', gain: 0.06 * k + 0.01 });
          this.tone(540, { to: 300, dur: 0.9, type: 'sine', gain: 0.05 * k + 0.01, delay: 0.65 });
        }
        break;
      case 'bite':
        if (this.allowed('bite', 200)) this.tone(320, { to: 120, dur: 0.12, type: 'sawtooth', gain: 0.09 });
        break;
      case 'faune_mort':
        if (k > 0.05) this.tone(240, { to: 70, dur: 0.3, type: 'triangle', gain: 0.07 * k });
        break;
      case 'explosion':
        if (k > 0.03) {
          this.noise({ dur: 0.7, from: 1800, to: 60, gain: 0.26 * k + 0.02 });
          this.tone(90, { to: 30, dur: 0.6, type: 'sawtooth', gain: 0.2 * k });
        }
        break;
      case 'ram':
        if (this.allowed('ram', 150) && k > 0.05) this.tone(150, { to: 50, dur: 0.18, type: 'square', gain: 0.1 * k });
        break;
      case 'knock':
        if (k > 0.05) this.tone(260, { to: 90, dur: 0.35, type: 'triangle', gain: 0.09 * k + 0.01 });
        break;
      case 'revive':
        [523.25, 659.25, 880].forEach((f, i) => this.tone(f, { dur: 0.25, gain: 0.07, delay: i * 0.09 }));
        break;
      case 'board':
        this.tone(200, { to: 320, dur: 0.15, type: 'square', gain: 0.06 });
        break;
      case 'hitmarker':
        this.tone(event.killed ? 520 : 1250, { to: event.killed ? 260 : 900, dur: 0.07, type: 'triangle', gain: 0.06 });
        break;
      case 'hurt':
        if (this.allowed('hurt', 120)) this.tone(210, { to: 90, dur: 0.18, type: 'sawtooth', gain: 0.08 });
        break;
      case 'pickup':
        this.tone(660, { to: 990, dur: 0.1, gain: 0.05 });
        break;
      case 'chest':
        if (k > 0.1) { this.tone(440, { to: 880, dur: 0.18, gain: 0.07 * k }); this.tone(880, { to: 1320, dur: 0.2, gain: 0.05 * k, delay: 0.08 }); }
        break;
      case 'build':
        this.tone(180, { to: 120, dur: 0.12, type: 'square', gain: 0.07 });
        this.noise({ dur: 0.12, from: 1200, to: 300, gain: 0.05 });
        break;
      case 'harvest':
        if (this.allowed('harvest', 90)) { this.tone(260, { to: 140, dur: 0.08, type: 'triangle', gain: 0.07 }); this.noise({ dur: 0.08, from: 2000, to: 500, gain: 0.05 }); }
        break;
      case 'jump':
        this.noise({ dur: 0.6, from: 600, to: 2400, gain: 0.08 });
        break;
      case 'land':
        this.tone(120, { to: 60, dur: 0.25, type: 'triangle', gain: 0.1 });
        break;
      case 'bus':
        this.tone(130, { to: 160, dur: 0.8, type: 'triangle', gain: 0.06 });
        break;
      case 'storm':
        this.tone(95, { to: 70, dur: 1.2, type: 'sawtooth', gain: 0.08 });
        this.tone(190, { to: 140, dur: 1.2, type: 'sawtooth', gain: 0.04, delay: 0.1 });
        break;
      case 'airdrop':
        [523.25, 659.25, 783.99].forEach((f, i) => this.tone(f, { dur: 0.3, gain: 0.06, delay: i * 0.12 }));
        break;
      case 'elimination':
        if (k > 0.05) this.tone(300, { to: 70, dur: 0.3, type: 'triangle', gain: 0.07 * k + 0.01 });
        break;
      case 'kill':
        [659.25, 880, 1174.66].forEach((f, i) => this.tone(f, { dur: 0.22, gain: 0.07, delay: i * 0.07 }));
        break;
      case 'death':
        [330, 262, 196].forEach((f, i) => this.tone(f, { dur: 0.5, type: 'triangle', gain: 0.1, delay: i * 0.2 }));
        break;
      case 'victory':
        [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98].forEach((f, i) => this.tone(f, { dur: 0.5, gain: 0.09, delay: i * 0.11 }));
        break;
    }
  }
}
