import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState, useMemo } from 'react';
import Header from './Header';
import Player from './Player';
import Modals from './Modals';
import ContextMenus from './ContextMenus';
import AuthModal from './AuthModal';
import PlayerHotkeys from './PlayerHotkeys';
import DeepLinkHandler from './DeepLinkHandler';
import { usePlayer } from '../context/PlayerContext';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';

// Layout: каркас додатку — Header, Outlet, Player, модалки
export default function Layout() {
    const { closeFullPlayer } = usePlayer();
    const { isAuthLoading } = useAuth();
    const { t } = useLocale();
    const location = useLocation();

    const defaultPhrases = useMemo(() => [
        t('layout.loadingMusic'),
        t('layout.loadingRecs'),
        t('layout.connecting'),
        t('layout.warming'),
        t('layout.findingTracks')
    ], [t]);

    const [isPageLoading, setIsPageLoading] = useState(false);
    const [customPhrases, setCustomPhrases] = useState(null);
    const [phraseIndex, setPhraseIndex] = useState(0);

    const showLoader = isAuthLoading || isPageLoading;
    const currentPhrases = customPhrases || defaultPhrases;

    useEffect(() => {
        closeFullPlayer();
    }, [location.pathname]);

    useEffect(() => {
        const handleStart = (e) => {
            if (e.detail?.phrases) setCustomPhrases(e.detail.phrases);
            setIsPageLoading(true);
        };
        const handleStop = () => {
            setIsPageLoading(false);
            setTimeout(() => setCustomPhrases(null), 500);
        };

        window.addEventListener('start-global-loader', handleStart);
        window.addEventListener('stop-global-loader', handleStop);

        return () => {
            window.removeEventListener('start-global-loader', handleStart);
            window.removeEventListener('stop-global-loader', handleStop);
        };
    }, []);

    useEffect(() => {
        let interval;
        if (showLoader) {
            interval = setInterval(() => {
                setPhraseIndex((prev) => (prev + 1) % currentPhrases.length);
            }, 2500);
        } else {
            setPhraseIndex(0);
        }
        return () => clearInterval(interval);
    }, [showLoader, currentPhrases.length]);

    return (
        <>
            <div className={`global_loader ${showLoader ? '' : 'hide'}`}>
                <div className="loader_spinner"></div>
                <h2 key={phraseIndex} className="loading_phrase">
                    {currentPhrases[phraseIndex]}
                </h2>
            </div>

            <PlayerHotkeys />
            <DeepLinkHandler />
            <Header />
            <main className="main">
                <div className="container full">
                    <Outlet />
                </div>
            </main>
            <Player />
            <Modals />
            <AuthModal />
            <ContextMenus />

            <style>{`
                .loading_phrase {
                    animation: textFadeInOut 2.5s ease-in-out infinite;
                    text-align: center;
                    color: #fff;
                    margin-top: 20px;
                }
                @keyframes textFadeInOut {
                    0% { opacity: 0; transform: translateY(5px); }
                    15% { opacity: 1; transform: translateY(0); }
                    85% { opacity: 1; transform: translateY(0); }
                    100% { opacity: 0; transform: translateY(-5px); }
                }
            `}</style>
        </>
    );
}
