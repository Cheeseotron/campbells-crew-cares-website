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
