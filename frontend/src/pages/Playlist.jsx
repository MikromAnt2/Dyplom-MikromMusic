import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { usePlaylist } from '../context/PlaylistContext';
import { useMenu } from '../context/MenuContext';
import { useToast } from '../context/ToastContext';
import { goToArtistPage } from '../utils/artistNav';
import { formatArtistDisplay } from '../utils/media';
import { normalizeTrackList } from '../utils/track';
import { renderSortIcon, toggleSortConfig, sortTrackRows } from '../utils/tableSort';
import searchIcon from '../assets/images/Search.png';
import BackButton from '../components/BackButton';
import ShareLinkButton from '../components/ShareLinkButton';
import { useShare } from '../hooks/useShare';
import { useLocale } from '../context/LocaleContext';

// Playlist: сторінка плейлиста — треки, редагування, відтворення
export default function Playlist() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { openMenu } = useMenu();
    const { t } = useLocale();

    const { user } = useAuth();
    const { playSong, currentSong, toggleLike, isLiked, playNextInQueue, addToQueueEnd, addTracksToQueueEnd, playTracksNextInQueue } = usePlayer();
    const { loadMyPlaylists, openPopup } = usePlaylist();
    const { showToast } = useToast();
    const { sharePlaylist } = useShare();

    const [playlist, setPlaylist] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
    const [selectedTracks, setSelectedTracks] = useState([]);

    const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
    const [isBulkMenuOpen, setIsBulkMenuOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editPrivacy, setEditPrivacy] = useState('private');

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchNextPageToken, setSearchNextPageToken] = useState(null);
    const [isSearching, setIsSearching] = useState(false);
    const [isFetchingMoreSearch, setIsFetchingMoreSearch] = useState(false);
    const searchRequestRef = useRef(0);
    const searchLoadMoreRef = useRef(null);
    const addTableBodyRef = useRef(null);

    const [likedTracks, setLikedTracks] = useState([]);
    const [suggestedTracks, setSuggestedTracks] = useState([]);
    const [suggestionsLoading, setSuggestionsLoading] = useState(false);
    const [addTab, setAddTab] = useState('suggested');

    const formatTime = (seconds) => {
        if (!seconds) return "--:--";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const formatDate = (dateString) => {
        if (!dateString) return "";
        const d = new Date(dateString);
        return `${d.getDate().toString().padStart(2, '0')}\\${(d.getMonth() + 1).toString().padStart(2, '0')}\\${d.getFullYear()}`;
    };

    useEffect(() => {
        if (isEditModalOpen && playlist) {
            setEditPrivacy(playlist.isPublic ? 'public' : 'private');
        }
    }, [isEditModalOpen, playlist]);

    useEffect(() => {
        const fetchPlaylist = async () => {
            setIsLoading(true);
            try {
                const isYouTube =
                    id.startsWith('PL') ||
                    id.startsWith('VL') ||
                    id.startsWith('RD') ||
                    id.startsWith('MPRE') ||
                    id.startsWith('OLAK5uy');

                const url = isYouTube ? `/api/yt-album/${id}` : `/api/playlists/${id}`;

                const res = await fetch(url);
                if (!res.ok) throw new Error(t('playlist.loadFailed'));

                const data = await res.json();
                setPlaylist(data);
            } catch (err) {
                console.error("Помилка завантаження:", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchPlaylist();
    }, [id]);

    const isOwner = user && playlist && !playlist.isYoutube && (playlist.owner === user.id || playlist.ownerId === user.id);

    const loadAddSuggestions = useCallback(async () => {
        if (!id) return;
        setSuggestionsLoading(true);
        try {
            const res = await fetch(`/api/playlists/${id}/add-suggestions`, { credentials: 'include' });
            const data = res.ok ? await res.json() : [];
            setSuggestedTracks(normalizeTrackList(Array.isArray(data) ? data : []));
        } catch (e) {
            console.error(e);
            setSuggestedTracks([]);
        } finally {
            setSuggestionsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        if (!isOwner) return;
        fetch('/api/songs/liked', { credentials: 'include' })
            .then((res) => (res.ok ? res.json() : []))
            .then((data) => setLikedTracks(normalizeTrackList(Array.isArray(data) ? data : [])))
            .catch(() => setLikedTracks([]));
    }, [isOwner]);

    useEffect(() => {
        if (!isOwner || !playlist?.tracks?.length) {
            setSuggestedTracks([]);
            return;
        }
        loadAddSuggestions();
    }, [isOwner, playlist?.tracks?.length, loadAddSuggestions]);

    const fetchSearchTracks = useCallback(async ({ q, pageToken = '', append = false }) => {
        const reqId = ++searchRequestRef.current;
        if (append) setIsFetchingMoreSearch(true);
        else {
            setIsSearching(true);
            setSearchNextPageToken(null);
        }

        try {
            const params = new URLSearchParams({
                q,
                pageSize: '20'
            });
            if (pageToken) params.set('pageToken', pageToken);

            const res = await fetch(`/api/search/tracks?${params.toString()}`);
            const data = res.ok ? await res.json() : { items: [], nextPageToken: null };
            if (reqId !== searchRequestRef.current) return;

            const batch = normalizeTrackList(data.items || []);
            setSearchNextPageToken(data.nextPageToken || null);
            setSearchResults((prev) => {
                if (!append) return batch;
                const seen = new Set(prev.map((t) => t.youtubeId));
                return [...prev, ...batch.filter((t) => !seen.has(t.youtubeId))];
            });
        } catch (e) {
            console.error(e);
            if (!append) setSearchResults([]);
        } finally {
            if (reqId === searchRequestRef.current) {
                setIsSearching(false);
                setIsFetchingMoreSearch(false);
            }
        }
    }, []);

    useEffect(() => {
        if (!isOwner) return;
        const q = searchQuery.trim();
        if (!q) {
            setSearchResults([]);
            setSearchNextPageToken(null);
            setIsSearching(false);
            return;
        }
        setAddTab('search');
        const timer = setTimeout(() => {
            fetchSearchTracks({ q, pageToken: '', append: false });
        }, 400);
        return () => clearTimeout(timer);
    }, [searchQuery, isOwner, fetchSearchTracks]);

    useEffect(() => {
        if (addTab !== 'search' || !searchNextPageToken) return undefined;
        const root = addTableBodyRef.current;
        const node = searchLoadMoreRef.current;
        if (!root || !node) return undefined;

        const observer = new IntersectionObserver(
            (entries) => {
                if (!entries[0]?.isIntersecting) return;
                if (isSearching || isFetchingMoreSearch) return;
                const q = searchQuery.trim();
                if (!q || !searchNextPageToken) return;
                fetchSearchTracks({ q, pageToken: searchNextPageToken, append: true });
            },
            { root, rootMargin: '80px', threshold: 0 }
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [addTab, searchNextPageToken, searchQuery, isSearching, isFetchingMoreSearch, fetchSearchTracks]);

    if (isLoading) return <div style={{ padding: '40px', color: '#fff' }}>{t('common.loading')}</div>;
    if (!playlist) return null;

    const handleSort = (key) => {
        setSortConfig((prev) => toggleSortConfig(prev, key));
    };

    const sortedTracks = sortTrackRows(
        (playlist.tracks || []).map((tr, i) => ({ ...tr, _index: i + 1 })),
        sortConfig
    );

    const handleDeletePlaylist = async () => {
        if (!window.confirm(t('playlist.deleteConfirm'))) return;
        try {
            const res = await fetch(`/api/playlists/${playlist.id}`, { method: 'DELETE' });
            if (res.ok) {
                showToast(t('playlist.deleted', { name: playlist.name }), 'info');
                loadMyPlaylists();
                navigate('/favorites');
            } else showToast(t('playlist.deleteFail'), 'error');
        } catch (e) {
            console.error(e);
            showToast(t('common.connectionError'), 'error');
        }
    };

    const handleBulkDelete = async () => {
        try {
            const res = await fetch(`/api/playlists/${id}/tracks`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ youtubeIds: selectedTracks })
            });
            if (res.ok) {
                setPlaylist({ ...playlist, tracks: playlist.tracks.filter(t => !selectedTracks.includes(t.youtubeId)) });
                setSelectedTracks([]);
                setIsBulkMenuOpen(false);
                showToast(t('playlist.tracksRemoved'), 'success');
            } else showToast(t('playlist.tracksRemoveFail'), 'error');
        } catch (e) {
            console.error(e);
            showToast(t('common.connectionError'), 'error');
        }
    };

    const handleBulkPlayNext = () => {
        const songsToAdd = playlist.tracks.filter(t => selectedTracks.includes(t.youtubeId));
        playTracksNextInQueue(songsToAdd);
        setIsBulkMenuOpen(false);
        setSelectedTracks([]);
    };

    const handleBulkAddQueue = () => {
        const songsToAdd = playlist.tracks.filter(t => selectedTracks.includes(t.youtubeId));
        addTracksToQueueEnd(songsToAdd);
        setIsBulkMenuOpen(false);
        setSelectedTracks([]);
    };

    const handleBulkLike = () => {
        const songsToLike = playlist.tracks.filter(t => selectedTracks.includes(t.youtubeId));
        let added = 0;
        songsToLike.forEach((song) => {
            if (!isLiked(song.youtubeId)) {
                toggleLike(song, { silent: true });
                added++;
            }
        });
        setIsBulkMenuOpen(false);
        setSelectedTracks([]);
        if (added) showToast(t('artist.likedAdded', { n: added }), 'success');
        else showToast(t('artist.likedAlready'), 'info');
    };

    const handleRemoveSingleTrack = async (songToRemove) => {
        try {
            const res = await fetch(`/api/playlists/${id}/tracks`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ youtubeIds: [songToRemove.youtubeId] })
            });
            if (res.ok) {
                setPlaylist({ ...playlist, tracks: playlist.tracks.filter(t => t.youtubeId !== songToRemove.youtubeId) });
                showToast(t('playlist.trackRemoved'), 'info');
            } else showToast(t('playlist.trackRemoveFail'), 'error');
        } catch (e) {
            console.error(e);
            showToast(t('common.connectionError'), 'error');
        }
    };

    const handleSearchKey = (e) => {
        if (e.key === 'Enter') setAddTab('search');
    };

    const handleAddTrack = async (song) => {
        try {
            const res = await fetch(`/api/playlists/${id}/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(song)
            });
            if (res.ok) {
                setPlaylist({ ...playlist, tracks: [...playlist.tracks, song] });
                showToast(t('playlist.trackAdded', { title: song.title }), 'success');
                loadAddSuggestions();
            } else showToast(t('playlist.trackAddFail'), 'error');
        } catch (err) {
            console.error(err);
            showToast(t('common.connectionError'), 'error');
        }
    };

    const handleEditSubmit = async (e) => {
        e.preventDefault();
        const name = e.target.name.value.trim();
        const description = e.target.description.value.trim();
        const isPublic = editPrivacy === 'public';

        if (!name) {
            showToast(t('playlist.nameRequired'), 'warning');
            return;
        }

        try {
            const res = await fetch(`/api/playlists/${playlist.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description, isPublic })
            });
            if (res.ok) {
                setPlaylist({ ...playlist, name, description, isPublic });
                setIsEditModalOpen(false);
                loadMyPlaylists();
                showToast(t('playlist.saved'), 'success');
            } else showToast(t('playlist.saveFail'), 'error');
        } catch (err) {
            console.error(err);
            showToast(t('common.connectionError'), 'error');
        }
    };

    const renderCover = () => {
        if (playlist.isYoutube) {
            const coverUrl = playlist.coverImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(playlist.name)}&background=181818&color=fff&size=500`;
            return <img src={coverUrl} className="playlist_cover_single" style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="album cover" />;
        }

        if (playlist.tracks.length >= 4) {
            return (
                <div className="playlist_cover_grid" style={{ width: '100%', height: '100%' }}>
                    {playlist.tracks.slice(0, 4).map((t, i) => <img key={i} src={t.image} alt="cover" />)}
                </div>
            );
        } else if (playlist.tracks.length > 0) {
            return <img src={playlist.tracks[0].image} className="playlist_cover_single" style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="cover" />;
        }
        return <div className="playlist_cover_skeleton" style={{ width: '100%', height: '100%' }}></div>;
    };

    const navigateToArtist = async (name, channelId, subs) => {
        const display = formatArtistDisplay(name);
        if (!display) return;
        const ucId = /^UC[\w-]{10,}$/i.test(String(channelId || '').trim()) ? String(channelId).trim() : '';
        const ok = await goToArtistPage(navigate, {
            author: display,
            channelId: ucId,
            name: display,
            subs: subs || playlist?.ownerSubs || ''
        });
        if (!ok) showToast(t('library.artistNotFound'), 'info');
    };

    const renderArtistLink = (name, channelId, subs) => {
        const display = formatArtistDisplay(name);
        if (!display) return null;
        return (
            <span
                className="pv_artist_link pv_artist_link--clickable"
                role="link"
                tabIndex={0}
                onClick={(e) => {
                    e.stopPropagation();
                    navigateToArtist(display, channelId, subs);
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        navigateToArtist(display, channelId, subs);
                    }
                }}
            >
                {display}
            </span>
        );
    };

    const handleTrackContextMenu = (e, track) => {
        e.preventDefault();
        const removeCallback = isOwner ? handleRemoveSingleTrack : null;
        const firstAuthor = track.authors?.[0];
        const authorName = formatArtistDisplay(firstAuthor?.name || track.author || playlist.ownerName);
        const rawId = firstAuthor?.id || playlist.ownerId || track.channelId || '';
        const ucId = /^UC[\w-]{10,}$/i.test(String(rawId).trim()) ? String(rawId).trim() : '';
        openMenu(e.clientX, e.clientY, {
            ...track,
            author: authorName || track.author,
            channelId: ucId,
            navArtistChannelId: ucId,
            navArtistName: authorName,
            navArtistSubs: playlist.ownerSubs || '',
            navArtistImage: track.image || playlist.coverImage || ''
        }, removeCallback);
    };

    let currentAddList = [];
    if (addTab === 'favorites') currentAddList = likedTracks;
    else if (addTab === 'search') currentAddList = searchResults;
    else if (addTab === 'suggested') currentAddList = suggestedTracks;

    return (
        <div className="playlist-page" onClick={() => { setIsMoreMenuOpen(false); setIsBulkMenuOpen(false); }}>
            <BackButton />

            <div className="playlist_view_header">
                <div className="pv_cover_container">{renderCover()}</div>
                <div className="pv_info">
                    <h1>{playlist.name}</h1>
                    <div className="pv_meta">
                        {playlist.isYoutube ? (
                            playlist.ownerId ? (
                                <span
                                    role="link"
                                    tabIndex={0}
                                    style={{ color: '#fff', textDecoration: 'none', fontWeight: 'bold', cursor: 'pointer' }}
                                    onClick={() => navigateToArtist(playlist.ownerName, playlist.ownerId, playlist.ownerSubs)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') e.currentTarget.click();
                                    }}
                                >
                                    {playlist.ownerName}
                                </span>
                            ) : (
                                <span style={{ color: '#fff', fontWeight: 'bold' }}>
                                    {playlist.ownerName}
                                </span>
                            )
                        ) : playlist.ownerId ? (
                            <Link to={`/user/${playlist.ownerId}`} style={{ color: '#fff', textDecoration: 'none', fontWeight: 'bold' }}>
                                {playlist.ownerName}
                            </Link>
                        ) : (
                            <span style={{ color: '#fff', fontWeight: 'bold' }}>
                                {playlist.ownerName}
                            </span>
                        )}
                        <br />
                        <span>{t('playlist.trackCount', { n: playlist.tracks.length })}</span>
                    </div>
                    <div className="pv_desc">{playlist.description}</div>

                    <div className="pv_actions" style={{ position: 'relative' }}>
                        <button className="pv_play_btn" onClick={() => playlist.tracks.length && playSong(playlist.tracks[0], playlist.tracks)}>
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>
                        </button>

                        {isOwner && (
                            <button className="pv_action_btn" title={t('playlist.edit')} style={{background:'none'}} onClick={() => setIsEditModalOpen(true)}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                        )}

                        <ShareLinkButton
                            className="pv_action_btn share_link_btn"
                            title={t('playlist.share')}
                            onClick={(e) => {
                                e.stopPropagation();
                                void sharePlaylist(id, playlist.name);
                            }}
                        />

                        <button className="pv_more_btn pv_action_btn" onClick={(e) => { e.stopPropagation(); setIsMoreMenuOpen(!isMoreMenuOpen); }}></button>

                        {isMoreMenuOpen && (
                            <div className="context-menu" style={{ position: 'absolute', top: '100%', left: '80px', zIndex: 10, minWidth: '220px' }}>
                                <div
                                    className="context-menu-item"
                                    onClick={() => {
                                        void sharePlaylist(id, playlist.name);
                                        setIsMoreMenuOpen(false);
                                    }}
                                >
                                    <div className="popup_icon popup_icon_share" />
                                    <span>{t('playlist.shareLink')}</span>
                                </div>
                                <div className="context-menu-item" onClick={() => { [...playlist.tracks].reverse().forEach(song => playNextInQueue(song)); setIsMoreMenuOpen(false); }}>
                                    <div className="popup_icon popup_icon_next"></div>
                                    <span>{t('contextMenu.playNextMany')}</span>
                                </div>
                                <div className="context-menu-item" onClick={() => { addTracksToQueueEnd(playlist.tracks); setIsMoreMenuOpen(false); }}>
                                    <div className="popup_icon popup_icon_queue"></div>
                                    <span>{t('contextMenu.addToQueue')}</span>
                                </div>
                                <div className="context-menu-item" onClick={(e) => { openPopup(e.clientX, e.clientY, playlist.tracks); setIsMoreMenuOpen(false); }}>
                                    <div className="popup_icon popup_icon_playlist"></div>
                                    <span>{t('contextMenu.addToPlaylist')}</span>
                                </div>
                                {isOwner && (
                                    <div className="context-menu-item" style={{ color: '#ff4d4d' }} onClick={handleDeletePlaylist}>
                                        <div className="popup_icon popup_icon_delete"></div>
                                        <span>{t('playlist.delete')}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="playlist_view_tracks">
                <div className="pv_track_header">
                    <div className="sortable_th pv_col_index" onClick={() => handleSort('index')}>#{renderSortIcon('index', sortConfig)}</div>
                    <div className="sortable_th" onClick={() => handleSort('title')}>{t('common.tableTitle')}{renderSortIcon('title', sortConfig)}</div>
                    <div className="sortable_th" onClick={() => handleSort('author')}>{t('common.tableArtist')}{renderSortIcon('author', sortConfig)}</div>
                    <div className="sortable_th" onClick={() => handleSort('album')}>{t('common.tableAlbum')}{renderSortIcon('album', sortConfig)}</div>
                    <div className="sortable_th" onClick={() => handleSort('addedAt')}>{t('common.tableAdded')}{renderSortIcon('addedAt', sortConfig)}</div>
                    <div className="sortable_th" style={{ textAlign: 'center' }} onClick={() => handleSort('duration')}>{t('common.tableTime')}{renderSortIcon('duration', sortConfig)}</div>

                    <div className="pv_col_checkbox" style={{ position: 'relative' }}>
                        {selectedTracks.length > 0 && (
                            <>
                                <button
                                    className="pv_action_btn"
                                    style={{ opacity: 1 }}
                                    onClick={(e) => { e.stopPropagation(); setIsBulkMenuOpen(!isBulkMenuOpen); }}
                                    title={t('common.bulkActions')}
                                ></button>

                                {isBulkMenuOpen && (
                                    <div className="context-menu" style={{ position: 'absolute', top: '100%', right: '30px', zIndex: 100, minWidth: '250px' }}>
                                        <div className="context-menu-item" onClick={(e) => { e.stopPropagation(); handleBulkPlayNext(); }}>
                                            <div className="popup_icon popup_icon_next"></div>
                                            <span>{t('contextMenu.playNextMany')}</span>
                                        </div>
                                        <div className="context-menu-item" onClick={(e) => { e.stopPropagation(); handleBulkAddQueue(); }}>
                                            <div className="popup_icon popup_icon_queue"></div>
                                            <span>{t('contextMenu.addToQueue')}</span>
                                        </div>
                                        <div className="context-menu-item" onClick={(e) => {
                                            e.stopPropagation();
                                            const songsToAdd = playlist.tracks.filter(t => selectedTracks.includes(t.youtubeId));
                                            openPopup(e.clientX, e.clientY, songsToAdd);
                                            setIsBulkMenuOpen(false);
                                        }}>
                                            <div className="popup_icon popup_icon_playlist"></div>
                                            <span>{t('contextMenu.addToPlaylist')}</span>
                                        </div>
                                        <div className="context-menu-item" onClick={(e) => { e.stopPropagation(); handleBulkLike(); }}>
                                            <div className="popup_icon popup_icon_unlike"></div>
                                            <span>{t('playlist.addToLiked')}</span>
                                        </div>
                                        {isOwner && (
                                            <div className="context-menu-item" style={{ color: '#ff4d4d' }} onClick={(e) => { e.stopPropagation(); handleBulkDelete(); }}>
                                                <div className="popup_icon popup_icon_delete"></div>
                                                <span>{t('playlist.removeFromPlaylist')}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                        <input
                            type="checkbox"
                            className="track_checkbox"
                            title={t('common.selectAll')}
                            checked={selectedTracks.length === playlist.tracks.length && playlist.tracks.length > 0}
                            onChange={(e) => {
                                if (e.target.checked) setSelectedTracks(playlist.tracks.map(t => t.youtubeId));
                                else setSelectedTracks([]);
                            }}
                        />
                    </div>
                </div>

                {sortedTracks.map((track, index) => {
                    const isPlaying = currentSong?.youtubeId === track.youtubeId;
                    const isSelected = selectedTracks.includes(track.youtubeId);

                    return (
                        <div
                            key={track.youtubeId + index}
                            className={`pv_track_row ${isSelected ? 'selected_row' : ''}`}
                            onClick={(e) => { if (e.target.type === 'checkbox') return; playSong(track, playlist.tracks); }}
                            onContextMenu={(e) => handleTrackContextMenu(e, track)}
                        >
                            <div className="pv_col_index" onClick={(e) => e.stopPropagation()}>
                                <span className="track_number" style={{ color: isPlaying ? '#a855f7' : '#b3b3b3' }}>
                                    {isPlaying ? <div className="icon play_icon" style={{ transform: 'scale(0.5)', position: 'relative', top: '3px' }}></div> : index + 1}
                                </span>
                                <span className="play_on_hover" onClick={() => playSong(track, playlist.tracks)}>
                                    <div className="icon play_icon" style={{ transform: 'scale(0.5)', position: 'relative', top: '3px' }}></div>
                                </span>
                            </div>
                            <div className="pv_col_title">
                                <img src={track.image || playlist.coverImage} className="pv_track_img" alt="cover" />
                                <div className="pv_track_name_wrapper">
                                    <div className="pv_track_name" style={{ color: isPlaying ? '#a855f7' : '#fff' }}>{track.title}</div>
                                    <button className="pv_title_heart_btn" style={{ opacity: isLiked && isLiked(track.youtubeId) ? 1 : undefined }} onClick={(e) => { e.stopPropagation(); toggleLike(track); }}>
                                        <div className={`heart_icon_fav ${isLiked && isLiked(track.youtubeId) ? 'heart_icon_fav_active' : ''}`}></div>
                                    </button>
                                </div>
                            </div>

                            <div className="pv_col_author" onClick={(e) => e.stopPropagation()}>
                                {track.authors && track.authors.length > 0 ? (
                                    track.authors.map((a, i) => (
                                        <span key={i}>
                                            {renderArtistLink(a.name, a.id || playlist.ownerId, playlist.ownerSubs)}
                                            {i < track.authors.length - 1 ? ', ' : ''}
                                        </span>
                                    ))
                                ) : (
                                    renderArtistLink(track.author, track.channelId || playlist.ownerId, playlist.ownerSubs) || (
                                        <span>{track.author}</span>
                                    )
                                )}
                            </div>

                            <div className="pv_col_album" onClick={(e) => e.stopPropagation()}>
                                {track.albumInfo?.id ? (
                                    <span
                                        style={{ cursor: 'pointer', transition: 'color 0.2s' }}
                                        onMouseEnter={(e) => { e.target.style.textDecoration = 'underline'; e.target.style.color = '#fff'; }}
                                        onMouseLeave={(e) => { e.target.style.textDecoration = 'none'; e.target.style.color = 'inherit'; }}
                                        onClick={() => navigate(`/playlist/${track.albumInfo.id}`)}
                                    >
                                        {track.albumInfo.name}
                                    </span>
                                ) : <span>{track.album || 'Single'}</span>}
                            </div>

                            <div className="pv_col_date">{formatDate(track.addedAt || Date.now())}</div>
                            <div className="pv_col_time"><span>{formatTime(track.duration)}</span></div>
                            <div className="pv_col_checkbox" onClick={(e) => e.stopPropagation()}>
                                <button className="pv_action_btn row_more_btn" onClick={(e) => handleTrackContextMenu(e, track)}></button>
                                <input
                                    type="checkbox"
                                    className="track_checkbox"
                                    checked={isSelected}
                                    onChange={() => { setSelectedTracks(prev => prev.includes(track.youtubeId) ? prev.filter(id => id !== track.youtubeId) : [...prev, track.youtubeId]); }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            {isOwner && (
                <div className="pv_add_tracks_section">
                    <div className="add_tracks_header_flex">
                        <h2>{t('playlist.addTracksTitle')}</h2>
                        <div className="search_bar" style={{ width: '300px', margin: 0 }}>
                            <span className="search_icon_wrapper"><img src={searchIcon} alt="" /></span>
                            <input
                                type="text"
                                id="search_input"
                                placeholder={t('playlist.searchSong')}
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    if (e.target.value.trim()) setAddTab('search');
                                }}
                                onKeyDown={handleSearchKey}
                            />
                        </div>
                    </div>
                    <div className="add_tracks_pills">
                        <button className={`pill_btn ${addTab === 'suggested' ? 'active' : ''}`} onClick={() => setAddTab('suggested')}>{t('playlist.tabSuggested')}</button>
                        <button className={`pill_btn ${addTab === 'favorites' ? 'active' : ''}`} onClick={() => setAddTab('favorites')}>{t('playlist.tabFavorites')}</button>
                        <button className={`pill_btn ${addTab === 'search' ? 'active' : ''}`} onClick={() => setAddTab('search')}>{t('playlist.tabSearch')}</button>
                    </div>
                    <div className="add_tracks_table">
                        <div className="add_table_header">
                            <div style={{ textAlign: 'right', paddingRight: '10px' }}>#</div>
                            <div>{t('common.tableTitle')}</div>
                            <div>{t('common.tableArtist')}</div>
                            <div>{t('common.tableAlbum')}</div>
                            <div style={{textAlign: 'center'}}>{t('common.tableTime')}</div>
                            <div></div>
                        </div>
                        <div ref={addTableBodyRef} className="add_table_body add_table_body--scroll">
                            {addTab === 'suggested' && suggestionsLoading && (
                                <div style={{ padding: 16, color: '#888' }}>{t('playlist.pickingByTaste')}</div>
                            )}
                            {addTab === 'search' && isSearching && <div style={{ padding: 16, color: '#888' }}>{t('playlist.searching')}</div>}
                            {currentAddList.map((song, index) => {
                                const isAdded = playlist.tracks.some(t => t.youtubeId === song.youtubeId);
                                const isPlaying = currentSong?.youtubeId === song.youtubeId;
                                return (
                                    <div className="add_table_row" key={song.youtubeId} onClick={() => playSong(song, currentAddList)} style={{ cursor: 'pointer' }}>
                                        <div className="pv_col_index" onClick={(e) => e.stopPropagation()}>
                                            <span className="track_number" style={{ color: isPlaying ? '#a855f7' : '#b3b3b3' }}>
                                                {isPlaying ? <div className="icon play_icon" style={{ transform: 'scale(0.5)', position: 'relative', top: '3px' }}></div> : index + 1}
                                            </span>
                                            <span className="play_on_hover" onClick={() => playSong(song, currentAddList)}>
                                                <div className="icon play_icon" style={{ transform: 'scale(0.5)', position: 'relative', top: '3px' }}></div>
                                            </span>
                                        </div>
                                        <div className="at_col_track">
                                            <img src={song.image} alt="cover" />
                                            <div className="at_title" style={{ color: isPlaying ? '#a855f7' : '#fff' }}>{song.title}</div>
                                        </div>
                                        <div className="at_col_artist">{song.author}</div>
                                        <div className="at_col_album">{song.album || 'Single'}</div>
                                        <div className="at_col_time" style={{ color: isPlaying ? '#a855f7' : '#888' }}>{formatTime(song.duration)}</div>
                                        <button className="btn_add_music_icon" disabled={isAdded} onClick={(e) => { e.stopPropagation(); handleAddTrack(song); }} title={isAdded ? t('playlist.alreadyAdded') : t('playlist.addTrack')}>
                                            {isAdded ? '✓' : (
                                                <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /><line x1="15" y1="9" x2="21" y2="9" /><line x1="18" y1="6" x2="18" y2="12" />
                                                </svg>
                                            )}
                                        </button>
                                    </div>
                                );
                            })}
                            {addTab === 'suggested' && !suggestionsLoading && suggestedTracks.length === 0 && (
                                <div style={{ padding: 16, color: '#888' }}>
                                    {t('playlist.needMoreForRecs')}
                                </div>
                            )}
                            {addTab === 'favorites' && likedTracks.length === 0 && (
                                <div style={{ padding: 16, color: '#888' }}>{t('playlist.noLikedForAdd')}</div>
                            )}
                            {addTab === 'search' && searchQuery.trim() && searchResults.length === 0 && !isSearching && (
                                <div style={{ padding: 16, color: '#888' }}>{t('playlist.nothingFoundSearch')}</div>
                            )}
                            {addTab === 'search' && !searchQuery.trim() && (
                                <div style={{ padding: 16, color: '#888' }}>{t('playlist.enterQuery')}</div>
                            )}
                            {addTab === 'search' && searchNextPageToken && (
                                <div ref={searchLoadMoreRef} className="add_table_load_more">
                                    {isFetchingMoreSearch ? t('common.loading') : ''}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {isEditModalOpen && (
                <div className="modal_overlay" onClick={(e) => { if(e.target.className === 'modal_overlay') setIsEditModalOpen(false) }}>
                    <div className="create_playlist_card_fixed">
                        <div className="create_playlist_header">
                            <h2>{t('playlist.editModalTitle')}</h2>
                            <span className="close_modal_icon" onClick={() => setIsEditModalOpen(false)}>✕</span>
                        </div>

                        <form onSubmit={handleEditSubmit} className="create_playlist_form_new">
                            <div className="input_field_wrapper">
                                <div className="label_row">
                                    <label>{t('modal.nameLabel')}</label>
                                </div>
                                <input type="text" name="name" defaultValue={playlist.name} placeholder={t('modal.playlistName')} required />
                            </div>

                            <div className="option_row" onClick={() => setEditPrivacy('public')}>
                                <div className="option_info">
                                    <div className="option_icon">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                                    </div>
                                    <div>
                                        <div className="option_title">{t('modal.publicTitle')}</div>
                                        <div className="option_desc">{t('modal.publicDesc')}</div>
                                    </div>
                                </div>
                                <label className="switch_new">
                                    <input type="checkbox" checked={editPrivacy === 'public'} onChange={() => setEditPrivacy('public')} />
                                    <span className="slider_new round"></span>
                                </label>
                            </div>

                            <div className="option_row" onClick={() => setEditPrivacy('private')}>
                                <div className="option_info">
                                    <div className="option_icon">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                    </div>
                                    <div>
                                        <div className="option_title">{t('modal.privateTitle')}</div>
                                        <div className="option_desc">{t('modal.privateDesc')}</div>
                                    </div>
                                </div>
                                <label className="switch_new">
                                    <input type="checkbox" checked={editPrivacy === 'private'} onChange={() => setEditPrivacy('private')} />
                                    <span className="slider_new round"></span>
                                </label>
                            </div>

                            <div className="input_field_wrapper">
                                <label>{t('modal.descLabel')}</label>
                                <textarea name="description" defaultValue={playlist.description} placeholder={t('modal.playlistDesc')} rows="3"></textarea>
                            </div>

                            <div className="create_playlist_footer_new">
                                <button type="button" className="btn_cancel_text" onClick={() => setIsEditModalOpen(false)}>{t('modal.cancel')}</button>
                                <button type="submit" className="btn_submit_purple">{t('playlist.save')}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}