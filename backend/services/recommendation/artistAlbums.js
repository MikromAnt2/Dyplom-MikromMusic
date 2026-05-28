const channelsRouter = require('../../routes/channels');
const { AUTH_HOME_LIMITS } = require('./constants');
const { highQualityAlbumImage } = require('./mediaQuality');
const { getYtClient } = require('./sources');
const {
  pickUcArtistId,
  extractUcFromArtistItem,
  isUcArtistId,
  cleanArtistName
} = require('../../utils/artistChannel');

// isValidAlbumId: чи id схожий на browseId альбому/плейлиста
function isValidAlbumId(id) {
  if (!id) return false;
  const s = String(id);
  return s.startsWith('MPRE') || s.startsWith('OLAK') || s.startsWith('PL') || s.startsWith('VL');
}

// mapDiscographyAlbum: елемент дискографії → картка альбому Home
function mapDiscographyAlbum(album, artistChannelId, artistSubs = '') {
  if (!album?.youtubeId) return null;
  const id = String(album.youtubeId);
  const playlistRelease = isValidAlbumId(id) || album.type === 'playlist';

  if (album.type === 'video' && !playlistRelease) return null;

  const title = (album.title || '').toLowerCase();
  if (title.includes('most played') || title.includes('latest release')) return null;

  if (!playlistRelease) {
    if (album.releaseType === 'Сингл' || album.releaseType === 'Останній реліз') return null;
    if (
      album.releaseType &&
      album.releaseType !== 'Альбом' &&
      album.releaseType !== 'Мініальбом'
    ) {
      return null;
    }
  }

  return {
    youtubeId: id,
    title: album.title,
    author: album.author,
    authorSubs: artistSubs || '',
    image: highQualityAlbumImage(album.image, id),
    channelId: artistChannelId || album.channelId,
    releaseType: album.releaseType || 'Альбом',
    type: playlistRelease ? 'playlist' : album.type || 'playlist'
  };
}

// artistNameMatchScore: схожість імені артиста з пошуковим запитом
function artistNameMatchScore(candidateName, queryName) {
  const a = cleanArtistName(candidateName).toLowerCase();
  const q = cleanArtistName(queryName).toLowerCase();
  if (!a || !q) return 0;
  if (a === q) return 100;
  if (a.includes(q) || q.includes(a)) return 85;
  const qTok = q.split(/\s+/).filter((t) => t.length >= 3)[0] || '';
  if (qTok && a.includes(qTok)) return 70;
  return 0;
}

// resolveChannelIdForAuthor: UC channelId за ім'ям через music.search
async function resolveChannelIdForAuthor(authorName, knownChannelId, options = {}) {
  const known = pickUcArtistId(knownChannelId);
  if (known) return known;

  const videoChannelId = pickUcArtistId(options.videoChannelId);
  if (videoChannelId) return videoChannelId;

  const yt = await getYtClient();
  const searchName = cleanArtistName(authorName).replace(/ - Topic/gi, '').trim();
  if (!searchName) return null;

  if (!yt?.music?.search) return null;

  let bestId = null;
  let bestScore = 0;

  const consider = (item) => {
    const id =
      extractUcFromArtistItem(item) || pickUcArtistId(item?.channelId, item?.id, item?.browseId);
    if (!id || !isUcArtistId(id)) return;
    const name = item?.name?.toString?.() || item?.title?.toString?.() || '';
    const score = artistNameMatchScore(name, searchName);
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  };

  try {
    const res = await yt.music.search(searchName, { type: 'artist' });
    const items = res?.artists?.contents || res?.contents || [];
    const list = Array.isArray(items) ? items : [];
    for (const item of list) consider(item);
    if (bestId && bestScore >= 55) return bestId;

    const songRes = await yt.music.search(searchName, { type: 'song' });
    const songs = songRes?.songs?.contents || songRes?.contents || [];
    for (const song of Array.isArray(songs) ? songs.slice(0, 8) : []) {
      const artists = song?.artists || [];
      for (const a of artists) consider(a);
      if (song?.channel_id && isUcArtistId(song.channel_id)) {
        const chScore = artistNameMatchScore(song.author?.name || searchName, searchName);
        if (chScore >= 50 && chScore > bestScore) {
          bestScore = chScore;
          bestId = song.channel_id;
        }
      }
    }
    if (bestId) return bestId;
  } catch (_) {}

  return null;
}

// collectArtistSources: джерела артистів з підписок і seed-документів
function collectArtistSources(profile) {
  const sources = [];
  const seen = new Set();

  const add = (channelId, name) => {
    const id = channelId ? String(channelId) : '';
    const key = id || (name || '').toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    sources.push({ channelId: id, name: name || '' });
  };

  for (const a of profile.subscribedArtists || []) {
    add(a.channelId, a.name);
  }
  for (const doc of profile.seedDocs || []) {
    add(doc.channelId, doc.author);
  }

  return sources.slice(0, 12);
}

// buildAlbumsFromArtists: альбоми з дискографії підписаних виконавців
async function buildAlbumsFromArtists(profile) {
  const loadDisco = channelsRouter.loadArtistDiscography;
  if (!loadDisco) return [];

  const sources = collectArtistSources(profile);
  const albums = [];
  const seenKeys = new Set();

  for (const src of sources) {
    let channelId = src.channelId;
    if (!channelId || !String(channelId).startsWith('UC')) {
      channelId = await resolveChannelIdForAuthor(src.name, channelId);
    }
    if (!channelId) continue;

    try {
      const disco = await loadDisco(channelId, src.name);
      const artistSubs = disco.artistSubs || '';
      const rawList = [
        ...(disco.albums || []),
        ...(disco.eps || []),
        ...(disco.singles || []),
        ...(disco.latestRelease ? [disco.latestRelease] : [])
      ];

      for (const raw of rawList) {
        const card = mapDiscographyAlbum(raw, channelId, artistSubs);
        if (!card) continue;
        const key = `${card.youtubeId}::${card.title}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        albums.push(card);
        if (albums.length >= AUTH_HOME_LIMITS.albumsForYou + 4) break;
      }
    } catch (err) {
      console.warn('[rec] discography skip', channelId, err.message);
    }
    if (albums.length >= AUTH_HOME_LIMITS.albumsForYou) break;
  }

  return albums.slice(0, AUTH_HOME_LIMITS.albumsForYou);
}

module.exports = { buildAlbumsFromArtists, mapDiscographyAlbum, resolveChannelIdForAuthor };
