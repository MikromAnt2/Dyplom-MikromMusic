import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { ToastProvider } from './context/ToastContext.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { PlayerProvider } from './context/PlayerContext.jsx'
import { PlaylistProvider } from './context/PlaylistContext.jsx'
import { MenuProvider } from './context/MenuContext.jsx'
import { LocaleProvider } from './context/LocaleContext.jsx'

if (typeof window !== 'undefined') {
    window.__MIKROM_PAGE_LOAD = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <ToastProvider>
        <LocaleProvider>
        <AuthProvider>
            <PlaylistProvider>
                <MenuProvider>
                    <PlayerProvider>
                        <App />
                    </PlayerProvider>
                </MenuProvider>
            </PlaylistProvider>
        </AuthProvider>
        </LocaleProvider>
    </ToastProvider>
)