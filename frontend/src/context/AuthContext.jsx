import { createContext, useState, useEffect, useContext } from 'react';
import { useToast } from './ToastContext';
import { useLocale } from './LocaleContext';

const AuthContext = createContext();

// AuthProvider: стан авторизації — user, модалка, checkAuthStatus
export function AuthProvider({ children }) {
    const { showToast } = useToast();
    const { t } = useLocale();
    const [user, setUser] = useState(null);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [isAuthLoading, setIsAuthLoading] = useState(true);
    const [authMode, setAuthMode] = useState('login');

    useEffect(() => {
        checkAuthStatus();
    }, []);

    // checkAuthStatus: перевіряє сесію при старті — GET /api/current_user
    const checkAuthStatus = async () => {
        try {
            const res = await fetch('/api/current_user');
            const userData = await res.json();
            setUser(userData && userData.displayName ? userData : null);
        } catch (err) {
            setUser(null);
        } finally {
            setIsAuthLoading(false);
        }
    };

    // openAuthModal: відкриває модалку входу/реєстрації — з режимом login або register
    const openAuthModal = (mode = 'login') => {
        setAuthMode(mode);
        setIsAuthModalOpen(true);
    };

    // closeAuthModal: закриває модалку авторизації — скидає isAuthModalOpen
    const closeAuthModal = () => setIsAuthModalOpen(false);

    // logout: вихід з акаунту — POST /api/logout
    const logout = async () => {
        try {
            const res = await fetch('/api/logout', { method: 'POST' });
            if (res.ok) {
                setUser(null);
                showToast(t('library.logoutSuccess'), 'info');
            } else {
                showToast(t('library.logoutFail'), 'error');
            }
        } catch (err) {
            console.error(err);
            showToast(t('common.connectionError'), 'error');
        }
    };

    return (
        <AuthContext.Provider value={{
            user,
            setUser,
            isAuthModalOpen,
            authMode,
            isAuthLoading,
            setAuthMode,
            openAuthModal,
            closeAuthModal,
            logout,
            checkAuthStatus
        }}>
            {children}
        </AuthContext.Provider>
    );
}

// useAuth: хук доступу до AuthContext — user, модалка, logout
export const useAuth = () => useContext(AuthContext);