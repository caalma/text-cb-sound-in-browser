const piDigits =
  '14159265358979323846264338327950288419716939937510' +
  '58209749445923078164062862089986280348253421170679';

export function code314Pattern(value) {
  if (value < 0 || piDigits.length === 0) {
    return null;
  }

  let len = 6 + (value % 3) * 2;

  if (len < 2) {
    len = 2;
  }

  if (len % 2 !== 0) {
    len--;
  }

  const offset = ((value * 7) + Math.floor(value / 3)) % piDigits.length;

  let out = '';

  for (let i = 0; i < len; i++) {
    let c = piDigits[(offset + i) % piDigits.length];

    if (c === '0') {
      c = '1';
    }

    /*
      Si querés ritmos más cortos, reemplazá la línea anterior
      por un mapeo 1-4:

      const d = c === '0' ? 1 : (c.charCodeAt(0) - 48);
      c = String(1 + ((d - 1) % 4));
    */

    out += c;
  }

  return out;
}
