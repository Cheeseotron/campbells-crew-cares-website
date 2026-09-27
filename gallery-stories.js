// Event-story photos are intentionally added to the permanent picture wall.
(async () => {
  const wall = document.querySelector('.gallery-wall');
  if (!wall) return;
  try {
    const response = await fetch('/portal-api/public/event-stories');
    if (!response.ok) return;
    const { stories = [] } = await response.json();
    if (stories.length) {
      ['winter-2025-05.jpg', 'winter-2025-04.jpg', 'winter-2025-03.jpg', 'winter-2025-02.jpg', 'winter-2025-01.jpg'].forEach((filename) => {
        const figure = document.createElement('figure'); const image = document.createElement('img');
        image.src = `assets/images/${filename}`; image.alt = 'Winter 2025 Kids Shopping Event'; image.loading = 'lazy'; image.decoding = 'async'; figure.append(image); wall.prepend(figure);
      });
    }
    stories.slice().reverse().forEach((story) => story.photos?.slice().reverse().forEach((photo) => {
      const figure = document.createElement('figure'); const image = document.createElement('img');
      image.src = photo.url; image.alt = photo.alt || story.title; image.loading = 'lazy'; image.decoding = 'async'; figure.append(image); wall.prepend(figure);
    }));
  } catch { /* The existing gallery remains available if event stories are unavailable. */ }
})();
