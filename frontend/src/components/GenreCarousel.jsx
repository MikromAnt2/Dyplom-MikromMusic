// src/components/GenreCarousel.jsx
import { useNavigate } from "react-router-dom";
import { useLocale } from "../context/LocaleContext";

// GenreCarousel: карусель жанрів — лінки на /genre
export default function GenreCarousel({ genres }) {
    const navigate = useNavigate();
    const { t } = useLocale();

    return (
        <section className="section" style={{ marginTop: "40px" }}>
            <h2 style={{ fontSize: "24px", fontWeight: 700, marginBottom: 16 }}>
                {t('library.genresTitle')}
            </h2>

            <div
                className="genre_carousel"
                style={{
                    display: "flex",
                    gap: "20px",
                    overflowX: "auto",
                    paddingBottom: "10px",
                }}
            >
                {genres.map((g) => (
                    <div
                        key={g.slug}
                        className="genre_card"
                        onClick={() => navigate(`/genre/${g.slug}`)}
                        style={{
                            minWidth: "180px",
                            height: "180px",
                            background: "#222",
                            borderRadius: "12px",
                            padding: "20px",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between",
                            cursor: "pointer",
                        }}
                    >
                        <span style={{ fontSize: "40px" }}>{g.emoji}</span>
                        <span style={{ fontWeight: 600, fontSize: "18px" }}>
                            {g.name}
                        </span>
                    </div>
                ))}
            </div>
        </section>
    );
}
