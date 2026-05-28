const CONTINUE_LOAD_KEY = 'mikrom-continue-load';
const CONTINUE_SUPPRESS_KEY = 'mikrom-continue-suppress';

// getPageLoadId: унікальний id перезавантаження вкладки
export function getPageLoadId() {
    if (typeof window === 'undefined') return 'ssr';
    return window.__MIKROM_PAGE_LOAD || 'default';
}

// wasContinueOfferedThisLoad: чи вже показували «Продовжити слухати»
export function wasContinueOfferedThisLoad() {
    try {
        return sessionStorage.getItem(CONTINUE_LOAD_KEY) === getPageLoadId();
    } catch (_) {
        return false;
    }
}

// markContinueOfferedThisLoad: позначає банер як показаний у цій вкладці
export function markContinueOfferedThisLoad() {
    try {
        sessionStorage.setItem(CONTINUE_LOAD_KEY, getPageLoadId());
    } catch (_) {}
}

// suppressContinueForThisLoad: приховує банер до наступного reload
export function suppressContinueForThisLoad() {
    try {
        sessionStorage.setItem(CONTINUE_SUPPRESS_KEY, getPageLoadId());
    } catch (_) {}
}

// isContinueSuppressedThisLoad: чи придушено банер у поточній вкладці
export function isContinueSuppressedThisLoad() {
    try {
        return sessionStorage.getItem(CONTINUE_SUPPRESS_KEY) === getPageLoadId();
    } catch (_) {
        return false;
    }
}
