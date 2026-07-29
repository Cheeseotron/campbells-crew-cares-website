document.querySelectorAll('[data-youtube-id]').forEach(function (container) {
  var link = container.querySelector('.video-poster');
  var videoId = container.getAttribute('data-youtube-id');

  if (!link || !videoId || !/^https?:$/.test(window.location.protocol)) return;

  link.addEventListener('click', function (event) {
    event.preventDefault();

    var iframe = document.createElement('iframe');
    iframe.src = 'https://www.youtube.com/embed/' + encodeURIComponent(videoId) + '?autoplay=1&rel=0';
    iframe.title = 'A deeper look at Campbell\'s story';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    container.replaceChildren(iframe);
  });
});
