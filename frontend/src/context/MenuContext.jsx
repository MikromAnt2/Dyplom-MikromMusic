import { createContext, useState, useContext } from 'react';

const MenuContext = createContext();

// MenuProvider: контекст контекстного меню — позиція, тип, дані
export function MenuProvider({ children }) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
    const [menuType, setMenuType] = useState('track');
    const [menuData, setMenuData] = useState(null);
    const [onRemove, setOnRemove] = useState(null);
    const [menuRemoveLabel, setMenuRemoveLabel] = useState(null);

    // placeMenu: позиціонує меню у viewport — з урахуванням країв екрана
    const placeMenu = (x, y, width, height) => {
        const pad = 8;
        let posX = Math.max(pad, x);
        let posY = Math.max(pad, y);
        if (posX + width > window.innerWidth - pad) {
            posX = Math.max(pad, window.innerWidth - width - pad);
        }
        if (posY + height > window.innerHeight - pad) {
            posY = Math.max(pad, window.innerHeight - height - pad);
        }
        setMenuPos({ x: Math.round(posX), y: Math.round(posY) });
    };

    // openMenuAt: відкриває меню за типом — track, album, playlist, artist
    const openMenuAt = (x, y, type, data, options = {}) => {
        const sizes = { track: [220, 260], album: [240, 200], playlist: [240, 220], artist: [220, 180] };
        const [w, h] = sizes[type] || sizes.track;
        placeMenu(x, y, w, h);
        setMenuType(type);
        setMenuData(data);
        setOnRemove(() => options.removeCallback || null);
        setMenuRemoveLabel(options.removeLabel || null);
        setIsMenuOpen(true);
    };

    // openTrackMenu: контекстне меню треку — з опційним removeCallback
    const openTrackMenu = (x, y, song, removeCallback = null, options = {}) => {
        openMenuAt(x, y, 'track', song, { removeCallback, removeLabel: options.removeLabel });
    };

    // openAlbumMenu: контекстне меню альбому
    const openAlbumMenu = (x, y, album) => {
        openMenuAt(x, y, 'album', album);
    };

    // openPlaylistMenu: контекстне меню плейлиста
    const openPlaylistMenu = (x, y, playlist) => {
        openMenuAt(x, y, 'playlist', playlist);
    };

    // openArtistMenu: контекстне меню артиста
    const openArtistMenu = (x, y, artist) => {
        openMenuAt(x, y, 'artist', artist);
    };

    // openMenu: alias openTrackMenu — зворотна сумісність
    const openMenu = (x, y, song, removeCallback = null) => {
        openTrackMenu(x, y, song, removeCallback);
    };

    // closeMenu: закриває контекстне меню — скидає стан
    const closeMenu = () => {
        setIsMenuOpen(false);
        setOnRemove(null);
        setMenuData(null);
        setMenuRemoveLabel(null);
    };

    return (
        <MenuContext.Provider
            value={{
                isMenuOpen,
                menuPos,
                menuType,
                menuData,
                selectedSong: menuType === 'track' ? menuData : null,
                onRemove,
                menuRemoveLabel,
                openMenu,
                openTrackMenu,
                openAlbumMenu,
                openPlaylistMenu,
                openArtistMenu,
                closeMenu
            }}
        >
            {children}
        </MenuContext.Provider>
    );
}

// useMenu: хук доступу до MenuContext
export const useMenu = () => useContext(MenuContext);
