import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePlayer } from '../context/PlayerContext';
import { useToast } from '../context/ToastContext';
import { normalizeTrack } from '../utils/track';
import { isValidYoutubeId } from '../utils/shareLinks';
import { useLocale } from '../context/LocaleContext';

// DeepLinkHandler: ?track=youtubeId — відтворення треку з посилання
export default function DeepLinkHandler() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { playSong, isPlayerReady } = usePlayer();
    const { showToast } = useToast();
    const { t } = useLocale();
    const handledRef = useRef('');

    useEffect(() => {
        const trackId = (searchParams.get('track') || '').trim();
        if (!isValidYoutubeId(trackId)) return undefined;
        if (handledRef.current === trackId) return undefined;

        const clearTrackParam = () => {
            const next = new URLSearchParams(searchParams);
            next.delete('track');
            setSearchParams(next, { replace: true });
        };

        const run = async () => {
            handledRef.current = trackId;
            try {
                const res = await fetch(`/api/share/track/${encodeURIComponent(trackId)}`);
                if (!res.ok) throw new Error('not found');
                const data = await res.json();
                const track = normalizeTrack(data.track);
                if (!track?.youtubeId) throw new Error('invalid');
                playSong(track);
            } catch (_) {
                showToast(t('library.trackLinkNotFound'), 'error');
            } finally {
                clearTrackParam();
            }
        };

        if (isPlayerReady) {
            void run();
            return undefined;
        }

        const onReady = () => {
            void run();
        };
        window.addEventListener('mikrom-yt-player-ready', onReady, { once: true });
        return () => window.removeEventListener('mikrom-yt-player-ready', onReady);
    }, [searchParams, setSearchParams, isPlayerReady, playSong, showToast]);

    return null;
}
