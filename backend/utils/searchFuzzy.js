const LEET_MAP = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  '$': 's'
};

const TYPO_NEIGHBORS = {
  n: ['m'],
  m: ['n'],
  i: ['l', '1'],
  l: ['i', '1'],
  '1': ['i', 'l'],
  '0': ['o'],
  o: ['0'],
  e: ['i'],
  c: ['k'],
  k: ['c'],
  u: ['v'],
  v: ['u'],
  b: ['v'],
  r: ['e']
};

// stripDiacritics: прибирає діакритики для порівняння рядків
function stripDiacritics(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

// deLeet: замінює leet-символи на літери (0→o, 4→a тощо)
function deLeet(str) {
  return String(str || '')
    .split('')
    .map((ch) => LEET_MAP[ch.toLowerCase()] || ch)
    .join('');
}

// normalizeSearchKey: ключ пошуку — lower, без пробілів і діакритик
function normalizeSearchKey(str) {
  return stripDiacritics(deLeet(String(str || '').trim().toLowerCase())).replace(/\s+/g, '');
}

// levenshtein: відстань редагування між двома рядками
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return row[b.length];
}

// nameSimilarity: схожість імені та запиту (0–1)
function nameSimilarity(name, query) {
  const n = normalizeSearchKey(name);
  const q = normalizeSearchKey(query);
  if (!n || !q) return 0;
  if (n === q) return 1;
  if (n.includes(q) || q.includes(n)) {
    const ratio = Math.min(n.length, q.length) / Math.max(n.length, q.length);
    if (ratio >= 0.85) return 0.95;
  }
  const maxLen = Math.max(n.length, q.length);
  const dist = levenshtein(n, q);
  return Math.max(0, 1 - dist / maxLen);
}

// generateTypoNeighbors: варіанти слова з типовими помилками клавіатури
function generateTypoNeighbors(word) {
  const key = normalizeSearchKey(word);
  const out = new Set();
  if (!key || key.length > 16) return [];

  for (let i = 0; i < key.length; i++) {
    const ch = key[i];
    const swaps = TYPO_NEIGHBORS[ch];
    if (!swaps) continue;
    for (const alt of swaps) {
      out.add(key.slice(0, i) + alt + key.slice(i + 1));
    }
  }
  return [...out];
}

const LAYOUT_CYR_TO_LAT = new Map([
  ['й', 'q'], ['ц', 'w'], ['у', 'e'], ['к', 'r'], ['е', 't'], ['н', 'y'], ['г', 'u'], ['ш', 'i'], ['щ', 'o'], ['з', 'p'],
  ['х', '['], ['ъ', ']'], ['ї', ']'], ['ґ', '`'], ['ё', '`'],
  ['ф', 'a'], ['ы', 's'], ['і', 's'], ['в', 'd'], ['а', 'f'], ['п', 'g'], ['р', 'h'], ['о', 'j'], ['л', 'k'], ['д', 'l'],
  ['ж', ';'], ['э', "'"], ['є', "'"],
  ['я', 'z'], ['ч', 'x'], ['с', 'c'], ['м', 'v'], ['и', 'b'], ['т', 'n'], ['ь', 'm'],
  ['б', ','], ['ю', '.'], ['.', '.']
]);

// hasCyrillic: чи є в рядку кириличні символи
function hasCyrillic(str) {
  return /[\u0400-\u04FF]/.test(String(str || ''));
}

// cyrillicKeyboardToLatin: невірна розкладка (ифнгкш → sayuri)
function cyrillicKeyboardToLatin(str) {
  const input = String(str || '');
  if (!hasCyrillic(input)) return '';

  let out = '';
  for (const ch of input) {
    const lower = ch.toLowerCase();
    const mapped = LAYOUT_CYR_TO_LAT.get(lower);
    if (mapped) {
      out += ch === lower ? mapped : mapped.toUpperCase();
    } else if (/[a-zA-Z0-9\s\-_'".]/.test(ch)) {
      out += ch;
    }
  }
  return out.trim();
}

// expandQueryVariants: варіанти запиту — leet, розкладка, друкарські помилки
function expandQueryVariants(query) {
  const raw = String(query || '').trim().replace(/\s+/g, ' ');
  if (!raw) return [];

  const set = new Set([raw]);
  const lowered = raw.toLowerCase();
  set.add(lowered);
  set.add(deLeet(lowered));

  const layoutLatin = cyrillicKeyboardToLatin(raw);
  if (layoutLatin && layoutLatin.toLowerCase() !== lowered) {
    set.add(layoutLatin);
    set.add(layoutLatin.toLowerCase());
    set.add(deLeet(layoutLatin.toLowerCase()));
  }

  const latinBase = hasCyrillic(raw) ? layoutLatin || raw : raw;
  const typoSource = (latinBase || raw).toLowerCase();

  if (typoSource.length >= 2 && typoSource.length <= 14) {
    for (const neighbor of generateTypoNeighbors(typoSource)) {
      set.add(neighbor);
      set.add(deLeet(neighbor));
    }
  }

  return [...set].filter(Boolean).slice(0, 10);
}

// fuzzyIncludes: чи haystack містить needle (substring або fuzzy)
function fuzzyIncludes(haystack, needle, minSim = 0.72) {
  const h = String(haystack || '').toLowerCase();
  const n = String(needle || '').toLowerCase();
  if (!h || !n) return false;
  if (h.includes(n)) return true;
  return nameSimilarity(h, n) >= minSim;
}

module.exports = {
  normalizeSearchKey,
  nameSimilarity,
  expandQueryVariants,
  fuzzyIncludes,
  deLeet,
  levenshtein,
  cyrillicKeyboardToLatin,
  hasCyrillic
};
