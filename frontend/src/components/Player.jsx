import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { usePlayer } from '../context/PlayerContext';
import { usePlaylist } from '../context/PlaylistContext';
import { useMenu } from '../context/MenuContext';
import { useToast } from '../context/ToastContext';
import {
    normalizeTrack,
    normalizeTrackList,
    trackCoverSrc,
    advanceCoverImage,
    onCoverLoadCheck
} from '../utils/track';
import { goToArtistPage } from '../utils/artistNav';
import * as yt from '../lib/youtubePlayer';
import EqControl from './EqControl';
import PipControl from './PipControl';
import ShareLinkButton from './ShareLinkButton';
import { useShare } from '../hooks/useShare';
import { useLocale } from '../context/LocaleContext';

// Player: UI міні- і повноекранного плеєра — керування з PlayerContext
export default function Player() {
    const { t } = useLocale();
    const {
        isFullPlayerOpen, toggleFullPlayer, currentSong,
        isPlaying, togglePlayPause, playNext, playPrev,
        currentTime, duration, seekTo, setPlayerVolume, volumePercent, isMuted, toggleMute,
        isPlayerReady, isQueueLoading,
        isRepeating, toggleRepeat, shuffleQueue, queue, currentIndex,
        playSpecificIndex, toggleLike, isLiked, playSong,
        reorderQueue, removeFromQueue,
        isVideoMode, toggleVideoMode,
        playbackMode
    } = usePlayer();

    const { openTrackMenu } = useMenu();
    const { openPopup } = usePlaylist();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const { shareTrack } = useShare();

    const progressContainerRef = useRef(null);
    const volumeContainerRef = useRef(null);
    const mediaContainerRef = useRef(null);
    const isDraggingProgress = useRef(false);
    const isDraggingVolume = useRef(false);
    const volume = volumePercent / 100;

    const lyricsContainerRef = useRef(null);
    const activeLineRef = useRef(null);

    const [progressPercent, setProgressPercent] = useState(0);
    const [hoverTime, setHoverTime] = useState(null);
    const [hoverPos, setHoverPos] = useState(0);

    const [activeRightTab, setActiveRightTab] = useState('queue');
    const [lyricsData, setLyricsData] = useState({ type: 'none', content: null });
    const [isLyricsLoading, setIsLyricsLoading] = useState(false);

    const [relatedTracks, setRelatedTracks] = useState([]);
    const [isFetchingRelated, setIsFetchingRelated] = useState(false);

    const [dragQueueIndex, setDragQueueIndex] = useState(null);
    const [dragOverQueueIndex, setDragOverQueueIndex] = useState(null);

    useEffect(() => {
        if (isPlayerReady) setPlayerVolume(volumePercent / 100);
    }, [isPlayerReady, volumePercent, setPlayerVolume]);

    useEffect(() => {
        document.body.classList.toggle('full-player-open', !!isFullPlayerOpen);
        return () => document.body.classList.remove('full-player-open');
    }, [isFullPlayerOpen]);

    useEffect(() => {
        if (!isFullPlayerOpen) {
            document.documentElement.style.removeProperty('--yt-toggle-top');
            document.documentElement.style.removeProperty('--yt-toggle-right');
            return undefined;
        }

        const updateTogglePos = () => {
            const box = mediaContainerRef.current;
            if (!box) return;
            const r = box.getBoundingClientRect();
            document.documentElement.style.setProperty('--yt-toggle-top', `${Math.round(r.top) + 12}px`);
            document.documentElement.style.setProperty('--yt-toggle-right', `${Math.round(window.innerWidth - r.right) + 12}px`);
        };

        updateTogglePos();
        const ro = new ResizeObserver(updateTogglePos);
        if (mediaContainerRef.current) ro.observe(mediaContainerRef.current);
        window.addEventListener('resize', updateTogglePos);
        window.addEventListener('scroll', updateTogglePos, true);

        return () => {
            ro.disconnect();
            window.removeEventListener('resize', updateTogglePos);
            window.removeEventListener('scroll', updateTogglePos, true);
            document.documentElement.style.removeProperty('--yt-toggle-top');
            document.documentElement.style.removeProperty('--yt-toggle-right');
        };
    }, [isFullPlayerOpen]);

    useEffect(() => {
        const showVideo = isFullPlayerOpen && isVideoMode;
        if (!showVideo || document.hidden) {
            yt.setDisplayMode('hidden');
            return undefined;
        }

        const measure = () => {
            if (document.hidden) return;
            const box = mediaContainerRef.current;
            if (!box) return;
            const r = box.getBoundingClientRect();
            if (r.width < 8 || r.height < 8) return;
            yt.setDisplayMode('video', {
                left: r.left,
                top: r.top,
                width: r.width,
                height: r.height
            });
        };

        const rafId = requestAnimationFrame(measure);
        const tId = window.setTimeout(measure, 80);
        const tId2 = window.setTimeout(measure, 280);
        const ro = new ResizeObserver(() => measure());
        if (mediaContainerRef.current) ro.observe(mediaContainerRef.current);
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure, true);

        return () => {
            cancelAnimationFrame(rafId);
            window.clearTimeout(tId);
            window.clearTimeout(tId2);
            ro.disconnect();
            window.removeEventListener('resize', measure);
            window.removeEventListener('scroll', measure, true);
            yt.setDisplayMode('hidden');
        };
    }, [isFullPlayerOpen, isVideoMode]);

    const displayPercent = isDraggingProgress.current
        ? progressPercent
        : (duration > 0 ? (currentTime / duration) * 100 : 0);

    const formatTime = (seconds) => {
        if (!seconds) return "0:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const parseSyncedLyrics = (lrcString) => {
        const lines = lrcString.split('\n');
        const parsed = [];
        const regex = /\[(\d{2}):(\d{2}\.\d{2,3})\](.*)/;

        lines.forEach(line => {
            const match = line.match(regex);
            if (match) {
                const min = parseInt(match[1], 10);
                const sec = parseFloat(match[2]);
                const text = match[3].trim();
                parsed.push({ time: min * 60 + sec, text: text || '\u00A0' });
            }
        });
        return parsed;
    };

    useEffect(() => {
        if (!currentSong) return;
        setLyricsData({ type: 'none', content: null });

        const fetchLyrics = async () => {
            setIsLyricsLoading(true);
            try {
                let cleanTitle = currentSong.title;
                if (cleanTitle.includes('-')) cleanTitle = cleanTitle.split('-').slice(1).join('-').trim();
                cleanTitle = cleanTitle.replace(/\[.*?\]|\(.*?\)/g, '').trim();
                const cleanArtist = currentSong.author.replace(/ - Topic/g, '').trim();

                const res = await fetch(`https://lrclib.net/api/get?artist_name=${encodeURIComponent(cleanArtist)}&track_name=${encodeURIComponent(cleanTitle)}`);

                if (res.ok) {
                    const data = await res.json();
                    if (data.syncedLyrics) setLyricsData({ type: 'synced', content: parseSyncedLyrics(data.syncedLyrics) });
                    else if (data.plainLyrics) setLyricsData({ type: 'plain', content: data.plainLyrics });
                    else setLyricsData({ type: 'none', content: t('player.lyricsNotFound') });
                } else {
                    setLyricsData({ type: 'none', content: t('player.lyricsNotFound') });
                }
            } catch (e) {
                setLyricsData({ type: 'none', content: t('player.lyricsLoadError') });
            } finally {
                setIsLyricsLoading(false);
            }
        };

        fetchLyrics();
    }, [currentSong]);

    useEffect(() => {
        if (activeRightTab === 'lyrics' && lyricsData.type === 'synced' && activeLineRef.current) {
            activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [currentTime, activeRightTab, lyricsData]);

    const fetchSimilarTracks = async () => {
        if (!currentSong?.youtubeId || isFetchingRelated) return;
        setIsFetchingRelated(true);
        try {
            const params = new URLSearchParams({
                youtubeId: currentSong.youtubeId,
                title: currentSong.title || '',
                author: currentSong.author || ''
            });
            const res = await fetch(`/api/recommendations/radio?${params}`, { credentials: 'include' });
            if (res.ok) {
                const list = normalizeTrackList(await res.json());
                setRelatedTracks(
                    list.filter((t) => t && t.youtubeId !== currentSong.youtubeId).slice(0, 40)
                );
            } else {
                setRelatedTracks([]);
            }
        } catch (err) {
            console.error(err);
            setRelatedTracks([]);
        } finally {
            setIsFetchingRelated(false);
        }
    };

    useEffect(() => {
        if (!currentSong) {
            setRelatedTracks([]);
            return;
        }
        if (activeRightTab === 'related') {
            fetchSimilarTracks();
        }
    }, [currentSong?.youtubeId, activeRightTab]);

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (isDraggingProgress.current && progressContainerRef.current) {
                const rect = progressContainerRef.current.getBoundingClientRect();
                let percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                setProgressPercent(percent * 100);
            }

            if (isDraggingVolume.current && volumeContainerRef.current) {
                const rect = volumeContainerRef.current.getBoundingClientRect();
                let percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                setPlayerVolume(percent);
            }
        };

        const handleMouseUp = () => {
            if (isDraggingProgress.current) {
                isDraggingProgress.current = false;
                seekTo(progressPercent / 100);
            }
            if (isDraggingVolume.current) isDraggingVolume.current = false;
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [progressPercent, seekTo, setPlayerVolume]);

    const handleProgressMouseMove = (e) => {
        if (!progressContainerRef.current || !duration) return;
        const rect = progressContainerRef.current.getBoundingClientRect();
        let x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        setHoverPos(x);
        setHoverTime(duration * (x / rect.width));
    };

    const handleProgressMouseLeave = () => setHoverTime(null);

    const handleVolumeIconClick = () => {
        toggleMute();
    };

    const handleShuffle = (e) => {
        e.stopPropagation();
        shuffleQueue();
    };

    const goArtistFromPlayer = async (e) => {
        e.stopPropagation();
        if (!currentSong) return;
        const ok = await goToArtistPage(navigate, {
            author: currentSong.author,
            channelId: currentSong.channelId,
            videoId: currentSong.youtubeId,
            name: currentSong.author,
            image: currentSong.image
        });
        if (!ok) showToast(t('library.artistNotFound'), 'info');
    };

    const handleBottomPlayerClick = (e) => {
        if (e.target.closest('.icon') || e.target.closest('.player_progress_container') || e.target.closest('.volume_bar_container') || e.target.closest('.full_player_right')) {
            return;
        }
        toggleFullPlayer();
    };

    const playerCoverUrl = (track, preferLarge = false) => {
        if (!track?.youtubeId) return '';
        return trackCoverSrc(track, track.title, preferLarge ? 1280 : 320);
    };

    const coverKey = `${currentSong?.youtubeId || 'none'}`;
    const onCoverError = (e) => {
        const el = e.target;
        if (!currentSong?.youtubeId) return;
        advanceCoverImage(el, currentSong.youtubeId, currentSong.image, currentSong.title);
    };
    const onCoverLoad = (e) => {
        const el = e.target;
        if (!currentSong?.youtubeId) return;
        onCoverLoadCheck(el, currentSong.youtubeId, currentSong.image, currentSong.title);
    };

    return (
        <>
            <div
                className="player"
                id="music_menu"
                onClick={handleBottomPlayerClick}
                style={{ display: currentSong ? '' : 'none' }}
            >
                <div
                    className="player_progress_container"
                    ref={progressContainerRef}
                    onMouseDown={(e) => {
                        isDraggingProgress.current = true;
                        const rect = progressContainerRef.current.getBoundingClientRect();
                        let percent = (e.clientX - rect.left) / rect.width;
                        const initialPercent = Math.max(0, Math.min(1, percent)) * 100;
                        setProgressPercent(initialPercent);
                        seekTo(initialPercent / 100);
                    }}
                    onMouseMove={handleProgressMouseMove}
                    onMouseLeave={handleProgressMouseLeave}
                >
                    <div
                        className="player_progress"
                        style={{
                            width: `${displayPercent}%`,
                            transition: isDraggingProgress.current ? 'none' : 'width 0.1s linear',
                            backgroundColor: '#a855f7'
                        }}
                    ></div>
                    {hoverTime !== null && (
                        <div className="progress_tooltip" style={{ left: `${hoverPos}px` }}>
                            {formatTime(hoverTime)}
                        </div>
                    )}
                </div>

                <div className="player_inner">
                    <div className="player_left">
                        <img
                            key={`${coverKey}-mini`}
                            src={playerCoverUrl(currentSong)}
                            className="song_img"
                            alt="Cover"
                            referrerPolicy="no-referrer"
                            onError={onCoverError}
                            onLoad={onCoverLoad}
                        />
                        <div className="player_left_meta">
                            <div className="song_info">
                                <div
                                    className="song_name music_information_text_name"
                                    title={currentSong?.title || undefined}
                                >
                                    {currentSong?.title || t('player.noSong')}
                                </div>
                                {currentSong?.author ? (
                                    <button
                                        type="button"
                                        className="song_artist song_artist_link"
                                        onClick={goArtistFromPlayer}
                                        title={currentSong.author}
                                    >
                                        {currentSong.author}
                                    </button>
                                ) : (
                                    <div className="song_artist" />
                                )}
                            </div>
                            <div className="left_actions">
                                <div className={`icon heart_icon ${currentSong && isLiked(currentSong.youtubeId) ? 'heart_icon_active' : ''}`} title="Heart" onClick={() => currentSong && toggleLike(currentSong)}></div>
                                <ShareLinkButton
                                    disabled={!currentSong}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (currentSong) void shareTrack(currentSong);
                                    }}
                                />
                                <div className="icon playlist_icon" title={t('player.addToPlaylist')} onClick={(e) => currentSong && openPopup(e.clientX, e.clientY, currentSong)}></div>
                            </div>
                        </div>
                    </div>

                    <div className="player_center">
                        <div className="main_controls">
                            <div
                                className={`icon repeat_icon${isRepeating ? ' is-active' : ' is-inactive'}`}
                                title={t('player.repeat')}
                                onClick={(e) => { e.stopPropagation(); toggleRepeat(); }}
                            ></div>
                            <div className="icon prev_icon" title="Prev" onClick={(e) => { e.stopPropagation(); playPrev(); }}></div>
                            <div className={`icon ${isPlaying ? 'pause_icon' : 'play_icon'}`} title="Play/Pause" onClick={(e) => { e.stopPropagation(); togglePlayPause(); }}></div>
                            <div className="icon next_icon" title="Next" onClick={(e) => { e.stopPropagation(); playNext(); }}></div>
                            <div className="icon shuffle_icon" title={t('player.shuffle')} onClick={handleShuffle}></div>
                        </div>
                        <div className="time_display">
                            <span>{formatTime(currentTime)}</span> / <span>{formatTime(duration)}</span>
                        </div>
                    </div>

                    <div className="player_right">
                        <div className="volume_control">
                            <div
                                className="volume_bar_container"
                                ref={volumeContainerRef}
                                onMouseDown={(e) => {
                                    isDraggingVolume.current = true;
                                    const rect = volumeContainerRef.current.getBoundingClientRect();
                                    let percent = (e.clientX - rect.left) / rect.width;
                                    const vol = Math.max(0, Math.min(1, percent));
                                    setPlayerVolume(vol);
                                }}
                            >
                                <div className="volume_bar" style={{ width: `${volume * 100}%`, backgroundColor: '#a855f7' }}></div>
                            </div>
                            <div
                                className={`icon volume_icon${isMuted ? ' is-muted' : ''}`}
                                title="Volume"
                                onClick={(e) => { e.stopPropagation(); handleVolumeIconClick(); }}
                            ></div>
                        </div>
                        <EqControl disabled={!currentSong} />
                        <PipControl
                            disabled={!currentSong}
                            isFullPlayerOpen={isFullPlayerOpen}
                            onCollapse={toggleFullPlayer}
                        />
                    </div>
                </div>
            </div>

            <div className={`full_player ${isFullPlayerOpen ? '' : 'hide'}`} id="music_player_full">
                <div className="full_player_inner">
                    <div className="full_player_left">
                        <div
                            ref={mediaContainerRef}
                            className={`media_container${isVideoMode ? ' media_container--video' : ''}`}
                        >
                            <div className="yt_embed_slot" aria-hidden={!isVideoMode} />
                            <img
                                key={`${coverKey}-full`}
                                src={playerCoverUrl(currentSong, true)}
                                className={`full_player_img${isVideoMode ? ' full_player_img--hidden' : ''}`}
                                alt="Cover"
                                referrerPolicy="no-referrer"
                                onError={onCoverError}
                                onLoad={onCoverLoad}
                            />
                            {!isVideoMode && <div className="media_overlay" />}
                            {isVideoMode && (
                                <div
                                    className="media_chrome_shield"
                                    title="Play / Pause"
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        togglePlayPause();
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            togglePlayPause();
                                        }
                                    }}
                                />
                            )}
                        </div>
                    </div>

                    <div className="full_player_right">
                        <div className="full_player_tabs">
                            <div className={`tab ${activeRightTab === 'queue' ? 'active' : ''}`} onClick={() => setActiveRightTab('queue')}>{t('player.tabNext')}</div>
                            <div className={`tab ${activeRightTab === 'lyrics' ? 'active' : ''}`} onClick={() => setActiveRightTab('lyrics')}>{t('player.tabLyrics')}</div>
                            <div className={`tab ${activeRightTab === 'related' ? 'active' : ''}`} onClick={() => setActiveRightTab('related')}>{t('player.tabRelated')}</div>
                        </div>

                        <div className="queue_list" ref={lyricsContainerRef} style={{ overflowY: 'auto', flex: 1, paddingRight: '10px' }}>

                            {activeRightTab === 'queue' && (
                                <>
                                    {queue.length > 0 ? (
                                        queue.map((raw, index) => {
                                            const song = normalizeTrack(raw);
                                            if (!song) return null;
                                            const isActive = currentIndex === index;
                                            return (
                                                <div
                                                    key={`${song.youtubeId}-${index}`}
                                                    className={`queue_item${isActive ? ' queue_item--active' : ''}${dragOverQueueIndex === index ? ' queue_item--drag-over' : ''}${dragQueueIndex === index ? ' queue_item--dragging' : ''}`}
                                                    draggable
                                                    onDragStart={(e) => {
                                                        setDragQueueIndex(index);
                                                        e.dataTransfer.effectAllowed = 'move';
                                                        e.dataTransfer.setData('text/plain', String(index));
                                                    }}
                                                    onDragOver={(e) => {
                                                        e.preventDefault();
                                                        e.dataTransfer.dropEffect = 'move';
                                                        if (dragOverQueueIndex !== index) setDragOverQueueIndex(index);
                                                    }}
                                                    onDragLeave={() => {
                                                        if (dragOverQueueIndex === index) setDragOverQueueIndex(null);
                                                    }}
                                                    onDrop={(e) => {
                                                        e.preventDefault();
                                                        const from = dragQueueIndex;
                                                        if (from !== null && from !== index) reorderQueue(from, index);
                                                        setDragQueueIndex(null);
                                                        setDragOverQueueIndex(null);
                                                    }}
                                                    onDragEnd={() => {
                                                        setDragQueueIndex(null);
                                                        setDragOverQueueIndex(null);
                                                    }}
                                                    onContextMenu={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        openTrackMenu(
                                                            e.clientX,
                                                            e.clientY,
                                                            song,
                                                            () => removeFromQueue(index),
                                                            { removeLabel: t('player.removeFromQueue') }
                                                        );
                                                    }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        playSpecificIndex(index);
                                                    }}
                                                >
                                                    <span className="queue_drag_handle" title={t('player.dragHandle')} aria-hidden="true">⋮⋮</span>
                                                    <img
                                                        src={trackCoverSrc(song, song.title, 96)}
                                                        alt="cover"
                                                        draggable={false}
                                                    />
                                                    <div className="queue_info">
                                                        <div className={`queue_title${isActive ? ' queue_title--active' : ''}`}>
                                                            {song.title}
                                                        </div>
                                                        <div className="queue_author">{song.author}</div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <p style={{ color: '#888', padding: '20px' }}>{t('player.queueEmpty')}</p>
                                    )}
                                    {isQueueLoading && (
                                        <div
                                            className="queue_loading_row"
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '10px',
                                                padding: '12px 10px',
                                                color: '#b3b3b3',
                                                fontSize: '13px'
                                            }}
                                        >
                                            <div
                                                className="loader_spinner"
                                                style={{
                                                    width: '16px',
                                                    height: '16px',
                                                    borderWidth: '2px',
                                                    borderTopColor: '#a855f7',
                                                    flexShrink: 0
                                                }}
                                            />
                                            <span>{t('player.pickingNext')}</span>
                                        </div>
                                    )}
                                </>
                            )}

                            {activeRightTab === 'lyrics' && (
                                <div style={{ padding: '20px 0 50% 0', textAlign: 'left' }}>
                                    {isLyricsLoading ? (
                                        <div style={{ color: '#a855f7', textAlign: 'center', marginTop: '20px' }}>{t('player.lyricsSearching')}</div>
                                    ) : lyricsData.type === 'synced' ? (
                                        lyricsData.content.map((line, index) => {
                                            const nextLine = lyricsData.content[index + 1];
                                            const isActive = currentTime >= line.time && (!nextLine || currentTime < nextLine.time);

                                            return (
                                                <div
                                                    key={index}
                                                    ref={isActive ? activeLineRef : null}
                                                    style={{
                                                        color: isActive ? '#fff' : '#666',
                                                        fontSize: isActive ? '24px' : '18px',
                                                        fontWeight: isActive ? '700' : '600',
                                                        transition: 'all 0.3s ease',
                                                        margin: '16px 0',
                                                        cursor: 'pointer'
                                                    }}
                                                    onClick={() => seekTo(line.time / duration)}
                                                >
                                                    {line.text}
                                                </div>
                                            );
                                        })
                                    ) : lyricsData.type === 'plain' ? (
                                        <div style={{ color: '#fff', fontSize: '18px', lineHeight: '1.8', whiteSpace: 'pre-wrap', fontWeight: '500' }}>
                                            {lyricsData.content}
                                        </div>
                                    ) : (
                                        <div style={{ color: '#888', textAlign: 'center', marginTop: '20px' }}>
                                            {lyricsData.content}
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeRightTab === 'related' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {isFetchingRelated && relatedTracks.length === 0 ? (
                                        <div style={{ color: '#a855f7', textAlign: 'center', padding: '24px' }}>
                                            {t('player.pickingSimilar')}
                                        </div>
                                    ) : null}
                                    {!isFetchingRelated && relatedTracks.length === 0 ? (
                                        <div style={{ color: '#888', textAlign: 'center', padding: '24px' }}>
                                            {t('player.noSimilar')}
                                        </div>
                                    ) : null}
                                    {relatedTracks.map((track, idx) => (
                                        <div
                                            key={`related-${track.youtubeId}-${idx}`}
                                            className="queue_item"
                                            style={{ display: 'flex', gap: '12px', padding: '10px', cursor: 'pointer', borderRadius: '8px' }}
                                            onClick={(e) => { e.stopPropagation(); playSong(track); }}
                                        >
                                            <img src={track.image} alt="cover" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '4px' }} onError={(e) => e.target.src = "https://ui-avatars.com/api/?name=Music&background=282828&color=fff"} />
                                            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1 }}>
                                                <div style={{ fontWeight: 600, fontSize: '14px', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.title}</div>
                                                <div style={{ fontSize: '12px', color: '#aaa', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.author}</div>
                                            </div>
                                        </div>
                                    ))}

                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {isFullPlayerOpen && playbackMode !== 'fallback' && typeof document !== 'undefined' && createPortal(
                <button
                    type="button"
                    className="toggle_media_btn toggle_media_btn--portal"
                    onClick={(e) => {
                        e.stopPropagation();
                        toggleVideoMode();
                    }}
                >
                    {isVideoMode ? t('player.showCover') : t('player.showVideo')}
                </button>,
                document.body
            )}
        </>
    );
}