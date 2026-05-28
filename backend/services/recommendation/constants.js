const SCORE_WEIGHTS = {
  genre: 0.25,
  artist: 0.25,
  mood: 0.15,
  popularity: 0.10,
  history: 0.15,
  exploration: 0.10
};

const { CACHE_TTL_MS } = require('../../config/cacheTtl');
const BLOCK_LIMIT = 25;
const MIN_HOME_BLOCK_ITEMS = 10;

const AUTH_HOME_LIMITS = {
  listenAgain: 25,
  forYou: 20,
  newFromSubscribed: 22,
  basedOnListening: 22,
  newForYou: 22,
  exploreMix: 18,
  popularInYourGenres: 22,
  albumsForYou: 12,
  quickPick: 45,
  artistsYouMayLike: 20,
  trendingNow: 22
};

const GUEST_HOME_LIMITS = {
  trendingNow: 18,
  popularNewReleases: 18,
  popularArtists: 18,
  popularAlbums: 15
};
const QUEUE_TARGET_SIZE = 80;
const MAX_PER_ARTIST_IN_BLOCK = 2;
const MAX_SEED_ARTIST_IN_QUEUE = 4;
const MAX_OTHER_ARTIST_IN_QUEUE = 3;

const ADJACENT_GENRES = {
  'anime-ost': ['jpop', 'vocaloid', 'rock', 'orchestral'],
  'jpop': ['anime-ost', 'vocaloid', 'lofi', 'pop'],
  'vocaloid': ['jpop', 'anime-ost', 'electronic'],
  'rock': ['metal', 'anime-ost', 'pop'],
  'jazz': ['lofi', 'blues', 'classical'],
  'lofi': ['jazz', 'electronic', 'acoustic'],
  'pop': ['jpop', 'rock', 'electronic'],
  'electronic': ['lofi', 'pop', 'hiphop'],
  'hiphop': ['electronic', 'pop'],
  'classical': ['orchestral', 'jazz', 'piano'],
  'orchestral': ['anime-ost', 'classical', 'cinematic'],
  'metal': ['rock', 'anime-ost'],
  'acoustic': ['folk', 'lofi', 'pop'],
  'default': ['pop', 'jpop', 'lofi', 'rock']
};

const ARTIST_CLUSTERS = [
  ['mili', 'myth roid', 'aimer', 'tuyu', 'yorushika', 'eve', 'reona', 'ling tosite sigure', 'zutomayo', 'yoasobi', 'kenshi yonezu', 'radwimps'],
  ['hatsune miku', 'kagamine rin', 'megurine luka', 'deco27', 'sasakure uk', 'wowaka', 'pinocchiop'],
  ['one ok rock', 'radwimps', 'asian kung fu generation', 'spyair', 'man with a mission'],
  ['daft punk', 'justice', 'kavinsky', 'carpenter brut', 'perturbator'],
  ['billie eilish', 'lorde', 'lana del rey', 'clairo', 'girl in red'],
  ['the weeknd', 'drake', 'frank ocean', 'kendrick lamar', 'travis scott'],
  ['hans zimmer', 'two steps from hell', 'epic music', 'audiomachine', 'really slow motion'],
  ['studio ghibli', 'joe hisaishi', 'kenshi yonezu', 'yorushika', 'king gnu']
];

const TRENDING_QUERIES = [
  'top hits music 2025',
  'viral music trending',
  'popular songs worldwide',
  'new music releases',
  'best of jpop 2025',
  'anime openings best'
];

const MOOD_SEARCH_SUFFIX = {
  'anime-ost': 'epic emotional anime soundtrack',
  'jpop': 'japanese indie pop chill',
  'vocaloid': 'vocaloid nightcore mix',
  'rock': 'alternative rock energy',
  'jazz': 'smooth jazz evening',
  'lofi': 'lofi hip hop study beats',
  'pop': 'feel good pop hits',
  'electronic': 'synthwave night drive',
  'default': 'chill aesthetic playlist'
};

const HOME_BLOCK_KEYS = [
  'forYou',
  'basedOnListening',
  'similarToRecent',
  'popularInYourGenres',
  'artistsYouMayLike',
  'listenAgain',
  'recentlyPlayed',
  'trendingNow',
  'newForYou',
  'exploreMix'
];

module.exports = {
  SCORE_WEIGHTS,
  CACHE_TTL_MS,
  BLOCK_LIMIT,
  MIN_HOME_BLOCK_ITEMS,
  AUTH_HOME_LIMITS,
  GUEST_HOME_LIMITS,
  QUEUE_TARGET_SIZE,
  MAX_PER_ARTIST_IN_BLOCK,
  MAX_SEED_ARTIST_IN_QUEUE,
  MAX_OTHER_ARTIST_IN_QUEUE,
  ADJACENT_GENRES,
  ARTIST_CLUSTERS,
  TRENDING_QUERIES,
  MOOD_SEARCH_SUFFIX,
  HOME_BLOCK_KEYS
};
