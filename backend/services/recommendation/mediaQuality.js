// highQualityTrackImage: URL превʼю треку (sddefault або upgrade)
function highQualityTrackImage(youtubeId, existingUrl = '') {
  if (youtubeId) {
    return `https://i.ytimg.com/vi/${youtubeId}/sddefault.jpg`;
  }
  return upgradeUrl(existingUrl);
}

// highQualityArtistImage: покращує URL аватара артиста
function highQualityArtistImage(imageUrl) {
  return upgradeUrl(imageUrl);
}

// highQualityAlbumImage: покращує обкладинку альбому
function highQualityAlbumImage(imageUrl, browseId) {
  const upgraded = upgradeUrl(imageUrl);
  if (upgraded) return upgraded;
  return imageUrl || '';
}

// upgradeUrl: підвищує якість googleusercontent / ytimg URL
function upgradeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  let u = url;
  if (u.startsWith('//')) u = `https:${u}`;
  if (u.includes('ytimg.com/vi/')) {
    return u.replace(/\/(mqdefault|sddefault|default|hqdefault|maxresdefault)\.jpg/i, '/sddefault.jpg');
  }
  if (u.includes('googleusercontent.com') || u.includes('ggpht.com')) {
    const base = u.split('=')[0];
    return `${base}=w1200-h630-l90-rj`;
  }
  if (u.includes('ui-avatars.com') && !u.includes('size=')) {
    return `${u}${u.includes('?') ? '&' : '?'}size=512`;
  }
  return u;
}

// enrichTrackMedia: додає image та imageFallback до треку
function enrichTrackMedia(track) {
  if (!track) return track;
  return {
    ...track,
    image: highQualityTrackImage(track.youtubeId, track.image),
    imageFallback: track.youtubeId
      ? `https://i.ytimg.com/vi/${track.youtubeId}/hqdefault.jpg`
      : upgradeUrl(track.image)
  };
}

// enrichArtistMedia: покращує image артиста для картки
function enrichArtistMedia(artist) {
  if (!artist) return artist;
  return {
    ...artist,
    image: highQualityArtistImage(artist.image),
    imageFallback: upgradeUrl(artist.image) || artist.imageFallback || ''
  };
}

// enrichAlbumMedia: покращує обкладинку альбому в обʼєкті
function enrichAlbumMedia(album) {
  if (!album) return album;
  return {
    ...album,
    image: highQualityAlbumImage(album.image, album.youtubeId || album.channelId)
  };
}

module.exports = {
  highQualityTrackImage,
  highQualityArtistImage,
  highQualityAlbumImage,
  enrichTrackMedia,
  enrichArtistMedia,
  enrichAlbumMedia
};
