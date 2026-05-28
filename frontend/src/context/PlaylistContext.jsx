import { createContext, useState, useEffect, useContext } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { useLocale } from './LocaleContext';
import { clampMenuPosition } from '../utils/menuPosition';

const PlaylistContext = createContext();

// PlaylistProvider: плейлисти користувача — списки, модалки, попап додавання
export function PlaylistProvider({ children }) {
    const { user, openAuthModal } = useAuth();
    const { showToast } = useToast();
    const { t } = useLocale();

    const [myPlaylists, setMyPlaylists] = useState([]);
    const [communityPlaylists, setCommunityPlaylists] = useState([]);

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [pendingSong, setPendingSong] = useState(null);

    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });

    useEffect(() => {
        if (user) loadMyPlaylists();
        else setMyPlaylists([]);

        loadCommunityPlaylists();
    }, [user]);

    // loadMyPlaylists: завантажує плейлисти користувача — GET /api/playlists/me
    const loadMyPlaylists = async () => {
        try {
            const res = await fetch('/api/playlists/me', { credentials: 'include' });
            if (res.ok) setMyPlaylists(await res.json());
        } catch (e) { console.error(e); }
    };

    // loadCommunityPlaylists: публічні плейлисти спільноти — GET /api/playlists/community
    const loadCommunityPlaylists = async () => {
        try {
            const res = await fetch('/api/playlists/community', { credentials: 'include' });
            if (res.ok) setCommunityPlaylists(await res.json());
        } catch (e) { console.error(e); }
    };

    // openCreateModal: відкриває модалку створення плейлиста — з опційним треком
    const openCreateModal = (song = null) => {
        if (!user) {
            setIsPopupOpen(false);
            showToast(t('toast.loginFirst'), 'warning');
            openAuthModal('login');
            return false;
        }
        setIsPopupOpen(false);
        setPendingSong(song);
        setIsCreateModalOpen(true);
        return true;
    };

    // closeCreateModal: закриває модалку створення — скидає pendingSong
    const closeCreateModal = () => {
        setIsCreateModalOpen(false);
        setPendingSong(null);
    };

    // openPopup: попап «додати в плейлист» — з позиціонуванням у viewport
    const openPopup = (x, y, song) => {
        if (!user) {
            showToast(t('toast.loginFirst'), 'warning');
            openAuthModal('login');
            return false;
        }
        const popupWidth = 260;
        const popupHeight = 360;
        const nearPlayer = y > window.innerHeight - 160;
        const { x: posX, y: posY } = clampMenuPosition(x, y, popupWidth, popupHeight, {
            preferAbove: nearPlayer,
            bottomReserve: 100
        });

        setPopupPos({ x: posX, y: posY });
        setPendingSong(song);
        setIsPopupOpen(true);
        return true;
    };

    // closePopup: закриває попап додавання в плейлист
    const closePopup = () => setIsPopupOpen(false);

    return (
        <PlaylistContext.Provider value={{
            myPlaylists, communityPlaylists, loadMyPlaylists, loadCommunityPlaylists,
            isCreateModalOpen, openCreateModal, closeCreateModal,
            isPopupOpen, popupPos, openPopup, closePopup, pendingSong
        }}>
            {children}
        </PlaylistContext.Provider>
    );
}

// usePlaylist: хук доступу до PlaylistContext — списки, модалки, попап
export const usePlaylist = () => useContext(PlaylistContext);