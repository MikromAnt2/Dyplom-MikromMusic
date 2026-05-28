// GENRE_CATALOG: slug жанру → ключ i18n та emoji (спільно для Home і GenrePage)
export const GENRE_CATALOG = [
    { slug: 'classical', emoji: '🎻', nameKey: 'home.genres.classical' },
    { slug: 'jazz', emoji: '🎷', nameKey: 'home.genres.jazz' },
    { slug: 'lofi', emoji: '🌙', nameKey: 'home.genres.lofi' },
    { slug: 'acoustic', emoji: '🎸', nameKey: 'home.genres.acoustic' },
    { slug: 'piano', emoji: '🎹', nameKey: 'home.genres.piano' },
    { slug: 'orchestral', emoji: '🎺', nameKey: 'home.genres.orchestral' },
    { slug: 'pop', emoji: '🎤', nameKey: 'home.genres.pop' },
    { slug: 'rock', emoji: '⚡', nameKey: 'home.genres.rock' },
    { slug: 'hiphop', emoji: '🎧', nameKey: 'home.genres.hiphop' },
    { slug: 'anime-ost', emoji: '✨', nameKey: 'home.genres.animeOst' },
    { slug: 'vocaloid', emoji: '📱', nameKey: 'home.genres.vocaloid' },
    { slug: 'electronic', emoji: '🎛️', nameKey: 'home.genres.electronic' }
];

// buildGenresList: список жанрів для головної — з перекладеними назвами
export function buildGenresList(t) {
    return GENRE_CATALOG.map((g) => ({
        slug: g.slug,
        emoji: g.emoji,
        name: t(g.nameKey)
    }));
}

// getLocalizedGenre: метадані жанру за slug і поточною мовою
export function getLocalizedGenre(slug, t) {
    const g = GENRE_CATALOG.find((x) => x.slug === slug);
    if (!g) return null;
    return { slug: g.slug, emoji: g.emoji, title: t(g.nameKey) };
}
