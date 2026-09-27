import { code128Pattern } from './code128.js';
import { code314Pattern } from './code314.js';

export function codebarPattern(mode, value) {
  if (mode === 'code314') {
    const p = code314Pattern(value);

    if (p) {
      return p;
    }
  }

  return code128Pattern(value);
}
