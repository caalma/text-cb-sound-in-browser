import { codebarPattern } from './codebar.js';
import { WAVE_NAMES } from './config.js';

const VOLUME_STEP = 0.01;
const OP_CENTER_DOWN = 0x00A1;

function clamp(v, lo, hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

function waveIndex(name) {
  const i = WAVE_NAMES.indexOf(name);
  return i < 0 ? 1 : i;
}

function isAsciiLetter(cp) {
  return (cp >= 65 && cp <= 90) || (cp >= 97 && cp <= 122);
}

function isVowel(cp) {
  if (cp >= 65 && cp <= 90) {
    cp += 32;
  }

  return cp === 97 || cp === 101 || cp === 105 || cp === 111 || cp === 117;
}

function makeRng(seed) {
  return { s: (seed >>> 0) || 0x12345678 };
}

function nextRand(rng) {
  let x = rng.s;

  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;

  rng.s = x >>> 0;
  return rng.s;
}

function randFloat(rng) {
  return (nextRand(rng) & 0xFFFFFF) / 0x1000000;
}

function deriveSeed(state, cp, index) {
  let x = state.runtime_seed >>> 0;

  x ^= Math.imul((state.word_counter || 0) + 1, 0x9E3779B9);
  x ^= Math.imul(index + 1, 0xC2B2AE3D);
  x ^= Math.imul(cp, 0x165667B1);

  return (x >>> 0) || 0x12345678;
}

function panGains(lat) {
  const v = clamp(lat, -9, 9);
  const t = ((v + 9) / 18) * (Math.PI / 2);
  return [Math.cos(t), Math.sin(t)];
}

function noiseSample(wt, ns, rng, freq, rate) {
  const white = randFloat(rng) * 2 - 1;
  const alpha = clamp(freq / (rate + freq), 0, 1);

  if (wt === 4) {
    ns.lp += alpha * (white - ns.lp);
    return ns.lp * 2;
  }

  if (wt === 5) {
    ns.brown = (ns.brown + 0.02 * white) / 1.02;
    ns.lp += alpha * (ns.brown - ns.lp);
    return ns.lp * 4;
  }

  ns.p0 = 0.99765 * ns.p0 + white * 0.099046;
  ns.p1 = 0.96300 * ns.p1 + white * 0.296516;
  ns.p2 = 0.57000 * ns.p2 + white * 1.052690;

  const pink = ns.p0 + ns.p1 + ns.p2 + white * 0.1848;
  ns.lp += alpha * (pink - ns.lp);

  return ns.lp * 0.5;
}

function oscSample(wt, phase, ns, rng, freq, rate) {
  switch (wt) {
    case 0:
      return phase < 0.5 ? 1 : -1;

    case 1:
      return Math.sin(2 * Math.PI * phase);

    case 2:
      return 2 * phase - 1;

    case 3:
      return 4 * Math.abs(phase - 0.5) - 1;

    default:
      return noiseSample(wt, ns, rng, freq, rate);
  }
}

function patternModules(pat) {
  let sum = 0;

  for (const ch of pat) {
    if (ch >= '0' && ch <= '9') {
      sum += ch.charCodeAt(0) - 48;
    }
  }

  return sum;
}

async function renderWord(events, center, tempoMs, state, audio) {
  const rate = audio.sampleRate();

  const moduleSamples = Math.max(
    1,
    Math.floor((tempoMs * rate) / 1000)
  );

  let maxFrames = 0;

  for (const ev of events) {
    const pat = codebarPattern(state.codebar_modo, ev.cp - 32);

    if (!pat) {
      continue;
    }

    const frames = patternModules(pat) * moduleSamples;

    if (frames > maxFrames) {
      maxFrames = frames;
    }
  }

  if (maxFrames <= 0) {
    return;
  }

  const mix = new Float32Array(maxFrames * 2);

  const fmin = Math.max(1, state.frecuencia_min);
  const fmax = Math.max(fmin, Math.min(state.frecuencia_max, rate / 2 - 50));

  events.forEach((ev, i) => {
    const pat = codebarPattern(state.codebar_modo, ev.cp - 32);

    if (!pat) {
      return;
    }

    const step = Math.floor((i + 1) / 2);
    const sign = (i % 2 === 0) ? 1 : -1;

    let freq = center + (sign * step * ev.disp);
    freq = clamp(freq, fmin, fmax);

    const inc = freq / rate;
    const [panL, panR] = panGains(ev.lat);

    const rng = makeRng(deriveSeed(state, ev.cp, i));

    const ns = {
      lp: 0,
      brown: 0,
      p0: 0,
      p1: 0,
      p2: 0
    };

    const smoothMs = Math.max(0, ev.smooth);
    const smoothSamples = Math.floor((smoothMs * rate) / 1000);
    const stepGain = smoothSamples > 0 ? 1 / smoothSamples : 0;

    let phase = 0;
    let gain = 0;
    let sampleIndex = 0;
    let bar = true;

    for (const ch of pat) {
      if (ch < '0' || ch > '9') {
        bar = !bar;
        continue;
      }

      const width = ch.charCodeAt(0) - 48;
      const samples = width * moduleSamples;

      let target = bar ? 1 : 0;

      if (ev.inv) {
        target = target ? 0 : 1;
      }

      for (let n = 0; n < samples && sampleIndex < maxFrames; n++) {
        if (smoothSamples > 0) {
          if (gain < target) {
            gain += stepGain;
            if (gain > target) gain = target;
          } else if (gain > target) {
            gain -= stepGain;
            if (gain < target) gain = target;
          }
        } else {
          gain = target;
        }

        const s = oscSample(ev.wave, phase, ns, rng, freq, rate);

        mix[sampleIndex * 2 + 0] += s * gain * ev.vol * panL;
        mix[sampleIndex * 2 + 1] += s * gain * ev.vol * panR;

        if (ev.wave < 4) {
          phase += inc;

          if (phase >= 1) {
            phase -= 1;
          }
        }

        sampleIndex++;
      }

      bar = !bar;
    }
  });

  let max = 0;

  for (let i = 0; i < mix.length; i++) {
    const a = Math.abs(mix[i]);

    if (a > max) {
      max = a;
    }
  }

  if (max > 1) {
    const scale = 1 / max;

    for (let i = 0; i < mix.length; i++) {
      mix[i] *= scale;
    }
  }

  if (max > 1e-9) {
    await audio.playFloat32Stereo(mix, maxFrames);
  }

  state.word_counter = (state.word_counter || 0) + 1;
}

function applyGlobalOp(state, cp, q, hasNum) {
  switch (cp) {
    case 43: // +
      state.dispersion += q;
      break;

    case 45: // -
      state.dispersion -= q;
      break;

    case 33: // !
      state.centro_sonoro += q;
      if (state.centro_sonoro < 0) state.centro_sonoro = 0;
      break;

    case OP_CENTER_DOWN:
      state.centro_sonoro -= q;
      if (state.centro_sonoro < 0) state.centro_sonoro = 0;
      break;

    case 41: // )
      state.suavidad_ritmica += q;
      if (state.suavidad_ritmica < 0) state.suavidad_ritmica = 0;
      break;

    case 40: // (
      state.suavidad_ritmica -= q;
      if (state.suavidad_ritmica < 0) state.suavidad_ritmica = 0;
      break;

    case 62: // >
      state.ritmo_ms_modulo += q;
      if (state.ritmo_ms_modulo < 1) state.ritmo_ms_modulo = 1;
      break;

    case 60: // <
      state.ritmo_ms_modulo -= q;
      if (state.ritmo_ms_modulo < 1) state.ritmo_ms_modulo = 1;
      break;

    case 35: // #
      if (hasNum) {
        state.inversion_ritmica = q !== 0;
      } else {
        state.inversion_ritmica = !state.inversion_ritmica;
      }
      break;

    case 123: // {
      state.lateralidad_sonora = clamp(state.lateralidad_sonora - q, -9, 9);
      break;

    case 125: // }
      state.lateralidad_sonora = clamp(state.lateralidad_sonora + q, -9, 9);
      break;

    case 64: // @
      if (hasNum) {
        state.modelo_onda = WAVE_NAMES[q % WAVE_NAMES.length];
      } else {
        state.modelo_onda = state.default_wave;
      }
      break;

    case 91: // [
      state.audio_volumen = clamp(
        state.audio_volumen - q * VOLUME_STEP,
        0,
        1
      );
      break;

    case 93: // ]
      state.audio_volumen = clamp(
        state.audio_volumen + q * VOLUME_STEP,
        0,
        1
      );
      break;

    default:
      break;
  }
}

async function processGlobalToken(cps, state, audio) {
  let pending = 0;
  let pendingDigits = 0;
  let hasNum = false;

  for (const cp of cps) {
    if (cp >= 48 && cp <= 57) {
      if (pending < 1000000000) {
        pending = pending * 10 + (cp - 48);
      }

      pendingDigits++;
      hasNum = true;
      continue;
    }

    const q = hasNum ? pending : 1;
    const hn = hasNum;

    pending = 0;
    pendingDigits = 0;
    hasNum = false;

    if (cp === 126) { // ~
      const tempo = Math.max(1, state.ritmo_ms_modulo);
      const seconds = (q * tempo) / 1000;

      await audio.ensureAudio();
      audio.scheduleSilence(seconds);

      continue;
    }

    applyGlobalOp(state, cp, q, hn);
  }
}

async function processWordLocal(cps, state, audio) {
  let vowels = 0;
  let consonants = 0;

  for (const cp of cps) {
    if (isAsciiLetter(cp)) {
      if (isVowel(cp)) {
        vowels++;
      } else {
        consonants++;
      }
    }
  }

  const baseDisp = consonants + (state.dispersion - 1);

  const events = [];

  let centerDelta = 0;
  let tempoDelta = 0;

  let inv = !!state.inversion_ritmica;
  let lat = clamp(state.lateralidad_sonora, -9, 9);
  let wave = waveIndex(state.modelo_onda);

  let currentDisp = baseDisp;
  let currentSmooth = state.suavidad_ritmica;
  let currentVol = clamp(state.audio_volumen, 0, 1);

  let pending = 0;
  let hasNum = false;

  for (const cp of cps) {
    if (cp >= 48 && cp <= 57) {
      if (pending < 1000000000) {
        pending = pending * 10 + (cp - 48);
      }

      hasNum = true;
      continue;
    }

    if (isAsciiLetter(cp)) {
      pending = 0;
      hasNum = false;

      events.push({
        cp,
        inv,
        lat,
        wave,
        disp: currentDisp,
        smooth: currentSmooth,
        vol: currentVol
      });

      continue;
    }

    const q = hasNum ? pending : 1;
    const hn = hasNum;

    pending = 0;
    hasNum = false;

    switch (cp) {
      case 43: // +
        currentDisp += q;
        break;

      case 45: // -
        currentDisp -= q;
        break;

      case 33: // !
        centerDelta += q;
        break;

      case OP_CENTER_DOWN:
        centerDelta -= q;
        break;

      case 41: // )
        currentSmooth += q;
        if (currentSmooth < 0) currentSmooth = 0;
        break;

      case 40: // (
        currentSmooth -= q;
        if (currentSmooth < 0) currentSmooth = 0;
        break;

      case 62: // >
        tempoDelta += q;
        break;

      case 60: // <
        tempoDelta -= q;
        break;

      case 35: // #
        if (hn) {
          inv = q !== 0;
        } else {
          inv = !inv;
        }
        break;

      case 123: // {
        lat = clamp(lat - q, -9, 9);
        break;

      case 125: // }
        lat = clamp(lat + q, -9, 9);
        break;

      case 64: // @
        if (hn) {
          wave = q % WAVE_NAMES.length;
        } else {
          wave = waveIndex(state.default_wave);
        }
        break;

      case 91: // [
        currentVol = clamp(currentVol - q * VOLUME_STEP, 0, 1);
        break;

      case 93: // ]
        currentVol = clamp(currentVol + q * VOLUME_STEP, 0, 1);
        break;

      default:
        break;
    }
  }

  if (events.length === 0) {
    return;
  }

  const center = state.centro_sonoro + centerDelta + vowels;
  const tempo = Math.max(1, state.ritmo_ms_modulo + tempoDelta);

  await renderWord(events, center, tempo, state, audio);
}

export async function processWord(token, state, audio) {
  if (!token) {
    return;
  }

  const cps = Array.from(token).map(ch => ch.codePointAt(0));

  let hasLetter = false;

  for (const cp of cps) {
    if (isAsciiLetter(cp)) {
      hasLetter = true;
      break;
    }
  }

  if (hasLetter) {
    await processWordLocal(cps, state, audio);
  } else {
    await processGlobalToken(cps, state, audio);
  }
}
