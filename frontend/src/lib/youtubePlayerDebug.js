const DEBUG =
    typeof window !== 'undefined'
    && (
        window.__MIKROM_YT_DEBUG === true
        || new URLSearchParams(window.location.search).has('yt_debug')
    );

// stateLabel: текстовий стан YT.PlayerState для логів
function stateLabel(st) {
    const map = {
        '-1': 'UNSTARTED',
        0: 'ENDED',
        1: 'PLAYING',
        2: 'PAUSED',
        3: 'BUFFERING',
        5: 'CUED'
    };
    return map[String(st)] ?? `STATE_${st}`;
}

// ytLog: діагностичний лог YouTube — лише з ?yt_debug=1
export function ytLog(message, data) {
    if (!DEBUG) return;
    const ts = new Date().toISOString().slice(11, 23);
    if (data !== undefined) {
        console.log(`%c[Mikrom YT ${ts}]%c ${message}`, 'color:#a855f7;font-weight:600', 'color:inherit', data);
    } else {
        console.log(`%c[Mikrom YT ${ts}]%c ${message}`, 'color:#a855f7;font-weight:600', 'color:inherit');
    }
}

// isYtDebugEnabled: чи увімкнено режим діагностики YT
export function isYtDebugEnabled() {
    return DEBUG;
}

export { stateLabel };
