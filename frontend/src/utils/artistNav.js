import { formatArtistDisplay } from './media';

// resolveArtistSearchName: імʼя артиста для пошуку без feat./collab
function resolveArtistSearchName(author, name) {
    const raw = formatArtistDisplay(name || author || '');
    if (!raw) return '';
    const first = raw.split(/\s*[,;&]|\s+feat\.|\s+ft\./i)[0].trim();
    return first || raw;
}

// fetchResolvedArtist: GET /api/channels/resolve — channelId за імʼям або videoId
async function fetchResolvedArtist({ searchName, channelId, videoId }) {
    const params = new URLSearchParams();
    if (searchName) params.set('q', searchName);
    if (channelId) params.set('channelId', channelId);
    if (videoId) params.set('videoId', videoId);
    const res = await fetch(`/api/channels/resolve?${params.toString()}`);
    if (!res.ok) return null;
    return res.json();
}

// goToArtistPage: перехід на сторінку артиста — navigate за channelId або пошук API
export async function goToArtistPage(navigate, { author, channelId, name, image, subs, tab, videoId }) {
    const searchName = resolveArtistSearchName(author, name);
    const rawId = channelId ? String(channelId).trim() : '';
    const ucId = /^UC[\w-]{10,}$/i.test(rawId) ? rawId : null;

    if (!searchName && !ucId && !videoId) return false;

    if (ucId) {
        navigate(`/artist/${ucId}`, {
            state: {
                name: searchName || name || author || undefined,
                image,
                subs: subs || undefined,
                tab
            }
        });
        return true;
    }

    try {
        const resolved = await fetchResolvedArtist({
            searchName,
            channelId: rawId || undefined,
            videoId: videoId || undefined
        });
        if (resolved?.channelId) {
            navigate(`/artist/${resolved.channelId}`, {
                state: {
                    name: resolved.name || searchName,
                    image: resolved.image || image,
                    subs: resolved.subs || subs,
                    tab
                }
            });
            return true;
        }
    } catch {}

    const queries = [...new Set([searchName, resolveArtistSearchName(author)].filter(Boolean))];

    for (const q of queries) {
        try {
            const res = await fetch(`/api/channels?q=${encodeURIComponent(q)}`);
            if (!res.ok) continue;
            const list = await res.json();
            const hit = (list || []).find((a) => a?.channelId);
            if (!hit) continue;
            navigate(`/artist/${hit.channelId}`, {
                state: {
                    name: hit.name || searchName,
                    image: hit.image || image,
                    subs: hit.subs || subs,
                    tab
                }
            });
            return true;
        } catch {}
    }

    return false;
}

// attachSearchArtistNav: додає navArtist* поля для ПКМ з пошуку
export function attachSearchArtistNav(track, primaryArtist) {
    if (!track) return track;
    const author = formatArtistDisplay(track.author) || primaryArtist?.name || '';
    return {
        ...track,
        author,
        navArtistChannelId: primaryArtist?.channelId || track.channelId || '',
        navArtistName: primaryArtist?.name || author,
        navArtistSubs: primaryArtist?.subs || '',
        navArtistImage: primaryArtist?.image || track.image || ''
    };
}
