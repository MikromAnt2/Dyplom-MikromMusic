const { AUTH_HOME_LIMITS } = require('./constants');
const { findClusterArtists } = require('./scoring');
const { normalizeArtistKey, toArtistCard } = require('./utils');
const { Innertube } = require('youtubei.js');
const { enrichArtistMedia } = require('./mediaQuality');
const {
  isUcArtistId,
  extractUcFromArtistItem,
  pickUcArtistId,
  cleanArtistName,
  isTopicStyleArtistName
} = require('../../utils/artistChannel');
const { resolveChannelIdForAuthor } = require('./artistAlbums');
const { enrichArtistsMonthlyListeners } = require('../../utils/artistSubs');

const L = AUTH_HOME_LIMITS;

// getYtClient: локальний Innertube клієнт (уникаємо циклічного require через `./sources` → `routes/search`)
const ytClientPromise = Innertube.create().catch(() => null);
async function getYtClient() {
  return ytClientPromise;
}

// flattenArtistNodes: збирає вузли артистів з дерева Innertube
function flattenArtistNodes(node, acc, depth = 0) {
  if (!node || depth > 20) return;
  if (Array.isArray(node)) {
    node.forEach((n) => flattenArtistNodes(n, acc, depth + 1));
    return;
  }
  if (node.channelId || node.browseId || node.id || node.name) acc.push(node);
  if (node.contents) flattenArtistNodes(node.contents, acc, depth + 1);
  if (node.items) flattenArtistNodes(node.items, acc, depth + 1);
}

// searchArtistViaMusic: UC channel артиста через music.search
async function searchArtistViaMusic(clean) {
  const yt = await getYtClient();
  if (!yt?.music?.search) return null;

  try {
    const res = await yt.music.search(clean, { type: 'artist' });
    const raw = [];
    flattenArtistNodes(res?.artists?.contents || res?.contents || res?.results, raw);
    for (const item of raw) {
      const id = extractUcFromArtistItem(item) || pickUcArtistId(item.channelId, item.browseId, item.id);
      const itemName = cleanArtistName(
        item.name?.toString?.() || item.title?.toString?.() || item.author?.name?.toString?.() || ''
      );
      if (!id || !isUcArtistId(id) || isTopicStyleArtistName(itemName)) continue;
      if (itemName && normalizeArtistKey(itemName) !== normalizeArtistKey(clean)) {
        const key = normalizeArtistKey(clean);
        if (!normalizeArtistKey(itemName).includes(key) && !key.includes(normalizeArtistKey(itemName))) {
          continue;
        }
      }
      let image = '';
      const thumbs = item.thumbnails || item.thumbnail?.thumbnails;
      if (thumbs?.length) image = thumbs[thumbs.length - 1]?.url || '';
      const monthlyListeners =
        item.subscribers?.toString?.() || item.subtitle?.toString?.() || '';
      return { channelId: id, name: itemName || clean, image, subs: '', monthlyListeners };
    }
  } catch (_) {}
  return null;
}

// searchArtistChannel: channelId, image та listeners за ім'ям
async function searchArtistChannel(name) {
  const clean = cleanArtistName(name);
  if (!clean || isTopicStyleArtistName(clean)) return null;

  const fromMusic = await searchArtistViaMusic(clean);
  if (fromMusic?.image) return fromMusic;

  const channelId = await resolveChannelIdForAuthor(clean, null);
  if (channelId && isUcArtistId(channelId)) {
    if (fromMusic) return { ...fromMusic, subs: '', monthlyListeners: fromMusic.monthlyListeners || '' };
    const retry = await searchArtistViaMusic(clean);
    if (retry) return { ...retry, subs: '', monthlyListeners: retry.monthlyListeners || '' };
    return { channelId, name: clean, image: '', subs: '', monthlyListeners: '' };
  }

  if (fromMusic) return fromMusic;
  return null;
}

// collectRecommendedArtistNames: імена схожих артистів для рекомендацій
function collectRecommendedArtistNames(profile) {
  const out = [];
  const seen = new Set();
  const subscribedKeys = new Set(
    (profile.subscribedArtists || []).map((a) => normalizeArtistKey(a.name))
  );

  const add = (name, priority = 1) => {
    const clean = cleanArtistName(name);
    const key = normalizeArtistKey(clean);
    if (!clean || !key || seen.has(key) || subscribedKeys.has(key) || isTopicStyleArtistName(clean)) {
      return;
    }
    seen.add(key);
    out.push({ name: clean, priority });
  };

  for (const name of profile.topArtists || []) {
    add(name, 4);
    for (const related of findClusterArtists(normalizeArtistKey(name))) {
      add(related, 3);
    }
  }

  for (const doc of profile.seedDocs || []) {
    const author = doc?.author;
    if (!author) continue;
    const key = normalizeArtistKey(author);
    for (const related of findClusterArtists(key)) {
      add(related, 3);
    }
  }

  for (const doc of (profile.seedDocs || []).slice(0, 6)) {
    if (doc?.author) add(doc.author, 2);
  }

  return out.sort((a, b) => b.priority - a.priority).slice(0, 24);
}

// mapWithConcurrency: паралельний map з обмеженням concurrency
async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await mapper(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

// buildArtistsYouMayLike: блок «Артисти, які можуть сподобатись»
async function buildArtistsYouMayLike(profile) {
  const cards = [];
  const seenIds = new Set();
  const subscribed = new Set(
    (profile.subscribedArtists || []).map((a) => a.channelId).filter(isUcArtistId)
  );

  const names = collectRecommendedArtistNames(profile).slice(0, 16);
  const resolvedList = await mapWithConcurrency(names, 4, async ({ name }) => {
    try {
      return await searchArtistChannel(name);
    } catch {
      return null;
    }
  });

  for (const resolved of resolvedList) {
    if (cards.length >= L.artistsYouMayLike) break;
    if (!resolved?.channelId || !isUcArtistId(resolved.channelId)) continue;
    if (seenIds.has(resolved.channelId) || subscribed.has(resolved.channelId)) continue;
    if (isTopicStyleArtistName(resolved.name)) continue;
    seenIds.add(resolved.channelId);

    const card = toArtistCard(
      enrichArtistMedia({
        channelId: resolved.channelId,
        name: resolved.name,
        image: resolved.image || '',
        subs: '',
        monthlyListeners: resolved.monthlyListeners || ''
      })
    );
    if (card) cards.push(card);
  }

  const yt = await getYtClient();
  const enriched = await enrichArtistsMonthlyListeners(yt, cards, 5);
  return enriched.slice(0, L.artistsYouMayLike);
}

module.exports = { buildArtistsYouMayLike, searchArtistChannel };
