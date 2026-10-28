/* Muted preview, then a user-initiated restart with sound. First-party video only. */
(() => {
  document.querySelectorAll('[data-gh-video]').forEach(frame => {
    const video = frame.querySelector('video');
    const launch = frame.querySelector('[data-gh-video-play]');
    const pause = frame.querySelector('[data-gh-video-pause]');
    const status = frame.querySelector('[data-gh-video-status]');
    const action = frame.querySelector('[data-gh-video-action]');
    if (!video || !launch) return;
    let engaged = false;
    let userPaused = false;
    let visible = true;
    video.defaultMuted = true;
    video.muted = true;
    video.controls = false;
    const label = (playing) => {
      if (engaged) return;
      if (status) status.textContent = playing ? 'Your video is playing' : 'Your video preview';
      if (action) action.textContent = playing ? 'Turn sound on' : 'Play from the beginning';
      if (pause) pause.textContent = userPaused ? 'Resume preview' : 'Pause preview';
    };
    const preview = async () => {
      if (engaged || userPaused || !visible || document.hidden) return;
      video.muted = true;
      video.loop = true;
      try { await video.play(); } catch { label(false); }
    };
    launch.addEventListener('click', async () => {
      engaged = true;
      userPaused = false;
      video.loop = false;
      video.currentTime = 0;
      video.muted = false;
      video.volume = 1;
      video.controls = true;
      try {
        await video.play();
        launch.hidden = true;
        if (pause) pause.hidden = true;
      } catch {
        engaged = false;
        launch.hidden = false;
        label(false);
      }
    });
    pause?.addEventListener('click', () => {
      userPaused = !userPaused;
      if (userPaused) video.pause();
      else preview();
      label(!video.paused);
    });
    video.addEventListener('playing', () => label(true));
    video.addEventListener('pause', () => label(false));
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => entries.forEach(entry => {
        visible = entry.isIntersecting;
        if (!visible && !engaged) video.pause();
        else preview();
      }), {threshold:0.08}).observe(frame);
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !engaged) video.pause();
      else preview();
    });
    preview();
  });
})();
