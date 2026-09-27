import * as recorder from './recorder.js';

import {
  DEFAULT_SETTINGS,
  HISTORY_KEY,
  encodeB64Utf8,
  loadStoredSettings,
  mergeSettings,
  parseHash,
  saveStoredSettings
} from './config.js';

import {
  runtimeFromSettings,
  stateLines
} from './state.js';

import * as audio from './audio.js';
import { processLine } from './parser.js';

const output = document.getElementById('output');
const input = document.getElementById('input');

const btnStop = document.getElementById('btn-stop');
const btnClear = document.getElementById('btn-clear');
const btnHelp = document.getElementById('btn-help');
const btnSettings = document.getElementById('btn-settings');
const btnScript = document.getElementById('btn-script');
const btnShare = document.getElementById('btn-share');
const btnRec = document.getElementById('btn-rec');

const helpDialog = document.getElementById('help-dialog');
const helpClose = document.getElementById('help-close');

const btnTutorial = document.getElementById('btn-tutorial');
const tutorialDialog = document.getElementById('tutorial-dialog');
const tutorialClose = document.getElementById('tutorial-close');

const settingsDialog = document.getElementById('settings-dialog');
const settingsForm = document.getElementById('settings-form');
const settingsClose = document.getElementById('settings-close');
const settingsReset = document.getElementById('settings-reset');

const sCentro = document.getElementById('s-centro');
const sDispersion = document.getElementById('s-dispersion');
const sSuavidad = document.getElementById('s-suavidad');
const sInversion = document.getElementById('s-inversion');
const sLateral = document.getElementById('s-lateral');
const sLateralVal = document.getElementById('s-lateral-val');
const sTempo = document.getElementById('s-tempo');
const sWave = document.getElementById('s-wave');
const sVolumen = document.getElementById('s-volumen');
const sVolumenVal = document.getElementById('s-volumen-val');
const sSeed = document.getElementById('s-seed');
const sFmin = document.getElementById('s-fmin');
const sFmax = document.getElementById('s-fmax');
const sCodebar = document.getElementById('s-codebar');

const scriptDialog = document.getElementById('script-dialog');
const scriptText = document.getElementById('script-text');
const scriptRun = document.getElementById('script-run');
const scriptImport = document.getElementById('script-import');
const scriptExport = document.getElementById('script-export');
const scriptClose = document.getElementById('script-close');
const fileInput = document.getElementById('file-input');

const dropOverlay = document.getElementById('drop-overlay');

const hashData = parseHash();

let settings = mergeSettings(
  DEFAULT_SETTINGS,
  loadStoredSettings(),
  hashData.settings
);

let state = runtimeFromSettings(settings);

let cmdHistory = [];
let historyIndex = 0;
let historyBackup = '';
let runningScript = false;

try {
  cmdHistory = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || '[]');
} catch {
  cmdHistory = [];
}

historyIndex = cmdHistory.length;

function saveHistory() {
  try {
    sessionStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(cmdHistory.slice(-200))
    );
  } catch {
    // ignore
  }
}

function print(text, cls = '') {
  const div = document.createElement('div');
  div.className = `line ${cls}`.trim();
  div.textContent = text;

  output.appendChild(div);

  while (output.children.length > 1000) {
    output.removeChild(output.firstChild);
  }

  output.scrollTop = output.scrollHeight;
}

function clearOutput() {
  output.textContent = '';
}

function openHelp() {
  helpDialog.showModal();
}

function openSettings() {
  fillSettingsForm(state);
  settingsDialog.showModal();
}

function openScript() {
  scriptDialog.showModal();
}

function resetState() {
  state = runtimeFromSettings(settings);
  env.state = state;
}

function reloadSettings() {
  settings = mergeSettings(
    DEFAULT_SETTINGS,
    loadStoredSettings(),
    parseHash().settings
  );

  state = runtimeFromSettings(settings);
  env.state = state;

  fillSettingsForm(state);
}

const env = {
  state,
  audio,
  print,
  stateLines: () => stateLines(env.state),
  resetState,
  reloadSettings,
  openHelp,
  toggleRec,
  stopRequested: false
};

function clampNumber(v, lo, hi) {
  v = Number(v);

  if (!Number.isFinite(v)) {
    v = lo;
  }

  return Math.min(hi, Math.max(lo, v));
}

function fillSettingsForm(obj) {
  sCentro.value = obj.centro_sonoro;
  sDispersion.value = obj.dispersion;
  sSuavidad.value = obj.suavidad_ritmica;
  sInversion.checked = !!obj.inversion_ritmica;
  sLateral.value = obj.lateralidad_sonora;
  sLateralVal.textContent = String(obj.lateralidad_sonora);
  sTempo.value = obj.ritmo_ms_modulo;
  sWave.value = obj.modelo_onda;
  sVolumen.value = obj.audio_volumen;
  sVolumenVal.textContent = Number(obj.audio_volumen).toFixed(2);
  sSeed.value = obj.audio_seed;
  sFmin.value = obj.frecuencia_min;
  sFmax.value = obj.frecuencia_max;
  sCodebar.value = obj.codebar_modo;
}

function readSettingsForm() {
  let fmin = clampNumber(sFmin.value, 1, 1000000);
  let fmax = clampNumber(sFmax.value, fmin, 1000000);

  return {
    centro_sonoro: clampNumber(sCentro.value, 0, 1000000),
    dispersion: clampNumber(sDispersion.value, -1000000, 1000000),
    suavidad_ritmica: clampNumber(sSuavidad.value, 0, 1000000),
    inversion_ritmica: sInversion.checked ? 1 : 0,
    lateralidad_sonora: clampNumber(sLateral.value, -9, 9),
    ritmo_ms_modulo: clampNumber(sTempo.value, 1, 1000000),
    modelo_onda: sWave.value,
    audio_volumen: clampNumber(sVolumen.value, 0, 1),
    audio_seed: clampNumber(sSeed.value, 0, 0xFFFFFFFF),
    frecuencia_min: fmin,
    frecuencia_max: fmax,
    codebar_modo: sCodebar.value
  };
}

async function submitLine(line) {
  if (runningScript) {
    print('Hay un script en ejecucion. Usa Stop si querés cancelarlo.', 'err');
    return;
  }
    print(`-> ${line}`, 'cmd');

  const trimmed = line.trim();

  if (trimmed) {
    cmdHistory.push(trimmed);
    historyIndex = cmdHistory.length;
    saveHistory();
  }

  try {
    await audio.ensureAudio();
    audio.resetStop();
    env.stopRequested = false;

    await processLine(line, env);
  } catch (err) {
    print(`error: ${err.message}`, 'err');
  }
}

async function runScript(text) {
  if (runningScript) {
    print('Hay un script en ejecucion.', 'err');
    return;
  }

  runningScript = true;

  try {
    await audio.ensureAudio();
    audio.resetStop();
    env.stopRequested = false;

    const lines = text.split(/\r?\n/);

    for (const line of lines) {
      if (env.stopRequested || audio.isStopped()) {
        break;
      }

        print(`-> ${line}`, 'cmd');

      await processLine(line, env);
      await audio.waitAhead(0.8);
    }
  } catch (err) {
    print(`error: ${err.message}`, 'err');
  } finally {
      runningScript = false;

      if (recorder.isRecording()) {
          print('grabacion sigue activa: envia _rec para detener y descargar', 'muted');
      }
  }
}




function historyPrev() {
  if (historyIndex <= 0) {
    return;
  }

  if (historyIndex === cmdHistory.length) {
    historyBackup = input.value;
  }

  historyIndex--;
  input.value = cmdHistory[historyIndex] || '';
}

function historyNext() {
  if (historyIndex >= cmdHistory.length) {
    return;
  }

  historyIndex++;

  if (historyIndex === cmdHistory.length) {
    input.value = historyBackup;
  } else {
    input.value = cmdHistory[historyIndex] || '';
  }
}

function deletePrevWord() {
  const start = input.selectionStart;
  const end = input.selectionEnd;

  const before = input.value.slice(0, start);
  const after = input.value.slice(end);

  const newBefore = before.replace(/\s*\S+$/, '');

  input.value = newBefore + after;
  input.setSelectionRange(newBefore.length, newBefore.length);
}

function caretStart() {
  input.setSelectionRange(0, 0);
}

function caretEnd() {
  input.setSelectionRange(input.value.length, input.value.length);
}

function killBeforeCursor() {
  const start = input.selectionStart;
  const end = input.selectionEnd;

  input.value = input.value.slice(end);
  input.setSelectionRange(0, 0);
}

function killAfterCursor() {
  const start = input.selectionStart;
  input.value = input.value.slice(0, start);
  input.setSelectionRange(start, start);
}

const COMMANDS = [
  '_help',
  '_rec',
  '_reload',
  '_reset',
  '_state',
  '_stop'
];

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

function autocomplete() {
  const val = input.value;

  if (!val.startsWith('_')) {
    return;
  }

  const matches = COMMANDS.filter(c => c.startsWith(val));

  if (matches.length === 1) {
    input.value = matches[0];
    caretEnd();
  } else if (matches.length > 1) {
    print(matches.join('   '), 'muted');
  }
}

async function toggleRec() {
  try {
    await audio.ensureAudio();

    if (!recorder.isRecording()) {
      recorder.startRecording(audio.currentTime(), audio.sampleRate());

      if (btnRec) {
        btnRec.textContent = 'Rec *';
        btnRec.classList.add('recording');
      }

      print('grabando. Envia _rec nuevamente para detener y descargar.', 'ok');
    } else {
      recorder.stopRecording(audio.currentTime());

      if (btnRec) {
        btnRec.textContent = 'Rec';
        btnRec.classList.remove('recording');
      }

      print('grabacion detenida. Descargando WAV...', 'ok');

      const blob = recorder.exportWavBlob(audio.currentTime());
      downloadBlob(blob, 'text-cb-sound.wav');
    }
  } catch (err) {
    print(`error de grabacion: ${err.message}`, 'err');
  }
}

scriptText.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    runScript(scriptText.value);
  }
});

input.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const line = input.value;
    input.value = '';
    await submitLine(line);
    return;
  }

  if (e.key === 'Tab') {
    e.preventDefault();
    autocomplete();
    return;
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault();
    historyPrev();
    return;
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    historyNext();
    return;
  }

  if (e.ctrlKey && (e.key === 'p' || e.key === 'P')) {
    e.preventDefault();
    historyPrev();
    return;
  }

  if (e.ctrlKey && (e.key === 'n' || e.key === 'N')) {
    e.preventDefault();
    historyNext();
    return;
  }

  if (e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
    e.preventDefault();
    caretStart();
    return;
  }

  if (e.ctrlKey && (e.key === 'e' || e.key === 'E')) {
    e.preventDefault();
    caretEnd();
    return;
  }

  if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) {
    e.preventDefault();
    killBeforeCursor();
    return;
  }

  if (e.ctrlKey && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    killAfterCursor();
    return;
  }

  if (e.ctrlKey && (e.key === 'w' || e.key === 'W')) {
    e.preventDefault();
    deletePrevWord();
    return;
  }

  if (e.ctrlKey && e.key === 'Backspace') {
    e.preventDefault();
    deletePrevWord();
    return;
  }

  if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) {
    e.preventDefault();
    clearOutput();
    return;
  }

  if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
    e.preventDefault();
    audio.stop();
    print('^C', 'warn');
    return;
  }
});

btnStop.addEventListener('click', () => {
  audio.stop();
  print('stop', 'warn');
});

btnClear.addEventListener('click', () => {
  clearOutput();
  input.focus();
});

btnHelp.addEventListener('click', () => {
  openHelp();
});

btnSettings.addEventListener('click', () => {
  openSettings();
});

btnScript.addEventListener('click', () => {
  openScript();
});

btnRec.addEventListener('click', async () => {
  await toggleRec();
});

helpClose.addEventListener('click', () => {
  helpDialog.close();
});

if (btnTutorial && tutorialDialog) {
  btnTutorial.addEventListener('click', () => {
    tutorialDialog.showModal();
  });
}

if (tutorialClose && tutorialDialog) {
  tutorialClose.addEventListener('click', () => {
    tutorialDialog.close();
  });
}

settingsClose.addEventListener('click', () => {
  settingsDialog.close();
});

scriptClose.addEventListener('click', () => {
  scriptDialog.close();
});

settingsReset.addEventListener('click', () => {
  fillSettingsForm(DEFAULT_SETTINGS);
});

sLateral.addEventListener('input', () => {
  sLateralVal.textContent = sLateral.value;
});

sVolumen.addEventListener('input', () => {
  sVolumenVal.textContent = Number(sVolumen.value).toFixed(2);
});

settingsForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const newSettings = readSettingsForm();

  settings = { ...settings, ...newSettings };
  saveStoredSettings(settings);

  const wordCounter = state.word_counter || 0;

  state = runtimeFromSettings(settings);
  state.word_counter = wordCounter;
  env.state = state;

  print('settings guardadas', 'ok');
  settingsDialog.close();
});

scriptRun.addEventListener('click', async () => {
  await runScript(scriptText.value);
});


if (scriptImport) {
  scriptImport.addEventListener('click', () => {
    fileInput.click();
  });

  scriptImport.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files && fileInput.files[0];

  if (!file) {
    return;
  }

  try {
    scriptText.value = await file.text();
    print(`script importado: ${file.name}`, 'muted');
  } catch (err) {
    print(`error al importar: ${err.message}`, 'err');
  }

  fileInput.value = '';
});

scriptExport.addEventListener('click', () => {
  const blob = new Blob([scriptText.value], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'script.txt';
  a.click();

  URL.revokeObjectURL(url);
});


if (tutorialDialog) {
  tutorialDialog.addEventListener('click', (e) => {
    const btn = e.target.closest('.run-example');

    if (!btn) {
      return;
    }

    const example = btn.closest('.tutorial-example');

    if (!example) {
      return;
    }

    const codeEl = example.querySelector('.example-text');

    if (!codeEl) {
      return;
    }

    const code = codeEl.textContent.trim();

    runScript(code);
  });
}

btnShare.addEventListener('click', async () => {
  const params = new URLSearchParams();

  for (const [k, v] of Object.entries(settings)) {
    params.set(k, String(v));
  }

  const script = scriptText.value.trim();

  if (script) {
    params.set('script', 'b64:' + encodeB64Utf8(script));
  }

  const url = location.pathname + location.search + '#' + params.toString();

  history.replaceState(null, '', url);

  try {
    await navigator.clipboard.writeText(location.href);
    print('URL copiada al portapapeles', 'ok');
  } catch {
    print('URL actualizada en la barra', 'ok');
  }
});

let dragCounter = 0;

window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragCounter++;
  dropOverlay.classList.add('active');
});

window.addEventListener('dragover', (e) => {
  e.preventDefault();
});

window.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragCounter--;

  if (dragCounter <= 0) {
    dragCounter = 0;
    dropOverlay.classList.remove('active');
  }
});

window.addEventListener('drop', async (e) => {
  e.preventDefault();

  dragCounter = 0;
  dropOverlay.classList.remove('active');

  const file = e.dataTransfer.files && e.dataTransfer.files[0];

  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    scriptText.value = text;

    print(`script soltado: ${file.name}`, 'muted');

    await runScript(text);
  } catch (err) {
    print(`error al soltar archivo: ${err.message}`, 'err');
  }
});

document.addEventListener('pointerdown', () => {
  audio.ensureAudio().catch(() => {});
}, { once: true });

document.addEventListener('keydown', () => {
  audio.ensureAudio().catch(() => {});
}, { once: true });

output.addEventListener('click', () => {
  input.focus();
});

print('text-cb-sound web', 'ok');
print('Escribi _help para ayuda.', 'muted');

if (hashData.script) {
  scriptText.value = hashData.script;
  print('Script cargado desde URL.', 'muted');

  if (hashData.autorun) {
    const once = async () => {
      document.removeEventListener('pointerdown', once);
      await runScript(hashData.script);
    };

    document.addEventListener('pointerdown', once);
    print('Autoreun: hace click o toca la pantalla para iniciar.', 'muted');
  }
}

fillSettingsForm(state);
input.focus();
