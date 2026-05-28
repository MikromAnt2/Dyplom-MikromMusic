import { useState, useRef, useEffect } from 'react';

// EqControl: заглушка еквалайзера (Web Audio API — обмеження YouTube iframe)
export default function EqControl({ disabled = false }) {
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

    return (
        <div className="eq_control_wrap" ref={wrapRef}>
            <button
                type="button"
                className="player_tool_icon eq_icon_btn"
                title="Еквалайзер"
                aria-label="Еквалайзер"
                aria-expanded={open}
                disabled={disabled}
                onClick={(e) => {
                    e.stopPropagation();
                    setOpen((v) => !v);
                }}
            >
                <span className="eq_icon_bars" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                </span>
            </button>

            {open && (
                <div
                    className="eq_popover"
                    role="dialog"
                    aria-label="Еквалайзер"
                    onClick={(e) => e.stopPropagation()}
                >
                    <p className="eq_popover_title">Еквалайзер</p>
                    <p className="eq_popover_stub">
                        Планувався на Web Audio API (пресети бас / вокал / стандарт), але YouTube
                        відтворює звук у захищеному iframe — браузер не дає підключити еквалайзер
                        до цього потоку без окремого проксі аудіо, який блокується політикою YouTube.
                    </p>
                </div>
            )}
        </div>
    );
}
