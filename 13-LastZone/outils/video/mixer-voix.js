// Assemble la voix off : place chaque segment .wav au début de sa scène (secondes) dans une piste unique.
//   node outils/video/mixer-voix.js <depart.json> <dossier des segments> <sortie.wav> <durée totale en secondes>
// depart.json : { "starts": [0, 7.1, ...] }  (mesures faites par outils/video/video.js)
// Les .wav doivent être en PCM 16 bits mono, même fréquence (c'est ce que produit outils/video/voix.ps1).

const fs = require('fs');
const path = require('path');

function lireWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error(file + ' : pas un WAV');
  let pos = 12;
  let fmt = null;
  let data = null;
  while (pos + 8 <= b.length) {
    const id = b.toString('ascii', pos, pos + 4);
    const size = b.readUInt32LE(pos + 4);
    if (id === 'fmt ') fmt = { format: b.readUInt16LE(pos + 8), channels: b.readUInt16LE(pos + 10), rate: b.readUInt32LE(pos + 12), bits: b.readUInt16LE(pos + 22) };
    if (id === 'data') { data = b.subarray(pos + 8, pos + 8 + Math.min(size, b.length - pos - 8)); break; }
    pos += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error(file + ' : WAV incomplet');
  if (fmt.format !== 1 || fmt.bits !== 16 || fmt.channels !== 1) throw new Error(file + ' : seul le PCM 16 bits mono est géré');
  return { fmt, samples: new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + (data.length & ~1))) };
}

function ecrireWav(file, samples, rate) {
  const data = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}

function main() {
  const [departFile, dossier, sortie, total] = process.argv.slice(2);
  if (!departFile || !dossier || !sortie || !total) throw new Error('usage : node mixer-voix.js depart.json dossier sortie.wav duree');
  const starts = JSON.parse(fs.readFileSync(departFile, 'utf8')).starts;
  const files = fs.readdirSync(dossier).filter(f => /^segment\d+\.wav$/.test(f)).sort();
  const segments = files.map(f => lireWav(path.join(dossier, f)));
  const rate = segments[0].fmt.rate;
  if (segments.some(s => s.fmt.rate !== rate)) throw new Error('fréquences différentes');
  const out = new Int16Array(Math.ceil(Number(total) * rate));
  let libre = 0;   // première seconde (en échantillons) où la voix précédente est terminée
  segments.forEach((seg, i) => {
    // petit retard : la voix suit le sous-titre ; si la scène précédente a débordé, on attend qu'elle finisse
    const begin = Math.max(Math.round((starts[i] === undefined ? 0 : starts[i]) * rate) + Math.round(0.3 * rate), libre);
    const end = begin + seg.samples.length;
    if (end > out.length) console.warn('segment', i + 1, 'dépasse la fin de la vidéo de', ((end - out.length) / rate).toFixed(1), 's');
    const next = starts[i + 1] === undefined ? Infinity : starts[i + 1] * rate;
    if (end > next) console.warn('segment', i + 1, 'déborde sur la scène suivante de', ((end - next) / rate).toFixed(1), 's');
    for (let k = 0; k < seg.samples.length && begin + k < out.length; k++) out[begin + k] = seg.samples[k];
    libre = end + Math.round(0.25 * rate);
  });
  ecrireWav(sortie, out, rate);
  console.log('voix off :', sortie, (out.length / rate).toFixed(1), 's', rate, 'Hz');
}

main();
