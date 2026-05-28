import { useState } from 'react';
import { usePlaylist } from '../context/PlaylistContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLocale } from '../context/LocaleContext';

// Modals: глобальні модалки — auth, create playlist, help
export default function Modals() {
    const { isCreateModalOpen, closeCreateModal, pendingSong, loadMyPlaylists, loadCommunityPlaylists } = usePlaylist();
    const { user, openAuthModal } = useAuth();
    const { showToast } = useToast();
    const { t } = useLocale();

    const [privacyType, setPrivacyType] = useState('private');

    if (!isCreateModalOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!user) {
            showToast(t('toast.loginFirst'), 'warning');
            closeCreateModal();
            openAuthModal('login');
            return;
        }

        const name = e.target.playlist_name.value.trim();
        const description = e.target.playlist_desc.value.trim();
        const isPublic = privacyType === 'public';

        try {
            const res = await fetch('/api/playlists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description, isPublic, initialTrack: pendingSong })
            });

            if (res.ok) {
                await res.json();
                closeCreateModal();
                loadMyPlaylists();
                loadCommunityPlaylists();
                showToast(
                    isPublic
                        ? t('toast.playlistCreatedPublic', { name })
                        : t('toast.playlistCreated', { name }),
                    'success'
                );
                if (pendingSong && !Array.isArray(pendingSong)) {
                    showToast(t('toast.firstTrackAdded'), 'info');
                }
            } else {
                const err = await res.json().catch(() => ({}));
                showToast(err.error || t('toast.playlistCreateFail'), 'error');
            }
        } catch (err) {
            console.error(err);
            showToast(t('common.connectionError'), 'error');
        }
    };

    return (
        <div className="modal_overlay" onClick={(e) => e.target.className === 'modal_overlay' && closeCreateModal()}>
            <div className="create_playlist_card_fixed">
                <div className="create_playlist_header">
                    <h2>{t('modal.createTitle')}</h2>
                    <span className="close_modal_icon" onClick={closeCreateModal}>✕</span>
                </div>

                <form onSubmit={handleSubmit} className="create_playlist_form_new">
                    <div className="input_field_wrapper">
                        <div className="label_row">
                            <label>{t('modal.nameLabel')}</label>
                        </div>
                        <input type="text" name="playlist_name" placeholder={t('modal.playlistName')} required />
                    </div>

                    <div className="option_row" onClick={() => setPrivacyType('public')}>
                        <div className="option_info">
                            <div className="option_icon">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                            </div>
                            <div>
                                <div className="option_title">{t('modal.publicTitle')}</div>
                                <div className="option_desc">{t('modal.publicDesc')}</div>
                            </div>
                        </div>
                        <label className="switch_new">
                            <input
                                type="checkbox"
                                checked={privacyType === 'public'}
                                onChange={() => setPrivacyType('public')}
                            />
                            <span className="slider_new round"></span>
                        </label>
                    </div>

                    <div className="option_row" onClick={() => setPrivacyType('private')}>
                        <div className="option_info">
                            <div className="option_icon">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                            </div>
                            <div>
                                <div className="option_title">{t('modal.privateTitle')}</div>
                                <div className="option_desc">{t('modal.privateDesc')}</div>
                            </div>
                        </div>
                        <label className="switch_new">
                            <input
                                type="checkbox"
                                checked={privacyType === 'private'}
                                onChange={() => setPrivacyType('private')}
                            />
                            <span className="slider_new round"></span>
                        </label>
                    </div>

                    <div className="input_field_wrapper">
                        <label>{t('modal.descLabel')}</label>
                        <textarea name="playlist_desc" placeholder={t('modal.playlistDesc')} rows="3"></textarea>
                    </div>

                    <div className="create_playlist_footer_new">
                        <button type="button" className="btn_cancel_text" onClick={closeCreateModal}>{t('modal.cancel')}</button>
                        <button type="submit" className="btn_create_final">{t('modal.create')}</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
