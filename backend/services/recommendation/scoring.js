const { SCORE_WEIGHTS, ARTIST_CLUSTERS } = require('./constants');
const {
  normalizeArtistKey,
  inferGenreHint,
  getAdjacentGenres,
  scoreAdd
} = require('./utils');

// findClusterArtists: схожі артисти з ARTIST_CLUSTERS за ключем
function findClusterArtists(artistKey) {
  if (!artistKey) return [];
  for (const cluster of ARTIST_CLUSTERS) {
    const keys = cluster.map(normalizeArtistKey);
    if (keys.some(k => artistKey.includes(k) || k.includes(artistKey))) {
      return keys.filter(k => k !== artistKey);
    }
  }
  return [];
}

// computeTrackScore: зважена оцінка треку vs профіль і seed
function computeTrackScore(candidate, profile, seedTrack = null, opts = {}) {
  const weights = { ...SCORE_WEIGHTS, ...opts.weights };
  const cGenre = inferGenreHint(candidate.title, candidate.author);
  const cArtist = normalizeArtistKey(candidate.author);

  let genreScore = 0;
  if (profile.topGenres?.length) {
    if (profile.topGenres.includes(cGenre)) genreScore = 1;
    else if (profile.topGenres.some(g => getAdjacentGenres(g).includes(cGenre))) genreScore = 0.55;
    else genreScore = 0.2;
  } else genreScore = 0.4;

  if (seedTrack) {
    const sGenre = inferGenreHint(seedTrack.title, seedTrack.author);
    if (cGenre === sGenre) genreScore = Math.max(genreScore, 0.95);
    else if (getAdjacentGenres(sGenre).includes(cGenre)) genreScore = Math.max(genreScore, 0.7);
  }

  let artistScore = 0;
  const seedArtist = seedTrack ? normalizeArtistKey(seedTrack.author) : '';
  if (seedArtist && cArtist) {
    if (cArtist === seedArtist) artistScore = 0.35;
    else if (cArtist.includes(seedArtist) || seedArtist.includes(cArtist)) artistScore = 0.5;
    else if (findClusterArtists(seedArtist).some(r => cArtist.includes(r) || r.includes(cArtist))) artistScore = 0.92;
  }
  if (profile.topArtists?.length && profile.topArtists.includes(cArtist)) {
    artistScore = Math.max(artistScore, 0.75);
  }
  const aw = profile.artistWeights?.get?.(cArtist);
  if (aw) artistScore = Math.max(artistScore, Math.min(1, aw / 5));

  let moodScore = 0.5;
  if (seedTrack) {
    const st = `${seedTrack.title} ${seedTrack.author}`.toLowerCase();
    const ct = `${candidate.title} ${candidate.author}`.toLowerCase();
    const moodWords = ['chill', 'epic', 'sad', 'happy', 'night', 'dream', 'love', 'battle', 'emotional'];
    const sm = moodWords.filter(w => st.includes(w));
    const cm = moodWords.filter(w => ct.includes(w));
    if (sm.length && cm.length) moodScore = sm.filter(w => cm.includes(w)).length / Math.max(sm.length, 1);
    else moodScore = cGenre === inferGenreHint(seedTrack.title, seedTrack.author) ? 0.75 : 0.45;
  }

  const popularityScore = Math.min(1, (candidate._popularity || candidate.popularity || opts.popularityMap?.get(candidate.youtubeId) || 0) / 10);

  let historyScore = 0;
  const eng = profile.engagementById?.get?.(candidate.youtubeId);
  if (eng?.liked) historyScore = 0.9;
  else if (profile.playCounts?.get?.(candidate.youtubeId)) {
    historyScore = Math.min(1, profile.playCounts.get(candidate.youtubeId) / 5);
  }
  if (profile.skippedIds?.has?.(candidate.youtubeId)) historyScore *= 0.15;
  if (profile.exclude?.has?.(candidate.youtubeId) && !opts.allowExcluded) historyScore = 0;

  let explorationScore = 0.3;
  if (profile.topGenres?.length && !profile.topGenres.includes(cGenre)) {
    const adjacent = profile.topGenres.flatMap(g => getAdjacentGenres(g));
    if (adjacent.includes(cGenre)) explorationScore = 0.85;
    else explorationScore = 0.5;
  }
  if (opts.boostExploration) explorationScore = Math.min(1, explorationScore + 0.25);

  const finalScore =
    genreScore * weights.genre +
    artistScore * weights.artist +
    moodScore * weights.mood +
    popularityScore * weights.popularity +
    historyScore * weights.history +
    explorationScore * weights.exploration;

  return {
    finalScore,
    components: { genreScore, artistScore, moodScore, popularityScore, historyScore, explorationScore }
  };
}

// scoreCandidates: оцінює масив кандидатів і повертає Map
function scoreCandidates(candidates, profile, seedTrack = null, opts = {}) {
  const scored = new Map();
  for (const c of candidates) {
    if (!c?.youtubeId) continue;
    const { finalScore, components } = computeTrackScore(c, profile, seedTrack, opts);
    if (opts.minScore && finalScore < opts.minScore) continue;
    scoreAdd(scored, c.youtubeId, finalScore, opts.reason || 'scored');
    const entry = scored.get(c.youtubeId);
    entry.meta = { ...c, components };
  }
  return scored;
}

module.exports = { computeTrackScore, scoreCandidates, findClusterArtists };
