// decodeHtmlEntities: декодує HTML-сутності в назвах з YouTube
export function decodeHtmlEntities(str) {
    if (!str || typeof str !== 'string') return str || '';
    return str
        .replace(/&quot;/g, '"')
        .replace(/&#0*39;/gi, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'");
}

// formatArtistDisplay: прибирає суфікс « - Topic» — для YT Music автоканалів
export function formatArtistDisplay(name) {
    const raw = String(name || '').trim();
    if (!raw) return '';
    if (/\s-\s*Topic\s*$/i.test(raw)) {
        return raw.replace(/\s*-\s*Topic\s*$/i, '').replace(/\s+topic\s*$/i, '').trim() || raw;
    }
    return raw;
}

// formatListeners: форматує кількість слухачів (uk | en)
export function formatListeners(value, locale = 'uk') {
    if (value == null || value === '') return '';

    const isEn = locale === 'en';
    const numLocale = isEn ? 'en-US' : 'uk-UA';

    const listenersWord = (count) => {
        const c = Math.abs(Math.floor(Number(count) || 0));
        if (isEn) return c === 1 ? 'listener' : 'listeners';
        const mod10 = c % 10;
        const mod100 = c % 100;
        if (mod10 === 1 && mod100 !== 11) return 'слухач';
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'слухачі';
        return 'слухачів';
    };

    const label = (displayVal, unit, rawCount) => {
        const word = listenersWord(rawCount);
        if (unit === 'M') {
            return isEn ? `${displayVal}M ${word}` : `${displayVal} млн слухачів`;
        }
        if (unit === 'K') {
            return isEn ? `${displayVal}K ${word}` : `${displayVal} тис. слухачів`;
        }
        return `${Number(displayVal).toLocaleString(numLocale)} ${word}`;
    };

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return '';

        if (/^\d+[,.]?\d*\s*(млн|тис\.?)\s*слухач/i.test(trimmed)) {
            const m = trimmed.match(/^([\d,.]+)\s*(млн|тис\.?)/i);
            if (m) {
                const num = m[1].replace(',', '.');
                const raw = parseFloat(m[1].replace(',', '.'));
                return m[2].toLowerCase().startsWith('млн')
                    ? label(num, 'M', raw)
                    : label(num, 'K', raw);
            }
        }

        if (/^\d+[,.]?\d*\s*(mln|million|k|thousand)\s*listener/i.test(trimmed)) {
            const m = trimmed.match(/^([\d,.]+)\s*(mln|million|k|thousand)/i);
            if (m) {
                const num = m[1].replace(',', '.');
                const u = m[2].toLowerCase();
                const raw = parseFloat(m[1].replace(',', '.'));
                if (u.startsWith('m')) return label(num, 'M', raw);
                return label(num, 'K', raw);
            }
        }

        const km = trimmed.match(/^([\d,.]+)\s*([KkMm])\b/);
        if (km) {
            let num = parseFloat(km[1].replace(',', '.'));
            const suffix = km[2].toUpperCase();
            if (suffix === 'K') num *= 1000;
            if (suffix === 'M') num *= 1_000_000;
            if (num > 0) return formatListeners(num, locale);
        }

        if (/subscriber|listener|слухач|підписник|monthly/i.test(trimmed)) {
            const digits = trimmed.replace(/[^\d]/g, '');
            if (digits) return formatListeners(parseInt(digits, 10), locale);
        }
    }

    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return '';

    if (n >= 1_000_000) {
        const m = n / 1_000_000;
        const val =
            m >= 10
                ? String(Math.round(m))
                : m.toFixed(2).replace(/\.?0+$/, '').replace('.', isEn ? '.' : ',');
        return label(val, 'M', n);
    }
    if (n >= 1000) {
        const k = n / 1000;
        const val =
            k >= 100
                ? String(Math.round(k))
                : k.toFixed(1).replace(/\.0$/, '').replace('.', isEn ? '.' : ',');
        return label(val, 'K', n);
    }
    return label(n, '', n);
}

// fallbackImg: placeholder-зображення — ui-avatars за назвою
export function fallbackImg(title, size = 300, bg = '282828') {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(title || 'Music')}&background=${bg}&color=fff&size=${size}`;
}

// onMediaError: fallback при помилці img — imageFallback, ytimg, ui-avatars
export function onMediaError(e, item, size = 300) {
    const el = e.target;
    const id = item?.youtubeId || item?.videoId;
    if (id) {
        const chain = [
            item?.imageFallback,
            `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
            `https://i.ytimg.com/vi/${id}/sddefault.jpg`,
            `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            `https://i.ytimg.com/vi/${id}/mqdefault.jpg`
        ].filter(Boolean);
        let step = Number(el.dataset.step || 0) + 1;
        if (step < chain.length) {
            el.dataset.step = String(step);
            el.src = chain[step];
            return;
        }
    }
    el.onerror = null;
    el.src = fallbackImg(item?.title || item?.name, size);
}
