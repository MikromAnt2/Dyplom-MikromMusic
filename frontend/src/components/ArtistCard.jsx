import { useNavigate } from 'react-router-dom';
import { useMenu } from '../context/MenuContext';
import { formatListeners, fallbackImg, onMediaError } from '../utils/media';
import { useLocale } from '../context/LocaleContext';

// ArtistCard: картка виконавця — перехід на /artist
export default function ArtistCard({ artist, size = 130, className = '' }) {
    const navigate = useNavigate();
    const { openArtistMenu } = useMenu();
    const { locale } = useLocale();
    if (!artist?.channelId) return null;

    const sizeClass = size >= 130 ? '' : size >= 100 ? 'artist_card--md' : 'artist_card--sm';

    const goArtist = () =>
        navigate(`/artist/${artist.channelId}`, {
            state: {
                subs: artist.listenerCount ?? artist.subs,
                name: artist.name,
                image: artist.image
            }
        });

    const handleContext = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openArtistMenu(e.clientX, e.clientY, artist);
    };

    const subsSource =
        artist.listenerCount ?? artist.subs ?? artist.monthlyListeners ?? '';
    const subsLabel = formatListeners(subsSource, locale) || '';

    return (
        <div
            className={`channel artist_card ${sizeClass} ${className}`.trim()}
            style={{ '--card-size': `${size}px` }}
            onClick={goArtist}
            onContextMenu={handleContext}
        >
            <img
                src={artist.image || fallbackImg(artist.name, size)}
                alt={artist.name || 'artist'}
                referrerPolicy="no-referrer"
                loading="lazy"
                decoding="async"
                onError={(e) => onMediaError(e, { ...artist, title: artist.name }, size)}
            />
            <div className="channel_name">{artist.name}</div>
            {subsLabel ? <div className="channel_subs">{subsLabel}</div> : null}
        </div>
    );
}
