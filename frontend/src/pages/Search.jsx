import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import { formatListeners, formatArtistDisplay } from '../utils/media';
import { goToArtistPage, attachSearchArtistNav } from '../utils/artistNav';
import { usePlayer } from '../context/PlayerContext';
import { useMenu } from '../context/MenuContext';
import { usePlaylist } from '../context/PlaylistContext';
import ArtistCard from '../components/ArtistCard';
import PlaylistCard from '../components/PlaylistCard';
import EmptyState from '../components/EmptyState';
import CardRowSkeleton from '../components/CardRowSkeleton';
import { useLocale } from '../context/LocaleContext';
import { renderSortIcon, toggleSortConfig, sortTrackRows } from '../utils/tableSort';

// Search: пошук треків, артистів, альбомів і плейлистів
export default function Search() {
    const { showToast } = useToast();
    const [searchParams] = useSearchParams();
    const query = searchParams.get('q') || '';
    const navigate = useNavigate();

    const { playSong, currentSong, toggleLike, isLiked, playTracksNextInQueue, addTracksToQueueEnd } = usePlayer();
    const { openMenu } = useMenu();
    const { openPopup } = usePlaylist();
    const { t, locale } = useLocale();

    const [channels, setChannels] = useState([]);
    const [bestArtist, setBestArtist] = useState(null);
    const [popularTracks, setPopularTracks] = useState([]);
    const [tracks, setTracks] = useState([]);
    const [playlists, setPlaylists] = useState([]);
    const [sitePlaylists, setSitePlaylists] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [suggestedQuery, setSuggestedQuery] = useState(null);

    const [nextPageToken, setNextPageToken] = useState(null);
    const [isFetchingMore, setIsFetchingMore] = useState(false);

    const [viewMode, setViewMode] = useState('all');

    const [selectedTracks, setSelectedTracks] = useState([]);
    const [isBulkMenuOpen, setIsBulkMenuOpen] = useState(false);
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

    // formatTime: секунди у m:ss для таблиці треків
    const formatTime = (seconds) => {
        if (!seconds) return "--:--";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    useEffect(() => {
        if (!query) return;

        const fetchResults = async () => {
            setIsLoading(true);
            setSelectedTracks([]);
            setSuggestedQuery(null);
            try {
                const res = await fetch(`/api/search/page?q=${encodeURIComponent(query)}`);
                const data = await res.json();

                const artists = data.artists || [];
                setChannels(artists);
                setBestArtist(data.bestArtist || artists[0] || null);
                setPopularTracks(data.popularTracks || []);
                setTracks(data.tracks || []);
                setPlaylists(data.albums || []);
                setSitePlaylists(data.sitePlaylists || []);
                setNextPageToken(data.nextPageToken || null);
                setSuggestedQuery(data.suggestedQuery || null);
                setViewMode('all');
                setSortConfig({ key: null, direction: 'asc' });
            } catch (e) {
                console.error('Помилка завантаження пошуку:', e);
                showToast(t('search.error'), 'error');
            } finally {
                setIsLoading(false);
            }
        };

        fetchResults();
    }, [query]);

    // loadMoreTracks: infinite scroll треків пошуку
    const loadMoreTracks = async () => {
        if (isFetchingMore || !nextPageToken) return;
        setIsFetchingMore(true);
        try {
            const res = await fetch(`/api/search/infiniteTracks?q=${encodeURIComponent(query)}&pageToken=${nextPageToken}`);
            const data = await res.json();

            setTracks(prev => {
                const existingIds = new Set(prev.map(t => t.youtubeId));
                const newUniqueTracks = (data.items || []).filter(t => !existingIds.has(t.youtubeId));
                return [...prev, ...newUniqueTracks];
            });
            setNextPageToken(data.nextPageToken || null);
        } catch (e) { console.error(e); } finally { setIsFetchingMore(false); }
    };

    useEffect(() => {
        const handleScroll = () => {
            if (window.innerHeight + document.documentElement.scrollTop >= document.documentElement.offsetHeight - 200) {
                if (viewMode === 'tracks') loadMoreTracks();
            }
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, [isFetchingMore, nextPageToken, viewMode]);

    const displayAlbums = playlists;
    const displayPlaylists = sitePlaylists;

    const handleSort = (key) => {
        setSortConfig((prev) => toggleSortConfig(prev, key));
    };

    const sortedTracks = sortTrackRows(
        tracks.map((tr, i) => ({ ...tr, _index: i + 1 })),
        sortConfig
    );
    const previewTracks = sortedTracks.slice(0, 15);

    const bestMatch = bestArtist ? { ...bestArtist, isArtist: true } : null;
    const primaryArtist = bestArtist || channels[0] || null;

    const goToTrackArtist = async (e, track) => {
        e.stopPropagation();
        const author = formatArtistDisplay(track.author) || primaryArtist?.name || '';
        const ok = await goToArtistPage(navigate, {
            author,
            channelId: primaryArtist?.channelId || track.channelId,
            name: primaryArtist?.name || author,
            subs: primaryArtist?.subs,
            image: primaryArtist?.image,
            videoId: track.youtubeId
        });
        if (!ok) showToast(t('library.artistNotFound'), 'info');
    };

    const renderTrackArtist = (track) => {
        const label = formatArtistDisplay(track.author) || primaryArtist?.name || '';
        if (!label) return null;
        const clickable = Boolean(primaryArtist?.channelId || track.channelId);
        return (
            <span
                className={`pv_artist_link${clickable ? ' pv_artist_link--clickable' : ''}`}
                onClick={clickable ? (e) => goToTrackArtist(e, track) : undefined}
                role={clickable ? 'link' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onKeyDown={
                    clickable
                        ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  goToTrackArtist(e, track);
                              }
                          }
                        : undefined
                }
            >
                {label}
            </span>
        );
    };

    const renderAlbumCell = (track) => {
        if (track.albumId) {
            return (
                <span
                    className="pv_album_link"
                    onClick={(ev) => {
                        ev.stopPropagation();
                        navigate(`/playlist/${track.albumId}`);
                    }}
                >
                    {track.album}
                </span>
            );
        }
        return track.album || 'Single';
    };

    const handleTrackContextMenu = (e, track) => {
        e.preventDefault();
        openMenu(e.clientX, e.clientY, attachSearchArtistNav(track, primaryArtist));
    };
    const handleBulkPlayNext = (listToPlay) => {
        const songsToAdd = listToPlay.filter((t) => selectedTracks.includes(t.youtubeId));
        playTracksNextInQueue(songsToAdd);
        setIsBulkMenuOpen(false);
        setSelectedTracks([]);
    };
    const handleBulkAddQueue = (listToPlay) => {
        const songsToAdd = listToPlay.filter((t) => selectedTracks.includes(t.youtubeId));
        addTracksToQueueEnd(songsToAdd);
        setIsBulkMenuOpen(false);
        setSelectedTracks([]);
    };

    const renderTrackRow = (track, index, list, showAlbum = false, showHeader = false) => {
        const isPlaying = currentSong?.youtubeId === track.youtubeId;
        const isSelected = selectedTracks.includes(track.youtubeId);

        return (
            <div key={`${track.youtubeId}-${index}`} className={`pv_track_row${isPlaying ? ' is-playing' : ''}${isSelected ? ' selected_row' : ''}${showAlbum ? ' pv_track_row--with-album' : ' pv_track_row--compact'}`} onClick={(e) => { if (e.target.type === 'checkbox') return; playSong(track, list); }} onContextMenu={(e) => handleTrackContextMenu(e, track)}>
                <div className="pv_col_index" onClick={(e) => e.stopPropagation()}>
                    <span className="track_number">
                        {isPlaying ? <div className="icon play_icon play_icon--row"></div> : index + 1}
                    </span>
                    <span className="play_on_hover" onClick={() => playSong(track, list)}>
                        <div className="icon play_icon play_icon--row"></div>
                    </span>
                </div>
                <div className="pv_col_title">
                    <img src={track.image} className="pv_track_img" alt="cover" />
                    <div className="pv_track_name_wrapper">
                        <div className="pv_track_name">{track.title}</div>
                        <button className="pv_title_heart_btn pv_title_heart_btn--show" onClick={(e) => { e.stopPropagation(); toggleLike(track); }}>
                            <div className={`heart_icon_fav ${isLiked && isLiked(track.youtubeId) ? 'heart_icon_fav_active' : ''}`}></div>
                        </button>
                    </div>
                </div>
                {showAlbum && <div className="pv_col_author">{renderTrackArtist(track)}</div>}
                {showAlbum && <div className="pv_col_album">{renderAlbumCell(track)}</div>}
                <div className="pv_col_time"><span>{formatTime(track.duration)}</span></div>
                <div className="pv_col_menu" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="pv_action_btn row_more_btn" aria-label={t('common.menu')} onClick={(e) => handleTrackContextMenu(e, track)}></button>
                </div>
                <div className="pv_col_checkbox" onClick={(e) => e.stopPropagation()}>
                    {showHeader && <input type="checkbox" className="track_checkbox" checked={isSelected} onChange={() => { setSelectedTracks(prev => prev.includes(track.youtubeId) ? prev.filter(id => id !== track.youtubeId) : [...prev, track.youtubeId]); }} />}
                </div>
            </div>
        );
    };

    const renderFullTrackRow = (track, index, list) => {
        const isPlaying = currentSong?.youtubeId === track.youtubeId;
        const isSelected = selectedTracks.includes(track.youtubeId);

        return (
            <div key={`${track.youtubeId}-${index}`} className={`pv_track_row${isPlaying ? ' is-playing' : ''}${isSelected ? ' selected_row' : ''}`} onClick={(e) => { if (e.target.type === 'checkbox') return; playSong(track, list); }} onContextMenu={(e) => handleTrackContextMenu(e, track)}>
                <div className="pv_col_index" onClick={(e) => e.stopPropagation()}>
                    <span className="track_number">
                        {isPlaying ? <div className="icon play_icon play_icon--row"></div> : index + 1}
                    </span>
                    <span className="play_on_hover" onClick={() => playSong(track, list)}>
                        <div className="icon play_icon play_icon--row"></div>
                    </span>
                </div>
                <div className="pv_col_title">
                    <img src={track.image} className="pv_track_img" alt="cover" />
                    <div className="pv_track_name_wrapper">
                        <div className="pv_track_name">{track.title}</div>
                        <button className="pv_title_heart_btn pv_title_heart_btn--show" onClick={(e) => { e.stopPropagation(); toggleLike(track); }}>
                            <div className={`heart_icon_fav ${isLiked && isLiked(track.youtubeId) ? 'heart_icon_fav_active' : ''}`}></div>
                        </button>
                    </div>
                </div>
                <div className="pv_col_author">{renderTrackArtist(track)}</div>
                <div className="pv_col_album">{renderAlbumCell(track)}</div>
                <div className="pv_col_time"><span>{formatTime(track.duration)}</span></div>
                <div className="pv_col_menu" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="pv_action_btn row_more_btn" aria-label={t('common.menu')} onClick={(e) => handleTrackContextMenu(e, track)}></button>
                </div>
                <div className="pv_col_checkbox" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" className="track_checkbox" checked={isSelected} onChange={() => { setSelectedTracks(prev => prev.includes(track.youtubeId) ? prev.filter(id => id !== track.youtubeId) : [...prev, track.youtubeId]); }} />
                </div>
            </div>
        );
    };

    const hasAnyResults =
        Boolean(bestMatch) ||
        tracks.length > 0 ||
        channels.length > 0 ||
        playlists.length > 0 ||
        sitePlaylists.length > 0;

    return (
        <div className="artist_page" onClick={() => setIsBulkMenuOpen(false)}>
            <div className="artist_full_tab" style={{ marginTop: '20px', paddingBottom: '60px' }}>

                <div className="fav_tabs" style={{ marginBottom: '30px' }}>
                    <button className={`fav_tab ${viewMode === 'all' ? 'active' : ''}`} onClick={() => setViewMode('all')}>{t('search.tabAll')}</button>
                    <button className={`fav_tab ${viewMode === 'tracks' ? 'active' : ''}`} onClick={() => setViewMode('tracks')}>{t('search.tabTracks')}</button>
                    <button className={`fav_tab ${viewMode === 'artists' ? 'active' : ''}`} onClick={() => setViewMode('artists')}>{t('search.tabArtists')}</button>
                    <button className={`fav_tab ${viewMode === 'albums' ? 'active' : ''}`} onClick={() => setViewMode('albums')}>{t('search.tabAlbums')}</button>
                    <button className={`fav_tab ${viewMode === 'playlists' ? 'active' : ''}`} onClick={() => setViewMode('playlists')}>{t('search.tabPlaylists')}</button>
                </div>

                {isLoading ? (
                    <div className="search_results_skeleton" aria-busy="true">
                        <p className="section_state_loading_text">{t('search.searching')}</p>
                        <div className="search_skeleton_block search_skeleton_block--tall" />
                        <CardRowSkeleton count={5} type="card" />
                        <CardRowSkeleton count={4} type="artist" />
                    </div>
                ) : (
                    <>
                        {suggestedQuery && (
                            <p className="search_layout_hint">
                                {t('search.didYouMean')}{' '}
                                <button
                                    type="button"
                                    className="search_layout_hint_btn"
                                    onClick={() => navigate(`/search?q=${encodeURIComponent(suggestedQuery)}`)}
                                >
                                    {suggestedQuery}
                                </button>
                                {' '}{t('search.wrongLayout')}
                            </p>
                        )}

                        {!hasAnyResults && query ? (
                            <EmptyState
                                title={t('search.noResultsTitle')}
                                message={t('search.noResultsMessage', { query })}
                            />
                        ) : null}

                        {viewMode === 'all' && hasAnyResults && (
                            <>
                                {(bestMatch || popularTracks.length > 0) && (
                                    <div style={{ display: 'flex', gap: '24px', marginBottom: '50px', flexWrap: 'nowrap' }}>
                                        {bestMatch && (
                                            <div style={{ width: '450px', flexShrink: 0 }}>
                                                <h3 style={{ fontSize: '24px', margin: '0 0 16px 0' }}>{t('search.bestResult')}</h3>
                                                <div
                                                    style={{
                                                        background: '#181818', borderRadius: '8px', padding: '20px',
                                                        cursor: 'pointer', transition: 'background 0.3s', position: 'relative',
                                                        display: 'flex', flexDirection: 'column', gap: '20px', height: '265px'
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.background = '#282828'}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = '#181818'}
                                                    onClick={() => bestMatch.isArtist ? navigate(`/artist/${bestMatch.channelId}`, { state: { subs: bestMatch.subs, name: bestMatch.name || bestMatch.title, image: bestMatch.image } }) : playSong(bestMatch, tracks)}
                                                >
                                                    <img src={bestMatch.image} style={{ width: '120px', height: '120px', borderRadius: bestMatch.isArtist ? '50%' : '8px', objectFit: 'cover' }} alt="best match" />
                                                    <div>
                                                        <div style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bestMatch.name || bestMatch.title}</div>
                                                        <div style={{ color: '#aaa', fontSize: '15px' }}>{bestMatch.isArtist ? t('search.bestMatchArtist') : t('search.bestMatchSong', { author: bestMatch.author })}</div>
                                                        {bestMatch.isArtist && formatListeners(bestMatch.subs, locale) ? (
                                                            <div style={{ color: '#b3b3b3', fontSize: '14px', marginTop: '4px' }}>{formatListeners(bestMatch.subs, locale)}</div>
                                                        ) : null}
                                                    </div>
                                                    {!bestMatch.isArtist && (
                                                        <div className="pv_track_play_overlay" style={{ right: '20px', bottom: '20px', top: 'auto', left: 'auto', width: '48px', height: '48px', borderRadius: '50%', background: '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0 }}>
                                                            <div className="icon play_icon" style={{ transform: 'scale(0.6)', filter: 'brightness(10)' }}></div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {popularTracks.length > 0 && (
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <h3 style={{ fontSize: '24px', margin: '0 0 16px 0' }}>{t('search.popularSongs')}</h3>
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    {popularTracks.map((track, i) => {
                                                        const isPlaying = currentSong?.youtubeId === track.youtubeId;
                                                        return (
                                                            <div
                                                                key={`${track.youtubeId}-${i}-pop`}
                                                                style={{ display: 'flex', alignItems: 'center', padding: '8px', borderRadius: '6px', cursor: 'pointer', transition: '0.2s' }}
                                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                                onClick={() => playSong(track, popularTracks)}
                                                                onContextMenu={(e) => handleTrackContextMenu(e, track)}
                                                            >
                                                                <div style={{ width: '40px', height: '40px', marginRight: '16px', position: 'relative' }}>
                                                                    <img src={track.image} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} alt="cover" />
                                                                </div>
                                                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                                                    <span style={{ fontSize: '15px', fontWeight: 500, color: isPlaying ? '#a855f7' : '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.title}</span>
                                                                    <span style={{ fontSize: '13px', color: '#aaa' }}>{renderTrackArtist(track)}</span>
                                                                </div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', paddingLeft: '10px' }}>
                                                                    <button className="pv_title_heart_btn" style={{ opacity: 1, padding: 0 }} onClick={(e) => { e.stopPropagation(); toggleLike(track); }}>
                                                                        <div className={`heart_icon_fav ${isLiked && isLiked(track.youtubeId) ? 'heart_icon_fav_active' : ''}`}></div>
                                                                    </button>
                                                                    <span style={{ color: '#aaa', fontSize: '14px', width: '40px', textAlign: 'right' }}>{formatTime(track.duration)}</span>
                                                                    <button type="button" className="pv_action_btn row_more_btn" aria-label={t('common.menu')} onClick={(e) => handleTrackContextMenu(e, track)}></button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {tracks.length > 0 && (
                                    <div className="section_block" style={{ marginBottom: '50px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                            <h3 style={{ fontSize: '24px', margin: 0 }}>{t('search.sectionTracks')}</h3>
                                            <button className="btn_view_all" style={{ background: 'none', color: '#aaa', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }} onClick={() => setViewMode('tracks')}>{t('search.viewAll')}</button>
                                        </div>
                                        <div className="playlist_view_tracks" style={{ margin: 0 }}>
                                            <div className="pv_track_header">
                                                <div className="sortable_th pv_col_index" onClick={() => handleSort('index')}>#{renderSortIcon('index', sortConfig)}</div>
                                                <div className="sortable_th" onClick={() => handleSort('title')}>{t('common.tableTitle')}{renderSortIcon('title', sortConfig)}</div>
                                                <div className="sortable_th" onClick={() => handleSort('author')}>{t('common.tableAuthor')}{renderSortIcon('author', sortConfig)}</div>
                                                <div className="sortable_th" onClick={() => handleSort('album')}>{t('common.tableAlbum')}{renderSortIcon('album', sortConfig)}</div>
                                                <div className="sortable_th" style={{ textAlign: 'center' }} onClick={() => handleSort('duration')}>{t('common.tableTime')}{renderSortIcon('duration', sortConfig)}</div>
                                                <div></div>
                                                <div></div>
                                            </div>
                                            {previewTracks.map((track, i) => renderTrackRow(track, i, sortedTracks, true, false))}
                                        </div>
                                    </div>
                                )}

                                {channels.length > 0 && (
                                    <div className="section_block" style={{ marginBottom: '50px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                            <h3 style={{ fontSize: '24px', margin: 0 }}>{t('search.sectionArtists')}</h3>
                                            <button className="btn_view_all" style={{ background: 'none', color: '#aaa', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }} onClick={() => setViewMode('artists')}>{t('search.viewAll')}</button>
                                        </div>
                                        <div className="channels" style={{ display: 'flex', gap: '30px', overflowX: 'auto', paddingBottom: '10px' }}>
                                            {channels.slice(0, 15).map((artist, i) => (
                                                <ArtistCard key={`${artist.channelId}-${i}`} artist={artist} size={130} />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {displayAlbums.length > 0 && (
                                    <div className="section_block" style={{ marginBottom: '50px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                            <h3 style={{ fontSize: '24px', margin: 0 }}>{t('search.sectionAlbums')}</h3>
                                            <button className="btn_view_all" style={{ background: 'none', color: '#aaa', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }} onClick={() => setViewMode('albums')}>{t('search.viewAll')}</button>
                                        </div>
                                        <div className="horizontal_list" style={{ display: 'flex', gap: '20px', paddingBottom: '10px', overflowX: 'auto' }}>
                                            {displayAlbums.slice(0, 15).map((item, i) => (
                                                <div className="card" key={`album-${item.youtubeId}-${i}`} onClick={() => navigate(`/playlist/${item.youtubeId}`)} style={{ height: '255px', flexShrink: 0, cursor: 'pointer', width: '200px' }}>
                                                    <div className="song_cover_container" style={{ width: '100%', height: '175px' }}>
                                                        <img src={item.image} alt="album cover" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }} />
                                                        <div className="pv_track_play_overlay">▶</div>
                                                    </div>
                                                    <div className="card_title" style={{ marginTop: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
                                                    <div className="card_sub" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.author}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {displayPlaylists.length > 0 && (
                                    <div className="section_block">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                            <h3 style={{ fontSize: '24px', margin: 0 }}>{t('search.sectionPlaylists')}</h3>
                                            <button className="btn_view_all" style={{ background: 'none', color: '#aaa', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }} onClick={() => setViewMode('playlists')}>{t('search.viewAll')}</button>
                                        </div>
                                        <div className="horizontal_list" style={{ display: 'flex', gap: '20px', paddingBottom: '10px', overflowX: 'auto' }}>
                                            {displayPlaylists.slice(0, 15).map((item) => (
                                                <PlaylistCard key={`site-pl-${item.id}`} playlist={item} />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {tracks.length === 0 && channels.length === 0 && displayAlbums.length === 0 && displayPlaylists.length === 0 && (
                                    <div style={{ textAlign: 'center', color: '#888', marginTop: '100px', fontSize: '18px' }}>
                                        {t('search.queryNothingFound', { query })}
                                    </div>
                                )}
                            </>
                        )}

                        {viewMode === 'tracks' && tracks.length > 0 && (
                            <div className="playlist_view_tracks">
                                <div className="pv_track_header">
                                    <div className="sortable_th pv_col_index" onClick={() => handleSort('index')}>#{renderSortIcon('index', sortConfig)}</div>
                                    <div className="sortable_th" onClick={() => handleSort('title')}>{t('common.tableTitle')}{renderSortIcon('title', sortConfig)}</div>
                                    <div className="sortable_th" onClick={() => handleSort('author')}>{t('common.tableAuthor')}{renderSortIcon('author', sortConfig)}</div>
                                    <div className="sortable_th" onClick={() => handleSort('album')}>{t('common.tableAlbum')}{renderSortIcon('album', sortConfig)}</div>
                                    <div className="sortable_th" style={{ textAlign: 'center' }} onClick={() => handleSort('duration')}>{t('common.tableTime')}{renderSortIcon('duration', sortConfig)}</div>
                                    <div className="pv_col_menu" style={{ position: 'relative' }}>
                                        {selectedTracks.length > 0 && (
                                            <>
                                                <button className="pv_action_btn" style={{ opacity: 1 }} onClick={(e) => { e.stopPropagation(); setIsBulkMenuOpen(!isBulkMenuOpen); }} title={t('common.bulkActions')}>•••</button>
                                                {isBulkMenuOpen && (
                                                    <div className="context-menu" style={{ position: 'absolute', top: '100%', right: '30px', zIndex: 100, minWidth: '220px' }}>
                                                        <div className="context-menu-item" onClick={(e) => { e.stopPropagation(); handleBulkPlayNext(sortedTracks); }}>{t('contextMenu.playNextMany')}</div>
                                                        <div className="context-menu-item" onClick={(e) => { e.stopPropagation(); handleBulkAddQueue(sortedTracks); }}>{t('contextMenu.addToQueue')}</div>
                                                        <div className="context-menu-item" onClick={(e) => {
                                                            e.stopPropagation();
                                                            const songsToAdd = sortedTracks.filter(t => selectedTracks.includes(t.youtubeId));
                                                            openPopup(e.clientX, e.clientY, songsToAdd);
                                                            setIsBulkMenuOpen(false);
                                                        }}>{t('contextMenu.addToPlaylist')}</div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                    <div className="pv_col_checkbox">
                                        <input type="checkbox" className="track_checkbox" checked={selectedTracks.length === sortedTracks.length && sortedTracks.length > 0} onChange={(e) => { if (e.target.checked) setSelectedTracks(sortedTracks.map(t => t.youtubeId)); else setSelectedTracks([]); }} />
                                    </div>
                                </div>
                                {sortedTracks.map((track, index) => renderFullTrackRow(track, index, sortedTracks))}

                                {isFetchingMore && (
                                    <div style={{ textAlign: 'center', padding: '20px', color: '#a855f7', fontWeight: 600 }}>{t('common.loading')}</div>
                                )}
                            </div>
                        )}

                        {viewMode === 'tracks' && tracks.length === 0 && !isLoading && (
                            <EmptyState message={t('search.emptyTracks')} />
                        )}

                        {viewMode === 'artists' && channels.length > 0 && (
                            <div className="channels" style={{ display: 'flex', flexWrap: 'wrap', gap: '24px' }}>
                                {channels.map((artist, i) => (
                                    <ArtistCard key={`${artist.channelId}-${i}`} artist={artist} size={130} />
                                ))}
                            </div>
                        )}

                        {viewMode === 'artists' && channels.length === 0 && !isLoading && (
                            <EmptyState message={t('search.emptyArtists')} />
                        )}

                        {viewMode === 'albums' && displayAlbums.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
                                {displayAlbums.map((item, i) => (
                                    <div className="card" key={`full-album-${item.youtubeId}-${i}`} onClick={() => navigate(`/playlist/${item.youtubeId}`)} style={{ height: '255px', flexShrink: 0, cursor: 'pointer', width: '200px' }}>
                                        <div className="song_cover_container" style={{ width: '100%', height: '175px' }}>
                                            <img src={item.image} alt="album cover" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }} />
                                            <div className="pv_track_play_overlay">▶</div>
                                        </div>
                                        <div className="card_title" style={{ marginTop: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
                                        <div className="card_sub" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.author}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {viewMode === 'albums' && displayAlbums.length === 0 && !isLoading && (
                            <EmptyState message={t('search.emptyAlbums')} />
                        )}

                        {viewMode === 'playlists' && displayPlaylists.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
                                {displayPlaylists.map((item) => (
                                    <PlaylistCard key={`full-site-pl-${item.id}`} playlist={item} />
                                ))}
                            </div>
                        )}

                        {viewMode === 'playlists' && displayPlaylists.length === 0 && !isLoading && (
                            <EmptyState message={t('search.emptyPlaylists')} />
                        )}
                    </>
                )}
            </div>
        </div>
    );
}