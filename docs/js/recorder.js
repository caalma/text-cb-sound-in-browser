let recording = false;
let startTime = 0;
let endTime = 0;
let sampleRate = 48000;
let events = [];

export function startRecording(currentTime, rate) {
  recording = true;
  startTime = currentTime;
  endTime = currentTime;
  sampleRate = rate;
  events = [];
}

export function stopRecording(currentTime) {
  if (!recording) {
    return;
  }

  recording = false;
  endTime = Math.max(startTime, currentTime);
}

export function isRecording() {
  return recording;
}

export function truncateAt(currentTime) {
  events = events.filter(ev => ev.time < currentTime);
}

export function addScheduledBuffer(ctxTime, audioBuffer) {
  if (!recording) {
    return;
  }

  events.push({
    time: ctxTime,
    buffer: audioBuffer
  });
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function encodeWav16(interleaved, channels, rate) {
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = interleaved.length * bytesPerSample;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);

  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;

  for (let i = 0; i < interleaved.length; i++) {
    let s = interleaved[i];

    if (s > 1) s = 1;
    if (s < -1) s = -1;

    const v = s < 0 ? s * 0x8000 : s * 0x7FFF;

    view.setInt16(offset, v, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export function exportWavBlob(currentTime) {
  const stopTime = recording
    ? Math.max(startTime, currentTime)
    : endTime;

  const duration = Math.max(0, stopTime - startTime);
  const frames = Math.ceil(duration * sampleRate);

  const data = new Float32Array(frames * 2);

  for (const ev of events) {
    const buffer = ev.buffer;

    const bufferDuration = buffer.length / buffer.sampleRate;
    const evEnd = ev.time + bufferDuration;

    if (evEnd <= startTime || ev.time >= stopTime) {
      continue;
    }

    const srcStart = Math.max(0, startTime - ev.time);
    const dstStart = Math.max(0, ev.time - startTime);

    const copyDuration = Math.min(
      bufferDuration - srcStart,
      stopTime - Math.max(ev.time, startTime)
    );

    const copyFrames = Math.floor(copyDuration * buffer.sampleRate);

    if (copyFrames <= 0) {
      continue;
    }

    const left = buffer.getChannelData(0);
    const right = buffer.numberOfChannels > 1
      ? buffer.getChannelData(1)
      : left;

    const srcOffset = Math.floor(srcStart * buffer.sampleRate);
    const dstOffset = Math.floor(dstStart * sampleRate);

    for (let i = 0; i < copyFrames; i++) {
      const di = dstOffset + i;

      if (di >= frames) {
        break;
      }

      const si = srcOffset + i;

      if (si >= buffer.length) {
        break;
      }

      data[di * 2 + 0] += left[si];
      data[di * 2 + 1] += right[si];
    }
  }

  return encodeWav16(data, 2, sampleRate);
}
