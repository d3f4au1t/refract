(() => {
  const story = document.querySelector('.prototype-story');
  if (!story) return;
  const stage = story.querySelector('.prototype-stage');
  const art = story.querySelector('.prototype-art');
  const canvas = story.querySelector('canvas');
  const controls = story.querySelector('.prototype-controls');
  const slider = controls.querySelector('input');
  const output = controls.querySelector('output');
  const phaseNumber = story.querySelector('.prototype-phase-number');
  const phaseText = story.querySelector('.prototype-phase-text');
  const description = story.querySelector('.prototype-description');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const phases = ['Start with the parts.', 'Fit the circuit board.', 'Connect the sensor.', 'Seat the display.', 'Close the housing.', 'Switch it on.'];
  let model, loading = false, failed = false, inView = false, frame = 0;
  let travel = 1000, top = 98, progress = 0, manual = 1, width = 1, height = 1;
  let lastProgress = -1, lastPhase = -1, lastWidth = 0, lastHeight = 0;
  const clamp = value => Math.max(0, Math.min(1, value));

  function update() {
    frame = 0;
    if (document.hidden || failed) return;
    progress = story.classList.contains('is-scroll') ? clamp((top - story.getBoundingClientRect().top) / travel) : manual;
    const phase = progress < .06 ? 0 : progress < .30 ? 1 : progress < .48 ? 2 : progress < .68 ? 3 : progress < .94 ? 4 : 5;
    if (phase !== lastPhase) {
      phaseNumber.textContent = String(Math.min(phase + 1, 5)).padStart(2, '0');
      phaseText.textContent = phases[phase]; lastPhase = phase;
    }
    if (progress !== lastProgress || width !== lastWidth || height !== lastHeight) {
      story.style.setProperty('--assembly-progress', progress.toFixed(4));
      story.dataset.progress = progress.toFixed(4);
      slider.value = String(Math.round(progress * 100));
      slider.setAttribute('aria-valuetext', `${Math.round(progress * 100)} percent assembled. ${phases[phase]}`);
      output.textContent = progress >= .99 ? 'Powered on' : `${Math.round(progress * 100)}% assembled`;
      if (model && inView) {
        model.render(progress, width, height);
        story.classList.add('is-rendered');
        lastProgress = progress; lastWidth = width; lastHeight = height;
      }
    }
  }
  function requestUpdate() { if (!frame) frame = requestAnimationFrame(update); }
  function measure() {
    const menuHeight = document.querySelector('#header').offsetHeight;
    const narrow = innerWidth <= 760;
    top = menuHeight + (narrow ? 4 : 12);
    // A stable small viewport prevents mobile browser chrome from moving the scene.
    const smallViewport = document.documentElement.clientHeight;
    const stageHeight = Math.min(860, smallViewport - top - 12);
    const scrollable = !failed && !reduced.matches && stageHeight >= (narrow ? 535 : 410);
    travel = Math.max(850, Math.min(1300, smallViewport * 1.25));
    story.classList.toggle('is-scroll', scrollable);
    story.classList.toggle('is-static', !scrollable);
    const instructions = model
      ? scrollable ? 'A circuit board, a sensor and a display. Scroll to see how they fit together.'
        : 'A circuit board, a sensor and a display. Use the control to see how they fit together.'
      : 'A circuit board, a sensor and a display, inside a metal housing.';
    if (description.textContent !== instructions) description.textContent = instructions;
    story.style.setProperty('--assembly-height', `${stageHeight}px`);
    story.style.setProperty('--assembly-travel', `${travel}px`);
    width = Math.max(1, Math.round(art.clientWidth)); height = Math.max(1, Math.round(art.clientHeight));
    requestUpdate();
  }
  async function load() {
    if (model || loading || failed) return;
    loading = true;
    try {
      const { createPrototype } = await import('./assembly-model.js?v=2');
      model = createPrototype(canvas);
      controls.hidden = false;
      measure();
    } catch {
      failed = true;
      // Keep the descriptive illustration if WebGL is unavailable.
      phaseNumber.textContent = '01'; phaseText.textContent = 'Example temperature sensor.';
      controls.hidden = true; measure();
    } finally { loading = false; }
  }
  slider.addEventListener('input', () => {
    manual = Number(slider.value) / 100;
    if (story.classList.contains('is-scroll')) {
      const start = story.getBoundingClientRect().top + scrollY - top;
      window.scrollTo({ top: start + travel * manual, behavior: 'instant' });
    }
    requestUpdate();
  });
  window.addEventListener('scroll', () => { if (inView) requestUpdate(); }, { passive: true });
  window.addEventListener('resize', measure);
  window.addEventListener('pageshow', () => { lastProgress = -1; measure(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) requestUpdate(); });
  reduced.addEventListener('change', measure);
  new ResizeObserver(measure).observe(stage);
  document.fonts.ready.then(measure);
  new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) load();
  }, { rootMargin: '700px' }).observe(story);
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (inView) { lastProgress = -1; requestUpdate(); }
  }).observe(stage);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); story.classList.remove('is-rendered');
    model?.dispose(); model = null; failed = true; controls.hidden = true; measure();
  });
  canvas.addEventListener('webglcontextrestored', () => { failed = false; load(); });
  measure();
})();
