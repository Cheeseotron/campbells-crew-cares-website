function startEventSlideshow(slideshow) {
  const slides = Array.from(slideshow.querySelectorAll('img'));
  const previous = slideshow.querySelector('[data-slide-previous]');
  const next = slideshow.querySelector('[data-slide-next]');
  if (slides.length < 2 || !previous || !next) return;
  let current = 0; let timer;
  const showSlide = (index) => { current = (index + slides.length) % slides.length; slides.forEach((slide, slideIndex) => slide.classList.toggle('is-active', slideIndex === current)); };
  const startTimer = () => { window.clearInterval(timer); timer = window.setInterval(() => showSlide(current + 1), 8000); };
  const moveTo = (index) => { showSlide(index); startTimer(); };
  previous.addEventListener('click', () => moveTo(current - 1));
  next.addEventListener('click', () => moveTo(current + 1));
  showSlide(0);
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) startTimer();
}

function storyDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value || '') : new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(date);
}

function storyYear(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? (String(value || '').match(/\d{4}/)?.[0] || 'Recent') : date.getUTCFullYear();
}

function impactLine(story) {
  return story.impactLine || (story.eventType === 'food_bag' ? `${Number(story.outcome || 0).toLocaleString()} food bags prepared` : `${Number(story.outcome || 0).toLocaleString()} children supported`);
}

function showFeaturedStory(story) {
  const section = document.querySelector('.recent-event');
  if (!section) return;
  const heading = section.querySelector('.section-heading');
  const title = heading?.querySelector('h2'); const recap = heading?.querySelector(':scope > p'); const label = heading?.querySelector('.eyebrow');
  if (label) label.textContent = 'Most recent event';
  if (title) title.textContent = story.title;
  if (recap) recap.textContent = story.recap || 'A Campbell\'s Crew Cares community event.';
  const feature = section.querySelector('.recent-event__feature');
  if (!feature || !story.photos?.length) return;
  const slideshow = document.createElement('div'); slideshow.className = 'recent-event__slideshow';
  story.photos.forEach((photo, index) => { const image = document.createElement('img'); image.src = photo.url; image.alt = photo.alt; image.classList.toggle('is-active', index === 0); slideshow.append(image); });
  if (story.photos.length > 1) {
    const previous = document.createElement('button'); previous.className = 'recent-event__arrow recent-event__arrow--previous'; previous.type = 'button'; previous.dataset.slidePrevious = ''; previous.setAttribute('aria-label', 'Show previous event photo'); previous.innerHTML = '<span aria-hidden="true">←</span>';
    const next = document.createElement('button'); next.className = 'recent-event__arrow recent-event__arrow--next'; next.type = 'button'; next.dataset.slideNext = ''; next.setAttribute('aria-label', 'Show next event photo'); next.innerHTML = '<span aria-hidden="true">→</span>';
    slideshow.append(previous, next);
  }
  const caption = document.createElement('div'); caption.className = 'recent-event__caption';
  const date = document.createElement('span'); date.textContent = storyDate(story.eventDate);
  const captionTitle = document.createElement('p'); captionTitle.textContent = story.title;
  caption.append(date, captionTitle); feature.replaceChildren(slideshow, caption); startEventSlideshow(slideshow);
}

function movePreviousFeaturedEventToArchive(archive) {
  const section = document.querySelector('.recent-event');
  const title = section?.querySelector('.section-heading h2')?.textContent?.trim();
  const recap = section?.querySelector('.section-heading > p')?.textContent?.trim();
  const image = section?.querySelector('.recent-event__slideshow img');
  const date = section?.querySelector('.recent-event__caption span')?.textContent?.trim();
  if (!title || !image) return;
  const article = document.createElement('article'); article.className = 'archive-event';
  const imageWrap = document.createElement('div'); imageWrap.className = 'archive-event__image'; const archiveImage = image.cloneNode(); archiveImage.loading = 'lazy'; imageWrap.append(archiveImage);
  const year = document.createElement('div'); year.className = 'archive-event__year'; year.textContent = storyYear(date);
  const copy = document.createElement('div'); copy.className = 'archive-event__copy'; const heading = document.createElement('h3'); heading.textContent = title; const text = document.createElement('p'); text.textContent = recap || 'A Campbell\'s Crew Cares community event.'; copy.append(heading, text);
  article.append(imageWrap, year, copy); archive.prepend(article);
}

document.querySelectorAll('[data-event-slideshow]').forEach(startEventSlideshow);

// Published organizer recaps become the featured event. Older published recaps
// remain lightweight archive entries, while every photo remains in the Gallery.
(async () => {
  const archive = document.querySelector('.event-archive .archive-list');
  if (!archive) return;
  try {
    const response = await fetch('/portal-api/public/event-stories');
    if (!response.ok) return;
    const { stories = [] } = await response.json();
    if (!stories.length) return;
    movePreviousFeaturedEventToArchive(archive);
    showFeaturedStory(stories[0]);
    stories.slice(1).reverse().forEach((story) => {
      const article = document.createElement('article'); article.className = 'archive-event'; const image = story.photos?.[0];
      if (image) { const imageWrap = document.createElement('div'); imageWrap.className = 'archive-event__image'; const img = document.createElement('img'); img.src = image.url; img.alt = image.alt; img.loading = 'lazy'; imageWrap.append(img); article.append(imageWrap); }
      const year = document.createElement('div'); year.className = 'archive-event__year'; year.textContent = storyYear(story.eventDate);
      const copy = document.createElement('div'); copy.className = 'archive-event__copy';
      const impact = document.createElement('p'); impact.className = 'eyebrow'; impact.textContent = impactLine(story);
      const title = document.createElement('h3'); title.textContent = story.title;
      const recap = document.createElement('p'); recap.textContent = story.recap || 'A Campbell\'s Crew Cares community event.';
      const date = document.createElement('small'); date.textContent = storyDate(story.eventDate);
      copy.append(impact, title, recap, date); article.append(year, copy); archive.prepend(article);
    });
  } catch { /* The hand-curated archive remains available if the portal is offline. */ }
})();
