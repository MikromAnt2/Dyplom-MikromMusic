import { useCallback } from 'react';
import { useToast } from '../context/ToastContext';
import {
    buildTrackShareUrl,
    buildPlaylistShareUrl,
    buildAuthorShareUrl,
    shareUrl,
    isValidYoutubeId
} from '../utils/shareLinks';

export function useShare() {
    const { showToast } = useToast();

    const shareTrack = useCallback(async (song, { silent = false } = {}) => {
        const youtubeId = song?.youtubeId;
        if (!isValidYoutubeId(youtubeId)) {
            if (!silent) showToast('Неможливо поділитися цим треком', 'error');
            return false;
        }
        const url = buildTrackShareUrl(youtubeId);
        const title = song.title || 'Mikrom';
        const text = song.author ? `${title} — ${song.author}` : title;
        const result = await shareUrl({ url, title, text });
        if (result === 'cancelled') return false;
        if (!silent) {
            if (result === 'shared') showToast('Посилання надіслано', 'success');
            else if (result === 'copied') showToast('Посилання на трек скопійовано', 'success');
            else showToast('Не вдалося скопіювати посилання', 'error');
        }
        return result === 'shared' || result === 'copied';
    }, [showToast]);

    const sharePlaylist = useCallback(async (playlistId, playlistName, { silent = false } = {}) => {
        const id = String(playlistId || '').trim();
        if (!id) {
            if (!silent) showToast('Неможливо поділитися плейлистом', 'error');
            return false;
        }
        const url = buildPlaylistShareUrl(id);
        const title = playlistName || 'Плейлист Mikrom';
        const result = await shareUrl({ url, title, text: title });
        if (result === 'cancelled') return false;
        if (!silent) {
            if (result === 'shared') showToast('Посилання надіслано', 'success');
            else if (result === 'copied') showToast('Посилання на плейлист скопійовано', 'success');
            else showToast('Не вдалося скопіювати посилання', 'error');
        }
        return result === 'shared' || result === 'copied';
    }, [showToast]);

    const shareAuthor = useCallback(async (channelId, authorName, { silent = false } = {}) => {
        if (!channelId) {
            if (!silent) showToast('Неможливо поділитися автором', 'error');
            return false;
        }
        const url = buildAuthorShareUrl(channelId);
        const title = authorName ? `Mikrom — ${authorName}` : 'Mikrom';
        const result = await shareUrl({ url, title, text: authorName ? authorName : title });
        if (result === 'cancelled') return false;
        if (!silent) {
            if (result === 'shared') showToast('Посилання на автора надіслано', 'success');
            else if (result === 'copied') showToast('Посилання на автора скопійовано', 'success');
            else showToast('Не вдалося скопіювати посилання на автора', 'error');
        }
        return result === 'shared' || result === 'copied';
    }, [showToast]);

    return {
        shareTrack,
        sharePlaylist,
        shareAuthor,
        buildTrackShareUrl,
        buildPlaylistShareUrl,
        buildAuthorShareUrl
    };
}
