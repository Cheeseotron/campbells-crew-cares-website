document.querySelectorAll(".program-slideshow").forEach((gallery) => {
  const photos = Array.from(gallery.querySelectorAll("img"));
  const previousButton = gallery.querySelector(".carousel-prev");
  const nextButton = gallery.querySelector(".carousel-next");
  const counter = gallery.querySelector(".carousel-count");
  let currentPhoto = 0;

  const showPhoto = (newIndex) => {
    currentPhoto = (newIndex + photos.length) % photos.length;

    photos.forEach((photo, index) => {
      const isCurrent = index === currentPhoto;
      photo.classList.toggle("is-active", isCurrent);
      photo.setAttribute("aria-hidden", String(!isCurrent));
    });

    counter.textContent = `${currentPhoto + 1} / ${photos.length}`;
  };

  previousButton.addEventListener("click", () => showPhoto(currentPhoto - 1));
  nextButton.addEventListener("click", () => showPhoto(currentPhoto + 1));
  showPhoto(0);
});
