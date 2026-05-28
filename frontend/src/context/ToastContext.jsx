import { createContext, useState, useContext, useCallback } from 'react';

const ToastContext = createContext();
const MAX_TOASTS = 5;
const DEFAULT_DURATION = 4500;

// useToast: хук показу toast-повідомлень
export const useToast = () => useContext(ToastContext);

// ToastProvider: стек toast-повідомлень — auto-dismiss за duration
export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    // showToast: показує toast — auto-hide після duration, max 5
    const showToast = useCallback((message, type = 'success', duration = DEFAULT_DURATION) => {
        if (!message) return;
        const id = Date.now() + Math.random();
        setToasts((prev) => [...prev.slice(-(MAX_TOASTS - 1)), { id, message, type }]);

        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
    }, []);

    const getIcon = (type) => {
        if (type === 'error') return '✕';
        if (type === 'info') return 'ℹ';
        if (type === 'warning') return '!';
        return '✓';
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="toast_stack">
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        role="status"
                        className={`toast_item toast_item--${toast.type}`}
                    >
                        <span className="toast_icon">{getIcon(toast.type)}</span>
                        {toast.message}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
