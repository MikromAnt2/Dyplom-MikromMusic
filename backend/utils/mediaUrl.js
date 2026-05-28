// normalizeMediaUrl: нормалізує URL медіа YouTube / Google
function normalizeMediaUrl(url) {
    if (!url || typeof url !== 'string') return '';
    let u = url.trim();
    const md = u.match(/\[.*?\]\((https?:\/\/[^)]+)\)/);
    if (md) u = md[1];
    if (u.startsWith('//')) u = `https:${u}`;
    if (u.startsWith('http://') || u.startsWith('https://')) return u;
    return '';
}

// upgradeGoogleThumb: підвищує якість превʼю Google/ytimg
function upgradeGoogleThumb(url, size = 'w500-h500') {
    const normalized = normalizeMediaUrl(url);
    if (!normalized) return '';
    if (normalized.includes('ytimg.com/vi/')) {
        return normalized.replace(/\/(mqdefault|sddefault|default|hqdefault)\.jpg/i, '/hqdefault.jpg');
    }
    if ((normalized.includes('googleusercontent.com') || normalized.includes('ggpht.com')) && normalized.includes('=')) {
        return `${normalized.split('=')[0]}=${size}`;
    }
    return normalized;
}

module.exports = { normalizeMediaUrl, upgradeGoogleThumb };
