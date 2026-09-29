(() => {
  window.dataLayer = window.dataLayer || [];
  const keys = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'];
  let stored = {};
  try { stored = JSON.parse(sessionStorage.getItem('godhealth_blueprint_campaign') || '{}'); } catch (_) {}
  const params = new URLSearchParams(location.search);
  const campaign = Object.fromEntries(keys.map(key => [key, params.get(key) || stored[key] || '']));
  const scan = document.getElementById('scan-cta');
  const scanUrl = new URL(scan.href);
  keys.forEach(key => { if (campaign[key]) scanUrl.searchParams.set(key, campaign[key]); });
  scan.href = scanUrl.href;
  document.getElementById('open-blueprint').addEventListener('click', () => window.dataLayer.push({event:'blueprint_delivered', ...campaign}));
  scan.addEventListener('click', () => window.dataLayer.push({event:'scan_cta_clicked', ...campaign}));
})();

  document.querySelectorAll('[data-hero-video]').forEach((frame) => {
    const video = frame.querySelector('[data-video]');
    const unmute = frame.querySelector('[data-video-unmute]');
    const play = frame.querySelector('[data-video-play]');
    const fullscreen = frame.querySelector('[data-video-fullscreen]');
    const progress = frame.querySelector('[data-video-progress]');
    if (!video) return;
    const syncPlayback = () => {
      frame.classList.toggle('video-paused', video.paused);
      if (play) {
        play.textContent = video.paused ? '▶' : 'Ⅱ';
        play.setAttribute('aria-label', video.paused ? 'Play video' : 'Pause video');
      }
    };
    const syncProgress = () => {
      if (progress && Number.isFinite(video.duration) && video.duration > 0) {
        progress.style.transform = `scaleX(${Math.min(video.currentTime / video.duration, 1)})`;
      }
    };
    const tryPlay = () => { const promise = video.play(); if (promise?.catch) promise.catch(syncPlayback); };
    video.defaultMuted = true; video.muted = true; video.volume = 1; tryPlay();
    unmute?.addEventListener('click', () => { video.currentTime = 0; video.volume = 1; video.muted = false; frame.classList.add('sound-enabled'); tryPlay(); });
    play?.addEventListener('click', () => { if (video.paused) tryPlay(); else video.pause(); });
    fullscreen?.addEventListener('click', async () => {
      try { if (document.fullscreenElement) await document.exitFullscreen(); else if (frame.requestFullscreen) await frame.requestFullscreen(); else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen(); }
      catch (_) { video.controls = true; }
    });
    video.addEventListener('click', () => { if (video.paused) tryPlay(); else video.pause(); });
    video.addEventListener('play', syncPlayback); video.addEventListener('pause', syncPlayback);
    video.addEventListener('timeupdate', syncProgress); video.addEventListener('loadedmetadata', syncProgress); syncPlayback();
  });
