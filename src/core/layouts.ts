// With extended keys on, terminals report Ctrl+letter as the character the active layout types, not the key pressed.
// Rows of the QWERTY letter keys and what the Russian and Ukrainian layouts put on the same keys.
const ROWS: [latin: string, ...layouts: string[]][] = [
  ["qwertyuiop", "йцукенгшщз"],
  ["asdfghjkl", "фывапролд", "фівапролд"],
  ["zxcvbnm", "ячсмить"],
];

const TO_LATIN = new Map<string, string>();
for (const [latin, ...layouts] of ROWS) {
  for (const layout of layouts) [...layout].forEach((char, i) => TO_LATIN.set(char, latin[i]!));
}

/** The QWERTY letter on the key that typed `char`, or `char` itself when no known layout puts it on a letter key. */
export const latinKey = (char: string) => TO_LATIN.get(char) ?? char;

/** Every non-Latin character the known layouts put on the key of the Latin `letter`. */
export const layoutVariants = (letter: string) =>
  [...TO_LATIN].filter(([, latin]) => latin === letter).map(([char]) => char);
