document.querySelectorAll('[data-event-slideshow]').forEach((slideshow) => {
  const slides = Array.from(slideshow.querySelectorAll('img'));
  const previous = slideshow.querySelector('[data-slide-previous]');
  const next = slideshow.querySelector('[data-slide-next]');

  if (slides.length < 2 || !previous || !next) return;

  let current = 0;
  let timer;

  const showSlide = (index) => {
    current = (index + slides.length) % slides.length;
    slides.forEach((slide, slideIndex) => {
      slide.classList.toggle('is-active', slideIndex === current);
    });
  };

  const startTimer = () => {
    window.clearInterval(timer);
    timer = window.setInterval(() => showSlide(current + 1), 8000);
  };

  const moveTo = (index) => {
    showSlide(index);
    startTimer();
  };

  previous.addEventListener('click', () => moveTo(current - 1));
  next.addEventListener('click', () => moveTo(current + 1));

  showSlide(0);
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) startTimer();
});

// Published organizer recaps appear ahead of the hand-curated historical archive.
// The public page receives only the title, date, recap, and one impact line.
(async () => {
  const archive = document.querySelector('.event-archive .archive-list');
  if (!archive) return;
  try {
    const response = await fetch('/portal-api/public/event-stories');
    if (!response.ok) return;
    const { stories = [] } = await response.json();
    stories.slice().reverse().forEach((story) => {
      const article = document.createElement('article');
      article.className = 'archive-event';
      const date = story.eventDate ? new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${story.eventDate}T00:00:00Z`)) : '';
      const year = story.eventDate ? new Date(`${story.eventDate}T00:00:00Z`).getUTCFullYear() : 'Recent';
      const impact = story.eventType === 'food_bag' ? `${Number(story.outcome || 0).toLocaleString()} food bags prepared` : `${Number(story.outcome || 0).toLocaleString()} children supported`;
      article.innerHTML = `<div class="archive-event__year">${year}</div><div class="archive-event__copy"><p class="eyebrow">${impact}</p><h3></h3><p></p><small></small></div>`;
      article.querySelector('h3').textContent = story.title;
      article.querySelector('.archive-event__copy > p:not(.eyebrow)').textContent = story.recap || 'A Campbell\'s Crew Cares community event.';
      article.querySelector('small').textContent = date;
      archive.prepend(article);
    });
  } catch { /* The hand-curated archive remains available if the portal is offline. */ }
})();
