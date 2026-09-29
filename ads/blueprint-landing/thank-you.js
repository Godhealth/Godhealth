(() => {
  window.dataLayer = window.dataLayer || {};
  const keys = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'];
  let stored = {};
  try { stored = JSON.parse(sessionStorage.getItem('godhealth_blueprint_campaign') || '{}'); } catch (_) {}
  const params = new URLSearchParams(location.search);
  const campaign = Object.fromEntries(keys.map(key => [key, params.get(key) || stored[key] || '']));
  const scan = document.getElementById('scan-cta');
  const coaching = document.getElementById('coaching-cta');
  const watchVideo = document.getElementById('watch-video-cta');
  [scan, coaching].forEach((link) => {
    if (!link) return;
    const url = new URL(link.href);
    keys.forEach(key => { if (campaign[key]) url.searchParams.set(key, campaign[key]); });
    link.href = url.href;
  });
  scan?.addEventListener('click', () => window.dataLayer.push({event:'scan_cta_clicked', ...campaign}));
  coaching?.addEventListener('click', () => window.dataLayer.push({event:'strategy_call_clicked', ...campaign}));
  watchVideo?.addEventListener('click', () => window.dataLayer.push({event:'thank_you_video_cta_clicked', ...campaign}));

  const animateScores = () => {
    const ring = document.querySelector('[data-score-ring]');
    if (!ring || ring.dataset.animated) return;
    ring.dataset.animated = 'true';
    const target = Number(ring.dataset.scoreRing || 0);
    const value = ring.querySelector('[data-score-value]');
    const counters = [...document.querySelectorAll('[data-count]')];
    const start = performance.now();
    const duration = 1500;
    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      ring.style.setProperty('--overall', String(target * eased));
      if (value) value.textContent = String(Math.round(target * eased));
      counters.forEach((counter) => counter.textContent = String(Math.round(Number(counter.dataset.count) * eased)));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const dashboard = document.querySelector('.sample-dashboard');
  if (dashboard && 'IntersectionObserver' in window) new IntersectionObserver((entries, obs) => { if (entries.some(entry => entry.isIntersecting)) { animateScores(); obs.disconnect(); } }, {threshold:.25}).observe(dashboard);
  else animateScores();

  document.querySelectorAll('[data-hero-video]').forEach((frame) => {
    const video = frame.querySelector('[data-video]'), unmute = frame.querySelector('[data-video-unmute]'), play = frame.querySelector('[data-video-play]'), fullscreen = frame.querySelector('[data-video-fullscreen]'), progress = frame.querySelector('[data-video-progress]');
    if (!video) return;
    const sync = () => { frame.classList.toggle('video-paused', video.paused); if (play) { play.textContent = video.paused ? '▶' : 'Ⅱ'; play.setAttribute('aria-label', video.paused ? 'Play video' : 'Pause video'); } };
    const tryPlay = () => { const promise = video.play(); if (promise?.catch) promise.catch(sync); };
    const updateProgress = () => { if (progress && video.duration > 0) progress.style.transform = `scaleX(${Math.min(video.currentTime / video.duration, 1)})`; };
    video.defaultMuted = true; video.muted = true; video.volume = 1; tryPlay();
    unmute?.addEventListener('click', () => { video.currentTime = 0; video.muted = false; frame.classList.add('sound-enabled'); tryPlay(); });
    play?.addEventListener('click', () => video.paused ? tryPlay() : video.pause());
    fullscreen?.addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else if (frame.requestFullscreen) await frame.requestFullscreen(); else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen(); } catch (_) { video.controls = true; } });
    video.addEventListener('click', () => video.paused ? tryPlay() : video.pause());
    video.addEventListener('play', sync); video.addEventListener('pause', sync); video.addEventListener('timeupdate', updateProgress); video.addEventListener('loadedmetadata', updateProgress); sync();
  });
})();
  const tabs=[...document.querySelectorAll('[data-story]')], panels=[...document.querySelectorAll('[data-story-panel]')], current=document.querySelector('[data-story-current]'), previous=document.querySelector('[data-story-prev]'), next=document.querySelector('[data-story-next]'); let storyIndex=0, storyTimer;
  const showStory=(index, moveFocus=false)=>{storyIndex=(index+panels.length)%panels.length;tabs.forEach((tab,i)=>{const active=i===storyIndex;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));tab.setAttribute('tabindex',active?'0':'-1');if(active&&moveFocus)tab.focus();});panels.forEach((panel,i)=>{const active=i===storyIndex;panel.hidden=!active;panel.classList.toggle('active',active);});if(current)current.textContent=String(storyIndex+1).padStart(2,'0');};
  tabs.forEach((tab,i)=>tab.addEventListener('click',()=>showStory(i,true))); previous?.addEventListener('click',()=>showStory(storyIndex-1)); next?.addEventListener('click',()=>showStory(storyIndex+1)); const storyShell=document.querySelector('[data-stories]'); const resetStoryTimer=()=>{clearInterval(storyTimer);storyTimer=setInterval(()=>showStory(storyIndex+1),15000);}; resetStoryTimer(); storyShell?.addEventListener('mouseenter',()=>clearInterval(storyTimer)); storyShell?.addEventListener('mouseleave',resetStoryTimer);
