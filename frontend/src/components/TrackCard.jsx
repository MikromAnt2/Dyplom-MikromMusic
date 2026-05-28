import { useNavigate } from 'react-router-dom';
import { usePlayer } from '../context/PlayerContext';
import { useMenu } from '../context/MenuContext';
import { useToast } from '../context/ToastContext';
import { onMediaError } from '../utils/media';
import { normalizeTrack, trackCoverSrc } from '../utils/track';
import { goToArtistPage } from '../utils/artistNav';
import { useLocale } from '../context/LocaleContext';

// TrackCard: картка треку — play, меню, radio-черга
export default function TrackCard({ track, list, onPlay, className = 'card', useRadioQueue = false }) {
    const { playSong } = usePlayer();
    const { openTrackMenu } = useMenu();
    const { showToast } = useToast();
    const { t } = useLocale();
    const navigate = useNavigate();

    const item = normalizeTrack(track);
    if (!item) return null;

    const play = (e) => {
        e?.stopPropagation?.();
        const queue = useRadioQueue
            ? null
            : (list || []).map(normalizeTrack).filter(Boolean);
        if (onPlay) onPlay(item, queue?.length ? queue : useRadioQueue ? null : [item]);
        else playSong(item, queue?.length ? queue : useRadioQueue ? null : [item]);
    };

    const handleContext = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openTrackMenu(e.clientX, e.clientY, item);
    };

    const goArtist = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok = await goToArtistPage(navigate, {
            author: item.author,
            channelId: item.channelId,
            videoId: item.youtubeId
        });
        if (!ok) showToast(t('library.artistNotFound'), 'info');
    };

    return (
        <div
            className={className}
            onClick={play}
            onContextMenu={handleContext}
            style={{ cursor: 'pointer', flexShrink: 0 }}
        >
            <div className="song_cover_container">
                <img
                    src={trackCoverSrc(item, item.title)}
                    alt={item.title}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(ev) => onMediaError(ev, item)}
                />
                <div className="pv_track_play_overlay">▶</div>
            </div>
            <p className="card_title">{item.title}</p>
            <p
                className="card_sub track_card_performer"
                role="link"
                tabIndex={0}
                title={t('library.goToArtist')}
                onClick={goArtist}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') goArtist(e);
                }}
            >
                {item.authorDisplay || item.author}
            </p>
        </div>
    );
}
