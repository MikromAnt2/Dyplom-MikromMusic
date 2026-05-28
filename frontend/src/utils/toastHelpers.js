// shortTitle: скорочує довгу назву — для toast-повідомлень
export function shortTitle(title, max = 42) {
    const t = (title || '').trim();
    if (t.length <= max) return t;
    return `${t.slice(0, max - 1)}…`;
}

// trackCountLabel: підпис кількості треків — з урахуванням мови
export function trackCountLabel(n, t) {
    const num = Number(n) || 0;
    if (typeof t === 'function') {
        const mod10 = num % 10;
        const mod100 = num % 100;
        if (mod10 === 1 && mod100 !== 11) return t('common.trackOne', { n: num });
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
            return t('common.trackFew', { n: num });
        }
        return t('common.trackMany', { n: num });
    }
    const mod10 = num % 10;
    const mod100 = num % 100;
    if (mod10 === 1 && mod100 !== 11) return `${num} трек`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${num} треки`;
    return `${num} треків`;
}
