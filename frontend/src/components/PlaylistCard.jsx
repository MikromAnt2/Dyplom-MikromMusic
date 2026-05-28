import { useNavigate } from 'react-router-dom';
import { useMenu } from '../context/MenuContext';
import { trackCoverSrc } from '../utils/track';
import { formatListeners } from '../utils/media';
import { useLocale } from '../context/LocaleContext';

// PlaylistCard: картка плейлиста — перехід на /playlist
export default function PlaylistCard({ playlist }) {
    const navigate = useNavigate();
    const { openPlaylistMenu } = useMenu();
    const { t, locale } = useLocale();

    const fallback = (name, size = 300) =>
        `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'Playlist')}&background=181818&color=fff&size=${size}`;

    const resolveTracks = () =>
        (playlist.tracks || []).filter((t) => t && (t.youtubeId || t.videoId));

    const listenersLabel = formatListeners(
        playlist.ownerSubs || playlist.subs || playlist.listeners,
        locale
    );

    const coverForTrack = (track) => {
        if (!track) return fallback(playlist.name || playlist.title, 300);
        if (track.image) return track.image;
        const id = track.youtubeId || track.videoId;
        if (id) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
        return trackCoverSrc(
            {
                ...track,
                author: track.author || 'YouTube',
                title: track.title || 'Track'
            },
            playlist.name || playlist.title,
            300
        );
    };

    const isValidCoverUrl = (url) =>
        url &&
        typeof url === 'string' &&
        !url.includes('default_playlist') &&
        !url.includes('placeholder.com');

    const renderCover = () => {
        const tracks = resolveTracks();
        const label = playlist.name || playlist.title || 'Playlist';
        const coverFallback =
            isValidCoverUrl(playlist.coverImage) ? playlist.coverImage : null;

        if (tracks.length >= 4) {
            const cells = tracks.slice(0, 4);
            return (
                <div className="playlist_cover_container">
                    <div className="playlist_cover_grid" aria-hidden="true">
                        {cells.map((track, idx) => (
                            <img
                                key={`${track.youtubeId || track.videoId || 't'}-${idx}`}
                                src={coverForTrack(track)}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                    e.target.onerror = null;
                                    e.target.src = coverFallback || fallback(label, 300);
                                }}
                            />
                        ))}
                    </div>
                </div>
            );
        }

        const singleSrc =
            (tracks.length > 0 ? coverForTrack(tracks[0]) : null) ||
            coverFallback ||
            fallback(label, 300);

        return (
            <div className="playlist_cover_container">
                <img
                    src={singleSrc}
                    className="playlist_cover_single"
                    alt="cover"
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = fallback(label, 300);
                    }}
                />
            </div>
        );
    };

    const open = () => navigate(`/playlist/${playlist.id || playlist.youtubeId}`);

    const handleContext = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openPlaylistMenu(e.clientX, e.clientY, playlist);
    };

    return (
        <div
            className="card playlist_card"
            onClick={open}
            onContextMenu={handleContext}
            style={{ cursor: 'pointer', flexShrink: 0 }}
        >
            {renderCover()}
            <div className="card_title">{playlist.name || playlist.title || t('library.playlistDefault')}</div>
            <div className="card_sub card_meta_type" style={{ fontWeight: 500, color: '#aaa' }}>
                {playlist.isPublic ? t('library.publicPlaylist') : t('library.privatePlaylist')}
            </div>
            <div className="card_sub">{playlist.ownerName}</div>
            {listenersLabel ? (
                <div className="card_sub" style={{ fontWeight: 500, color: '#7a7a7a', fontSize: '11px' }}>
                    {listenersLabel}
                </div>
            ) : null}
        </div>
    );
}
