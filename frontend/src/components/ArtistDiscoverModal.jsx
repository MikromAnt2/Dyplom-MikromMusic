import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import ArtistCard from './ArtistCard';
import searchIcon from '../assets/images/Search.png';
import { useToast } from '../context/ToastContext';
import { useLocale } from '../context/LocaleContext';

// ArtistDiscoverModal: підбір виконавців за смаками користувача
export default function ArtistDiscoverModal({ open, onClose, subscribedArtists, onArtistAdded }) {
    const { showToast } = useToast();
    const { t } = useLocale();
    const [loading, setLoading] = useState(false);
    const [recommendations, setRecommendations] = useState([]);
    const [query, setQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);

    const subscribedIds = useMemo(
        () => new Set((subscribedArtists || []).map((a) => a.channelId)),
        [subscribedArtists]
    );

    useEffect(() => {
        if (!open) return;
        setQuery('');
        setSearchResults([]);
        setLoading(true);
        fetch('/api/recommendations/home-artists', { credentials: 'include' })
            .then((r) => (r.ok ? r.json() : { artistsYouMayLike: [] }))
            .then((data) => setRecommendations(data.artistsYouMayLike || []))
            .catch(() => setRecommendations([]))
            .finally(() => setLoading(false));
    }, [open]);

    useEffect(() => {
        if (!open || !query.trim()) {
            setSearchResults([]);
            return;
        }
        const timer = setTimeout(() => {
            setSearching(true);
            fetch(`/api/channels?q=${encodeURIComponent(query.trim())}`)
                .then((r) => (r.ok ? r.json() : []))
                .then((data) => setSearchResults(Array.isArray(data) ? data : []))
                .catch(() => setSearchResults([]))
                .finally(() => setSearching(false));
        }, 350);
        return () => clearTimeout(timer);
    }, [open, query]);

    const displayList = useMemo(() => {
        if (query.trim()) {
            return searchResults.filter((a) => a?.channelId && !subscribedIds.has(a.channelId));
        }
        return recommendations.filter((a) => a?.channelId && !subscribedIds.has(a.channelId));
    }, [query, searchResults, recommendations, subscribedIds]);

    const handleAdd = async (artist) => {
        if (!artist?.channelId || subscribedIds.has(artist.channelId)) return;
        try {
            const res = await fetch('/api/subscribe', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ artist })
            });
            const data = await res.json();
            if (data.subscribedArtists) {
                onArtistAdded?.(data.subscribedArtists);
                showToast(t('library.artistAdded', { name: artist.name }), 'success');
            } else {
                const subRes = await fetch('/api/subscriptions', { credentials: 'include' });
                if (subRes.ok) {
                    const list = await subRes.json();
                    if (Array.isArray(list)) onArtistAdded?.(list);
                }
            }
        } catch {
            showToast(t('library.subscribeFail'), 'error');
        }
    };

    if (!open) return null;

    const modal = (
        <div className="artist_discover_overlay" onClick={onClose}>
            <div className="artist_discover_panel" onClick={(e) => e.stopPropagation()}>
                <div className="artist_discover_head">
                    <div>
                        <h2>{t('library.findArtist')}</h2>
                        <p className="artist_discover_sub">
                            {t('library.discoverSubtitle')}
                        </p>
                    </div>
                    <button type="button" className="artist_discover_close" onClick={onClose} aria-label={t('help.close')}>
                        ×
                    </button>
                </div>

                <div className="artist_discover_search">
                    <img src={searchIcon} alt="" className="artist_discover_search_icon" />
                    <input
                        type="search"
                        placeholder={t('library.searchArtists')}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                </div>

                {loading || searching ? (
                    <p className="artist_discover_hint">{t('common.loading')}</p>
                ) : displayList.length === 0 ? (
                    <p className="artist_discover_hint">
                        {query.trim()
                            ? t('library.discoverNoResults')
                            : t('library.discoverNoRecs')}
                    </p>
                ) : (
                    <div className="artist_discover_grid">
                        {displayList.map((artist) => (
                            <div key={artist.channelId} className="artist_discover_cell">
                                <ArtistCard artist={artist} size={130} />
                                <button
                                    type="button"
                                    className="artist_discover_add"
                                    onClick={() => handleAdd(artist)}
                                >
                                    {t('library.discoverAdd')}
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <button type="button" className="btn_shuffle_music artist_discover_done" onClick={onClose}>
                    {t('library.discoverDone')}
                </button>
            </div>
        </div>
    );

    return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal;
}
