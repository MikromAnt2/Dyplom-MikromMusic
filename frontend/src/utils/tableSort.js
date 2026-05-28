// toggleSortConfig: перемикає ключ сортування та напрямок asc/desc
export function toggleSortConfig(prev, key) {
    let direction = 'asc';
    if (prev.key === key && prev.direction === 'asc') direction = 'desc';
    return { key, direction };
}

// renderSortIcon: стрілка напрямку сортування для заголовка колонки
export function renderSortIcon(key, config) {
    if (config.key !== key) return null;
    return config.direction === 'asc' ? ' ↑' : ' ↓';
}

// sortTrackRows: сортує рядки треків за ключем колонки
export function sortTrackRows(data, config, keyMap = {}) {
    if (!config?.key || !Array.isArray(data)) return data;
    const field = keyMap[config.key] || config.key;

    return [...data].sort((a, b) => {
        let aVal;
        let bVal;

        if (field === 'views') {
            aVal = Number(a.views) || 0;
            bVal = Number(b.views) || 0;
        } else if (field === 'duration') {
            aVal = Number(a.duration) || 0;
            bVal = Number(b.duration) || 0;
        } else if (field === 'addedAt' || field === 'playedAt') {
            aVal = new Date(a[field] || 0).getTime();
            bVal = new Date(b[field] || 0).getTime();
        } else if (field === 'index') {
            aVal = Number(a._index) || 0;
            bVal = Number(b._index) || 0;
        } else {
            aVal = String(a[field] || '').toLowerCase();
            bVal = String(b[field] || '').toLowerCase();
        }

        if (aVal < bVal) return config.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return config.direction === 'asc' ? 1 : -1;
        return 0;
    });
}
