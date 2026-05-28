import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../context/ToastContext';
import { usePlaylist } from '../context/PlaylistContext';
import { usePlayer } from '../context/PlayerContext';
import { useMenu } from '../context/MenuContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import searchIcon from '../assets/images/Search.png';
import { goToArtistPage } from '../utils/artistNav';
import { formatArtistDisplay } from '../utils/media';
import { useShare } from '../hooks/useShare';
import { useLocale } from '../context/LocaleContext';

// ContextMenus: глобальні контекстні меню — track, album, playlist, artist
export default function ContextMenus() {
    const { t } = useLocale();
    const { showToast } = useToast();
    const { isPopupOpen, popupPos, closePopup, myPlaylists, pendingSong, openCreateModal, openPopup } = usePlaylist();
    const { isMenuOpen, menuPos, menuType, menuData, onRemove, menuRemoveLabel, closeMenu, selectedSong } = useMenu();
    const {
        playNextInQueue, addToQueueEnd, addTracksToQueueEnd, playSong,
        isLiked, toggleLike
    } = usePlayer();
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const { shareTrack, sharePlaylist, shareAuthor } = useShare();

    const [subscribedIds, setSubscribedIds] = useState(new Set());

    const menuRef = useRef(null);
    const popupRef = useRef(null);
    const menuOpenedAtRef = useRef(0);
    const songIsLiked = isLiked && selectedSong ? isLiked(selectedSong.youtubeId) : false;

    useEffect(() => {
        if (!user) {
            setSubscribedIds(new Set());
            return;
        }
        fetch('/api/subscriptions', { credentials: 'include' })
            .then((r) => (r.ok ? r.json() : []))
            .then((list) => setSubscribedIds(new Set((list || []).map((a) => a.channelId))))
            .catch(() => setSubscribedIds(new Set()));
    }, [user, isMenuOpen]);

    useEffect(() => {
        if (isMenuOpen) menuOpenedAtRef.current = Date.now();
    }, [isMenuOpen, menuPos.x, menuPos.y]);

    useEffect(() => {
        const handleOutsideClick = (e) => {
            if (e.button === 2) return;
            if (e.target.closest('.row_more_btn, .pv_action_btn--lg')) return;
            if (isMenuOpen) {
                if (Date.now() - menuOpenedAtRef.current < 400) return;
                if (menuRef.current && !menuRef.current.contains(e.target)) closeMenu();
            }
            if (isPopupOpen && popupRef.current && !popupRef.current.contains(e.target) && !e.target.closest('.playlist_icon')) {
                closePopup();
            }
        };
        const handleGlobalHide = () => {
            if (isMenuOpen) closeMenu();
            if (isPopupOpen) closePopup();
        };
        document.addEventListener('mousedown', handleOutsideClick);
        window.addEventListener('scroll', handleGlobalHide, { passive: true });
        window.addEventListener('resize', handleGlobalHide);
        return () => {
            document.removeEventListener('mousedown', handleOutsideClick);
            window.removeEventListener('scroll', handleGlobalHide);
            window.removeEventListener('resize', handleGlobalHide);
        };
    }, [isMenuOpen, isPopupOpen, closeMenu, closePopup]);

    const handleAddToSpecificPlaylist = async (playlistId) => {
        if (!pendingSong) return;
        try {
            let res;
            if (Array.isArray(pendingSong)) {
                res = await fetch(`/api/playlists/${playlistId}/add-bulk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ tracks: pendingSong })
                });
            } else {
                res = await fetch(`/api/playlists/${playlistId}/add`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(pendingSong)
                });
            }
            if (res.ok) {
                showToast(t('contextMenu.addedToPlaylist'), 'success');
                closePopup();
            } else showToast(t('contextMenu.addError'), 'error');
        } catch (e) {
            console.error(e);
        }
    };

    const fetchAlbumTracks = async (albumId) => {
        const res = await fetch(`/api/yt-album/${albumId}`);
        if (!res.ok) return [];
        const data = await res.json();
        return data.tracks || [];
    };

    const queueTracks = (tracks, mode) => {
        if (!tracks?.length) {
            showToast(t('contextMenu.tracksNotFound'), 'error');
            return;
        }
        if (mode === 'play') {
            playSong(tracks[0], tracks);
        } else if (mode === 'next') {
            [...tracks].reverse().forEach((t) => playNextInQueue(t, { silent: true }));
            showToast(t('contextMenu.playNextBulk', { count: tracks.length }), 'success');
        } else {
            addTracksToQueueEnd(tracks);
        }
    };

    const handleSubscribeArtist = async (artist) => {
        if (!user) {
            showToast(t('contextMenu.loginRequired'), 'error');
            return;
        }
        try {
            const res = await fetch('/api/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ artist })
            });
            if (res.ok) {
                const data = await res.json();
                const ids = new Set((data.subscribedArtists || []).map((a) => a.channelId));
                setSubscribedIds(ids);
                showToast(ids.has(artist.channelId) ? t('contextMenu.subscribed') : t('contextMenu.unsubscribed'), 'success');
            }
        } catch (e) {
            console.error(e);
        }
        closeMenu();
    };

    const renderTrackMenu = () => {
        const song = menuData;
        if (!song) return null;
        return (
            <>
                <div className="context-menu-item" onClick={() => { playNextInQueue(song); closeMenu(); }}>
                    <div className="popup_icon popup_icon_next"></div><span>{t('contextMenu.playNext')}</span>
                </div>
                <div className="context-menu-item" onClick={() => { addToQueueEnd(song); closeMenu(); }}>
                    <div className="popup_icon popup_icon_queue"></div><span>{t('contextMenu.addToQueueEnd')}</span>
                </div>
                <div className="context-menu-item" onClick={() => { openPopup(menuPos.x, menuPos.y, song); closeMenu(); }}>
                    <div className="popup_icon popup_icon_playlist"></div><span>{t('contextMenu.addToPlaylist')}</span>
                </div>
                <div className="context-menu-item" onClick={() => { toggleLike(song); closeMenu(); }}>
                    <div className={`popup_icon ${songIsLiked ? 'popup_icon_like' : 'popup_icon_unlike'}`}></div>
                    <span>{songIsLiked ? t('contextMenu.removeFromLiked') : t('contextMenu.addToLiked')}</span>
                </div>
                <div
                    className="context-menu-item"
                    onClick={(e) => {
                        e.stopPropagation();
                        void shareTrack(song);
                        closeMenu();
                    }}
                >
                    <div className="popup_icon popup_icon_share" />
                    <span>{t('contextMenu.shareTrack')}</span>
                </div>
                <div
                    className="context-menu-item"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const payload = { ...song };
                        const ok = await goToArtistPage(navigate, {
                            author: payload.author,
                            channelId: payload.navArtistChannelId || payload.channelId,
                            name: payload.navArtistName || formatArtistDisplay(payload.author),
                            subs: payload.navArtistSubs,
                            image: payload.navArtistImage || payload.image
                        });
                        closeMenu();
                        if (!ok) showToast(t('library.artistNotFound'), 'info');
                    }}
                >
                    <div className="popup_icon popup_icon_author"></div><span>{t('contextMenu.goToArtist')}</span>
                </div>
                {onRemove && (
                    <div className="context-menu-item context-menu-item--danger" onClick={() => { onRemove(song); closeMenu(); }}>
                        <div className="popup_icon popup_icon_delete"></div>
                        <span>{menuRemoveLabel || t('contextMenu.removeFromPlaylist')}</span>
                    </div>
                )}
            </>
        );
    };

    const renderAlbumOrPlaylistMenu = (isSitePlaylist) => {
        const item = menuData;
        if (!item) return null;
        const browseId = item.youtubeId || item.id;

        const runWithTracks = async (mode) => {
            let tracks = item.tracks;
            if (!tracks?.length && browseId) tracks = await fetchAlbumTracks(browseId);
            queueTracks(tracks, mode);
            closeMenu();
        };

        return (
            <>
                {!isSitePlaylist && (
                    <div className="context-menu-item" onClick={() => { navigate(`/playlist/${browseId}`); closeMenu(); }}>
                        <span>{t('contextMenu.openAlbum')}</span>
                    </div>
                )}
                {isSitePlaylist && (
                    <div className="context-menu-item" onClick={() => { navigate(`/playlist/${item.id}`); closeMenu(); }}>
                        <span>{t('contextMenu.openPlaylist')}</span>
                    </div>
                )}
                <div className="context-menu-item" onClick={() => runWithTracks('play')}>
                    <div className="popup_icon popup_icon_next"></div><span>{t('contextMenu.play')}</span>
                </div>
                <div className="context-menu-item" onClick={() => runWithTracks('next')}>
                    <div className="popup_icon popup_icon_next"></div><span>{t('contextMenu.playNextMany')}</span>
                </div>
                <div className="context-menu-item" onClick={() => runWithTracks('end')}>
                    <div className="popup_icon popup_icon_queue"></div><span>{t('contextMenu.addToQueueEnd')}</span>
                </div>
                <div
                    className="context-menu-item"
                    onClick={async () => {
                        let tracks = item.tracks;
                        if (!tracks?.length && browseId) tracks = await fetchAlbumTracks(browseId);
                        if (tracks?.length) openPopup(menuPos.x, menuPos.y, tracks);
                        else showToast(t('contextMenu.noTracksToAdd'), 'error');
                        closeMenu();
                    }}
                >
                    <div className="popup_icon popup_icon_playlist"></div><span>{t('contextMenu.addToPlaylist')}</span>
                </div>
                <div
                    className="context-menu-item"
                    onClick={(e) => {
                        e.stopPropagation();
                        const plId = isSitePlaylist ? item.id : browseId;
                        void sharePlaylist(plId, item.name || item.title);
                        closeMenu();
                    }}
                >
                    <div className="popup_icon popup_icon_share" />
                    <span>{t('contextMenu.sharePlaylist')}</span>
                </div>
            </>
        );
    };

    const renderArtistMenu = () => {
        const artist = menuData;
        if (!artist?.channelId) return null;
        const isSub = subscribedIds.has(artist.channelId);
        const onSameArtistPage =
            location.pathname === `/artist/${artist.channelId}` ||
            location.pathname.startsWith(`/artist/${artist.channelId}/`);

        const openArtistTab = (tab) => {
            navigate(`/artist/${artist.channelId}`, {
                state: { name: artist.name, image: artist.image, subs: artist.subs, tab }
            });
            closeMenu();
        };

        const playLatestRelease = async () => {
            try {
                const nameQ = artist.name ? `?name=${encodeURIComponent(artist.name)}` : '';
                const res = await fetch(`/api/artist-discography/${artist.channelId}${nameQ}`);
                const data = res.ok ? await res.json() : {};
                const latest = data.latestRelease;
                if (!latest?.youtubeId) {
                    showToast(t('contextMenu.releaseNotFound'), 'info');
                    closeMenu();
                    return;
                }
                const track = {
                    youtubeId: latest.youtubeId,
                    title: latest.title,
                    author: latest.author || artist.name,
                    image: latest.image
                };
                playSong(track, [track]);
            } catch (e) {
                console.error(e);
                showToast(t('contextMenu.releaseLoadFail'), 'error');
            }
            closeMenu();
        };

        return (
            <>
                {!onSameArtistPage && (
                    <div className="context-menu-item" onClick={() => openArtistTab(null)}>
                        <div className="popup_icon popup_icon_author"></div><span>{t('contextMenu.goToArtist')}</span>
                    </div>
                )}
                <div
                    className="context-menu-item"
                    onClick={() => {
                        void shareAuthor(artist.channelId, artist.name);
                        closeMenu();
                    }}
                >
                    <div className="popup_icon popup_icon_share" />
                    <span>{t('contextMenu.shareArtist')}</span>
                </div>
                <div className="context-menu-item" onClick={() => openArtistTab('similar')}>
                    <div className="popup_icon popup_icon_author"></div><span>{t('contextMenu.similarArtists')}</span>
                </div>
                <div className="context-menu-item" onClick={playLatestRelease}>
                    <div className="popup_icon popup_icon_next"></div><span>{t('contextMenu.latestRelease')}</span>
                </div>
                <div className="context-menu-item" onClick={() => handleSubscribeArtist(artist)}>
                    <div className="popup_icon popup_icon_like"></div>
                    <span>{isSub ? t('contextMenu.unsubscribe') : t('contextMenu.subscribe')}</span>
                </div>
            </>
        );
    };

    const menuLayer = isMenuOpen && menuData ? (
        <div
            ref={menuRef}
            className="context-menu context-menu--fixed"
            style={{ top: `${menuPos.y}px`, left: `${menuPos.x}px` }}
        >
            {menuType === 'track' && renderTrackMenu()}
            {menuType === 'album' && renderAlbumOrPlaylistMenu(false)}
            {menuType === 'playlist' && renderAlbumOrPlaylistMenu(true)}
            {menuType === 'artist' && renderArtistMenu()}
        </div>
    ) : null;

    const popupLayer = isPopupOpen && pendingSong ? (
        <div
            ref={popupRef}
            className="playlist_popup context-menu--fixed"
            style={{ top: `${popupPos.y}px`, left: `${popupPos.x}px` }}
        >
            <div className="playlist_modal_content">
                <div className="playlist_modal_header">
                    <button type="button" className="btn_back" onClick={closePopup}><span className="back_arrow">‹</span> {t('contextMenu.back')}</button>
                </div>
                <div className="playlist_modal_body">
                    <div className="playlist_search_container">
                        <span className="search_icon_small"><img src={searchIcon} alt="" /></span>
                        <input type="text" placeholder={t('contextMenu.searchPlaylist')} />
                    </div>
                    <div className="add_new_playlist_btn" onClick={() => openCreateModal(pendingSong)}>
                        <span className="plus_icon">+</span>
                        <span className="purple_text">{t('contextMenu.newPlaylist')}</span>
                    </div>
                    <div className="playlists_list">
                        {myPlaylists.map((pl) => (
                            <div key={pl.id} className="playlist_list_item" onClick={() => handleAddToSpecificPlaylist(pl.id)}>{pl.name}</div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    ) : null;

    return (
        <>
            {typeof document !== 'undefined' && menuLayer ? createPortal(menuLayer, document.body) : menuLayer}
            {typeof document !== 'undefined' && popupLayer ? createPortal(popupLayer, document.body) : popupLayer}
        </>
    );
}
