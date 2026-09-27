import * as synth from './synth.js';

async function handleCommand(cmd, env) {
  cmd = cmd.trim();

  if (cmd === '_stop') {
    env.audio.stop();
    env.print('stop', 'ok');
    env.stopRequested = true;
    return;
  }

  if (cmd === '_rec') {
    await env.toggleRec();
    return;
  }

  if (cmd === '_state') {
    for (const line of env.stateLines()) {
      env.print(line);
    }
    return;
  }

  if (cmd === '_reset') {
    env.resetState();
    env.print('ok reset', 'ok');
    return;
  }

  if (cmd === '_reload') {
    env.reloadSettings();
    env.print('ok reload', 'ok');
    return;
  }

  if (cmd === '_help') {
    env.openHelp();
    env.print('ayuda abierta', 'muted');
    return;
  }

  env.print(`comando desconocido: ${cmd}`, 'err');
}

export async function processLine(line, env) {
  if (!line) {
    return;
  }

  const tokens = line.split(/\s+/).filter(t => t.length > 0);

  for (const token of tokens) {
    if (env.stopRequested || env.audio.isStopped()) {
      break;
    }

    if (token === ';;') {
      break;
    }

    if (token.startsWith(';;')) {
      continue;
    }

    if (token.startsWith('_')) {
      await handleCommand(token, env);
    } else {
      await synth.processWord(token, env.state, env.audio);
    }
  }
}
