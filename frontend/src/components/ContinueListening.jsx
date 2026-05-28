import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { useLocale } from '../context/LocaleContext';
import {
    loadPlaybackSession,
    clearPlaybackSession,
    formatResumeTime
} from '../utils/playbackSession';
import {
    getPageLoadId,
    markContinueOfferedThisLoad,
    suppressContinueForThisLoad,
    isContinueSuppressedThisLoad
} from '../utils/pageSession';
import * as yt from '../lib/youtubePlayer';

const MIN_RESUME_SECONDS = 1;

// ContinueListening: картка «Продовжити слухати» — лише після перезавантаження вкладки
export default function ContinueListening() {
    const { user } = useAuth();
    const { currentSong, restorePlaybackSession } = usePlayer();
    const { t } = useLocale();
    const [session, setSession] = useState(null);
    const [dismissed, setDismissed] = useState(false);
    const initKeyRef = useRef('');

    useEffect(() => {
        const initKey = `${getPageLoadId()}:${user?.id ?? 'guest'}`;
        if (initKeyRef.current === initKey) return;
        initKeyRef.current = initKey;

        if (isContinueSuppressedThisLoad()) {
            setDismissed(true);
            setSession(null);
            return;
        }

        const saved = loadPlaybackSession(user?.id ?? null);
        if (!saved?.song?.youtubeId) {
            setDismissed(true);
            setSession(null);
            return;
        }

        const resumeAt = Number(saved.currentTime) || 0;
        if (resumeAt < MIN_RESUME_SECONDS) {
            setDismissed(true);
            setSession(null);
            return;
        }

        if (
            currentSong?.youtubeId &&
            currentSong.youtubeId !== saved.song.youtubeId
        ) {
            suppressContinueForThisLoad();
            setDismissed(true);
            setSession(null);
            return;
        }

        setDismissed(false);
        setSession(saved);
    }, [user?.id, currentSong?.youtubeId]);

    useEffect(() => {
        if (!session?.song?.youtubeId || dismissed) return;
        markContinueOfferedThisLoad();
    }, [session?.song?.youtubeId, dismissed]);

    useEffect(() => {
        if (!session?.song?.youtubeId) return;
        if (
            currentSong?.youtubeId &&
            currentSong.youtubeId !== session.song.youtubeId
        ) {
            suppressContinueForThisLoad();
            setDismissed(true);
        }
    }, [currentSong?.youtubeId, session?.song?.youtubeId]);

    if (dismissed || !session?.song) return null;

    if (currentSong?.youtubeId === session.song.youtubeId) return null;

    const timeLabel = formatResumeTime(session.currentTime);
    const handleResume = () => {
        yt.armAutoplayFromGesture();
        void restorePlaybackSession({ autoplay: true }).then((ok) => {
            if (ok) setSession(null);
        });
    };

    const handleDismiss = () => {
        suppressContinueForThisLoad();
        clearPlaybackSession(user?.id ?? null);
        setDismissed(true);
        setSession(null);
    };

    return (
        <section className="continue_listening" aria-label={t('continue.aria')}>
            <div className="continue_listening_inner">
                <img
                    className="continue_listening_cover"
                    src={session.song.image || `https://i.ytimg.com/vi/${session.song.youtubeId}/sddefault.jpg`}
                    alt=""
                />
                <div className="continue_listening_text">
                    <span className="continue_listening_label">{t('continue.label')}</span>
                    <strong className="continue_listening_title">{session.song.title}</strong>
                    <span className="continue_listening_artist">{session.song.author}</span>
                </div>
                <div className="continue_listening_actions">
                    <button type="button" className="continue_listening_btn" onClick={handleResume}>
                        {timeLabel ? t('continue.fromTime', { time: timeLabel }) : t('continue.play')}
                    </button>
                    <button
                        type="button"
                        className="continue_listening_dismiss"
                        onClick={handleDismiss}
                        title={t('continue.dismiss')}
                        aria-label={t('continue.dismiss')}
                    >
                        ✕
                    </button>
                </div>
            </div>
        </section>
    );
}
