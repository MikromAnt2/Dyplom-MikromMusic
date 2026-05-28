import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { usePlaylist } from "../context/PlaylistContext";
import PlaylistCard from "../components/PlaylistCard";
import { usePlayer } from "../context/PlayerContext";
import { useMenu } from "../context/MenuContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import ArtistCard from "../components/ArtistCard";
import ArtistDiscoverModal from "../components/ArtistDiscoverModal";
import EmptyState from "../components/EmptyState";
import { onMediaError, fallbackImg, formatArtistDisplay } from "../utils/media";
import { goToArtistPage } from "../utils/artistNav";
import searchIcon from "../assets/images/Search.png";
import { useLocale } from "../context/LocaleContext";

// Favorites: бібліотека — плейлисти, лайки, історія, підписки
export default function Favorites() {
    const [activeTab, setActiveTab] = useState("best");

    const { user, openAuthModal } = useAuth();

    const { myPlaylists, openCreateModal, openPopup } = usePlaylist();
    const { playSong, currentSong, toggleLike, isLiked, playTracksNextInQueue, addTracksToQueueEnd } = usePlayer();
    const { openMenu } = useMenu();
    const { showToast } = useToast();
    const { t } = useLocale();

    const [likedTracks, setLikedTracks] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [playlistSearchQuery, setPlaylistSearchQuery] = useState("");
    const [historySearchQuery, setHistorySearchQuery] = useState("");
    const [artistSearchQuery, setArtistSearchQuery] = useState("");
    const [discoverOpen, setDiscoverOpen] = useState(false);

    const [selectedTracks, setSelectedTracks] = useState([]);
    const [isBulkMenuOpen, setIsBulkMenuOpen] = useState(false);
    const [subscribedArtists, setSubscribedArtists] = useState([]);
    const [historyTracks, setHistoryTracks] = useState([]);
    const navigate = useNavigate();

    const [sortConfigTracks, setSortConfigTracks] = useState({ key: null, direction: 'asc' });
    const [sortConfigHistory, setSortConfigHistory] = useState({ key: null, direction: 'asc' });

    const [showAllTracks, setShowAllTracks] = useState(false);
    const [showAllHistory, setShowAllHistory] = useState(false);

    const bestPlaylistsRef = useRef(null);
    const bestArtistsRef = useRef(null);

    // formatTime: секунди у m:ss — для тривалості треку
    const formatTime = (seconds) => {
        if (!seconds) return "--:--";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    // formatDate: дата у DD\MM\YYYY — для історії
    const formatDate = (dateString) => {
        if (!dateString) return "";
        const d = new Date(dateString);
        return `${d.getDate().toString().padStart(2, '0')}\\${(d.getMonth() + 1).toString().padStart(2, '0')}\\${d.getFullYear()}`;
    };

    // scrollList: горизонтальний скрол секції — smooth ±300px
    const scrollList = (ref, direction) => {
        if (ref.current) {
            const scrollAmount = direction === 'left' ? -300 : 300;
            ref.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        }
    };

    useEffect(() => {
        setSelectedTracks([]);
        setIsBulkMenuOpen(false);
    }, [activeTab]);

    const refreshHistory = () => {
        fetch('/api/history', { credentials: 'include' })
            .then(res => res.ok ? res.json() : [])
            .then(data => setHistoryTracks(Array.isArray(data) ? data : []))
            .catch(err => console.error(err));
    };

    useEffect(() => {
        if (!user) return;

        fetch('/api/subscriptions', { credentials: 'include' })
            .then(res => res.ok ? res.json() : [])
            .then(data => setSubscribedArtists(Array.isArray(data) ? data : []))
            .catch(() => setSubscribedArtists([]));

        fetch('/api/songs/liked', { credentials: 'include' })
            .then(res => res.ok ? res.json() : [])
            .then(data => setLikedTracks(Array.isArray(data) ? data : []))
            .catch(() => setLikedTracks([]));

        refreshHistory();
    }, [activeTab, user]);

    useEffect(() => {
        if (!user || activeTab !== 'history') return undefined;
        const onHistoryUpdated = () => refreshHistory();
        window.addEventListener('mikrom-history-updated', onHistoryUpdated);
        return () => window.removeEventListener('mikrom-history-updated', onHistoryUpdated);
    }, [activeTab, user]);

    if (!user) {
        return (
            <div className="favorites-page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 150px)' }}>
                <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <svg viewBox="0 0 24 24" width="80" height="80" stroke="#a855f7" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '24px' }}>
                        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    <h2 style={{ fontSize: '32px', color: '#fff', marginBottom: '16px', fontWeight: 'bold' }}>{t('library.notAuthTitle')}</h2>
                    <p style={{ color: '#aaa', marginBottom: '32px', fontSize: '16px', maxWidth: '450px', lineHeight: '1.5' }}>
                        {t('library.notAuthDesc')}
                    </p>
                    <button className="btn_submit_purple" onClick={() => openAuthModal('login')} style={{ padding: '14px 40px', fontSize: '16px', borderRadius: '30px', cursor: 'pointer', border: 'none' }}>
                        {t('library.loginOrRegister')}
                    </button>
                </div>
            </div>
        );
    }

    const handleTrackContextMenu = (e, track) => {
        e.preventDefault();
        const author = formatArtistDisplay(track.author);
        openMenu(e.clientX, e.clientY, {
            ...track,
            author,
            channelId: '',
            navArtistChannelId: '',
            navArtistName: author
        });
    };

    const handleBulkPlayNext = (list) => {
        const songsToAdd = list.filter(t => selectedTracks.includes(t.youtubeId));
        playTracksNextInQueue(songsToAdd);
        setIsBulkMenuOpen(false);
        setSelectedTracks([]);
    };

    const handleBulkAddQueue = (list) => {
        const songsToAdd = list.filter(t => selectedTracks.includes(t.youtubeId));
        addTracksToQueueEnd(songsToAdd);
        setIsBulkMenuOpen(false);
        setSelectedTracks([]);
    };

    const getAvatarColor = (name) => {
        if (!name) return '#a855f7';
        const colors = ['#a855f7', '#f44336', '#e91e63', '#9c27b0', '#3f51b5', '#2196f3', '#00bcd4', '#009688', '#4caf50', '#ff9800', '#ff5722'];
        return colors[name.charCodeAt(0) % colors.length];
    };

    const goToArtistFromTrack = async (e, track) => {
        e.stopPropagation();
        if (!track?.author) return;
        const author = formatArtistDisplay(track.author);
        const ok = await goToArtistPage(navigate, {
            author,
            name: author,
            image: track.image
        });
        if (!ok) showToast(t('library.artistNotFound'), 'info');
    };

    const renderAuthorLink = (track) => (
        <span
            className="pv_artist_link pv_artist_link--clickable"
            onClick={(e) => goToArtistFromTrack(e, track)}
            role="link"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    goToArtistFromTrack(e, track);
                }
            }}
        >
            {track.author}
        </span>
    );

    const handleShuffleLibrary = () => {
        const pool = [...likedTracks, ...historyTracks].filter((t, i, arr) =>
            arr.findIndex((x) => x.youtubeId === t.youtubeId) === i
        );
        if (!pool.length) {
            showToast(t('library.notEnoughToShuffle'), 'warning');
            return;
        }
        const shuffled = [...pool].sort(() => Math.random() - 0.5);
        playSong(shuffled[0], shuffled, { silent: true });
        showToast(t('library.shufflePlay'), 'success');
    };

    // handleSort: сортування таблиці треків або історії — asc/desc toggle
    const handleSort = (key, tab) => {
        if (tab === 'tracks') {
            let direction = 'asc';
            if (sortConfigTracks.key === key && sortConfigTracks.direction === 'asc') direction = 'desc';
            setSortConfigTracks({ key, direction });
        } else {
            let direction = 'asc';
            if (sortConfigHistory.key === key && sortConfigHistory.direction === 'asc') direction = 'desc';
            setSortConfigHistory({ key, direction });
        }
    };

    const sortData = (data, config) => {
        if (!config.key) return data;
        return [...data].sort((a, b) => {
            let aVal = a[config.key] || '';
            let bVal = b[config.key] || '';

            if (config.key === 'addedAt' || config.key === 'playedAt') {
                aVal = new Date(aVal).getTime();
                bVal = new Date(bVal).getTime();
            } else if (config.key === 'duration') {
                aVal = Number(aVal);
                bVal = Number(bVal);
            } else {
                aVal = aVal.toString().toLowerCase();
                bVal = bVal.toString().toLowerCase();
            }

            if (aVal < bVal) return config.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return config.direction === 'asc' ? 1 : -1;
            return 0;
        });
    };

    const renderSortIcon = (key, config) => {
        if (config.key !== key) return null;
        return config.direction === 'asc' ? ' ↑' : ' ↓';
    };

    const filteredTracks = likedTracks.filter(track => {
        const q = searchQuery.toLowerCase();
        return (track.title || '').toLowerCase().includes(q) || (track.author || '').toLowerCase().includes(q);
    });
    const sortedTracks = sortData(filteredTracks, sortConfigTracks);
    const visibleTracks = showAllTracks ? sortedTracks : sortedTracks.slice(0, 30);

    const filteredHistoryTracks = historyTracks.filter(track => {
        const q = historySearchQuery.toLowerCase();
        return (track.title || '').toLowerCase().includes(q) || (track.author || '').toLowerCase().includes(q);
    });
    const sortedHistory = sortData(filteredHistoryTracks, sortConfigHistory);
    const visibleHistory = showAllHistory ? sortedHistory : sortedHistory.slice(0, 30);

    const filteredPlaylists = (myPlaylists || []).filter(pl =>
        (pl.name || '').toLowerCase().includes(playlistSearchQuery.toLowerCase())
    );

    const filteredArtists = subscribedArtists.filter((artist) =>
        (artist.name || '').toLowerCase().includes(artistSearchQuery.toLowerCase())
    );

    const findArtistCard = (
        <div
            className="channel artist_card artist_add_card"
            style={{ '--card-size': '130px', flexShrink: 0 }}
            onClick={() => setDiscoverOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setDiscoverOpen(true);
                }
            }}
        >
            <div className="artist_add_circle" aria-hidden="true">
                +
            </div>
            <div className="channel_name artist_add_label">{t('library.findArtist')}</div>
        </div>
    );

    const checkboxStyle = { width: '16px', height: '16px', minWidth: '16px', cursor: 'pointer', margin: 0, flexShrink: 0 };

    return (
        <div className="favorites-page" onClick={() => setIsBulkMenuOpen(false)}>

            <div className="fav_header_block">
                <div className="fav_header_identity">
                    <div
                        className="fav_user_avatar"
                        style={{
                            backgroundColor:
                                user.avatar && user.avatar !== 'images/user-template.png'
                                    ? 'transparent'
                                    : getAvatarColor(user.displayName),
                            backgroundImage:
                                user.avatar && user.avatar !== 'images/user-template.png'
                                    ? `url(${user.avatar})`
                                    : 'none',
                            backgroundSize: 'cover',
                            backgroundPosition: 'center'
                        }}
                    >
                        {(!user.avatar || user.avatar === 'images/user-template.png') &&
                            user.displayName?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h1>{t('library.pageTitle')}</h1>
                        <div className="fav_stats">
                            {t('library.stats', {
                                liked: likedTracks.length,
                                artists: subscribedArtists.length,
                                playlists: myPlaylists?.length || 0
                            })}
                        </div>
                    </div>
                </div>
                <button type="button" className="btn_shuffle_music" onClick={handleShuffleLibrary}>
                    {t('library.shuffleMusic')}
                </button>
            </div>

            <div className="fav_tabs">
                <button className={`fav_tab ${activeTab === "best" ? "active" : ""}`} onClick={() => setActiveTab("best")}>{t("library.best")}</button>
                <button className={`fav_tab ${activeTab === "tracks" ? "active" : ""}`} onClick={() => setActiveTab("tracks")}>{t("library.tracks")}</button>
                <button className={`fav_tab ${activeTab === "playlists" ? "active" : ""}`} onClick={() => setActiveTab("playlists")}>{t("library.playlists")}</button>
                <button className={`fav_tab ${activeTab === "artists" ? "active" : ""}`} onClick={() => setActiveTab("artists")}>{t("library.artists")}</button>
                <button className={`fav_tab ${activeTab === "history" ? "active" : ""}`} onClick={() => setActiveTab("history")}>{t("library.history")}</button>
            </div>

            {activeTab === "best" && (
                <div className="artist_full_tab">
                    <section className="section">
                        <div className="section_header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ fontSize: "24px", fontWeight: 700, margin: 0 }}>{t('library.playlists')}</h2>
                            <div className="arrows" style={{ display: 'flex', gap: '8px' }}>
                                <button className="scroll_btn prev" style={{ cursor: 'pointer' }} onClick={() => scrollList(bestPlaylistsRef, 'left')}>‹</button>
                                <button className="scroll_btn next" style={{ cursor: 'pointer' }} onClick={() => scrollList(bestPlaylistsRef, 'right')}>›</button>
                            </div>
                        </div>

                        <div className="horizontal_list" ref={bestPlaylistsRef} style={{ display: 'flex', gap: '20px', overflowX: 'auto', paddingBottom: '10px' }}>
                            <div className="card playlist_card" onClick={() => openCreateModal()} style={{ cursor: 'pointer', flexShrink: 0 }}>
                                <div className="playlist_cover_container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#181818', border: '1px dashed #555', width: '100%', height: '175px', borderRadius: '6px' }}>
                                    <span style={{ fontSize: '48px', color: '#a855f7', fontWeight: 300 }}>+</span>
                                </div>
                                <div className="card_title" style={{ marginTop: '12px' }}>{t('library.createPlaylist')}</div>
                            </div>
                            {myPlaylists && myPlaylists.map(playlist => (
                                <PlaylistCard key={playlist.id} playlist={playlist} />
                            ))}
                        </div>
                    </section>

                    <section className="section" style={{ marginTop: "40px" }}>
                        <div className="section_header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ fontSize: "24px", fontWeight: 700, margin: 0 }}>{t('library.artistsCount', { n: subscribedArtists.length })}</h2>
                            <div className="arrows" style={{ display: 'flex', gap: '8px' }}>
                                <button className="scroll_btn prev" style={{ cursor: 'pointer' }} onClick={() => scrollList(bestArtistsRef, 'left')}>‹</button>
                                <button className="scroll_btn next" style={{ cursor: 'pointer' }} onClick={() => scrollList(bestArtistsRef, 'right')}>›</button>
                            </div>
                        </div>

                        <div className="channels" ref={bestArtistsRef} style={{ display: 'flex', gap: '24px', overflowX: 'auto', paddingBottom: '8px', alignItems: 'flex-start' }}>
                            {findArtistCard}
                            {subscribedArtists.map((artist) => (
                                <ArtistCard key={artist.channelId} artist={artist} size={130} />
                            ))}
                        </div>
                    </section>
                </div>
            )}

            {activeTab === "tracks" && (
                <div className="artist_full_tab">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "20px" }}>
                        <div>
                            <h2 style={{ fontSize: "24px", fontWeight: 700, margin: "0 0 16px 0" }}>{t('library.likedCount', { n: likedTracks.length })}</h2>
                            <div style={{ display: "flex", gap: 16 }}>
                                <button className="pv_play_btn" onClick={() => filteredTracks.length > 0 && playSong(filteredTracks[0], filteredTracks)}>
                                    <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24" style={{ marginLeft: '2px' }}><path d="M8 5v14l11-7z"></path></svg>
                                </button>
                            </div>
                        </div>

                        <div className="pv_search_add" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <img src={searchIcon} alt="" style={{ position: 'absolute', left: '8px', width: '24px', height: '24px', opacity: 0.6, pointerEvents: 'none', transform: 'scaleX(-1)' }} />
                            <input placeholder={t('library.searchTracks')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ padding: '8px 16px 8px 40px', background: 'transparent', border: 'none', color: '#fff', outline: 'none', fontSize: '15px' }} />
                        </div>
                    </div>

                    <div className="playlist_view_tracks">
                        <div className="pv_track_header">
                            <div className="pv_col_index">#</div>
                            <div className="sortable_th" onClick={() => handleSort('title', 'tracks')}>{t('common.tableTitle')}{renderSortIcon('title', sortConfigTracks)}</div>
                            <div className="sortable_th" onClick={() => handleSort('author', 'tracks')}>{t('common.tableArtist')}{renderSortIcon('author', sortConfigTracks)}</div>
                            <div className="sortable_th" onClick={() => handleSort('album', 'tracks')}>{t('common.tableAlbum')}{renderSortIcon('album', sortConfigTracks)}</div>
                            <div className="sortable_th" onClick={() => handleSort('addedAt', 'tracks')}>{t('common.tableAdded')}{renderSortIcon('addedAt', sortConfigTracks)}</div>
                            <div className="sortable_th" style={{ textAlign: 'center' }} onClick={() => handleSort('duration', 'tracks')}>{t('common.tableTime')}{renderSortIcon('duration', sortConfigTracks)}</div>
                            <div className="pv_col_checkbox" style={{ position: 'relative' }}>
                                {selectedTracks.length > 0 && (
                                    <>
                                        <button className="pv_action_btn" style={{ opacity: 1 }} onClick={(e) => { e.stopPropagation(); setIsBulkMenuOpen(!isBulkMenuOpen); }} title={t('common.bulkActions')}></button>
                                        {isBulkMenuOpen && (
                                            <div className="context-menu" style={{ position: 'absolute', top: '100%', right: '30px', zIndex: 100, minWidth: '220px' }}>
                                                <div className="context-menu-item" onClick={(e) => { e.stopPropagation(); handleBulkPlayNext(filteredTracks); }}>{t('contextMenu.playNextMany')}</div>
                                                <div className="context-menu-item" onClick={(e) => { e.stopPropagation(); handleBulkAddQueue(filteredTracks); }}>{t('contextMenu.addToQueue')}</div>
                                                <div className="context-menu-item" onClick={(e) => {
                                                    e.stopPropagation();
                                                    const songsToAdd = filteredTracks.filter(t => selectedTracks.includes(t.youtubeId));
                                                    openPopup(e.clientX, e.clientY, songsToAdd);
                                                    setIsBulkMenuOpen(false);
                                                }}>{t('contextMenu.addToPlaylist')}</div>
                                            </div>
                                        )}
                                    </>
                                )}
                                <input
                                    type="checkbox"
                                    className="track_checkbox"
                                    title={t('common.selectAll')}
                                    style={checkboxStyle}
                                    checked={selectedTracks.length === visibleTracks.length && visibleTracks.length > 0}
                                    onChange={(e) => {
                                        if (e.target.checked) setSelectedTracks(visibleTracks.map(t => t.youtubeId));
                                        else setSelectedTracks([]);
                                    }}
                                />
                            </div>
                        </div>

                        {visibleTracks.map((track, index) => {
                            const isPlaying = currentSong?.youtubeId === track.youtubeId;
                            const isSelected = selectedTracks.includes(track.youtubeId);

                            return (
                                <div key={track.youtubeId} className={`pv_track_row ${isSelected ? 'selected_row' : ''}`} onClick={(e) => { if (e.target.type === 'checkbox') return; playSong(track, sortedTracks); }} onContextMenu={(e) => handleTrackContextMenu(e, track)}>
                                    <div className="pv_col_index" onClick={(e) => e.stopPropagation()}>
                                        <span className="track_number" style={{ color: isPlaying ? '#a855f7' : '#b3b3b3' }}>
                                            {isPlaying ? <div className="icon play_icon" style={{ transform: 'scale(0.5)', position: 'relative', top: '3px' }}></div> : index + 1}
                                        </span>
                                        <span className="play_on_hover" onClick={() => playSong(track, sortedTracks)}>
                                            <div className="icon play_icon" style={{ transform: 'scale(0.5)', position: 'relative', top: '3px' }}></div>
                                        </span>
                                    </div>
                                    <div className="pv_col_title">
                                        <img src={track.image || fallbackImg(track.title)} className="pv_track_img" alt="cover" referrerPolicy="no-referrer" onError={(e) => onMediaError(e, track)} />
                                        <div className="pv_track_name_wrapper">
                                            <div className="pv_track_name" style={{ color: isPlaying ? '#a855f7' : '#fff' }}>{track.title}</div>
                                            <button className="pv_title_heart_btn" style={{ opacity: 1 }} onClick={(e) => { e.stopPropagation(); toggleLike(track); }}>
                                                <div className={`heart_icon_fav ${isLiked && isLiked(track.youtubeId) ? 'heart_icon_fav_active' : ''}`}></div>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="pv_col_author">{renderAuthorLink(track)}</div>
                                    <div className="pv_col_album">{track.album || 'Single'}</div>
                                    <div className="pv_col_date">{formatDate(track.addedAt || Date.now())}</div>
                                    <div className="pv_col_time"><span>{formatTime(track.duration)}</span></div>
                                    <div className="pv_col_checkbox" onClick={(e) => e.stopPropagation()}>
                                        <button className="pv_action_btn row_more_btn" onClick={(e) => handleTrackContextMenu(e, track)}></button>
                                        <input
                                            type="checkbox"
                                            className="track_checkbox"
                                            style={checkboxStyle}
                                            checked={isSelected}
                                            onChange={() => { setSelectedTracks(prev => prev.includes(track.youtubeId) ? prev.filter(id => id !== track.youtubeId) : [...prev, track.youtubeId]); }}
                                        />
                                    </div>
                                </div>
                            );
                        })}

                        {!showAllTracks && sortedTracks.length > 30 && (
                            <div style={{ textAlign: 'center', marginTop: '20px' }}>
                                <button className="btn_mix" style={{ padding: '10px 24px', cursor: 'pointer' }} onClick={() => setShowAllTracks(true)}>{t('library.showAll')}</button>
                            </div>
                        )}

                        {visibleTracks.length === 0 && (
                            <p style={{ color: '#888', padding: '40px 0', textAlign: 'center' }}>
                                {searchQuery ? t('library.noSearchResults') : t('library.noLikedTracks')}
                            </p>
                        )}
                    </div>
                </div>
            )}

            {activeTab === "playlists" && (
                <div className="artist_full_tab">
                    <section className="section">
                        <div className="section_header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px' }}>
                            <h2 style={{ fontSize: "24px", fontWeight: 700, margin: 0 }}>{t('library.playlistsCount', { n: myPlaylists ? myPlaylists.length : 0 })}</h2>
                            <div className="pv_search_add" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                <img src={searchIcon} alt="" style={{ position: 'absolute', left: '8px', width: '24px', height: '24px', opacity: 0.6, pointerEvents: 'none', transform: 'scaleX(-1)' }} />
                                <input placeholder={t('library.searchPlaylists')} value={playlistSearchQuery} onChange={(e) => setPlaylistSearchQuery(e.target.value)} style={{ padding: '8px 16px 8px 40px', background: 'transparent', border: 'none', color: '#fff', outline: 'none', fontSize: '15px' }} />
                            </div>
                        </div>

                        <div className="horizontal_list" style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', paddingBottom: '10px' }}>
                            <div className="card playlist_card" onClick={() => openCreateModal()} style={{ cursor: 'pointer', flexShrink: 0 }}>
                                <div className="playlist_cover_container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#181818', border: '1px dashed #555', width: '100%', height: '175px', borderRadius: '6px' }}>
                                    <span style={{ fontSize: '48px', color: '#a855f7', fontWeight: 300 }}>+</span>
                                </div>
                                <div className="card_title" style={{ marginTop: '12px' }}>{t('library.createPlaylist')}</div>
                            </div>
                            {filteredPlaylists.map(playlist => (
                                <PlaylistCard key={playlist.id} playlist={playlist} />
                            ))}
                            {filteredPlaylists.length === 0 && myPlaylists?.length > 0 && (
                                <p style={{ color: '#888', width: '100%', padding: '20px 0' }}>{t('library.noSearchResults')}</p>
                            )}
                        </div>
                    </section>
                </div>
            )}

            {activeTab === 'artists' && (
                <div className="artist_full_tab">
                    <div className="fav_section_head">
                        <h2 className="fav_section_title">{t('library.artistsCount', { n: subscribedArtists.length })}</h2>
                        <div className="pv_search_add fav_section_search">
                            <img src={searchIcon} alt="" className="fav_section_search_icon" />
                            <input
                                placeholder={t('library.searchArtists')}
                                value={artistSearchQuery}
                                onChange={(e) => setArtistSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="channels artists_grid">
                        {findArtistCard}
                        {filteredArtists.map((artist) => (
                            <ArtistCard key={artist.channelId} artist={artist} size={130} />
                        ))}
                    </div>

                    {filteredArtists.length === 0 && subscribedArtists.length > 0 && artistSearchQuery && (
                        <p className="artists_grid_empty">{t('library.noSearchResults')}</p>
                    )}

                </div>
            )}

            <ArtistDiscoverModal
                open={discoverOpen}
                onClose={() => setDiscoverOpen(false)}
                subscribedArtists={subscribedArtists}
                onArtistAdded={setSubscribedArtists}
            />

            {activeTab === 'history' && (
                <div className="artist_full_tab">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "20px" }}>
                        <div>
                            <h2 style={{ fontSize: "24px", fontWeight: 700, margin: "0 0 16px 0" }}>{t('library.historyTitle')}</h2>
                            <div style={{ display: "flex", gap: 16 }}>
                                <button className="pv_play_btn" onClick={() => filteredHistoryTracks.length > 0 && playSong(filteredHistoryTracks[0], filteredHistoryTracks)}>
                                    <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24" style={{ marginLeft: '2px' }}><path d="M8 5v14l11-7z"></path></svg>
                                </button>
                            </div>
                        </div>

                        <div className="pv_search_add" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <img src={searchIcon} alt="" style={{ position: 'absolute', left: '8px', width: '24px', height: '24px', opacity: 0.6, pointerEvents: 'none', transform: 'scaleX(-1)' }} />
                            <input placeholder={t('library.searchTracks')} value={historySearchQuery} onChange={(e) => setHistorySearchQuery(e.target.value)} style={{ padding: '8px 16px 8px 40px', background: 'transparent', border: 'none', color: '#fff', outline: 'none', fontSize: '15px' }} />
                        </div>
                    </div>

                    <div className="playlist_view_tracks">
                        <div className="pv_track_header">
                            <div className="pv_col_index">#</div>
                            <div className="sortable_th" onClick={() => handleSort('title', 'history')}>{t('common.tableTitle')}{renderSortIcon('title', sortConfigHistory)}</div>
                            <div className="sortable_th" onClick={() => handleSort('author', 'history')}>{t('common.tableArtist')}{renderSortIcon('author', sortConfigHistory)}</div>
                            <div className="sortable_th" onClick={() => handleSort('album', 'history')}>{t('common.tableAlbum')}{renderSortIcon('album', sortConfigHistory)}</div>
                            <div className="sortable_th" onClick={() => handleSort('playedAt', 'history')}>{t('common.tablePlayed')}{renderSortIcon('playedAt', sortConfigHistory)}</div>
                            <div className="sortable_th" style={{ textAlign: 'center' }} onClick={() => handleSort('duration', 'history')}>{t('common.tableTime')}{renderSortIcon('duration', sortConfigHistory)}</div>
                            <div className="pv_col_checkbox" style={{ position: 'relative' }}>
                                {selectedTracks.length > 0 && (
                                    <>
                                        <button className="pv_action_btn" style={{ opacity: 1 }} onClick={(e) => { e.stopPropagation(); setIsBulkMenuOpen(!isBulkMenuOpen); }} title={t('common.bulkActions')}></button>
                                        {isBulkMenuOpen && (
                                            <div className="context-menu" style={{ position: 'absolute', top: '100%', right: '30px', zIndex: 100, minWidth: '220px' }}>
                                                <div className="context-menu-item" onClick={(e) => { e.stopPropagation(); handleBulkPlayNext(filteredHistoryTracks); }}>{t('contextMenu.playNextMany')}</div>
                                                <div className="context-menu-item" onClick={(e) => { e.stopPropagation(); handleBulkAddQueue(filteredHistoryTracks); }}>{t('contextMenu.addToQueue')}</div>
                                                <div className="context-menu-item" onClick={(e) => {
                                                    e.stopPropagation();
                                                    const songsToAdd = filteredHistoryTracks.filter(t => selectedTracks.includes(t.youtubeId));
                                                    openPopup(e.clientX, e.clientY, songsToAdd);
                                                    setIsBulkMenuOpen(false);
                                                }}>{t('contextMenu.addToPlaylist')}</div>
                                            </div>
                                        )}
                                    </>
                                )}
                                <input
                                    type="checkbox"
                                    className="track_checkbox"
                                    title={t('common.selectAll')}
                                    style={checkboxStyle}
                                    checked={selectedTracks.length === visibleHistory.length && visibleHistory.length > 0}
                                    onChange={(e) => {
                                        if (e.target.checked) setSelectedTracks(visibleHistory.map(t => t.youtubeId));
                                        else setSelectedTracks([]);
                                    }}
                                />
                            </div>
                        </div>

                        {visibleHistory.length > 0 ? visibleHistory.map((track, index) => {
                            const isPlaying = currentSong?.youtubeId === track.youtubeId;
                            const isSelected = selectedTracks.includes(track.youtubeId);

                            return (
                                <div key={`${track.youtubeId}-${index}`} className={`pv_track_row ${isSelected ? 'selected_row' : ''}`} onClick={(e) => { if (e.target.type === 'checkbox') return; playSong(track, sortedHistory); }} onContextMenu={(e) => handleTrackContextMenu(e, track)}>
                                    <div className="pv_col_index" onClick={(e) => e.stopPropagation()}>
                                        <span className="track_number" style={{ color: isPlaying ? '#a855f7' : '#b3b3b3' }}>
                                            {isPlaying ? <div className="icon play_icon" style={{ transform: 'scale(0.5)', position: 'relative', top: '3px' }}></div> : index + 1}
                                        </span>
                                        <span className="play_on_hover" onClick={() => playSong(track, sortedHistory)}>
                                            <div className="icon play_icon" style={{ transform: 'scale(0.5)', position: 'relative', top: '3px' }}></div>
                                        </span>
                                    </div>
                                    <div className="pv_col_title">
                                        <img src={track.image || fallbackImg(track.title)} className="pv_track_img" alt="cover" referrerPolicy="no-referrer" onError={(e) => onMediaError(e, track)} />
                                        <div className="pv_track_name_wrapper">
                                            <div className="pv_track_name" style={{ color: isPlaying ? '#a855f7' : '#fff' }}>{track.title}</div>
                                            <button className="pv_title_heart_btn" style={{ opacity: 1 }} onClick={(e) => { e.stopPropagation(); toggleLike(track); }}>
                                                <div className={`heart_icon_fav ${isLiked && isLiked(track.youtubeId) ? 'heart_icon_fav_active' : ''}`}></div>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="pv_col_author">{renderAuthorLink(track)}</div>
                                    <div className="pv_col_album">{track.album || 'Single'}</div>
                                    <div className="pv_col_date">{formatDate(track.playedAt)}</div>
                                    <div className="pv_col_time"><span>{formatTime(track.duration)}</span></div>
                                    <div className="pv_col_checkbox" onClick={(e) => e.stopPropagation()}>
                                        <button className="pv_action_btn row_more_btn" onClick={(e) => handleTrackContextMenu(e, track)}></button>
                                        <input
                                            type="checkbox"
                                            className="track_checkbox"
                                            style={checkboxStyle}
                                            checked={isSelected}
                                            onChange={() => { setSelectedTracks(prev => prev.includes(track.youtubeId) ? prev.filter(id => id !== track.youtubeId) : [...prev, track.youtubeId]); }}
                                        />
                                    </div>
                                </div>
                            );
                        }) : (
                            <p style={{ color: '#888', marginTop: '20px', textAlign: 'center' }}>{historySearchQuery ? t('library.noSearchResults') : t('library.emptyHistory')}</p>
                        )}

                        {!showAllHistory && sortedHistory.length > 30 && (
                            <div style={{ textAlign: 'center', marginTop: '20px' }}>
                                <button className="btn_mix" style={{ padding: '10px 24px', cursor: 'pointer' }} onClick={() => setShowAllHistory(true)}>{t('library.showAll')}</button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}