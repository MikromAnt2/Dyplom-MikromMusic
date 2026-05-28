// coerceText: перетворює значення підписників у рядок для парсингу
function coerceText(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value?.toString === 'function') return value.toString();
  return '';
}

// hasSubscriberMagnitude: чи є в рядку млн/тис/k/m позначення масштабу
function hasSubscriberMagnitude(s) {
  return /[\d,.]+\s*(млн|million|мільйон|тис|тыс|thousand)\b/i.test(s) || /[\d,.]+\s*[km]\b/i.test(s);
}

// isSubscriberCountText: чи схожий рядок на кількість підписників/слухачів
function isSubscriberCountText(raw) {
  const s = coerceText(raw).trim().toLowerCase();
  if (!s) return false;

  if (hasSubscriberMagnitude(s)) return true;

  if (!/subscriber|listener|слухач|підписник|monthly|audience|fan(s)?\b/.test(s)) return false;

  const digits = s.replace(/[^\d]/g, '');
  if (!digits) return false;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n >= 10_000;
}

// parseCountFromString: витягує число слухачів з тексту YouTube/Innertube
function parseCountFromString(raw) {
  const s = coerceText(raw).trim().toLowerCase();
  if (!s) return 0;

  if (typeof raw === 'number' && raw > 0) return Math.round(raw);

  if (/^\d+$/.test(s)) return 0;

  const kmInline = s.match(/([\d,.]+)\s*([km])\b/i);
  if (kmInline) {
    let num = parseFloat(kmInline[1].replace(',', '.'));
    const suffix = kmInline[2].toLowerCase();
    if (suffix === 'k') num *= 1000;
    if (suffix === 'm') num *= 1000000;
    if (Number.isFinite(num) && num > 0) return Math.round(num);
  }

  const m = s.match(/([\d,.]+)\s*(млн|million|мільйон)/i);
  if (m) {
    const num = parseFloat(m[1].replace(',', '.'));
    if (Number.isFinite(num)) return Math.round(num * 1_000_000);
  }

  const k = s.match(/([\d,.]+)\s*(тис|тыс|thousand)/i);
  if (k) {
    const num = parseFloat(k[1].replace(',', '.'));
    if (Number.isFinite(num)) return Math.round(num * 1000);
  }

  if (!isSubscriberCountText(raw)) return 0;

  if (hasSubscriberMagnitude(s)) {
    const digits = s.replace(/[^\d]/g, '');
    if (digits) return parseInt(digits, 10);
  }

  return 0;
}

// formatListenersUk: форматує число слухачів українською («1,49 млн слухачів»)
function formatListenersUk(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return '';

  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    const val =
      m >= 10
        ? String(Math.round(m))
        : m.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
    return `${val} млн слухачів`;
  }
  if (n >= 1000) {
    const k = n / 1000;
    const val =
      k >= 100
        ? String(Math.round(k))
        : k.toFixed(1).replace(/\.0$/, '').replace('.', ',');
    return `${val} тис. слухачів`;
  }
  return `${n.toLocaleString('uk-UA')} слухачів`;
}

// formatSubsLabel: Innertube/YouTube рядки → «1,49 млн слухачів»
function formatSubsLabel(subs) {
  if (typeof subs === 'number' && subs > 0) return formatListenersUk(subs);

  const text = coerceText(subs).trim();
  if (!text || text === '0') return '';

  if (/слухач/i.test(text) && /млн|тис/i.test(text)) return text;

  const count = parseCountFromString(text);
  if (count > 0) return formatListenersUk(count);

  const cleaned = text
    .replace(/subscribers?|listener|audience|monthly|artist/gi, '')
    .replace(/підписників|підписники|фанатів|щомісячних/gi, '')
    .trim();
  if (/слухач/i.test(cleaned) && /млн|тис/i.test(cleaned)) return cleaned;

  return '';
}

module.exports = {
  formatSubsLabel,
  formatListenersUk,
  parseCountFromString,
  isSubscriberCountText,
  hasSubscriberMagnitude
};
