import * as recorder from './recorder.js';

export function currentTime() {
  return ctx ? ctx.currentTime : 0;
}

let ctx = null;
let nextTime = 0;
let stopped = false;

const activeSources = new Set();

function getAudioContextClass() {
  return window.AudioContext || window.webkitAudioContext;
}

export async function ensureAudio() {
  const AC = getAudioContextClass();

  if (!AC) {
    throw new Error('Web Audio no disponible');
  }

  if (!ctx) {
    ctx = new AC({ latencyHint: 'interactive' });
    nextTime = ctx.currentTime + 0.05;
  }

  if (ctx.state === 'suspended') {
    await ctx.resume();
  }

  nextTime = Math.max(nextTime, ctx.currentTime + 0.02);

  return ctx;
}

export function sampleRate() {
  return ctx ? ctx.sampleRate : 48000;
}

export function resetStop() {
  stopped = false;
}

export function isStopped() {
  return stopped;
}

export function stop() {
  stopped = true;

  if (!ctx) {
    return;
  }

  for (const src of activeSources) {
    try {
      src.stop();
    } catch {
      // already stopped
    }
  }

  activeSources.clear();

  if (ctx) {
    recorder.truncateAt(ctx.currentTime);
  }

  nextTime = ctx.currentTime + 0.05;
}

export function scheduleBuffer(buffer) {
  if (!ctx) {
    return;
  }

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);

  const t = Math.max(ctx.currentTime + 0.01, nextTime);
    src.start(t);

    recorder.addScheduledBuffer(t, buffer);

  activeSources.add(src);

  src.onended = () => {
      activeSources.delete(src);
  };

  nextTime = t + buffer.duration;
}

export function scheduleSilence(seconds) {
  if (!ctx || seconds <= 0) {
    return;
  }

  nextTime = Math.max(nextTime, ctx.currentTime + 0.01) + seconds;
}

export async function playFloat32Stereo(interleaved, frames) {
  if (frames <= 0) {
    return;
  }

  await ensureAudio();

  const buffer = ctx.createBuffer(2, frames, ctx.sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  for (let i = 0; i < frames; i++) {
    left[i] = interleaved[i * 2 + 0];
    right[i] = interleaved[i * 2 + 1];
  }

  scheduleBuffer(buffer);
}

export async function waitAhead(maxAhead = 0.7) {
  while (ctx && !stopped && (nextTime - ctx.currentTime) > maxAhead) {
    await new Promise(resolve => setTimeout(resolve, 80));
  }
}
