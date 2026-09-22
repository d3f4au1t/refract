const header = document.querySelector('#header');
const hero = document.querySelector('.hero');
const menuButton = document.querySelector('.menu-toggle');
const menu = document.querySelector('#mobile-nav');
const dialog = document.querySelector('#registration-dialog');
const closeMenu = () => { menu.hidden = true; menuButton.setAttribute('aria-expanded', 'false'); menuButton.setAttribute('aria-label', 'Open navigation'); };
new IntersectionObserver(([entry]) => header.classList.toggle('scrolled', !entry.isIntersecting), { rootMargin: '-90px 0px 0px 0px' }).observe(hero);
menuButton.addEventListener('click', () => { const open = menu.hidden; menu.hidden = !open; menuButton.setAttribute('aria-expanded', String(open)); menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation'); });
menu.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.querySelectorAll('[data-registration]').forEach(button => button.addEventListener('click', () => { closeMenu(); dialog.showModal(); document.body.classList.add('dialog-open'); }));
const closeDialog = () => dialog.close();
dialog.querySelector('.dialog-close').addEventListener('click', closeDialog);
dialog.querySelector('.dialog-done').addEventListener('click', closeDialog);
dialog.addEventListener('click', event => { const box = dialog.getBoundingClientRect(); if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) closeDialog(); });
dialog.addEventListener('close', () => document.body.classList.remove('dialog-open'));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });

const backdrop = document.querySelector('.fixed-backdrop');
const backgroundLogo = backdrop.querySelector('img');
const glass = document.querySelector('.glass-content');
let lightFrame = 0;
const updateLightOcclusion = () => {
  lightFrame = 0;
  const glassBounds = glass.getBoundingClientRect();
  const glassEdge = glassBounds.top;
  const logoBounds = backgroundLogo.getBoundingClientRect();
  // The central flare sits at y=457 in the supplied 941px-tall artwork.
  const lightSourceY = logoBounds.top + logoBounds.height * (457 / 941);
  const lightSourceX = logoBounds.left + logoBounds.width * (837 / 1672);
  const distance = glassEdge - lightSourceY;
  const falloff = Math.max(18, Math.min(32, logoBounds.width * .02));
  // Keep the beam bright until contact, then let its intensity roll off rapidly.
  const transmission = 1 / (1 + Math.exp(-(distance + falloff * .24) / (falloff * .18)));
  const occlusion = 1 - transmission;
  const glowReach = falloff * (distance >= 0 ? 2.2 : .85);
  const edgeGlow = Math.exp(-Math.pow(distance / glowReach, 2));
  document.documentElement.style.setProperty('--light-occlusion', occlusion.toFixed(4));
  glass.style.setProperty('--light-source-x', `${lightSourceX - glassBounds.left}px`);
  glass.style.setProperty('--edge-glow', edgeGlow.toFixed(4));
  backdrop.classList.toggle('light-occluded', glassEdge <= lightSourceY);
};
const requestLightUpdate = () => {
  if (!lightFrame) lightFrame = requestAnimationFrame(updateLightOcclusion);
};
window.addEventListener('scroll', requestLightUpdate, { passive: true });
window.addEventListener('resize', requestLightUpdate);
window.addEventListener('pageshow', requestLightUpdate);
backgroundLogo.addEventListener('load', requestLightUpdate);
new ResizeObserver(requestLightUpdate).observe(hero);
updateLightOcclusion();

// Reveal the content without ever transforming the fixed logo or glass surface.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const revealTargets = document.querySelectorAll([
  '.glass-content h2', '.glass-content .section-label', '.stats>div',
  '.directions>div', '.funding>div',
  '.glass-content .body-copy', '.manifesto-copy .statement', '.format-note',
  '.support-list', '.join-section>.button', '.join-section>.eyebrow',
  '.faq-list details', '.footer-top', '.footer-bottom'
].join(','));

if (!reducedMotion.matches && 'IntersectionObserver' in window) {
  document.body.classList.add('motion-enabled');
  document.querySelectorAll('.stats,.directions,.funding,.faq-list').forEach(group => {
    [...group.children].forEach((item, index) => {
      item.style.setProperty('--enter-delay', `${Math.min(index * 95, 285)}ms`);
    });
  });
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: .12, rootMargin: '0px 0px -24px 0px' });
  revealTargets.forEach(target => {
    target.classList.add('reveal-ready');
    revealObserver.observe(target);
  });
  reducedMotion.addEventListener('change', event => {
    if (!event.matches) return;
    revealTargets.forEach(target => target.classList.add('is-visible'));
    revealObserver.disconnect();
    document.body.classList.remove('motion-enabled');
  });
}

const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
document.querySelectorAll('.directions>div').forEach(card => {
  let pointerFrame = 0;
  let pointerX = 0;
  let pointerY = 0;
  card.addEventListener('pointermove', event => {
    if (!finePointer.matches || reducedMotion.matches) return;
    const bounds = card.getBoundingClientRect();
    pointerX = event.clientX - bounds.left;
    pointerY = event.clientY - bounds.top;
    if (pointerFrame) return;
    pointerFrame = requestAnimationFrame(() => {
      card.style.setProperty('--pointer-x', `${pointerX}px`);
      card.style.setProperty('--pointer-y', `${pointerY}px`);
      pointerFrame = 0;
    });
  }, { passive: true });
  card.addEventListener('pointerleave', () => {
    cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
  });
});

// A bookmark selects its destination immediately. Ignore intermediate sections
// during native smooth scrolling; return to position tracking on the next scroll.
const navigationGroups = [header.querySelector('nav'), menu].map(nav =>
  [...nav.querySelectorAll('a')].map(link => ({ link, section: document.querySelector(link.hash) }))
);
const navigationLinks = navigationGroups.flat().map(item => item.link);
let bookmarkTarget = null;
let navigationFrame = 0;
let navigationSettleTimer = 0;
const setActiveBookmark = hash => {
  navigationLinks.forEach(link => {
    if (link.hash === hash) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
};
const updateNavigationFromScroll = () => {
  navigationFrame = 0;
  if (bookmarkTarget) return;
  const readingLine = Math.max(header.offsetHeight + 24, window.innerHeight * .3);
  navigationGroups.forEach(items => {
    const current = items.filter(item => item.section.getBoundingClientRect().top <= readingLine).at(-1);
    items.forEach(item => {
      if (item === current) item.link.setAttribute('aria-current', 'location');
      else item.link.removeAttribute('aria-current');
    });
  });
};
const releaseBookmarkScroll = () => {
  clearTimeout(navigationSettleTimer);
  bookmarkTarget = null;
  // Keep the clicked highlight. Recalculate only when scrolling resumes.
};
const waitForBookmarkScroll = () => {
  clearTimeout(navigationSettleTimer);
  navigationSettleTimer = setTimeout(releaseBookmarkScroll, 180);
};
const selectBookmark = hash => {
  const target = document.getElementById(hash.slice(1));
  if (!target) return;
  bookmarkTarget = target;
  setActiveBookmark(hash);
  waitForBookmarkScroll();
};
document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  selectBookmark(link.hash);
});
window.addEventListener('hashchange', () => selectBookmark(location.hash));
window.addEventListener('scroll', () => {
  if (bookmarkTarget) { waitForBookmarkScroll(); return; }
  if (!navigationFrame) navigationFrame = requestAnimationFrame(updateNavigationFromScroll);
}, { passive: true });
document.addEventListener('scrollend', () => {
  if (!bookmarkTarget) return;
  const offset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  const targetY = Math.min(document.documentElement.scrollHeight - window.innerHeight,
    Math.max(0, bookmarkTarget.getBoundingClientRect().top + window.scrollY - offset));
  // Ignore a late scrollend from an earlier click if another jump has started.
  if (Math.abs(window.scrollY - targetY) < 2) releaseBookmarkScroll();
});
// A deliberate scroll gesture can interrupt a bookmark jump immediately.
window.addEventListener('wheel', event => {
  if (!event.ctrlKey && (event.deltaY || event.deltaX)) releaseBookmarkScroll();
}, { passive: true });
window.addEventListener('touchmove', releaseBookmarkScroll, { passive: true });
document.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.target.closest('input,textarea,select,button,summary,[contenteditable="true"],[role="dialog"]')) return;
  if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) releaseBookmarkScroll();
});
window.addEventListener('resize', updateNavigationFromScroll);
window.addEventListener('pageshow', updateNavigationFromScroll);
if (location.hash) selectBookmark(location.hash);
else updateNavigationFromScroll();

document.addEventListener('click', event => {
  if (!menu.hidden && !menu.contains(event.target) && !menuButton.contains(event.target)) closeMenu();
});
window.matchMedia('(min-width: 761px)').addEventListener('change', event => {
  if (event.matches) closeMenu();
});

// Let native vertical scrolling carry the timeline sideways, then release it.
// The opening title and every chapter share one panoramic track, like the reference.
// The page, glass, and background keep their original geometry.
const journey = document.querySelector('.journey-section');
const journeyPin = journey.querySelector('.journey-pin');
const journeyViewport = journey.querySelector('.journey-viewport');
const journeyTrack = journey.querySelector('.journey-track');
const journeyPanorama = journey.querySelector('.journey-panorama');
const journeyIntro = journey.querySelector('.journey-intro');
const journeyChapters = [...journey.querySelectorAll('.journey-chapter')];
const journeyCount = journey.querySelector('.journey-count');
const journeyHint = journey.querySelector('.journey-scroll-hint>span');
let journeyTravel = 0;
let journeyTop = 0;
let journeyFrame = 0;
let journeyMeasureFrame = 0;
let currentChapter = -1;

const updateJourney = () => {
  journeyFrame = 0;
  if (!journey.classList.contains('is-horizontal')) return;
  const progress = Math.max(0, Math.min(1, (journeyTop - journey.getBoundingClientRect().top) / journeyTravel));
  journeyPanorama.style.transform = `translate3d(${-journeyTravel * progress}px,0,0)`;
  journey.style.setProperty('--journey-progress', progress.toFixed(4));
  const chapter = Math.min(journeyChapters.length - 1, Math.floor(progress * journeyChapters.length));
  if (chapter !== currentChapter) {
    currentChapter = chapter;
    journeyCount.textContent = String(chapter + 1).padStart(2, '0');
    journeyChapters.forEach((item, index) => {
      item.dataset.current = String(index === chapter);
      item.dataset.passed = String(index < chapter);
    });
  }
  const complete = progress >= .995;
  journey.classList.toggle('is-complete', complete);
  journeyHint.textContent = complete ? 'Keep going down' : 'Scroll to explore';
};
const requestJourneyUpdate = () => {
  if (!journeyFrame) journeyFrame = requestAnimationFrame(updateJourney);
};
const measureJourney = () => {
  journeyMeasureFrame = 0;
  // Compact desktop windows still pan; only very short views use the vertical list.
  const horizontal = !reducedMotion.matches && window.innerHeight >= 480;
  journey.classList.toggle('is-horizontal', horizontal);
  journey.style.removeProperty('height');
  journeyPanorama.style.removeProperty('transform');
  if (!horizontal) {
    journeyTravel = 0;
    journey.classList.remove('is-complete');
    return;
  }
  journeyTop = header.offsetHeight;
  journey.style.setProperty('--journey-top', `${journeyTop}px`);
  journey.style.setProperty('--journey-height', `${window.innerHeight - journeyTop}px`);
  journeyTravel = Math.max(1, journeyPanorama.scrollWidth - journeyViewport.clientWidth);
  const cardsOverflow = [...journey.querySelectorAll('.journey-card')].some(card => card.scrollHeight > card.clientHeight + 1);
  if (cardsOverflow || journeyIntro.scrollHeight > journeyViewport.clientHeight + 1) {
    journey.classList.remove('is-horizontal', 'is-complete');
    journeyTravel = 0;
    return;
  }
  journey.style.height = `${journeyPin.offsetHeight + journeyTravel}px`;
  updateJourney();
};
const requestJourneyMeasure = () => {
  if (!journeyMeasureFrame) journeyMeasureFrame = requestAnimationFrame(measureJourney);
};
window.addEventListener('scroll', requestJourneyUpdate, { passive: true });
window.addEventListener('resize', requestJourneyMeasure);
window.addEventListener('pageshow', requestJourneyMeasure);
reducedMotion.addEventListener('change', requestJourneyMeasure);
// Remeasure when font loading or a browser/sidebar resize changes card geometry.
new ResizeObserver(requestJourneyMeasure).observe(journeyViewport);
document.fonts.ready.then(requestJourneyMeasure);
measureJourney();

// Only a header resize changes the fixed menu mask; scrolling never moves it.
const measureMenu = () => {
  document.documentElement.style.setProperty('--menu-height', `${header.offsetHeight}px`);
};
new ResizeObserver(measureMenu).observe(header);
measureMenu();

// Count each funding goal once, on its first visible appearance.
// Static, accessible labels stay at the final value throughout the animation.
if ('IntersectionObserver' in window && !reducedMotion.matches) {
  const fundingCounters = [...document.querySelectorAll('[data-count-to]')].map(element => ({
    element,
    value: element.querySelector('.count-value'),
    target: Number(element.dataset.countTo),
    label: element.querySelector('.count-value').textContent,
    started: false,
    frame: 0,
    timer: 0
  }));
  const finishCounter = counter => {
    cancelAnimationFrame(counter.frame);
    clearTimeout(counter.timer);
    counter.value.textContent = counter.label;
    counter.element.dataset.countState = 'complete';
  };
  const startCounter = counter => {
    if (counter.started) return;
    counter.started = true;
    counter.element.dataset.countState = 'counting';
    const start = performance.now() + 80;
    const tick = now => {
      const progress = Math.min(1, Math.max(0, (now - start) / 600));
      // Keep the final digits moving at the same pace as the rest of the count.
      counter.value.textContent = `$${Math.floor(counter.target * progress)}`;
      if (progress < 1) counter.frame = requestAnimationFrame(tick);
      // Briefly show the full amount before compacting it to $10K+ / $3K+.
      else counter.timer = setTimeout(() => finishCounter(counter), 60);
    };
    counter.frame = requestAnimationFrame(tick);
  };
  const fundingObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting || entry.intersectionRatio < .5) return;
      const counter = fundingCounters.find(item => item.element === entry.target);
      fundingObserver.unobserve(entry.target);
      startCounter(counter);
    });
  }, { threshold: .5, rootMargin: '0px 0px -24px 0px' });
  fundingCounters.forEach(counter => {
    counter.value.textContent = '$0';
    counter.element.dataset.countState = 'ready';
    fundingObserver.observe(counter.element);
  });
  reducedMotion.addEventListener('change', event => {
    if (!event.matches) return;
    fundingObserver.disconnect();
    fundingCounters.forEach(finishCounter);
  });
}
