import { useLocale } from '../context/LocaleContext';

// ShareLinkButton: кнопка «поділитися» зі спрайта іконок
export default function ShareLinkButton({ className = 'player_tool_icon share_link_btn', title, disabled, onClick }) {
    const { t } = useLocale();
    const resolvedTitle = title ?? t('common.share');

    return (
        <button
            type="button"
            className={className}
            title={resolvedTitle}
            aria-label={resolvedTitle}
            disabled={disabled}
            onClick={onClick}
        >
            <span className="share_icon" aria-hidden="true" />
        </button>
    );
}
