import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { useLocale } from '../context/LocaleContext';
import HotkeysTable from './HotkeysTable';

const WELCOME_SESSION_KEY = 'mikrom-welcome-session-v1';

// HelpModal: привітання для гостей (раз на сесію); кнопка ? — довідка та гарячі клавіші
export default function HelpModal() {
    const { user, isAuthLoading, openAuthModal } = useAuth();
    const { currentSong, isFullPlayerOpen } = usePlayer();
    const { t } = useLocale();
    const [isOpen, setIsOpen] = useState(false);
    const [tab, setTab] = useState('about');

    useEffect(() => {
        document.body.classList.toggle('has-player-bar', Boolean(currentSong?.youtubeId));
        return () => document.body.classList.remove('has-player-bar');
    }, [currentSong?.youtubeId]);

    useEffect(() => {
        if (isAuthLoading) return undefined;
        if (user) return undefined;
        if (sessionStorage.getItem(WELCOME_SESSION_KEY)) return undefined;

        const timer = window.setTimeout(() => {
            setTab('about');
            setIsOpen(true);
            sessionStorage.setItem(WELCOME_SESSION_KEY, '1');
        }, 900);

        return () => window.clearTimeout(timer);
    }, [user, isAuthLoading]);

    useEffect(() => {
        document.body.style.overflow = isOpen ? 'hidden' : '';
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    const openHelp = (nextTab = 'about') => {
        setTab(nextTab);
        setIsOpen(true);
    };

    return (
        <>
            {!isFullPlayerOpen && (
            <button
                type="button"
                className="help_fab"
                onClick={() => openHelp('hotkeys')}
                title={t('help.fabTitle')}
                aria-label={t('help.fabAria')}
            >
                ?
            </button>
            )}

            {isOpen && (
                <div className="help_overlay" onClick={() => setIsOpen(false)}>
                    <div className="help_panel help_panel--wide" onClick={(e) => e.stopPropagation()}>
                        <button
                            type="button"
                            className="help_close"
                            onClick={() => setIsOpen(false)}
                            aria-label={t('help.close')}
                        >
                            ×
                        </button>

                        <div className="help_tabs" role="tablist">
                            <button
                                type="button"
                                role="tab"
                                aria-selected={tab === 'about'}
                                className={`help_tab ${tab === 'about' ? 'help_tab--active' : ''}`}
                                onClick={() => setTab('about')}
                            >
                                {t('help.about')}
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={tab === 'hotkeys'}
                                className={`help_tab ${tab === 'hotkeys' ? 'help_tab--active' : ''}`}
                                onClick={() => setTab('hotkeys')}
                            >
                                {t('help.hotkeys')}
                            </button>
                        </div>

                        {tab === 'hotkeys' ? (
                            <>
                                <h2>{t('help.hotkeysTitle')}</h2>
                                <p className="help_lead">{t('help.hotkeysLead')}</p>
                                <HotkeysTable />
                            </>
                        ) : (
                            <>
                                <h2>{t('help.welcomeTitle')}</h2>
                                <p className="help_lead">{t('help.welcomeLead')}</p>

                                <div className="help_sections">
                                    <div className="help_box">
                                        <strong className="help_box_title">{t('help.featuresTitle')}</strong>
                                        <ul>
                                            <li>{t('help.feature1')}</li>
                                            <li>{t('help.feature2')}</li>
                                            <li>{t('help.feature3')}</li>
                                            <li>{t('help.feature4')}</li>
                                            <li>{t('help.feature5')}</li>
                                        </ul>
                                    </div>

                                    <div className="help_box">
                                        <strong className="help_box_title">{t('help.tipTitle')}</strong>
                                        <p className="help_note">
                                            {t('help.tipText')}{' '}
                                            <button
                                                type="button"
                                                className="help_inline_link"
                                                onClick={() => setTab('hotkeys')}
                                            >
                                                {t('help.tipLink')}
                                            </button>
                                            .
                                        </p>
                                    </div>

                                    <div className="help_box">
                                        <strong className="help_box_title">{t('help.deployNoteTitle')}</strong>
                                        <p className="help_note">{t('help.deployNoteText')}</p>
                                    </div>

                                    {!user && (
                                        <div className="help_box help_box--accent">
                                            <strong className="help_box_title help_box_title--accent">
                                                {t('help.registerTitle')}
                                            </strong>
                                            <p className="help_note">{t('help.registerNote')}</p>
                                            <div className="help_auth_row">
                                                <button
                                                    type="button"
                                                    className="btn_submit_purple"
                                                    onClick={() => {
                                                        setIsOpen(false);
                                                        openAuthModal('register');
                                                    }}
                                                >
                                                    {t('help.createAccount')}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="help_btn_secondary"
                                                    onClick={() => {
                                                        setIsOpen(false);
                                                        openAuthModal('login');
                                                    }}
                                                >
                                                    {t('header.login')}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        <div className="help_footer">
                            <button
                                type="button"
                                className="btn_submit_purple help_btn_done"
                                onClick={() => setIsOpen(false)}
                            >
                                {t('help.done')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
