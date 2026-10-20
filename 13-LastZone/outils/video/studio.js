// Studio : rendu HORS LIGNE de la vidéo de présentation, image par image.
//
// Contrairement à Video.start() (enregistrement en temps réel, qui saccade dès que le navigateur
// ralentit ou que l'onglet est mis en arrière-plan), le Studio avance le jeu d'exactement 1/30 s par
// image, la dessine, l'encode (WebCodecs : H.264) puis assemble un fichier MP4 avec une piste audio
// (voix off + ambiance) calculée à part. Résultat : 30 images par seconde exactes, quelle que soit la
// vitesse de l'ordinateur, et des fondus entre les scènes pour cacher les changements de décor.
//
// Utilisation (page ouverte avec ?video, console du navigateur) :   Studio.render()
// Le fichier est écrit dans video/<nom>.mp4 par serve.js.

const Mp4 = {
  u8(...parts) {
    let size = 0;
    for (const p of parts) size += p.length;
    const out = new Uint8Array(size);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  },
  u32(n) { return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]); },
  u16(n) { return new Uint8Array([(n >>> 8) & 255, n & 255]); },
  str(s) { return new Uint8Array([...s].map(c => c.charCodeAt(0))); },
  zeros(n) { return new Uint8Array(n); },
  box(type, ...payload) {
    const body = Mp4.u8(...payload);
    return Mp4.u8(Mp4.u32(body.length + 8), Mp4.str(type), body);
  },
  fullBox(type, version, flags, ...payload) {
    return Mp4.box(type, new Uint8Array([version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255]), ...payload);
  },
  matrix() {
    return Mp4.u8(Mp4.u32(0x10000), Mp4.u32(0), Mp4.u32(0), Mp4.u32(0), Mp4.u32(0x10000), Mp4.u32(0), Mp4.u32(0), Mp4.u32(0), Mp4.u32(0x40000000));
  },

  // Tables d'échantillons d'une piste ; offset = position du premier octet de la piste dans le fichier
  sampleTables(samples, delta, offset, keyframes) {
    const n = samples.length;
    const stts = Mp4.fullBox('stts', 0, 0, Mp4.u32(1), Mp4.u32(n), Mp4.u32(delta));
    const stsc = Mp4.fullBox('stsc', 0, 0, Mp4.u32(1), Mp4.u32(1), Mp4.u32(n), Mp4.u32(1));
    const stsz = Mp4.fullBox('stsz', 0, 0, Mp4.u32(0), Mp4.u32(n), ...samples.map(s => Mp4.u32(s.length)));
    const stco = Mp4.fullBox('stco', 0, 0, Mp4.u32(1), Mp4.u32(offset));
    const parts = [stts];
    if (keyframes) {
      const list = [];
      samples.forEach((s, i) => { if (s.key) list.push(i + 1); });
      parts.push(Mp4.fullBox('stss', 0, 0, Mp4.u32(list.length), ...list.map(i => Mp4.u32(i))));
    }
    parts.push(stsc, stsz, stco);
    return parts;
  },

  trackBox(id, handler, mediaTimescale, durationMedia, durationMovie, header, sampleEntry, tables, width, height) {
    const tkhd = Mp4.fullBox('tkhd', 0, 7, Mp4.u32(0), Mp4.u32(0), Mp4.u32(id), Mp4.u32(0), Mp4.u32(durationMovie),
      Mp4.zeros(8), Mp4.u16(0), Mp4.u16(0), Mp4.u16(handler === 'soun' ? 0x0100 : 0), Mp4.u16(0), Mp4.matrix(),
      Mp4.u32(width << 16), Mp4.u32(height << 16));
    const mdhd = Mp4.fullBox('mdhd', 0, 0, Mp4.u32(0), Mp4.u32(0), Mp4.u32(mediaTimescale), Mp4.u32(durationMedia), Mp4.u16(0x55c4), Mp4.u16(0));
    const hdlr = Mp4.fullBox('hdlr', 0, 0, Mp4.u32(0), Mp4.str(handler), Mp4.zeros(12), Mp4.str(handler === 'vide' ? 'LastZone Video\0' : 'LastZone Audio\0'));
    const dinf = Mp4.box('dinf', Mp4.fullBox('dref', 0, 0, Mp4.u32(1), Mp4.fullBox('url ', 0, 1)));
    const stsd = Mp4.fullBox('stsd', 0, 0, Mp4.u32(1), sampleEntry);
    const stbl = Mp4.box('stbl', stsd, ...tables);
    const minf = Mp4.box('minf', header, dinf, stbl);
    return Mp4.box('trak', tkhd, Mp4.box('mdia', mdhd, hdlr, minf));
  },

  // video : { width, height, avcC, samples: [{ length, data, key }], timescale, delta }
  // audio : { sampleRate, asc, samples: [Uint8Array...], delta } (AAC)
  write(video, audio) {
    const videoBytes = video.samples.reduce((s, x) => s + x.data.length, 0);
    const audioBytes = audio.samples.reduce((s, x) => s + x.length, 0);
    const movieMs = Math.round(video.samples.length * video.delta / video.timescale * 1000);
    const ftyp = Mp4.box('ftyp', Mp4.str('isom'), Mp4.u32(512), Mp4.str('isom'), Mp4.str('iso2'), Mp4.str('avc1'), Mp4.str('mp41'));

    const build = (videoOffset, audioOffset) => {
      const avc1 = Mp4.box('avc1', Mp4.zeros(6), Mp4.u16(1), Mp4.zeros(16), Mp4.u16(video.width), Mp4.u16(video.height),
        Mp4.u32(0x00480000), Mp4.u32(0x00480000), Mp4.u32(0), Mp4.u16(1), Mp4.zeros(32), Mp4.u16(0x0018), Mp4.u16(0xffff),
        Mp4.box('avcC', video.avcC));
      const vtables = Mp4.sampleTables(video.samples.map(s => ({ length: s.data.length, key: s.key })), video.delta, videoOffset, true);
      const vtrak = Mp4.trackBox(1, 'vide', video.timescale, video.samples.length * video.delta, movieMs,
        Mp4.fullBox('vmhd', 0, 1, Mp4.zeros(8)), avc1, vtables, video.width, video.height);

      const asc = audio.asc;
      const esds = Mp4.fullBox('esds', 0, 0,
        new Uint8Array([0x03, 23 + asc.length, 0, 1, 0]),
        new Uint8Array([0x04, 15 + asc.length, 0x40, 0x15, 0, 0, 0]), Mp4.u32(128000), Mp4.u32(96000),
        new Uint8Array([0x05, asc.length]), asc,
        new Uint8Array([0x06, 1, 0x02]));
      const mp4a = Mp4.box('mp4a', Mp4.zeros(6), Mp4.u16(1), Mp4.zeros(8), Mp4.u16(1), Mp4.u16(16), Mp4.u16(0), Mp4.u16(0), Mp4.u32(audio.sampleRate << 16), esds);
      const atables = Mp4.sampleTables(audio.samples.map(s => ({ length: s.length })), audio.delta, audioOffset, false);
      const atrak = Mp4.trackBox(2, 'soun', audio.sampleRate, audio.samples.length * audio.delta,
        Math.round(audio.samples.length * audio.delta / audio.sampleRate * 1000), Mp4.fullBox('smhd', 0, 0, Mp4.zeros(4)), mp4a, atables, 0, 0);

      const mvhd = Mp4.fullBox('mvhd', 0, 0, Mp4.u32(0), Mp4.u32(0), Mp4.u32(1000), Mp4.u32(movieMs), Mp4.u32(0x10000), Mp4.u16(0x0100), Mp4.zeros(10),
        Mp4.matrix(), Mp4.zeros(24), Mp4.u32(3));
      return Mp4.box('moov', mvhd, vtrak, atrak);
    };

    const probe = build(0, 0);
    const mdatStart = ftyp.length + probe.length + 8;           // après l'en-tête de mdat
    const moov = build(mdatStart, mdatStart + videoBytes);
    const header = Mp4.u32(videoBytes + audioBytes + 8);
    return Mp4.u8(ftyp, moov, header, Mp4.str('mdat'), ...video.samples.map(s => s.data), ...audio.samples);
  }
};

const Studio = {
  fps: 30,
  W: 1280,
  H: 720,
  rate: 48000,
  fade: 0.3,                // secondes de fondu avant et après chaque changement de scène
  status: 'prêt',
  saved: null,

  // Passe la boucle de rendu de p5 au « point mort » : toutes les images sont dessinées à la main
  async prepare() {
    noLoop();
    pixelDensity(1);
    resizeCanvas(this.W, this.H);
    computeView();
    profil.data.settings.tutorielFini = true;
  },

  yieldToBrowser() {
    return new Promise(resolve => { const c = new MessageChannel(); c.port1.onmessage = () => resolve(); c.port2.postMessage(0); });
  },

  // Voix off + ambiance, mixées hors ligne à partir des instants de début de scène (secondes)
  async buildAudio(starts, total) {
    const rate = this.rate;
    const length = Math.ceil((total + 0.5) * rate);
    const out = new Float32Array(length);
    // ambiance : nappe grave, très discrète, et un souffle de vent
    let wind = 0;
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const pad = Math.sin(2 * Math.PI * 55 * t) + 0.6 * Math.sin(2 * Math.PI * 82.4 * t) + 0.4 * Math.sin(2 * Math.PI * 110.5 * t);
      wind = wind * 0.995 + (Math.random() * 2 - 1) * 0.005;
      out[i] = 0.014 * pad * (0.75 + 0.25 * Math.sin(2 * Math.PI * 0.11 * t)) + wind * 0.45;
    }
    // voix : un segment par scène, l'un après l'autre (le suivant attend la fin du précédent)
    const offline = new OfflineAudioContext(1, rate, rate);
    let free = 0;
    for (let i = 0; i < 11; i++) {
      const res = await fetch(Video.voiceDir + '/segment' + String(i + 1).padStart(2, '0') + '.wav');
      if (!res.ok) throw new Error('segment de voix manquant : ' + (i + 1));
      const buffer = await offline.decodeAudioData(await res.arrayBuffer());
      const data = buffer.getChannelData(0);
      const begin = Math.max(Math.round(((starts[i] === undefined ? 0 : starts[i]) + 0.45) * rate), free);
      for (let k = 0; k < data.length && begin + k < length; k++) out[begin + k] += data[k] * 1.0;
      free = begin + data.length + Math.round(0.25 * rate);
    }
    for (let i = 0; i < length; i++) out[i] = Math.max(-0.98, Math.min(0.98, out[i]));
    return out;
  },

  async encodeAudio(samples) {
    const frames = [];
    let asc = null;
    const encoder = new AudioEncoder({
      output: (chunk, meta) => {
        const bytes = new Uint8Array(chunk.byteLength);
        chunk.copyTo(bytes);
        frames.push(bytes);
        if (!asc && meta && meta.decoderConfig && meta.decoderConfig.description) asc = new Uint8Array(meta.decoderConfig.description);
      },
      error: e => { throw e; }
    });
    encoder.configure({ codec: 'mp4a.40.2', sampleRate: this.rate, numberOfChannels: 1, bitrate: 96000 });
    const block = 1024 * 4;
    for (let at = 0; at < samples.length; at += block) {
      const part = samples.slice(at, Math.min(samples.length, at + block));
      const data = new AudioData({ format: 'f32-planar', sampleRate: this.rate, numberOfFrames: part.length, numberOfChannels: 1,
        timestamp: Math.round(at / this.rate * 1e6), data: part });
      encoder.encode(data);
      data.close();
      if (encoder.encodeQueueSize > 12) await this.yieldToBrowser();
    }
    await encoder.flush();
    encoder.close();
    if (!asc) asc = new Uint8Array([0x11, 0x88]);      // AAC-LC, 48 kHz, mono (valeur par défaut)
    return { asc, frames };
  },

  // limit : nombre de scènes à rendre (essais courts) ; retourne { bytes, file }
  async render(name = 'video-finale-last-zone', limit = null) {
    if (this.running) return;
    this.running = true;
    this.status = 'préparation';
    await this.prepare();
    const canvas = document.querySelector('canvas');
    const scenes = Video.scenes().slice(0, limit || 99);
    const saved = JSON.stringify(profil.data.settings);

    // ----- encodeur vidéo -----
    const samples = [];
    let avcC = null;
    const venc = new VideoEncoder({
      output: (chunk, meta) => {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        samples.push({ data, key: chunk.type === 'key', ts: chunk.timestamp });
        if (!avcC && meta && meta.decoderConfig && meta.decoderConfig.description) avcC = new Uint8Array(meta.decoderConfig.description);
      },
      error: e => { this.status = 'erreur encodeur : ' + e.message; throw e; }
    });
    venc.configure({ codec: 'avc1.640028', width: this.W, height: this.H, bitrate: 5000000, framerate: this.fps,
      avc: { format: 'avc' }, latencyMode: 'quality' });

    // ----- scénario -----
    Video.t = 0;
    Video.sceneIndex = -1;
    Video.sceneStart = 0;
    Video.starts = [];
    Video.caption = '';
    Video.title = false;
    Video.endCard = false;
    const dt = 1000 / this.fps;
    // horloge virtuelle : les animations liées à millis() (balancement, rotation du butin) avancent de 1/30 s par image
    const realMillis = window.millis;
    window.millis = () => Video.t * 1000;
    let state = null;               // null | { kind: 'out' | 'in', until: secondes }
    let frame = 0;
    let finished = false;
    this.status = 'rendu';
    while (!finished) {
      Video.t = frame / this.fps;
      window.deltaTime = dt;
      const current = scenes[Video.sceneIndex];
      const elapsed = Video.t - Video.sceneStart;

      if (state && state.kind === 'out' && Video.t >= state.until) {
        // au plus noir : on change de décor
        if (current && current.leave) current.leave();
        Video.sceneIndex++;
        Video.sceneStart = Video.t;
        Video.starts.push(Number(Video.t.toFixed(3)));
        const next = scenes[Video.sceneIndex];
        if (!next) { finished = true; break; }
        if (next.enter) next.enter();
        if (match && match.joueur && screen === 'match') {
          const p = match.joueur;
          viewYaw = p.phase === 'vehicule' && p.vehicle ? p.vehicle.angle : p.aim;        // pas de rotation après un changement de lieu
        }
        state = { kind: 'in', until: Video.t + this.fade };
      } else if (Video.sceneIndex < 0) {
        Video.sceneIndex = 0;
        Video.sceneStart = Video.t;
        Video.starts.push(0);
        scenes[0].enter();
        state = { kind: 'in', until: Video.t + 0.5 };
      } else {
        if (state && state.kind === 'in' && Video.t >= state.until) state = null;
        const over = current && (elapsed >= current.dur || (current.until && elapsed > 4 && current.until()));
        if (current && !over) {
          if (current.tick) current.tick(elapsed, dt / 1000);
        } else if (current && !state) {
          const last = Video.sceneIndex === scenes.length - 1;
          if (last) { Video.sceneIndex++; Video.starts.push(Number(Video.t.toFixed(3))); finished = true; break; }
          state = { kind: 'out', until: Video.t + this.fade };
        }
      }

      // la caméra suit le regard (ou le cap du véhicule) en douceur
      if (match && match.joueur && screen === 'match') {
        const p = match.joueur;
        const ref = p.phase === 'vehicule' && p.vehicle ? p.vehicle.angle : p.aim;
        const diff = Math.atan2(Math.sin(ref - viewYaw), Math.cos(ref - viewYaw));
        viewYaw += diff * 0.12;
        if (p.alive) p.invulnerable = Math.max(p.invulnerable, 5);
      }
      draw();
      Video.drawCaption();
      Video.drawOverlays();
      if (state) {
        const a = state.kind === 'out' ? 1 - (state.until - Video.t) / this.fade : (state.until - Video.t) / (Video.sceneIndex === 0 && frame < this.fps ? 0.5 : this.fade);
        push();
        noStroke();
        fill(5, 10, 30, 255 * Math.max(0, Math.min(1, a)));
        rect(0, 0, width, height);
        pop();
      }

      const image = new VideoFrame(canvas, { timestamp: Math.round(frame * 1e6 / this.fps), duration: Math.round(1e6 / this.fps) });
      venc.encode(image, { keyFrame: frame % 60 === 0 });
      image.close();
      frame++;
      if (venc.encodeQueueSize > 6 || frame % 15 === 0) await this.yieldToBrowser();
      if (frame % 30 === 0) this.status = 'rendu ' + (frame / this.fps).toFixed(0) + ' s';
      if (frame > this.fps * 400) throw new Error('rendu trop long : scénario bloqué ?');
    }
    window.millis = realMillis;
    await venc.flush();
    venc.close();
    const total = frame / this.fps;

    this.status = 'audio';
    const pcm = await this.buildAudio(Video.starts, total);
    const audio = await this.encodeAudio(pcm);

    this.status = 'assemblage MP4';
    const mp4 = Mp4.write(
      { width: this.W, height: this.H, avcC, samples, timescale: 30000, delta: 1000 },
      { sampleRate: this.rate, asc: audio.asc, samples: audio.frames, delta: 1024 });
    const res = await fetch('/__enregistrer/' + name + '.mp4', { method: 'POST', body: new Blob([mp4], { type: 'video/mp4' }) });
    this.saved = await res.json();
    const ordered = samples.every((x, i) => i === 0 || x.ts > samples[i - 1].ts);
    this.summary = { ordre: ordered ? 'ok' : 'IMAGES DANS UN ORDRE DIFFÉRENT (B-frames)', images: samples.length, secondes: Number(total.toFixed(2)), starts: Video.starts, audioFrames: audio.frames.length };

    profil.data.settings = JSON.parse(saved);
    profil.save();
    if (typeof leaveMatchSafe === 'function') leaveMatchSafe();
    loop();
    this.running = false;
    this.status = 'terminé';
    return this.saved;
  }
};
