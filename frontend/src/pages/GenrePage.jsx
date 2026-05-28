import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ArtistCard from '../components/ArtistCard';
import AlbumCard from '../components/AlbumCard';
import TrackCard from '../components/TrackCard';
import ScrollableSection from '../components/ScrollableSection';
import EmptyState from '../components/EmptyState';
import BackButton from '../components/BackButton';
import { usePlayer } from '../context/PlayerContext';
import { useToast } from '../context/ToastContext';
import { useLocale } from '../context/LocaleContext';
import { getLocalizedGenre } from '../i18n/genreMeta';

// GenrePage: сторінка жанру — треки, артисти, альбоми з API
export default function GenrePage() {
    const { slug } = useParams();
    const navigate = useNavigate();
    const { playSong } = usePlayer();
    const { showToast } = useToast();
    const { t } = useLocale();
    const [genreData, setGenreData] = useState({ meta: null, topTracks: [], topArtists: [], albums: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);

    const fallbackMeta = { title: t('genre.fallbackTitle'), emoji: '🎵', gradient: 'linear-gradient(135deg,#2a2a4a,#12121f)' };

    useEffect(() => {
        const controller = new AbortController();
        setIsLoading(true);
        setLoadError(null);
        window.dispatchEvent(
            new CustomEvent('start-global-loader', {
                detail: { phrases: [t('genre.loading'), t('genre.picking'), t('genre.almostReady')] }
            })
        );

        fetch(`/api/genre/${slug}`, { signal: controller.signal })
            .then((r) => {
                if (!r.ok) throw new Error('API error');
                return r.json();
            })
            .then((data) => {
                setGenreData({
                    meta: data.meta || null,
                    topTracks: Array.isArray(data.topTracks) ? data.topTracks : [],
                    topArtists: Array.isArray(data.topArtists) ? data.topArtists : [],
                    albums: Array.isArray(data.albums) ? data.albums : []
                });
            })
            .catch((err) => {
                if (err.name !== 'AbortError') {
                    setLoadError(t('genre.loadFailed'));
                    showToast(t('genre.loadFailed'), 'error');
                }
            })
            .finally(() => {
                setIsLoading(false);
                window.dispatchEvent(new Event('stop-global-loader'));
            });

        return () => {
            controller.abort();
            window.dispatchEvent(new Event('stop-global-loader'));
        };
    }, [slug, t, showToast]);

    const localizedGenre = getLocalizedGenre(slug, t);
    const meta = localizedGenre
        ? { ...fallbackMeta, ...genreData.meta, emoji: localizedGenre.emoji, title: localizedGenre.title }
        : genreData.meta || fallbackMeta;

    if (isLoading) return null;

    return (
        <div className="genre_page" style={{ padding: '0 0 48px', color: '#fff' }}>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    flexWrap: 'wrap',
                    marginBottom: '28px'
                }}
            >
                <BackButton />

                <p
                    className="genre_page_label"
                    style={{
                        margin: 0,
                        fontSize: '17px',
                        fontWeight: 600,
                        color: '#d4d4d4',
                        letterSpacing: '0.02em',
                        lineHeight: 1.3
                    }}
                >
                    {meta.emoji ? `${meta.emoji} ` : ''}
                    {meta.title || slug}
                </p>
            </div>

            {loadError ? (
                <EmptyState message={loadError} actionLabel={t('genre.backHome')} onAction={() => navigate('/')} />
            ) : (
                <>
                    <ScrollableSection title={t('genre.topTracks')}>
                        {genreData.topTracks.length > 0 ? (
                            genreData.topTracks.map((song, i) => (
                                <TrackCard
                                    key={`gt-${song.youtubeId}-${i}`}
                                    track={song}
                                    list={genreData.topTracks}
                                />
                            ))
                        ) : (
                            <EmptyState message={t('genre.emptyTracks')} />
                        )}
                    </ScrollableSection>

                    <ScrollableSection title={t('genre.popularArtists')}>
                        {genreData.topArtists.length > 0 ? (
                            genreData.topArtists.map((a, i) => (
                                <ArtistCard key={`ga-${a.channelId}-${i}`} artist={a} size={130} />
                            ))
                        ) : (
                            <EmptyState message={t('genre.emptyArtists')} />
                        )}
                    </ScrollableSection>

                    <ScrollableSection title={t('genre.albums')}>
                        {genreData.albums.length > 0 ? (
                            genreData.albums.map((a, i) => (
                                <AlbumCard key={`gal-${a.youtubeId}-${i}`} album={a} />
                            ))
                        ) : (
                            <EmptyState message={t('genre.emptyAlbums')} />
                        )}
                    </ScrollableSection>
                </>
            )}
        </div>
    );
}
