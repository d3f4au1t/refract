// Move the same 60 icons into example teams without changing the page geometry.
(() => {
  const formation = document.querySelector('.team-formation');
  if (!formation) return;
  const stage = formation.querySelector('.formation-stage');
  const people = [...formation.querySelectorAll('.person')];
  const teams = [...formation.querySelectorAll('.team-outline')];
  const status = formation.querySelector('.formation-status');
  const replay = formation.querySelector('.formation-replay');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let started = false;
  let visible = false;
  let groupTimer = 0;
  let finishTimer = 0;
  let layoutFrame = 0;

  const layout = () => {
    stage.classList.add('is-measuring');
    const css = getComputedStyle(stage);
    const columns = Number(css.getPropertyValue('--team-columns'));
    const gridColumns = Number(css.getPropertyValue('--grid-columns'));
    const gap = parseFloat(css.getPropertyValue('--team-gap'));
    const tileHeight = parseFloat(css.getPropertyValue('--team-height'));
    const tileWidth = (stage.clientWidth - gap * (columns - 1)) / columns;
    const iconWidth = people[0].offsetWidth;
    const iconHeight = people[0].offsetHeight;
    const gridCellWidth = Math.min(52, stage.clientWidth / gridColumns);
    const gridCellHeight = iconHeight + (columns === 2 ? 19 : 21);
    const gridRows = Math.ceil(people.length / gridColumns);
    const gridLeft = (stage.clientWidth - gridCellWidth * gridColumns) / 2;
    const gridTop = (stage.clientHeight - gridCellHeight * gridRows) / 2;
    const memberGap = columns === 2 ? 5 : 10;
    teams.forEach((team, index) => {
      team.style.width = `${tileWidth}px`;
      team.style.height = `${tileHeight}px`;
      team.style.setProperty('--tile-x', `${(index % columns) * (tileWidth + gap)}px`);
      team.style.setProperty('--tile-y', `${Math.floor(index / columns) * (tileHeight + gap)}px`);
    });
    people.forEach((person, index) => {
      const team = Number(person.dataset.team);
      const member = Number(person.dataset.member);
      const size = Number(teams[team].dataset.size);
      const groupWidth = size * iconWidth + (size - 1) * memberGap;
      // Interleave team membership in the initial crowd so groups gather naturally.
      const gridIndex = (index * 17) % people.length;
      person.style.setProperty('--grid-x', `${gridLeft + (gridIndex % gridColumns) * gridCellWidth + (gridCellWidth - iconWidth) / 2}px`);
      person.style.setProperty('--grid-y', `${gridTop + Math.floor(gridIndex / gridColumns) * gridCellHeight + (gridCellHeight - iconHeight) / 2}px`);
      person.style.setProperty('--team-x', `${(team % columns) * (tileWidth + gap) + (tileWidth - groupWidth) / 2 + member * (iconWidth + memberGap)}px`);
      person.style.setProperty('--team-y', `${Math.floor(team / columns) * (tileHeight + gap) + (tileHeight - iconHeight) / 2}px`);
      person.style.setProperty('--person-delay', `${team * 18 + member * 28}ms`);
    });
    stage.classList.add('is-ready');
    cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(() => stage.classList.remove('is-measuring'));
  };
  const settle = () => {
    clearTimeout(groupTimer);
    clearTimeout(finishTimer);
    groupTimer = 0;
    formation.dataset.phase = 'teams';
    status.textContent = 'Example: 16 teams of 2–5';
    replay.disabled = false;
  };
  const play = (fromReplay = false) => {
    clearTimeout(groupTimer);
    clearTimeout(finishTimer);
    formation.dataset.phase = 'grid';
    status.textContent = 'Example: 60 students';
    replay.disabled = true;
    groupTimer = setTimeout(() => {
      groupTimer = 0;
      formation.dataset.phase = 'teams';
      status.textContent = 'Example: 16 teams of 2–5';
      finishTimer = setTimeout(settle, 1600);
    }, fromReplay ? 1900 : 1250);
  };
  const observer = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting && entries[0].intersectionRatio >= .4;
    if (visible && !started && !motion.matches) {
      started = true;
      play();
    } else if (!visible && groupTimer) {
      // If the initial crowd leaves before grouping starts, show it on next entry.
      clearTimeout(groupTimer);
      groupTimer = 0;
      started = false;
      replay.disabled = false;
    }
  }, { threshold: [.0, .4] });
  layout();
  new ResizeObserver(layout).observe(stage);
  observer.observe(stage);
  replay.hidden = motion.matches;
  replay.addEventListener('click', () => {
    if (motion.matches) return;
    started = true;
    play(true);
  });
  motion.addEventListener('change', () => {
    replay.hidden = motion.matches;
    if (motion.matches) { started = true; settle(); }
    else if (!started && visible) { started = true; play(); }
  });
  if (motion.matches) { started = true; settle(); }
})();
