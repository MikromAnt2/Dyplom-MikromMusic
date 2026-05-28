import { useNavigate } from 'react-router-dom';
import { useMenu } from '../context/MenuContext';
import { fallbackImg, onMediaError, formatListeners } from '../utils/media';
import { useLocale } from '../context/LocaleContext';

// AlbumCard: картка альбому або релізу — як плейлист на Home
export default function AlbumCard({ album, onPlay }) {
    const navigate = useNavigate();
    const { openAlbumMenu } = useMenu();
    const { t, locale } = useLocale();
    if (!album?.youtubeId) return null;

    const title = (album.title || album.name || '').trim() || t('common.untitled');
    const author = (album.author || album.ownerName || album.artist || '').trim() || t('library.unknownArtist');
    const listenersLabel = formatListeners(album.authorSubs || album.subs || album.listeners, locale);

    const handleClick = () => {
        if (album.type === 'video' && onPlay) onPlay(album);
        else navigate(`/playlist/${album.youtubeId}`);
    };

    const handleContext = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openAlbumMenu(e.clientX, e.clientY, { ...album, title, author });
    };

    return (
        <div
            className="card playlist_card album_card"
            onClick={handleClick}
            onContextMenu={handleContext}
            style={{ flexShrink: 0, cursor: 'pointer' }}
        >
            <div className="playlist_cover_container">
                <img
                    className="playlist_cover_single"
                    src={album.image || fallbackImg(title, 330)}
                    alt={title}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    decoding="async"
                    onError={(e) => onMediaError(e, { ...album, title }, 330)}
                />
            </div>
            <div className="card_title" title={title}>
                {title}
            </div>
            <div className="card_sub card_meta_type" style={{ fontWeight: 500, color: '#aaa' }}>
                {t('library.albumLabel')}
            </div>
            <div className="card_sub">{author}</div>
            {listenersLabel ? (
                <div className="card_sub" style={{ fontWeight: 500, color: '#7a7a7a', fontSize: '11px' }}>
                    {listenersLabel}
                </div>
            ) : null}
        </div>
    );
}
