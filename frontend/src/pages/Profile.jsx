import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useLocale } from '../context/LocaleContext';

// Profile: редагування профілю — ім'я, email, аватар
export default function Profile() {
    const { user, setUser } = useAuth();
    const { t } = useLocale();
    const navigate = useNavigate();

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [avatar, setAvatar] = useState('');
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (!user) {
            navigate('/');
        } else {
            setName(user.displayName || '');
            setEmail(user.email || '');
            setAvatar(user.avatar || '');
        }
    }, [user, navigate]);

    const getAvatarColor = (name) => {
        if (!name) return '#a855f7';
        const colors = ['#a855f7', '#f44336', '#e91e63', '#9c27b0', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4'];
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
        return colors[Math.abs(hash) % colors.length];
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) {
                alert(t('profile.fileTooBig'));
                return;
            }

            const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif'];
            if (!allowedTypes.includes(file.type)) {
                alert(t('profile.fileType'));
                return;
            }

            const reader = new FileReader();
            reader.onloadend = () => {
                if (file.type === 'image/svg+xml') {
                    setAvatar(reader.result);
                    return;
                }

                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    setAvatar(canvas.toDataURL('image/png'));
                };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/user/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayName: name, email: email, avatar: avatar })
            });

            if (res.ok) {
                const updatedUser = await res.json();
                setUser(updatedUser);
                alert(t('profile.updated'));
            } else {
                const data = await res.json();
                alert(data.error || t('profile.updateFail'));
            }
        } catch (err) {
            console.error(err);
            alert(t('common.connectionError'));
        }
    };

    if (!user) return null;

    const hasCustomAvatar = avatar && avatar !== 'images/user-template.png';

    return (
        <div className="artist_full_tab" style={{ maxWidth: '850px', margin: '0 auto', marginTop: '40px' }}>
            <h2 style={{ fontSize: '32px', marginBottom: '40px', fontWeight: 700 }}>{t('profile.title')}</h2>

            <form className="profile_layout" onSubmit={handleSubmit}>
                <div className="profile_left">
                    <div
                        className="profile_avatar_large"
                        style={{
                            backgroundColor: hasCustomAvatar ? 'transparent' : getAvatarColor(user.displayName),
                            overflow: 'hidden'
                        }}
                    >
                        {hasCustomAvatar ? (
                            <img src={avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            user.displayName.charAt(0).toUpperCase()
                        )}
                    </div>

                    <input
                        type="file"
                        accept="image/png, image/jpeg, image/webp, image/svg+xml, image/gif"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        onChange={handleFileChange}
                    />

                    <button type="button" className="btn_change_avatar" onClick={() => fileInputRef.current.click()}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '8px'}}>
                            <path d="M12 20h9"></path>
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                        </svg>
                        {t('profile.changeAvatar')}
                    </button>
                </div>

                <div className="profile_right">
                    <div className="input_field_wrapper">
                        <label>{t('profile.name')}</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            className="profile_input"
                        />
                    </div>

                    <div className="input_field_wrapper" style={{ marginTop: '24px' }}>
                        <label>{t('profile.email')}</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="profile_input"
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '40px' }}>
                        <button type="submit" className="btn_submit_purple" style={{ padding: '12px 32px', fontSize: '15px' }}>
                            {t('profile.save')}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}
