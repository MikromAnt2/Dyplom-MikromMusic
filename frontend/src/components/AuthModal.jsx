import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLocale } from '../context/LocaleContext';

// AuthModal: модалка входу та реєстрації — login/register tabs
export default function AuthModal() {
    const { isAuthModalOpen, closeAuthModal, authMode, checkAuthStatus } = useAuth();
    const { showToast } = useToast();
    const { t } = useLocale();

    const [activeTab, setActiveTab] = useState('login');
    const [error, setError] = useState('');

    useEffect(() => {
        if (isAuthModalOpen) {
            setActiveTab(authMode || 'login');
            setError('');
        }
    }, [isAuthModalOpen, authMode]);

    if (!isAuthModalOpen) return null;

    // handleLoginSubmit: локальний вхід — POST /api/login
    const handleLoginSubmit = async (e) => {
        e.preventDefault();
        setError('');
        const email = e.target.email.value;
        const password = e.target.password.value;

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();

            if (!res.ok) setError(data.error || t('auth.wrongCredentials'));
            else {
                await checkAuthStatus();
                closeAuthModal();
                showToast(t('auth.loginSuccess'), 'success');
            }
        } catch (err) {
            setError(t('common.connectionError'));
        }
    };

    // handleRegisterSubmit: реєстрація — POST /api/register
    const handleRegisterSubmit = async (e) => {
        e.preventDefault();
        setError('');
        const displayName = e.target.displayName.value;
        const email = e.target.email.value;
        const password = e.target.password.value;

        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayName, email, password })
            });
            const data = await res.json();

            if (!res.ok) setError(data.error || t('auth.registerError'));
            else {
                await checkAuthStatus();
                closeAuthModal();
                showToast(t('auth.registerSuccess'), 'success');
            }
        } catch (err) {
            setError(t('common.connectionError'));
        }
    };

    return (
        <div className="modal_overlay">
            <div className="modal_content auth_modal_inner">
                <span className="modal_close" onClick={closeAuthModal}>✕</span>

                <div className="auth_tabs">
                    <button
                        className={`auth_tab ${activeTab === 'login' ? 'active' : ''}`}
                        onClick={() => { setActiveTab('login'); setError(''); }}
                    >
                        {t('auth.login')}
                    </button>
                    <button
                        className={`auth_tab ${activeTab === 'register' ? 'active' : ''}`}
                        onClick={() => { setActiveTab('register'); setError(''); }}
                    >
                        {t('auth.register')}
                    </button>
                </div>

                <div className="auth_forms">
                    {error && <div style={{ color: '#ff4d4d', marginBottom: '15px', textAlign: 'center', fontSize: '14px' }}>{error}</div>}

                    {activeTab === 'login' ? (
                        <form id="form_login" onSubmit={handleLoginSubmit}>
                            <div className="input_group">
                                <label>{t('auth.email')}</label>
                                <input type="email" name="email" placeholder={t('auth.emailPlaceholder')} required />
                            </div>
                            <div className="input_group">
                                <label>{t('auth.password')}</label>
                                <input type="password" name="password" placeholder={t('auth.passwordPlaceholder')} required />
                            </div>
                            <button type="submit" className="btn_submit">{t('auth.submitLogin')}</button>
                        </form>
                    ) : (
                        <form id="form_register" onSubmit={handleRegisterSubmit}>
                            <div className="input_group">
                                <label>{t('auth.displayName')}</label>
                                <input type="text" name="displayName" placeholder={t('auth.displayNamePlaceholder')} required />
                            </div>
                            <div className="input_group">
                                <label>{t('auth.email')}</label>
                                <input type="email" name="email" placeholder={t('auth.emailPlaceholder')} required />
                            </div>
                            <div className="input_group">
                                <label>{t('auth.password')}</label>
                                <input type="password" name="password" placeholder={t('auth.passwordNewPlaceholder')} required />
                            </div>
                            <button type="submit" className="btn_submit">{t('auth.submitRegister')}</button>
                        </form>
                    )}
                </div>

                <div className="modal_divider"><span>{t('auth.or')}</span></div>
                <button className="modal_btn_google" onClick={() => window.location.href = '/auth/google'}>
                    {t('auth.google')}
                </button>
            </div>
        </div>
    );
}
