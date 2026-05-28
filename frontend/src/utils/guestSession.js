const STORAGE_KEY = 'pv_guest_listening';
const MAX_ITEMS = 40;

// getGuestListeningIds: ID прослуханих гостем — з localStorage
export function getGuestListeningIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, MAX_ITEMS) : [];
  } catch {
    return [];
  }
}

// pushGuestListening: додає трек у guest-історію — unshift у localStorage
export function pushGuestListening(youtubeId) {
  if (!youtubeId) return;
  const ids = getGuestListeningIds().filter(id => id !== youtubeId);
  ids.unshift(youtubeId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(0, MAX_ITEMS)));
}

// guestSeedsQueryParam: query-параметр seeds — для рекомендацій гостя
export function guestSeedsQueryParam() {
  const ids = getGuestListeningIds();
  if (!ids.length) return '';
  return `&seeds=${encodeURIComponent(ids.join(','))}`;
}

// guestSessionQueryParam: session і seeds у query — для radio API
export function guestSessionQueryParam(queue = []) {
  const ids = queue.map(t => t.youtubeId).filter(Boolean).slice(-15);
  if (!ids.length) return guestSeedsQueryParam();
  return `&session=${encodeURIComponent(ids.join(','))}${guestSeedsQueryParam()}`;
}
