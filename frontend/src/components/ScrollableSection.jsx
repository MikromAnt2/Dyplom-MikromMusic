import { useRef } from 'react';

// ScrollableSection: горизонтальна секція з заголовком — для Home
export default function ScrollableSection({ title, subtitle, children }) {
    const scrollRef = useRef(null);

    // scroll: горизонтальний скрол списку на offset px
    const scroll = (offset) => {
        if (scrollRef.current) {
            scrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
        }
    };

    return (
        <section className="section music_section">
            <div className="section_header">
                <div>
                    <h2>{title}</h2>
                    {subtitle ? <span className="section_subtitle">{subtitle}</span> : null}
                </div>
                <div className="arrows">
                    <button className="scroll_btn prev" onClick={() => scroll(-400)}>‹</button>
                    <button className="scroll_btn next" onClick={() => scroll(400)}>›</button>
                </div>
            </div>

            <div className="song_list horizontal_list horizontal_scroll" ref={scrollRef}>
                {children}
            </div>
        </section>
    );
}
