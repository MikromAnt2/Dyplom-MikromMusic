const { diversifyByArtist, dedupeByYoutubeId } = require('../services/recommendation/diversity');

describe('Рекомендації — різноманітність', () => {
  const tracks = [
    { youtubeId: '1', author: 'Artist A', title: 'A1' },
    { youtubeId: '2', author: 'Artist A', title: 'A2' },
    { youtubeId: '3', author: 'Artist A', title: 'A3' },
    { youtubeId: '4', author: 'Artist B', title: 'B1' },
    { youtubeId: '5', author: 'Artist C', title: 'C1' }
  ];

  it('diversifyByArtist обмежує домінування одного виконавця', () => {
    const out = diversifyByArtist(tracks, 2, 5);
    const countA = out.filter((t) => t.author === 'Artist A').length;
    expect(countA).toBeLessThanOrEqual(3);
    expect(out.length).toBe(5);
    expect(new Set(out.map((t) => t.author)).size).toBeGreaterThan(1);
  });

  it('diversifyByArtist зберігає targetSize', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      youtubeId: `id${i}`,
      author: `Artist ${i % 4}`,
      title: `T${i}`
    }));
    const out = diversifyByArtist(many, 2, 10);
    expect(out.length).toBe(10);
  });

  it('dedupeByYoutubeId', () => {
    expect(dedupeByYoutubeId([{ youtubeId: 'x' }, { youtubeId: 'x' }])).toHaveLength(1);
  });
});
