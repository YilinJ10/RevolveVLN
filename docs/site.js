'use strict';

const hero = document.querySelector('.hero');
const film = document.getElementById('hero-video');
const filmFrame = hero.querySelector('.film-frame');
const heldCamera = document.getElementById('held-camera-frame');
const motion = document.getElementById('motion');
const quality = document.getElementById('hero-quality');
const eyes = document.getElementById('egocentric-canvas').getContext('2d', {alpha: false});
const memory = document.getElementById('reconstruction-canvas').getContext('2d', {alpha: false});
const frameProbe = document.createElement('canvas');
frameProbe.width = 16;
frameProbe.height = 16;
const probe = frameProbe.getContext('2d', {willReadFrequently: true});
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const connection = navigator.connection;
const compactTouchScreen = matchMedia('(pointer: coarse) and (max-width: 75rem)').matches;
let highDefinition = !compactTouchScreen && !connection?.saveData;
let requested = !reduceMotion.matches && !connection?.saveData;
let inView = !('IntersectionObserver' in window);
let mode = 'idle';
let stream = null;
let loadingSegments = false;
let callback = null;
let resumeAt = null;
let sourceRevision = 0;
let libraryPromise;
let showingOpening = true;
let openingPainted = false;
let openingTimer = null;
let needFrameCheck = true;
let eyeWidth = 960;
let memoryWidth = 960;

const roomOut = [[0,.15],[5,.27],[10,.41],[15,.55],[20,.67],[25,.75],[30,.81],[40,.87],[45,.93],[49,.98]];
const hallway = [[50,.61],[53,.47],[57,.43],[68,.40],[78,.39],[82,.41],[86,.47],[89.3,.54]];
const roomBack = [[89.3,.98],[94,.95],[100,.86],[105,.85],[110,.76],[115,.67],[120,.58],[125,.46],[130,.44],[135,.32],[140,.22],[143.567,.17]];
function positionCamera(time) {
  const points = time < 50 ? roomOut : time < 89.3 ? hallway : roomBack;
  let right = 1;
  while (right < points.length - 1 && time > points[right][0]) right++;
  const [t0,x0] = points[right-1];
  const [t1,x1] = points[right];
  const mix = Math.max(0, Math.min(1, (time-t0)/(t1-t0)));
  const focus = (x0 + (x1-x0)*mix).toFixed(3);
  if (filmFrame.style.getPropertyValue('--focus') !== focus) filmFrame.style.setProperty('--focus', focus);
}

function hasBothViews(width, height) {
  if (!probe || location.protocol === 'file:') return film.currentTime > 0;
  probe.drawImage(film, width, 0, width, height, 0, 0, 16, 8);
  probe.drawImage(film, 0, height, width, film.videoHeight - height, 0, 8, 16, 8);
  const pixels = probe.getImageData(0, 0, 16, 16).data;
  let eyeVisible = false;
  for (let i = 0; i < pixels.length; i += 4) {
    if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) < 48) continue;
    if (i < pixels.length / 2) eyeVisible = true;
    else if (eyeVisible) return true;
  }
  return false;
}

function paintInset(ctx, x, y, width, height, outputWidth) {
  const canvas = ctx.canvas;
  const outputHeight = Math.round(outputWidth * height / width);
  if (canvas.width !== outputWidth || canvas.height !== outputHeight) {
    canvas.width = outputWidth;
    canvas.height = outputHeight;
  }
  ctx.drawImage(film, x, y, width, height, 0, 0, canvas.width, canvas.height);
}

function drawFrame(time) {
  if (showingOpening || resumeAt !== null || film.readyState < 2 || film.seeking || !eyes || !memory) return;
  const width = film.videoWidth / 2;
  const height = width * 9 / 16;
  if (!width || film.videoHeight <= height) return;
  if (needFrameCheck && !hasBothViews(width, height)) return;
  paintInset(eyes, width, 0, width, height, eyeWidth);
  paintInset(memory, 0, height, width, film.videoHeight - height, memoryWidth);
  needFrameCheck = false;
  positionCamera(time);
  heldCamera.hidden = true;
  hero.classList.add('has-frame');
}

function holdCameraFrame() {
  if (!heldCamera.hidden || !hero.classList.contains('has-frame') || film.readyState < 2 || film.seeking) return;
  const context = heldCamera.getContext('2d', {alpha: false});
  if (!context) return;
  heldCamera.width = film.videoWidth / 2;
  heldCamera.height = heldCamera.width * 9 / 16;
  context.drawImage(film, 0, 0, heldCamera.width, heldCamera.height, 0, 0, heldCamera.width, heldCamera.height);
  heldCamera.hidden = false;
}

function sizeInsets() {
  const ratio = window.devicePixelRatio || 1;
  eyeWidth = Math.max(1, Math.min(1920, Math.round(eyes.canvas.clientWidth * ratio)));
  memoryWidth = Math.max(1, Math.min(1920, Math.round(memory.canvas.clientWidth * ratio)));
}

function onFrame(now, metadata) {
  callback = null;
  drawFrame(metadata?.mediaTime ?? film.currentTime);
  if (!film.paused && !film.ended) schedule();
}
function schedule() {
  if (callback !== null) return;
  callback = film.requestVideoFrameCallback ? film.requestVideoFrameCallback(onFrame) : requestAnimationFrame(onFrame);
}
function discardCallback() {
  if (callback === null) return;
  if (film.cancelVideoFrameCallback) film.cancelVideoFrameCallback(callback);
  else cancelAnimationFrame(callback);
  callback = null;
}
function labelMotion() {
  const label = mode === 'failed' ? 'Retry synchronized video' : requested ? 'Pause synchronized video' : 'Play synchronized video';
  motion.title = label;
  motion.setAttribute('aria-label', label);
  motion.dataset.paused = String(!requested || mode === 'failed');
}

function labelQuality() {
  quality.setAttribute('aria-pressed', String(highDefinition));
  quality.querySelector('span').textContent = highDefinition ? 'HD' : 'SD';
  quality.title = highDefinition ? 'Main camera 1080p · Switch to 540p' : 'Main camera 540p · Switch to 1080p';
}

function loadLibrary() {
  if (!libraryPromise) libraryPromise = new Promise((resolve,reject) => {
    const script = document.createElement('script');
    script.src = 'assets/vendor/hls.light-1.7.4.min.js';
    script.onload = () => resolve(window.Hls);
    script.onerror = () => { libraryPromise = null; reject(new Error('HLS player unavailable')); };
    document.head.append(script);
  });
  return libraryPromise;
}

function releaseStream() {
  needFrameCheck = true;
  const previous = stream;
  stream = null;
  previous?.destroy();
  loadingSegments = false;
  discardCallback();
}

function useProgressive() {
  if (mode === 'progressive') return;
  holdCameraFrame();
  highDefinition = false;
  labelQuality();
  releaseStream();
  mode = 'progressive';
  film.src = film.dataset.src;
  updatePlayback();
}

async function useMediaSource() {
  needFrameCheck = true;
  const revision = sourceRevision;
  mode = 'loading-library';
  try {
    const Hls = await loadLibrary();
    if (revision !== sourceRevision) return;
    if (!Hls?.isSupported()) { quality.hidden = true; useProgressive(); return; }
    mode = 'attaching';
    const controller = new Hls({autoStartLoad: false, maxBufferLength: 18, maxMaxBufferLength: 32, backBufferLength: 14});
    stream = controller;
    controller.on(Hls.Events.MEDIA_ATTACHED, () => { if (stream === controller) controller.loadSource(film.dataset.stream); });
    controller.on(Hls.Events.MANIFEST_PARSED, () => {
      if (stream !== controller) return;
      mode = 'stream';
      updatePlayback();
    });
    controller.on(Hls.Events.ERROR, (event, details) => {
      if (stream === controller && details.fatal) { rememberTime(); useProgressive(); }
    });
    controller.attachMedia(film);
  } catch {
    if (revision === sourceRevision) useProgressive();
  }
}
function rememberTime() {
  if (resumeAt === null && Number.isFinite(film.currentTime) && film.currentTime > 0) resumeAt = film.currentTime;
}
function startSource() {
  film.preload = 'auto';
  if (!highDefinition || location.protocol === 'file:') { useProgressive(); return; }
  if (film.canPlayType('application/vnd.apple.mpegurl')) {
    mode = 'native';
    film.src = film.dataset.stream;
    updatePlayback();
  } else {
    useMediaSource();
  }
}
function updatePlayback() {
  labelMotion();
  if (!requested || !inView || document.hidden) {
    clearTimeout(openingTimer);
    openingTimer = null;
    film.pause();
    if (stream && loadingSegments) { stream.stopLoad(); loadingSegments = false; }
    return;
  }
  if (showingOpening && openingPainted && openingTimer === null) {
    openingTimer = setTimeout(() => {
      openingTimer = null;
      showingOpening = false;
      updatePlayback();
    }, 850);
  }
  if (mode === 'idle') { startSource(); return; }
  if (mode === 'loading-library' || mode === 'attaching' || mode === 'failed') return;
  if (stream && !loadingSegments) { stream.startLoad(resumeAt ?? film.currentTime); loadingSegments = true; }
  if (showingOpening) return;
  film.play().catch(error => {
    if (error.name === 'NotAllowedError') { requested = false; labelMotion(); }
  });
}
film.addEventListener('loadedmetadata', () => {
  if (resumeAt !== null && Number.isFinite(film.duration)) {
    film.currentTime = Math.min(resumeAt, Math.max(0, film.duration-.1));
    resumeAt = null;
  }
});
film.addEventListener('seeking', () => { needFrameCheck = true; });
film.addEventListener('seeked', schedule);
film.addEventListener('playing', () => { schedule(); labelMotion(); });
film.addEventListener('error', () => {
  if (!film.error) return;
  if (mode === 'native') { rememberTime(); useMediaSource(); }
  else if (mode === 'progressive') {
    rememberTime();
    mode = 'failed'; requested = false;
    heldCamera.hidden = true;
    hero.classList.remove('has-frame');
    positionCamera(0);
    discardCallback();
    labelMotion();
  }
});
quality.addEventListener('click', () => {
  rememberTime();
  holdCameraFrame();
  sourceRevision++;
  highDefinition = !highDefinition;
  labelQuality();
  if (mode !== 'idle') {
    mode = 'idle';
    film.pause();
    releaseStream();
    film.removeAttribute('src');
    film.load();
  }
  updatePlayback();
});
motion.addEventListener('click', () => {
  if (!inView && mode === 'idle') {
    inView = true;
    requested = false;
  }
  if (mode === 'failed') mode = 'idle';
  requested = !requested;
  if (requested && showingOpening) {
    clearTimeout(openingTimer);
    openingTimer = null;
    showingOpening = false;
  }
  updatePlayback();
});
reduceMotion.addEventListener('change', () => {
  requested = !reduceMotion.matches && !navigator.connection?.saveData;
  updatePlayback();
});
document.addEventListener('visibilitychange', updatePlayback);
if (eyes && memory) {
  motion.hidden = false;
  quality.hidden = location.protocol === 'file:' ||
    !(film.canPlayType('application/vnd.apple.mpegurl') || window.MediaSource || window.ManagedMediaSource);
  labelQuality();
  Promise.resolve(hero.querySelector('.opening-poster').decode?.()).catch(() => {}).then(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      openingPainted = true;
      updatePlayback();
    }));
  });
  sizeInsets();
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(sizeInsets);
    observer.observe(eyes.canvas.parentElement);
    observer.observe(memory.canvas.parentElement);
  } else window.addEventListener('resize', sizeInsets);
  if ('IntersectionObserver' in window) {
    let landingOnSection = Boolean(document.getElementById(location.hash.slice(1))?.closest('main'));
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting && !landingOnSection;
      landingOnSection = false;
      updatePlayback();
    }).observe(hero);
  }
  updatePlayback();
}

const resourceDialog = document.getElementById('resource-dialog');
for (const link of document.querySelectorAll('.resources a[href^="#release-"]')) {
  link.addEventListener('click', event => {
    if (!resourceDialog.showModal || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const note = document.getElementById(link.hash.slice(1));
    document.getElementById('resource-name').textContent = note.querySelector('h2').textContent;
    document.getElementById('resource-message').textContent = note.querySelector('p').textContent;
    resourceDialog.showModal();
  });
}
resourceDialog.addEventListener('click', event => {
  if (event.target !== resourceDialog) return;
  const bounds = resourceDialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) resourceDialog.close();
});

const demoPlayers = document.querySelectorAll('.demo-task video');
for (const player of demoPlayers) {
  player.addEventListener('play', () => {
    for (const other of demoPlayers) {
      if (other !== player && !other.paused) other.pause();
    }
  });
}

async function prepareDemoStream(player) {
  const source = player.dataset.stream;
  if (location.protocol === 'file:' || !player.paused || player.played.length) return;
  const fallback = player.getAttribute('src');
  let controller;
  let restored = false;
  let playing = false;
  const rememberPlay = () => { playing = true; };
  const rememberPause = () => { if (!player.error) playing = false; };
  const startSegments = () => { controller?.startLoad(); };
  function useFallback() {
    if (restored) return;
    restored = true;
    const position = player.currentTime;
    const resume = playing || !player.paused;
    player.removeEventListener('error', useFallback);
    player.removeEventListener('play', startSegments);
    player.removeEventListener('play', rememberPlay);
    player.removeEventListener('pause', rememberPause);
    controller?.destroy();
    player.src = fallback;
    if (position > 0) {
      player.addEventListener('loadedmetadata', () => { player.currentTime = position; }, {once: true});
    }
    if (resume) player.play().catch(() => {});
  }
  if (player.canPlayType('application/vnd.apple.mpegurl')) {
    player.addEventListener('error', useFallback, {once: true});
    player.src = source;
  } else {
    let Hls;
    try { Hls = await loadLibrary(); } catch { return; }
    if (!Hls.isSupported() || !player.paused || player.played.length) return;
    controller = new Hls({autoStartLoad: false, maxBufferLength: 24, backBufferLength: 15});
    controller.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) useFallback(); });
    controller.on(Hls.Events.MANIFEST_PARSED, () => { if (!player.paused) startSegments(); });
    player.addEventListener('play', startSegments, {once: true});
    controller.loadSource(source);
    controller.attachMedia(player);
  }
  player.addEventListener('play', rememberPlay);
  player.addEventListener('pause', rememberPause);
}

function prepareDemo(player) {
  player.poster = player.dataset.poster;
  if (player.dataset.stream) prepareDemoStream(player);
}
const demoPosters = document.querySelectorAll('main video[data-poster]');
if ('IntersectionObserver' in window) {
  const approaching = new IntersectionObserver(entries => {
    for (const {target, isIntersecting} of entries) {
      if (isIntersecting) {
        approaching.unobserve(target);
        prepareDemo(target);
      }
    }
  }, {rootMargin: '300px 0px'});
  for (const player of demoPosters) approaching.observe(player);
} else {
  for (const player of demoPosters) prepareDemo(player);
}

const copyCitation = document.getElementById('copy-bibtex');
const citationEntry = document.getElementById('bibtex-entry');
const copyStatus = document.getElementById('copy-status');
copyCitation.hidden = false;
copyCitation.addEventListener('click', async () => {
  copyStatus.textContent = '';
  try {
    await navigator.clipboard.writeText(citationEntry.textContent.trimEnd() + '\n');
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(citationEntry);
    selection.removeAllRanges();
    selection.addRange(range);
    let copied = false;
    try {
      copied = document.execCommand?.('copy') === true;
    } catch {
    }
    if (!copied) {
      copyStatus.textContent = 'Citation selected. Use your device’s Copy command.';
      return;
    }
    selection.removeAllRanges();
  }
  copyStatus.textContent = 'Copied.';
});

function revealSections() {
  if (!('IntersectionObserver' in window)) return;
  const selector = '.section h2, .abstract-body p, .framework, .result, .demo-task';
  const unread = new Set(document.querySelectorAll(selector));
  const observer = new IntersectionObserver(entries => {
    let order = 0;
    for (const {target, isIntersecting} of entries) {
      if (!isIntersecting || reduceMotion.matches || !target.classList.contains('reveal-pending')) continue;
      observer.unobserve(target);
      target.style.setProperty('--reveal-delay', Math.min(order++, 4) * 60 + 'ms');
      target.classList.replace('reveal-pending', 'reveal-in');
    }
  }, {threshold: .08, rootMargin: '0px 0px -5% 0px'});

  function settle(block) {
    observer.unobserve(block);
    unread.delete(block);
    block.classList.remove('reveal-pending', 'reveal-in');
    block.style.removeProperty('--reveal-delay');
  }
  document.addEventListener('focusin', event => {
    const block = event.target.closest('.reveal-pending, .reveal-in');
    if (block) settle(block);
  });
  document.addEventListener('animationend', event => {
    if (event.animationName === 'section-rise' || event.animationName === 'heading-rise') settle(event.target);
  });
  function applyPreference() {
    observer.disconnect();
    document.querySelectorAll('.reveal-in').forEach(settle);
    for (const block of unread) {
      if (block.getBoundingClientRect().top < window.innerHeight * .95) {
        settle(block);
      } else {
        block.classList.toggle('reveal-pending', !reduceMotion.matches);
        if (!reduceMotion.matches) observer.observe(block);
      }
    }
  }
  reduceMotion.addEventListener('change', applyPreference);
  applyPreference();
}

revealSections();
