import { useNavigate } from 'react-router-dom';
import { useLocale } from '../context/LocaleContext';

// BackButton: навігація назад (history -1 або custom onClick)
export default function BackButton({ onClick, className = '' }) {
    const navigate = useNavigate();
    const { t } = useLocale();
    const handleClick = onClick || (() => navigate(-1));

    return (
        <div onClick={handleClick} className={`back_btn ${className}`.trim()} role="button" tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleClick();
                }
            }}
        >
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
            </svg>
            {t('contextMenu.back')}
        </div>
    );
}
