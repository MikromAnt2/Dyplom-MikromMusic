import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import PlaylistCard from "../components/PlaylistCard";
import ScrollableSection from "../components/ScrollableSection";
import ArtistCard from "../components/ArtistCard";
import AlbumCard from "../components/AlbumCard";
import TrackCard from "../components/TrackCard";
import EmptyState from "../components/EmptyState";
import CardRowSkeleton from "../components/CardRowSkeleton";
import ContinueListening from "../components/ContinueListening";

import { usePlaylist } from "../context/PlaylistContext";
import { usePlayer } from "../context/PlayerContext";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../context/LocaleContext";
import { getGuestListeningIds } from "../utils/guestSession";
import { normalizeTrack } from "../utils/track";
import { buildGenresList } from "../translations/genreMeta";

const COMMUNITY_LIMIT = 20;

// homeStorageKey: ключ sessionStorage для кешу Home — per userId або guest
function homeStorageKey(userId) {
    return userId ? `mikrom-home-v3-${userId}` : "mikrom-home-v3-guest";
}

// hasAnyBlocks: чи є непорожні блоки рекомендацій — хоча б один масив
function hasAnyBlocks(blocks) {
    if (!blocks || typeof blocks !== "object") return false;
    return Object.values(blocks).some((v) => Array.isArray(v) && v.length > 0);
}

// Home: головна — персональні або гостьові блоки рекомендацій
export default function Home() {
    const navigate = useNavigate();
    const { communityPlaylists } = usePlaylist();
    const { playSong } = usePlayer();
    const { user, isAuthLoading } = useAuth();
    const { t } = useLocale();

    const authSections = useMemo(() => [
        { key: "listenAgain", title: t("home.sections.listenAgain") },
        { key: "forYou", title: t("home.sections.forYou") },
        { key: "newFromSubscribed", title: t("home.sections.newFromSubscribed") },
        { key: "basedOnListening", title: t("home.sections.basedOnListening") },
        { key: "newForYou", title: t("home.sections.newForYou") },
        { key: "exploreMix", title: t("home.sections.exploreMix") },
        { key: "popularInYourGenres", title: t("home.sections.popularInYourGenres") },
        { key: "albumsForYou", title: t("home.sections.albumsForYou"), type: "albums", alwaysShow: true },
        { key: "communityPlaylists", title: t("home.sections.communityPlaylists"), type: "playlists", alwaysShow: true },
        { key: "artistsYouMayLike", title: t("home.sections.artistsYouMayLike"), type: "artists" },
        { key: "trendingNow", title: t("home.sections.trendingNow") }
    ], [t]);

    const guestSections = useMemo(() => [
        { key: "trendingNow", title: t("home.sections.trendingNow") },
        { key: "popularNewReleases", title: t("home.sections.popularNewReleases") },
        { key: "popularArtists", title: t("home.sections.popularArtists"), type: "artists" },
        { key: "communityPlaylists", title: t("home.sections.communityPlaylists"), type: "playlists", alwaysShow: true },
        { key: "popularAlbums", title: t("home.sections.popularAlbums"), type: "albums" }
    ], [t]);

    const GENRES = useMemo(() => buildGenresList(t), [t]);

    const genresScrollRef = useRef(null);
    const [blocks, setBlocks] = useState({});
    const [homeReady, setHomeReady] = useState(false);
    const [communityLoading, setCommunityLoading] = useState(true);
    const [artistsLoading, setArtistsLoading] = useState(false);

    const scrollGenres = (offset) => {
        genresScrollRef.current?.scrollBy({ left: offset, behavior: "smooth" });
    };

    useEffect(() => {
        setCommunityLoading(true);
        const t = setTimeout(() => setCommunityLoading(false), 800);
        return () => clearTimeout(t);
    }, [communityPlaylists]);

    const fetchArtistsInBackground = useCallback(async () => {
        if (!user) return;
        setArtistsLoading(true);
        try {
            const res = await fetch("/api/recommendations/home-artists", {
                credentials: "include",
                cache: "no-store"
            });
            if (res.ok) {
                const data = await res.json();
                const list = data.artistsYouMayLike || [];
                if (list.length) {
                    setBlocks((prev) => ({ ...prev, artistsYouMayLike: list }));
                }
            }
        } catch (e) {
            console.error("Помилка завантаження виконавців:", e);
        } finally {
            setArtistsLoading(false);
        }
    }, [user]);

    const fetchListenAgainInBackground = useCallback(async () => {
        if (!user) return;
        try {
            const res = await fetch("/api/history/top-played?limit=25", {
                credentials: "include",
                cache: "no-store"
            });
            if (!res.ok) return;
            const rows = await res.json();
            const tracks = (rows || [])
                .map((s) =>
                    normalizeTrack({
                        youtubeId: s.youtubeId,
                        title: s.title,
                        author: s.author,
                        image: s.image,
                        duration: s.duration
                    })
                )
                .filter(Boolean);
            if (tracks.length) {
                setBlocks((prev) => ({ ...prev, listenAgain: tracks }));
            }
        } catch (e) {
            console.error("Помилка завантаження «Прослухати ще раз»:", e);
        }
    }, [user]);

    useEffect(() => {
        if (isAuthLoading) return;

        const storageKey = homeStorageKey(user?.id);

        const guestSeeds = !user ? getGuestListeningIds().join(",") : "";

        const applyHomeData = (data, persist = true) => {
            const b = data.blocks || {};
            setBlocks(b);
            setHomeReady(true);
            if (persist && storageKey) {
                try {
                    sessionStorage.setItem(
                        storageKey,
                        JSON.stringify({
                            blocks: b,
                            meta: data.meta || {},
                            guestSeeds: guestSeeds || undefined
                        })
                    );
                } catch (_) {
                }
            }
            if (user) {
                fetchArtistsInBackground();
            }
            if (user && !b.listenAgain?.length) {
                fetchListenAgainInBackground();
            }
        };

        let hasStale = false;
        let guestCacheValid = false;
        if (storageKey) {
            try {
                const raw = sessionStorage.getItem(storageKey);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed?.blocks && hasAnyBlocks(parsed.blocks)) {
                        const seedsMatch =
                            user || !guestSeeds || parsed.guestSeeds === guestSeeds;
                        if (seedsMatch) {
                            applyHomeData(parsed, false);
                            hasStale = true;
                            guestCacheValid = !user;
                        }
                    }
                }
            } catch (_) {
            }
        }

        const fetchHomeContent = async (withLoader) => {
            if (withLoader) {
                window.dispatchEvent(
                    new CustomEvent("start-global-loader", {
                        detail: {
                            phrases: [
                                t("home.loadingFeed"),
                                t("home.almostReady")
                            ]
                        }
                    })
                );
                if (!hasStale) setHomeReady(false);
            }

            try {
                if (!user) {
                    const seeds = getGuestListeningIds();
                    const guestUrl = `/api/recommendations/home-guest?seeds=${encodeURIComponent(seeds.join(","))}`;
                    const guestRes = await fetch(guestUrl, { cache: "no-store" });
                    if (guestRes.ok) {
                        applyHomeData(await guestRes.json());
                    }
                } else {
                    const res = await fetch("/api/recommendations/home-full", {
                        credentials: "include",
                        cache: "no-store"
                    });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.error && !hasAnyBlocks(data.blocks)) {
                            console.error("Home recommendations:", data.error);
                            if (!hasStale) {
                                setBlocks({});
                                setHomeReady(true);
                            }
                        } else {
                            applyHomeData(data);
                        }
                    } else if (!hasStale) {
                        console.error("Home recommendations HTTP", res.status);
                        setHomeReady(true);
                    }
                }
            } catch (err) {
                console.error("Помилка завантаження головної:", err);
                if (!hasStale) setHomeReady(true);
            } finally {
                if (withLoader) {
                    window.dispatchEvent(new Event("stop-global-loader"));
                }
            }
        };

        if (guestCacheValid) {
            return;
        }

        fetchHomeContent(!hasStale);
    }, [user, isAuthLoading, fetchArtistsInBackground, fetchListenAgainInBackground]);

    const renderTrackCard = (track, keyPrefix, i, list, useRadioQueue = false) => (
        <TrackCard
            key={`${keyPrefix}-${track.youtubeId}-${i}`}
            track={track}
            list={list}
            useRadioQueue={useRadioQueue}
        />
    );

    const renderArtistCard = (artist, keyPrefix, i) => (
        <ArtistCard key={`${keyPrefix}-${artist.channelId}-${i}`} artist={artist} size={130} />
    );

    const renderAlbumCard = (album, keyPrefix, i) => (
        <AlbumCard key={`${keyPrefix}-${album.youtubeId}-${i}`} album={album} onPlay={playSong} />
    );

    const renderCommunityPlaylists = () => {
        const list = (communityPlaylists || []).slice(0, COMMUNITY_LIMIT);
        return (
            <ScrollableSection title={t("home.communityPlaylists")}>
                {communityLoading && list.length === 0 ? (
                    <CardRowSkeleton count={4} type="card" />
                ) : list.length > 0 ? (
                    list.map((playlist) => <PlaylistCard key={playlist.id} playlist={playlist} />)
                ) : (
                    <EmptyState
                        message={t("home.communityEmpty")}
                        actionLabel={user ? t("home.createPlaylist") : undefined}
                        onAction={user ? () => navigate("/favorites") : undefined}
                    />
                )}
            </ScrollableSection>
        );
    };

    const sections = user ? authSections : guestSections;

    const renderSection = ({ key, title, type, alwaysShow }) => {
        if (type === "playlists") return <div key={key}>{renderCommunityPlaylists()}</div>;

        const items = blocks[key];

        if (type === "artists") {
            if (!homeReady || (artistsLoading && !items?.length)) {
                return (
                    <ScrollableSection key={key} title={title}>
                        <CardRowSkeleton count={6} type="artist" />
                    </ScrollableSection>
                );
            }
            if (!items?.length) return null;
            return (
                <ScrollableSection key={key} title={title}>
                    {items.map((artist, i) => renderArtistCard(artist, key, i))}
                </ScrollableSection>
            );
        }

        if (!items?.length && !alwaysShow) return null;

        if (type === "albums") {
            return (
                <ScrollableSection key={key} title={title}>
                    {!homeReady ? (
                        <CardRowSkeleton count={5} type="card" />
                    ) : items?.length ? (
                        items.map((album, i) => renderAlbumCard(album, key, i))
                    ) : (
                        <EmptyState message={t("home.albumsHint")} />
                    )}
                </ScrollableSection>
            );
        }
        if (!items?.length) return null;
        return (
            <ScrollableSection key={key} title={title}>
                {items.map((track, i) => renderTrackCard(track, key, i, items, key === "listenAgain"))}
            </ScrollableSection>
        );
    };

    return (
        <div className="home_page">
            <ContinueListening />
            <div className="genres_sticky_bar genres_section">
                <div className="genres_section_header">
                    <h3 className="genres_section_title">{t('library.genresTitle')}</h3>
                    <div className="arrows">
                        <button type="button" className="scroll_btn prev" onClick={() => scrollGenres(-300)}>‹</button>
                        <button type="button" className="scroll_btn next" onClick={() => scrollGenres(300)}>›</button>
                    </div>
                </div>
                <div ref={genresScrollRef} className="genres_row hide_scrollbar">
                    {GENRES.map((g) => (
                        <button
                            key={g.slug}
                            type="button"
                            className="genre_chip"
                            onClick={() => navigate(`/genre/${g.slug}`)}
                        >
                            <span className="genre_chip_emoji">{g.emoji}</span> {g.name}
                        </button>
                    ))}
                </div>
            </div>

            {sections.map(renderSection)}
        </div>
    );
}
