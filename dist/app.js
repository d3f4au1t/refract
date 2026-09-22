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
  const crossing = Math.max(0, Math.min(1, (falloff - distance) / (falloff * 2)));
  const occlusion = crossing * crossing * (3 - 2 * crossing);
  const edgeGlow = Math.exp(-Math.pow(distance / (falloff * 1.7), 2));
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
