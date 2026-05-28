import { useState, useRef, useEffect } from 'react';

// PipControl: заглушка вікна поверх вкладок (Document / video PiP)
export default function PipControl({ disabled = false, isFullPlayerOpen, onCollapse }) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const onDoc = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    if (isFullPlayerOpen) {
        return (
            <div
                className="icon exit_icon"
                title="Згорнути плеєр"
                role="button"
                aria-label="Згорнути плеєр"
                onClick={(e) => {
                    e.stopPropagation();
                    onCollapse?.();
                }}
            />
        );
    }

    return (
        <div className="pip_control_wrap" ref={wrapRef}>
            <div
                className="icon exit_icon"
                title="Вікно поверх вкладок"
                role="button"
                aria-label="Вікно поверх вкладок"
                aria-expanded={open}
                style={disabled ? { opacity: 0.35, pointerEvents: 'none' } : undefined}
                onClick={(e) => {
                    e.stopPropagation();
                    if (disabled) return;
                    setOpen((v) => !v);
                }}
            />

            {open && (
                <div
                    className="eq_popover pip_popover"
                    role="dialog"
                    aria-label="Вікно поверх вкладок"
                    onClick={(e) => e.stopPropagation()}
                >
                    <p className="eq_popover_title">Вікно поверх вкладок</p>
                    <p className="eq_popover_stub">
                        Планувалось міні-вікно при зміні вкладки (Picture-in-Picture), але YouTube
                        відтворює через iframe — браузер не дає стабільно винести плеєр поверх інших
                        вкладок з власним інтерфейсом, на відміну від YouTube Music з прямим відео.
                    </p>
                </div>
            )}
        </div>
    );
}
