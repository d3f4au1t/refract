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
  backdrop.style.setProperty('--light-occlusion', occlusion.toFixed(4));
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

const navigationLinks = [...header.querySelectorAll('nav a')];
const sectionObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    navigationLinks.forEach(link => {
      if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  });
}, { rootMargin: '-15% 0px -65% 0px' });
navigationLinks.forEach(link => sectionObserver.observe(document.querySelector(link.hash)));

document.addEventListener('click', event => {
  if (!menu.hidden && !menu.contains(event.target) && !menuButton.contains(event.target)) closeMenu();
});
window.matchMedia('(min-width: 761px)').addEventListener('change', event => {
  if (event.matches) closeMenu();
});

// Let native vertical scrolling carry the timeline sideways, then release it.
// Only the chapter track moves; the page, glass, and background keep their geometry.
const journey = document.querySelector('.journey-section');
const journeyPin = journey.querySelector('.journey-pin');
const journeyViewport = journey.querySelector('.journey-viewport');
const journeyTrack = journey.querySelector('.journey-track');
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
  journeyTrack.style.transform = `translate3d(${-journeyTravel * progress}px,0,0)`;
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
  // Small or zoomed viewports and reduced-motion readers get the full vertical list.
  const horizontal = !reducedMotion.matches && window.innerHeight >= 650;
  journey.classList.toggle('is-horizontal', horizontal);
  journey.style.removeProperty('height');
  journeyTrack.style.removeProperty('transform');
  if (!horizontal) {
    journeyTravel = 0;
    journey.classList.remove('is-complete');
    return;
  }
  journeyTop = header.offsetHeight;
  journey.style.setProperty('--journey-top', `${journeyTop}px`);
  journey.style.setProperty('--journey-height', `${window.innerHeight - journeyTop}px`);
  const end = journeyTrack.lastElementChild.getBoundingClientRect().right - journeyTrack.getBoundingClientRect().left;
  const endPadding = parseFloat(getComputedStyle(journeyTrack).paddingRight);
  journeyTravel = Math.max(1, end + endPadding - journeyViewport.clientWidth);
  if ([...journey.querySelectorAll('.journey-card')].some(card => card.scrollHeight > card.clientHeight + 1)) {
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
