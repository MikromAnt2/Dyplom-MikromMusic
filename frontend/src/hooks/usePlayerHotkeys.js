import { useEffect } from 'react';
import { usePlayer } from '../context/PlayerContext';

function isTypingTarget(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.isContentEditable) return true;
    return Boolean(el.closest('[contenteditable="true"]'));
}

// usePlayerHotkeys: глобальні клавіші плеєра — пробіл, стрілки, Ctrl+стрілки
export function usePlayerHotkeys() {
    const {
        currentSong,
        togglePlayPause,
        playNext,
        playPrev,
        seekBy,
        adjustVolume,
        toggleMute
    } = usePlayer();

    useEffect(() => {
        const onKeyDown = (e) => {
            if (e.defaultPrevented || isTypingTarget(e.target)) return;
            if (e.metaKey || e.altKey) return;

            const hasTrack = Boolean(currentSong?.youtubeId);

            if (e.code === 'Space' || e.key === ' ') {
                if (!hasTrack) return;
                e.preventDefault();
                togglePlayPause();
                return;
            }

            if (e.key === 'm' || e.key === 'M') {
                e.preventDefault();
                toggleMute();
                return;
            }

            if (!hasTrack) return;

            if (e.key === 'ArrowLeft' && e.ctrlKey) {
                e.preventDefault();
                playPrev();
                return;
            }

            if (e.key === 'ArrowRight' && e.ctrlKey) {
                e.preventDefault();
                playNext();
                return;
            }

            if (e.key === 'ArrowLeft' && !e.ctrlKey) {
                e.preventDefault();
                seekBy(e.shiftKey ? -5 : -1);
                return;
            }

            if (e.key === 'ArrowRight' && !e.ctrlKey) {
                e.preventDefault();
                seekBy(e.shiftKey ? 5 : 1);
                return;
            }

            if (e.key === 'ArrowUp' && !e.ctrlKey) {
                e.preventDefault();
                adjustVolume(e.shiftKey ? 5 : 1);
                return;
            }

            if (e.key === 'ArrowDown' && !e.ctrlKey) {
                e.preventDefault();
                adjustVolume(e.shiftKey ? -5 : -1);
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [currentSong?.youtubeId, togglePlayPause, playNext, playPrev, seekBy, adjustVolume, toggleMute]);
}
