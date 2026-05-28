import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import siteLogo from '../assets/images/siteLogo.png';
import searchIcon from '../assets/images/Search.png';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';

// Header: лого + пошук зліва; навігація, мова та профіль — справа
export default function Header() {
    const { user, openAuthModal, logout } = useAuth();
    const { locale, setLocale, t } = useLocale();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [langOpen, setLangOpen] = useState(false);
    const dropdownRef = useRef(null);
    const langRef = useRef(null);
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const [searchQuery, setSearchQuery] = useState('');

    const langButtonLabel = locale === 'en' ? t('header.langEn') : t('header.langUk');

    useEffect(() => {
        if (location.pathname === '/search') {
            setSearchQuery(searchParams.get('q') || '');
        }
    }, [location.pathname, searchParams]);

    const handleSearch = (e) => {
        if (e.key === 'Enter' && searchQuery.trim()) {
            navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
        }
    };

    const getAvatarColor = (name) => {
        if (!name) return '#a855f7';
        const colors = ['#a855f7', '#f44336', '#e91e63', '#9c27b0', '#3f51b5', '#2196f3', '#00bcd4', '#009688', '#4caf50', '#ff9800', '#ff5722'];
        const charCode = name.charCodeAt(0);
        return colors[charCode % colors.length];
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (langRef.current && !langRef.current.contains(event.target)) {
                setLangOpen(false);
            }
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const pickLocale = (code) => {
        setLocale(code);
        setLangOpen(false);
    };

    return (
        <header className="header" id="header_border">
            <div className="header_inner" id="header_inner_border">
                <div className="header_left">
                    <NavLink to="/" className="logo" title={t('header.logoTitle')}>
                        <img src={siteLogo} alt="Mikrom" />
                    </NavLink>
                </div>

                <div className="header_right">
                    <nav className="header_nav">
                        <NavLink to="/" className="nav_item" end>{t('header.home')}</NavLink>
                        <NavLink to="/favorites" className="nav_item" id="nav_favorites">{t('header.library')}</NavLink>
                    </nav>

                    <div className="search_bar">
                        <span className="search_icon_wrapper"><img src={searchIcon} alt="" /></span>
                        <input
                            type="search"
                            id="search_input"
                            name="mikrom_search"
                            placeholder={t('header.searchPlaceholder')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={handleSearch}
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                        />
                    </div>

                    <div className="lang_switch" ref={langRef}>
                        <button
                            type="button"
                            className="lang_btn lang_btn--current"
                            onClick={() => setLangOpen((v) => !v)}
                            aria-expanded={langOpen}
                            aria-haspopup="listbox"
                            aria-label={t('header.langAria')}
                        >
                            {langButtonLabel}
                            <span className="lang_chevron" aria-hidden="true">▾</span>
                        </button>
                        {langOpen && (
                            <div className="lang_dropdown" role="listbox" aria-label={t('header.langAria')}>
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={locale === 'uk'}
                                    className={`lang_dropdown_item ${locale === 'uk' ? 'lang_dropdown_item--active' : ''}`}
                                    onClick={() => pickLocale('uk')}
                                >
                                    {t('header.langMenuUk')}
                                </button>
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={locale === 'en'}
                                    className={`lang_dropdown_item ${locale === 'en' ? 'lang_dropdown_item--active' : ''}`}
                                    onClick={() => pickLocale('en')}
                                >
                                    {t('header.langMenuEn')}
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="auth_buttons" ref={dropdownRef}>
                        {user ? (
                            <>
                                <div
                                    className="user_avatar_circle"
                                    style={{
                                        backgroundColor: user.avatar && user.avatar !== 'images/user-template.png' ? 'transparent' : getAvatarColor(user.displayName),
                                        backgroundImage: user.avatar && user.avatar !== 'images/user-template.png' ? `url(${user.avatar})` : 'none',
                                        backgroundSize: 'cover',
                                        backgroundPosition: 'center'
                                    }}
                                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                >
                                    {(!user.avatar || user.avatar === 'images/user-template.png') && user.displayName.charAt(0).toUpperCase()}
                                </div>

                                {isDropdownOpen && (
                                    <div className="profile_dropdown_menu">
                                        <div className="context-menu-item" style={{ cursor: 'pointer' }} onClick={() => { navigate('/profile'); setIsDropdownOpen(false); }}>
                                            <div className="popup_icon popup_icon_settings"></div><span>{t('header.settings')}</span>
                                        </div>
                                        <div className="context-menu-item" style={{ color: '#ff4d4d'}} onClick={() => { logout(); setIsDropdownOpen(false); }}>
                                            <div className="popup_icon popup_icon_exit"></div><span>{t('header.logout')}</span>
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="dropdown_logged_out">
                                <button type="button" className="btn_login" onClick={() => openAuthModal('login')}>{t('header.login')}</button>
                                <button type="button" className="btn_register" onClick={() => openAuthModal('register')}>{t('header.register')}</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
}
