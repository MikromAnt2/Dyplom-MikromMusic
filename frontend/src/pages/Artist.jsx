import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import { formatListeners } from '../utils/media';
import { usePlayer } from '../context/PlayerContext';
import { useMenu } from '../context/MenuContext';
import { usePlaylist } from '../context/PlaylistContext';
import BackButton from '../components/BackButton';
import ShareLinkButton from '../components/ShareLinkButton';
import { useShare } from '../hooks/useShare';
import { useLocale } from '../context/LocaleContext';

// Artist: сторінка виконавця — дискографія, підписка, схожі
export default function Artist() {
    const { id } = useParams();
    const { t, locale } = useLocale();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const location = useLocation();
    const passedSubs = location.state?.subs || null;
    const passedName = location.state?.name || null;
    const passedImage = location.state?.image || null;
    const passedTab = location.state?.tab || null;

    const isUcArtistId = (cid) => typeof cid === 'string' && /^UC[\w-]{10,}$/i.test(cid.trim());

    const { openMenu, openAlbumMenu, openArtistMenu } = useMenu();
    const { shareAuthor } = useShare();
    const { openPopup } = usePlaylist();
    const { playSong, currentSong, toggleLike, isLiked, playTracksNextInQueue, addTracksToQueueEnd } = usePlayer();
    const [isSubscribed, setIsSubscribed] = useState(false);

    const [artist, setArtist] = useState(() =>
        passedName ? { name: passedName, image: passedImage || '', channelId: id, subs: passedSubs || '' } : null
    );
    const [loadError, setLoadError] = useState(null);
    const [topTracks, setTopTracks] = useState([]);
    const [discography, setDiscography] = useState({ albums: [], eps: [], singles: [] });

    const [likedTracks, setLikedTracks] = useState([]);
    const [searchTop, setSearchTop] = useState('');
    const [searchFav, setSearchFav] = useState('');

    const [activeTab, setActiveTab] = useState(
        passedTab && ['discography', 'top', 'fav', 'similar'].includes(passedTab) ? passedTab : 'discography'
    );

    useEffect(() => {
        if (passedTab && ['discography', 'top', 'fav', 'similar'].includes(passedTab)) {
            setActiveTab(passedTab);
        }
    }, [passedTab, id]);
    const [isLoading, setIsLoading] = useState(true);

    const [selectedTracks, setSelectedTracks] = useState([]);
    const [isBulkMenuOpen, setIsBulkMenuOpen] = useState(false);
    const [sortConfigTop, setSortConfigTop] = useState({ key: null, direction: 'asc' });
    const [sortConfigFav, setSortConfigFav] = useState({ key: null, direction: 'asc' });

    const [nextPageToken, setNextPageToken] = useState(null);
    const [isMoreLoading, setIsMoreLoading] = useState(false);
    const observer = useRef();

    useEffect(() => {
        setArtist(passedName ? { name: passedName, image: passedImage || '', channelId: id, subs: passedSubs || '' } : null);
        setLoadError(null);
        setTopTracks([]);
        setDiscography({ albums: [], eps: [], singles: [] });
        setNextPageToken(null);
    }, [id, passedName, passedImage, passedSubs]);

    useEffect(() => {
        setSelectedTracks([]);
        setIsBulkMenuOpen(false);
    }, [activeTab]);

    // formatViews: скорочення переглядів (K/M)
    const formatViews = (views) => {
        if (!views) return '0';
        if (views >= 1000000) return (views / 1000000).toFixed(1).replace('.0', '') + 'M';
        if (views >= 1000) return (views / 1000).toFixed(0) + 'K';
        return views;
    };

    const formatTime = (seconds) => {
        if (!seconds) return "--:--";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const formatReleaseLabel = (item, sectionKind) => {
        if (sectionKind === 'album') return t('common.album');
        if (sectionKind === 'single') return t('common.single');
        const rt = String(item?.releaseType || '').toLowerCase();
        if (rt.includes('альбом') || rt === 'album' || rt.includes('міні') || rt.includes('mini')) {
            return t('common.album');
        }
        if (rt.includes('сингл') || rt === 'single') return t('common.single');
        return item?.releaseType || t('common.single');
    };

    const formatTrackAlbum = (track) => {
        const name = String(track?.album || '').trim();
        if (!name || /^single$/i.test(name) || /^сингл$/i.test(name)) return t('common.single');
        return name;
    };

    const handleSortTop = (key) => {
        let direction = 'asc';
        if (sortConfigTop.key === key && sortConfigTop.direction === 'asc') direction = 'desc';
        setSortConfigTop({ key, direction });
    };

    const handleSortFav = (key) => {
        let direction = 'asc';
        if (sortConfigFav.key === key && sortConfigFav.direction === 'asc') direction = 'desc';
        setSortConfigFav({ key, direction });
    };

    const sortTracks = (data, config) => {
        if (!config.key) return data;
        return [...data].sort((a, b) => {
            let aVal;
            let bVal;
            if (config.key === 'views') {
                aVal = Number(a.views) || 0;
                bVal = Number(b.views) || 0;
            } else if (config.key === 'duration') {
                aVal = Number(a.duration) || 0;
                bVal = Number(b.duration) || 0;
            } else if (config.key === 'addedAt') {
                aVal = new Date(a.addedAt || 0).getTime();
                bVal = new Date(b.addedAt || 0).getTime();
            } else {
                aVal = String(a[config.key] || '').toLowerCase();
                bVal = String(b[config.key] || '').toLowerCase();
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

    const fallbackImg = (title, size = 300) =>
        `https://ui-avatars.com/api/?name=${encodeURIComponent(title || 'Music')}&background=181818&color=fff&size=${size}`;

    const onImgError = (e, title, size = 300) => {
        e.target.onerror = null;
        e.target.src = fallbackImg(title, size);
    };

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;

        const fetchWithTimeout = async (url, options = {}, timeoutMs = 15000) => {
            const inner = new AbortController();
            const t = setTimeout(() => inner.abort(), timeoutMs);
            const abortOuter = () => inner.abort();
            try {
                if (signal) signal.addEventListener('abort', abortOuter, { once: true });
                return await fetch(url, { ...options, signal: inner.signal });
            } finally {
                clearTimeout(t);
                if (signal) signal.removeEventListener('abort', abortOuter);
            }
        };

        const fetchArtistData = async () => {
            setIsLoading(true);
            setLoadError(null);
            window.dispatchEvent(
                new CustomEvent('start-global-loader', {
                    detail: {
                        phrases: [
                            t('artist.loadingPage'),
                            t('artist.loadingDiscography'),
                            t('artist.loadingTop')
                        ]
                    }
                })
            );
            try {
                const nameQ = passedName ? `?name=${encodeURIComponent(passedName)}` : '';

                const resChannel = await fetchWithTimeout(`/api/channels/${id}${nameQ}`, {}, 15000);
                let tracksChannelId = isUcArtistId(id) ? id : null;

                if (resChannel?.ok) {
                    const artistData = await resChannel.json();
                    const resolvedId = artistData?.channelId;
                    if (resolvedId && resolvedId !== id && isUcArtistId(resolvedId)) {
                        navigate(`/artist/${resolvedId}`, {
                            replace: true,
                            state: {
                                subs: artistData.subs,
                                name: artistData.name || passedName,
                                image: artistData.image || passedImage
                            }
                        });
                        return;
                    }
                    let subs = artistData.subs || passedSubs || '';
                    if (!subs && artistData.name) {
                        try {
                            const lookup = await fetchWithTimeout(
                                `/api/channels?q=${encodeURIComponent(artistData.name)}`,
                                {},
                                8000
                            );
                            if (lookup.ok) {
                                const list = await lookup.json();
                                const hit =
                                    (list || []).find((a) => a.channelId === artistData.channelId) ||
                                    (list || [])[0];
                                if (hit?.subs) subs = hit.subs;
                            }
                        } catch (_) {
                        }
                    }
                    setArtist({
                        ...artistData,
                        subs
                    });
                    if (isUcArtistId(resolvedId)) tracksChannelId = resolvedId;
                } else if (resChannel?.status === 404) {
                    setLoadError(t('artist.notFound'));
                } else if (!passedName) {
                    setLoadError(t('artist.loadFailed'));
                }

                const tracksUrl = tracksChannelId
                    ? `/api/search/infiniteTracks?channelId=${tracksChannelId}`
                    : null;

                const [resTracks, resDisco, resLiked, resSubs] = await Promise.all([
                    tracksUrl ? fetchWithTimeout(tracksUrl, {}, 15000) : Promise.resolve(null),
                    fetchWithTimeout(`/api/artist-discography/${id}${nameQ}`, {}, 25000),
                    fetchWithTimeout('/api/songs/liked', { credentials: 'include' }, 15000),
                    fetchWithTimeout('/api/subscriptions', { credentials: 'include' }, 15000)
                ]);

                if (resTracks?.ok) {
                    const trackData = await resTracks.json();
                    setTopTracks(trackData.items || []);
                    setNextPageToken(trackData.nextPageToken || null);
                }

                if (resDisco?.ok) {
                    const discoData = await resDisco.json();
                    setDiscography({
                        albums: discoData.albums || [],
                        eps: discoData.eps || [],
                        singles: discoData.singles || [],
                        similar: discoData.similar || [],
                        latestRelease: discoData.latestRelease || null
                    });
                }

                if (resLiked?.ok) setLikedTracks(await resLiked.json());

                if (resSubs?.ok) {
                    const subs = await resSubs.json();
                    setIsSubscribed(subs.some(sub => sub.channelId === id));
                }
            } catch (err) {
                if (err?.name !== 'AbortError') console.error(err);
            } finally {
                setIsLoading(false);
                window.dispatchEvent(new Event('stop-global-loader'));
            }
        };
        fetchArtistData();
        return () => {
            controller.abort();
            window.dispatchEvent(new Event('stop-global-loader'));
        };
    }, [id, navigate, passedSubs, passedName, passedImage]);

    // loadMoreTracks: infinite scroll топ-треків артиста
    const loadMoreTracks = async () => {
        if (isMoreLoading || !nextPageToken) return;
        setIsMoreLoading(true);
        try {
            const channelForTracks = isUcArtistId(artist?.channelId) ? artist.channelId : (isUcArtistId(id) ? id : null);
            if (!channelForTracks) return;
            const res = await fetch(`/api/search/infiniteTracks?channelId=${channelForTracks}&pageToken=${nextPageToken}`);
            if (res.ok) {
                const data = await res.json();
                setTopTracks(prev => {
                    const newTracks = (data.items || []).filter(n => !prev.some(p => p.youtubeId === n.youtubeId));
                    return [...prev, ...newTracks];
                });
                setNextPageToken(data.nextPageToken || null);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsMoreLoading(false);
        }
    };

    const loadingRef = useCallback(node => {
        if (isMoreLoading) return;
        if (observer.current) observer.current.disconnect();

        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && nextPageToken) {
                loadMoreTracks();
            }
        });

        if (node) observer.current.observe(node);
    }, [isMoreLoading, nextPageToken]);

    const handleSubscribe = async () => {
        if (!artist) return;
        try {
            const res = await fetch('/api/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ artist: { channelId: artist.channelId, name: artist.name, image: artist.image, subs: passedSubs || artist.subs } })
            });
            if (res.ok) {
                const data = await res.json();
                const nowSubscribed = data.subscribedArtists.some((sub) => sub.channelId === artist.channelId);
                setIsSubscribed(nowSubscribed);
                showToast(
                    nowSubscribed ? t('artist.subscribed', { name: artist.name }) : t('artist.unsubscribed', { name: artist.name }),
                    'success'
                );
            } else showToast(t('artist.subscribeFail'), 'error');
        } catch (e) {
            console.error(e);
            showToast(t('common.connectionError'), 'error');
        }
    };

    if (isLoading) return null;
    if (!artist && loadError) {
        return (
            <div className="page_message">
                <p>{loadError}</p>
                <BackButton />
            </div>
        );
    }
    if (!artist) return <div className="page_message">{t('artist.pageNotFound')}</div>;

    const filteredTopTracks = topTracks.filter(t => t.title.toLowerCase().includes(searchTop.toLowerCase()));
    const sortedTopTracks = sortTracks(filteredTopTracks, sortConfigTop);
    const artistLikedTracks = likedTracks.filter(t => t.author === artist.name);
    const filteredFavTracks = artistLikedTracks.filter(t => t.title.toLowerCase().includes(searchFav.toLowerCase()));
    const sortedFavTracks = sortTracks(filteredFavTracks, sortConfigFav);

    const handleTrackContextMenu = (e, track) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = e.currentTarget?.getBoundingClientRect?.();
        const x = e.clientX || (rect ? rect.left : 0);
        const y = e.clientY || (rect ? rect.bottom + 4 : 0);
        openMenu(x, y, {
            ...track,
            channelId: track.channelId || artist?.channelId,
            navArtistChannelId: artist?.channelId,
            navArtistName: artist?.name,
            navArtistImage: artist?.image,
            navArtistSubs: artist?.subs
        });
    };

    const handleArtistHeaderMenu = (e) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        openArtistMenu(rect.left, rect.bottom + 4, {
            channelId: artist.channelId,
            name: artist.name,
            image: artist.image,
            subs: artist.subs
        });
    };

    const handleBulkPlayNext = (list) => {
        const songsToAdd = list.filter((t) => selectedTracks.includes(t.youtubeId));
        playTracksNextInQueue(songsToAdd);
        setIsBulkMenuOpen(false);
        setSelectedTracks([]);
    };

    const handleBulkAddQueue = (list) => {
        const songsToAdd = list.filter((t) => selectedTracks.includes(t.youtubeId));
        addTracksToQueueEnd(songsToAdd);
        setIsBulkMenuOpen(false);
        setSelectedTracks([]);
    };

    const handleBulkLike = (list) => {
        const songsToLike = list.filter((t) => selectedTracks.includes(t.youtubeId));
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

    const handleAlbumContextMenu = (e, item) => {
        e.preventDefault();
        e.stopPropagation();
        openAlbumMenu(e.clientX, e.clientY, { ...item, author: artist?.name || item.author });
    };

    const handleSimilarArtistContextMenu = (e, sim) => {
        e.preventDefault();
        e.stopPropagation();
        openArtistMenu(e.clientX, e.clientY, {
            channelId: sim.channelId,
            name: sim.name,
            image: sim.image,
            subs: sim.subs
        });
    };

    const renderReleaseGrid = (title, items, sectionKind) => {
        if (!items || items.length === 0) return null;
        return (
            <div className="section_block section_block--full">
                <div className="section_divider_header">
                    <h3 className="block_title block_title--lg">{title}</h3>
                </div>
                <div className="horizontal_list horizontal_list--wrap">
                    {items.map((item, i) => (
                        <div
                            className="card playlist_card"
                            key={item.youtubeId + i}
                            onClick={() => item.type === 'video' ? playSong(item, items) : navigate(`/playlist/${item.youtubeId}`)}
                            onContextMenu={(e) => handleAlbumContextMenu(e, item)}
                        >
                            <div className="playlist_cover_container">
                                <img
                                    className="playlist_cover_single"
                                    src={item.image || fallbackImg(item.title, 300)}
                                    alt="album cover"
                                    loading="lazy"
                                    decoding="async"
                                    referrerPolicy="no-referrer"
                                    onError={(e) => onImgError(e, item.title, 300)}
                                />
                                <div className="pv_track_play_overlay">▶</div>
                            </div>
                            <div className="card_title">{item.title?.length > 25 ? `${item.title.substring(0, 25)}…` : item.title}</div>
                            <div className="card_sub">{artist?.name || ''}</div>
                            <div className="card_sub card_sub--type">
                                {formatReleaseLabel(item, sectionKind)}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="artist_page" onClick={() => setIsBulkMenuOpen(false)}>
            <BackButton />
            <div className="artist_header">
                <img
                    src={artist.image}
                    alt={artist.name}
                    className="artist_avatar"
                    referrerPolicy="no-referrer"
                    onError={(e) => onImgError(e, artist.name, 220)}
                />
                <div className="artist_info">
                    <h1>{artist.name}</h1>
                    <div className="artist_subs_count">
                        {formatListeners(artist?.subs, locale) ||
                            (typeof artist?.subs === 'string' && artist.subs.trim()) ||
                            formatListeners(passedSubs, locale) ||
                            ''}
                    </div>
                    <div className="artist_actions" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="btn_mix" onClick={() => topTracks.length && playSong(topTracks[0], topTracks)}>
                            <div className="icon play_icon play_icon--sm"></div>
                            Mix
                        </button>
                        <button type="button" className="pv_title_heart_btn pv_title_heart_btn--show pv_title_heart_btn--spaced" onClick={handleSubscribe}>
                            <div className={`heart_icon_fav ${isSubscribed ? 'heart_icon_fav_active' : ''}`}></div>
                        </button>
                        <ShareLinkButton
                            className="pv_action_btn share_link_btn"
                            title={t('artist.sharePage')}
                            onClick={() => void shareAuthor(artist.channelId, artist.name)}
                        />
                        <button
                            type="button"
                            className="pv_action_btn pv_action_btn--lg"
                            title={t('common.more')}
                            onClick={handleArtistHeaderMenu}
                        />
                    </div>
                </div>
            </div>

            <div className="artist_tabs">
                <div className={`artist_tab ${activeTab === 'discography' ? 'active' : ''}`} onClick={() => setActiveTab('discography')}>{t('artist.tabDiscography')}</div>
                <div className={`artist_tab ${activeTab === 'top' ? 'active' : ''}`} onClick={() => setActiveTab('top')}>{t('artist.tabTop')}</div>
                <div className={`artist_tab ${activeTab === 'fav' ? 'active' : ''}`} onClick={() => setActiveTab('fav')}>{t('artist.tabFav')}</div>
                <div className={`artist_tab ${activeTab === 'similar' ? 'active' : ''}`} onClick={() => setActiveTab('similar')}>{t('artist.tabSimilar')}</div>
            </div>

            {activeTab === 'discography' && (
                <>
                    <div className="artist_layout">
                        <div className="artist_main">
                            <div className="section_block">
                                <h3 className="block_title">{t('artist.topPopular')} <button className="btn_view_all" onClick={() => setActiveTab('top')}>{t('artist.viewAll')}</button></h3>
                                <div className="top_tracks_list">
                                    {topTracks.slice(0, 5).map((track, index) => {
                                        const isPlaying = currentSong?.youtubeId === track.youtubeId;
                                        return (
                                            <div
                                                className={`top_track_row${isPlaying ? ' is-playing' : ''}`}
                                                key={track.youtubeId}
                                                onClick={() => playSong(track, topTracks)}
                                                onContextMenu={(e) => handleTrackContextMenu(e, track)}
                                            >
                                                <div className="tt_index">
                                                    {isPlaying ? '▶' : `${index + 1}.`}
                                                </div>
                                                <img
                                                    src={track.image || fallbackImg(track.title)}
                                                    alt="cover"
                                                    className="tt_img"
                                                    referrerPolicy="no-referrer"
                                                    loading="lazy"
                                                    onError={(e) => onImgError(e, track.title)}
                                                />
                                                <div className="tt_title">{track.title}</div>
                                                <div className="tt_views">
                                                    {formatViews(track.views)}
                                                </div>
                                                <div className="tt_actions" onClick={e => e.stopPropagation()}>
                                                    <button className="pv_title_heart_btn pv_title_heart_btn--show" onClick={(e) => { e.stopPropagation(); toggleLike(track); }}>
                                                        <div className={`heart_icon_fav ${isLiked && isLiked(track.youtubeId) ? 'heart_icon_fav_active' : ''}`}></div>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="pv_action_btn row_more_btn"
                                                        title={t('common.menu')}
                                                        onClick={(e) => handleTrackContextMenu(e, track)}
                                                    />
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            <div className="section_block section_block--gap-top">
                                <h3 className="block_title block_title--gap">{t('artist.latestRelease')}</h3>
                                {discography.latestRelease ? (
                                    <div className="latest_release_card"
                                         onClick={() => {
                                             if (discography.latestRelease.type === 'video') {
                                                 playSong(discography.latestRelease, [discography.latestRelease]);
                                             } else {
                                                 navigate(`/playlist/${discography.latestRelease.youtubeId}`);
                                             }
                                         }}
                                         onContextMenu={(e) => handleAlbumContextMenu(e, {
                                             ...discography.latestRelease,
                                             releaseType: discography.latestRelease.type === 'playlist' ? t('common.album') : t('common.single')
                                         })}
                                    >
                                        <img
                                            src={discography.latestRelease.image || fallbackImg(discography.latestRelease.title, 260)}
                                            alt={discography.latestRelease.title}
                                            className="lr_thumb"
                                            referrerPolicy="no-referrer"
                                            onError={(e) => onImgError(e, discography.latestRelease.title, 260)}
                                        />
                                        <div className="lr_info lr_info--center">
                                            <div className="lr_date">
                                                {new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}
                                            </div>
                                            <div className="lr_title">{discography.latestRelease.title}</div>
                                            <div className="lr_type">
                                                {discography.latestRelease.type === 'playlist' ? t('common.album') : t('common.single')}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text_empty_hint">{t('artist.noInfo')}</div>
                                )}
                            </div>
                        </div>

                        <div className="artist_side">
                            <div className="artist_side_link" onClick={() => setActiveTab('fav')}>
                                <h3 className="block_title block_title--sm">{t('artist.inYourLikes')}</h3>
                                <div className="fav_widget fav_widget--sidebar">
                                    <div className="fav_widget_icon fav_widget_icon--round">
                                        <div className="heart_icon_fav heart_icon_fav_active"></div>
                                    </div>
                                    <div>
                                        <div className="fav_widget_title">{t('artist.likedWidget')}</div>
                                        <div className="fav_widget_count">{t('artist.savedCount', { n: artistLikedTracks.length })}</div>
                                    </div>
                                </div>
                            </div>

                            <div className="similar_artists_sidebar_block">
                                <h3 className="block_title block_title--row">
                                    {t('artist.similarTitle')}
                                    <span className="link_more" onClick={() => setActiveTab('similar')}>&gt;</span>
                                </h3>

                                <div className="similar_artists_list similar_artists_list--compact">
                                    {discography.similar && discography.similar.slice(0, 5).map((sim) => (
                                        <div
                                            className="sa_row sa_row--compact"
                                            key={sim.channelId}
                                            onClick={() => navigate(`/artist/${sim.channelId}`, { state: { subs: sim.subs, name: sim.name, image: sim.image } })}
                                            onContextMenu={(e) => handleSimilarArtistContextMenu(e, sim)}
                                        >
                                            <img
                                                src={sim.image || fallbackImg(sim.name, 128)}
                                                alt={sim.name}
                                                className="sa_avatar--sm"
                                                referrerPolicy="no-referrer"
                                                loading="lazy"
                                                decoding="async"
                                                onError={(e) => onImgError(e, sim.name, 128)}
                                            />
                                            <div className="sa_info sa_info--clip">
                                                <div className="sa_name">{sim.name}</div>
                                                <div className="sa_subs">
                                                    {formatListeners(sim.subs, locale) || sim.subs}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="artist_discography_wrap">
                        {renderReleaseGrid(t('artist.albums'), discography.albums, 'album')}
                        {renderReleaseGrid(t('artist.singles'), discography.singles, 'single')}
                    </div>
                </>
            )}

            {activeTab === 'top' && (
                <div className="artist_full_tab">
                    <div className="tab_header_flex">
                        <h2>{t('artist.topPopular')}</h2>
                        <div className="pv_search_add pv_search_add--icon">
                            <img src="/src/assets/images/Search.png" alt="Search" className="search_icon_in_field" />
                            <input placeholder={t('library.searchTracks')} value={searchTop} onChange={(e) => setSearchTop(e.target.value)} />
                        </div>
                    </div>

                    <div className="playlist_view_tracks">
                        <div className="pv_track_header">
                            <div className="pv_col_index">#</div>
                            <div className="sortable_th" onClick={() => handleSortTop('title')}>{t('common.tableTitle')}{renderSortIcon('title', sortConfigTop)}</div>
                            <div className="sortable_th" onClick={() => handleSortTop('author')}>{t('common.tableAuthor')}{renderSortIcon('author', sortConfigTop)}</div>
                            <div className="sortable_th" onClick={() => handleSortTop('album')}>{t('common.tableAlbum')}{renderSortIcon('album', sortConfigTop)}</div>
                            <div className="sortable_th" onClick={() => handleSortTop('views')}>{t('common.tableViews')}{renderSortIcon('views', sortConfigTop)}</div>
                            <div className="sortable_th col_time_center" onClick={() => handleSortTop('duration')}>{t('common.tableTime')}{renderSortIcon('duration', sortConfigTop)}</div>
                            <div className="pv_col_checkbox pv_col_checkbox--rel">
                                {selectedTracks.length > 0 && (
                                    <>
                                        <button className="pv_action_btn pv_action_btn--show" onClick={(e) => { e.stopPropagation(); setIsBulkMenuOpen(!isBulkMenuOpen); }} title={t('common.bulkActions')}></button>
                                        {isBulkMenuOpen && (
                                            <div className="context-menu context-menu--bulk">
                                                <div className="context-menu-item" onClick={(e) => { e.stopPropagation(); handleBulkPlayNext(sortedTopTracks); }}>{t('contextMenu.playNextMany')}</div>
                                                <div className="context-menu-item" onClick={(e) => { e.stopPropagation(); handleBulkAddQueue(sortedTopTracks); }}>{t('contextMenu.addToQueue')}</div>
                                                <div className="context-menu-item" onClick={(e) => {
                                                    e.stopPropagation();
                                                    const songsToAdd = sortedTopTracks.filter(t => selectedTracks.includes(t.youtubeId));
                                                    openPopup(e.clientX, e.clientY, songsToAdd);
                                                    setIsBulkMenuOpen(false);
                                                }}>{t('contextMenu.addToPlaylist')}</div>
                                                <div className="context-menu-item" onClick={(e) => { e.stopPropagation(); handleBulkLike(filteredTopTracks); }}>{t('artist.addToLiked')}</div>
                                            </div>
                                        )}
                                    </>
                                )}
                                <input
                                    type="checkbox"
                                    className="track_checkbox"
                                    title={t('common.selectAll')}
                                    checked={selectedTracks.length === sortedTopTracks.length && sortedTopTracks.length > 0}
                                    onChange={(e) => {
                                        if (e.target.checked) setSelectedTracks(sortedTopTracks.map(t => t.youtubeId));
                                        else setSelectedTracks([]);
                                    }}
                                />
                            </div>
                        </div>

                        {sortedTopTracks.map((track, index) => {
                            const isPlaying = currentSong?.youtubeId === track.youtubeId;
                            const isSelected = selectedTracks.includes(track.youtubeId);

                            return (
                                <div
                                    key={track.youtubeId}
                                    className={`pv_track_row${isPlaying ? ' is-playing' : ''}${isSelected ? ' selected_row' : ''}`}
                                    onClick={(e) => { if (e.target.type === 'checkbox') return; playSong(track, sortedTopTracks); }}
                                    onContextMenu={(e) => handleTrackContextMenu(e, track)}
                                >
                                    <div className="pv_col_index" onClick={(e) => e.stopPropagation()}>
                                        <span className="track_number">
                                            {isPlaying ? <div className="icon play_icon play_icon--row"></div> : index + 1}
                                        </span>
                                        <span className="play_on_hover" onClick={() => playSong(track, sortedTopTracks)}>
                                            <div className="icon play_icon play_icon--row"></div>
                                        </span>
                                    </div>
                                    <div className="pv_col_title">
                                        <img
                                            src={track.image || fallbackImg(track.title)}
                                            className="pv_track_img"
                                            alt="cover"
                                            referrerPolicy="no-referrer"
                                            loading="lazy"
                                            onError={(e) => onImgError(e, track.title)}
                                        />
                                        <div className="pv_track_name_wrapper">
                                            <div className="pv_track_name">{track.title}</div>
                                            <button className="pv_title_heart_btn pv_title_heart_btn--show" onClick={(e) => { e.stopPropagation(); toggleLike(track); }}>
                                                <div className={`heart_icon_fav ${isLiked && isLiked(track.youtubeId) ? 'heart_icon_fav_active' : ''}`}></div>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="pv_col_author">{track.author}</div>
                                    <div className="pv_col_album">{formatTrackAlbum(track)}</div>
                                    <div className="pv_col_date pv_col_date--views">{formatViews(track.views)}</div>
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
                            )
                        })}

                        {nextPageToken && (
                            <div ref={loadingRef} className="artist_loading_more">
                                {isMoreLoading ? t('artist.loadingMore') : ''}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'fav' && (
                <div className="artist_full_tab">
                    <div className="tab_header_flex">
                        <h2>{t('artist.inYourLikes')}</h2>
                        <div className="pv_search_add pv_search_add--icon">
                            <img src="/src/assets/images/Search.png" alt="Search" className="search_icon_in_field" />
                            <input placeholder={t('library.searchTracks')} value={searchFav} onChange={(e) => setSearchFav(e.target.value)} />
                        </div>
                    </div>

                    {artistLikedTracks.length === 0 ? (
                        <p className="text_muted_block">{t('artist.noFavArtistTracks')}</p>
                    ) : (
                        <div className="playlist_view_tracks">
                            <div className="pv_track_header">
                                <div className="pv_col_index">#</div>
                                <div className="sortable_th" onClick={() => handleSortFav('title')}>{t('common.tableTitle')}{renderSortIcon('title', sortConfigFav)}</div>
                                <div className="sortable_th" onClick={() => handleSortFav('author')}>{t('common.tableAuthor')}{renderSortIcon('author', sortConfigFav)}</div>
                                <div className="sortable_th" onClick={() => handleSortFav('album')}>{t('common.tableAlbum')}{renderSortIcon('album', sortConfigFav)}</div>
                                <div className="sortable_th" onClick={() => handleSortFav('addedAt')}>{t('common.tableAddedDate')}{renderSortIcon('addedAt', sortConfigFav)}</div>
                                <div className="sortable_th col_time_center" onClick={() => handleSortFav('duration')}>{t('common.tableTime')}{renderSortIcon('duration', sortConfigFav)}</div>
                                <div className="pv_col_checkbox pv_col_checkbox--rel">
                                    {selectedTracks.length > 0 && (
                                        <>
                                            <button className="pv_action_btn pv_action_btn--show" onClick={(e) => { e.stopPropagation(); setIsBulkMenuOpen(!isBulkMenuOpen); }} title={t('common.bulkActions')}></button>
                                            {isBulkMenuOpen && (
                                                <div className="context-menu context-menu--bulk">
                                                    <div className="context-menu-item" onClick={(e) => { e.stopPropagation(); handleBulkPlayNext(sortedFavTracks); }}>{t('contextMenu.playNextMany')}</div>
                                                    <div className="context-menu-item" onClick={(e) => { e.stopPropagation(); handleBulkAddQueue(sortedFavTracks); }}>{t('contextMenu.addToQueue')}</div>
                                                    <div className="context-menu-item" onClick={(e) => {
                                                        e.stopPropagation();
                                                        const songsToAdd = sortedFavTracks.filter(t => selectedTracks.includes(t.youtubeId));
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
                                        checked={selectedTracks.length === sortedFavTracks.length && sortedFavTracks.length > 0}
                                        onChange={(e) => {
                                            if (e.target.checked) setSelectedTracks(sortedFavTracks.map(t => t.youtubeId));
                                            else setSelectedTracks([]);
                                        }}
                                    />
                                </div>
                            </div>

                            {sortedFavTracks.map((track, index) => {
                                const isPlaying = currentSong?.youtubeId === track.youtubeId;
                                const isSelected = selectedTracks.includes(track.youtubeId);

                                return (
                                    <div
                                        key={track.youtubeId}
                                        className={`pv_track_row${isPlaying ? ' is-playing' : ''}${isSelected ? ' selected_row' : ''}`}
                                        onClick={(e) => { if (e.target.type === 'checkbox') return; playSong(track, sortedFavTracks); }}
                                        onContextMenu={(e) => handleTrackContextMenu(e, track)}
                                    >
                                        <div className="pv_col_index" onClick={(e) => e.stopPropagation()}>
                                            <span className="track_number">
                                                {isPlaying ? <div className="icon play_icon play_icon--row"></div> : index + 1}
                                            </span>
                                            <span className="play_on_hover" onClick={() => playSong(track, sortedFavTracks)}>
                                                <div className="icon play_icon play_icon--row"></div>
                                            </span>
                                        </div>
                                        <div className="pv_col_title">
                                            <img
                                            src={track.image || fallbackImg(track.title)}
                                            className="pv_track_img"
                                            alt="cover"
                                            referrerPolicy="no-referrer"
                                            loading="lazy"
                                            onError={(e) => onImgError(e, track.title)}
                                        />
                                            <div className="pv_track_name_wrapper">
                                                <div className="pv_track_name">{track.title}</div>
                                                <button className="pv_title_heart_btn pv_title_heart_btn--show" onClick={(e) => { e.stopPropagation(); toggleLike(track); }}>
                                                    <div className={`heart_icon_fav ${isLiked && isLiked(track.youtubeId) ? 'heart_icon_fav_active' : ''}`}></div>
                                                </button>
                                            </div>
                                        </div>
                                        <div className="pv_col_author">{track.author}</div>
                                        <div className="pv_col_album">{formatTrackAlbum(track)}</div>
                                        <div className="pv_col_date">{new Date(track.addedAt || Date.now()).toLocaleDateString('uk-UA', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
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
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'similar' && (
                <div className="artist_full_tab">
                    <h2 className="similar_tab_title">{t('artist.similarTitle')}</h2>
                    <div className="similar_artists_grid">
                        {discography.similar && discography.similar.length > 0 ? (
                            discography.similar.map(sim => (
                                <div
                                    className="channel channel--similar-card"
                                    key={sim.channelId}
                                    onClick={() => navigate(`/artist/${sim.channelId}`, { state: { subs: sim.subs, name: sim.name, image: sim.image } })}
                                    onContextMenu={(e) => handleSimilarArtistContextMenu(e, sim)}
                                >
                                    <img
                                        src={sim.image || fallbackImg(sim.name, 260)}
                                        alt={sim.name}
                                        referrerPolicy="no-referrer"
                                        loading="lazy"
                                        decoding="async"
                                        onError={(e) => onImgError(e, sim.name, 260)}
                                    />
                                    <div className="channel_name">{sim.name}</div>
                                    <div className="channel_subs">{sim.subs}</div>
                                </div>
                            ))
                        ) : (
                            <p className="text_muted_block">{t('artist.noSimilarData')}</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}