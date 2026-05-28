// EmptyState: порожній стан секції — коли список порожній (не завантаження)
export default function EmptyState({ title, message, actionLabel, onAction }) {
    return (
        <div className="empty_state">
            {title ? <strong className="empty_state_title">{title}</strong> : null}
            <p>{message}</p>
            {actionLabel && onAction ? (
                <button type="button" className="btn_mix" onClick={onAction}>
                    {actionLabel}
                </button>
            ) : null}
        </div>
    );
}
