export const WAVE_NAMES = [
  'square',
  'sine',
  'saw',
  'triangle',
  'wnoise',
  'bnoise',
  'rnoise'
];

export const CODEBAR_MODES = [
  'code128',
  'code314'
];

export const DEFAULT_SETTINGS = {
  centro_sonoro: 220,
  dispersion: 1,
  suavidad_ritmica: 0,
  inversion_ritmica: 0,
  lateralidad_sonora: 0,
  ritmo_ms_modulo: 20,
  modelo_onda: 'sine',
  audio_volumen: 0.95,
  audio_seed: 12345,
  frecuencia_min: 20,
  frecuencia_max: 20000,
  codebar_modo: 'code128'
};

export const SETTINGS_KEY = 'text-cb-sound:settings';
export const HISTORY_KEY = 'text-cb-sound:history';

export function encodeB64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';

  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }

  return btoa(bin);
}

export function decodeB64Utf8(b64) {
  try {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

export function decodeMaybeB64(value) {
  if (typeof value === 'string' && value.startsWith('b64:')) {
    return decodeB64Utf8(value.slice(4));
  }

  return value;
}

function toNumber(raw, fallback) {
  const v = decodeMaybeB64(raw);
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toInt(raw, fallback) {
  return Math.trunc(toNumber(raw, fallback));
}

function coerceSetting(key, raw) {
  const decoded = decodeMaybeB64(raw);

  switch (key) {
    case 'centro_sonoro':
      return toNumber(raw, DEFAULT_SETTINGS.centro_sonoro);

    case 'audio_volumen':
      return toNumber(raw, DEFAULT_SETTINGS.audio_volumen);

    case 'dispersion':
      return toInt(raw, DEFAULT_SETTINGS.dispersion);

    case 'suavidad_ritmica':
      return toInt(raw, DEFAULT_SETTINGS.suavidad_ritmica);

    case 'inversion_ritmica':
      return ['1', 'true', 'on', 'si', 'yes'].includes(String(decoded).toLowerCase()) ? 1 : 0;

    case 'lateralidad_sonora':
      return toInt(raw, DEFAULT_SETTINGS.lateralidad_sonora);

    case 'ritmo_ms_modulo':
      return toInt(raw, DEFAULT_SETTINGS.ritmo_ms_modulo);

    case 'audio_seed':
      return toInt(raw, DEFAULT_SETTINGS.audio_seed);

    case 'frecuencia_min':
      return toInt(raw, DEFAULT_SETTINGS.frecuencia_min);

    case 'frecuencia_max':
      return toInt(raw, DEFAULT_SETTINGS.frecuencia_max);

    case 'modelo_onda':
      return WAVE_NAMES.includes(decoded) ? decoded : DEFAULT_SETTINGS.modelo_onda;

    case 'codebar_modo':
      return CODEBAR_MODES.includes(decoded) ? decoded : DEFAULT_SETTINGS.codebar_modo;

    default:
      return decoded;
  }
}

export function parseHash() {
  const result = {
    settings: {},
    script: '',
    autorun: false
  };

  if (!location.hash || location.hash.length < 2) {
    return result;
  }

  const params = new URLSearchParams(location.hash.slice(1));

  if (params.has('autorun')) {
    result.autorun = ['1', 'true', 'on'].includes(params.get('autorun'));
  }

  if (params.has('script')) {
    result.script = decodeMaybeB64(params.get('script'));
  }

  if (params.has('settings')) {
    try {
      const obj = JSON.parse(decodeMaybeB64(params.get('settings')));

      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (key in obj) {
          result.settings[key] = obj[key];
        }
      }
    } catch {
      // ignore invalid settings JSON
    }
  }

  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (params.has(key)) {
      result.settings[key] = coerceSetting(key, params.get(key));
    }
  }

  return result;
}

export function loadStoredSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);

    if (!raw) {
      return {};
    }

    const obj = JSON.parse(raw);
    const out = {};

    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (key in obj) {
        out[key] = obj[key];
      }
    }

    return out;
  } catch {
    return {};
  }
}

export function saveStoredSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}

export function mergeSettings(...sources) {
  const out = { ...DEFAULT_SETTINGS };

  for (const src of sources) {
    if (!src) {
      continue;
    }

    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (key in src) {
        out[key] = src[key];
      }
    }
  }

  return out;
}
