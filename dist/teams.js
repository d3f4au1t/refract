// Move the same 60 icons into example teams without changing the page geometry.
(() => {
  const formation = document.querySelector('.team-formation');
  if (!formation) return;
  const stage = formation.querySelector('.formation-stage');
  const people = [...formation.querySelectorAll('.person')].map((icon, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'person';
    button.dataset.team = icon.dataset.team; button.dataset.member = icon.dataset.member;
    button.dataset.person = String(index); button.disabled = true; button.tabIndex = index ? -1 : 0;
    button.append(...icon.childNodes); button.querySelector('svg').setAttribute('aria-hidden', 'true');
    icon.replaceWith(button); return button;
  });
  stage.setAttribute('role', 'group');
  stage.setAttribute('aria-label', 'Example teams. Select a person, then a team. Use arrow keys to choose a team, Enter to move, Escape to cancel. Teams need 2 to 5 people.');
  formation.querySelector('.formation-art').removeAttribute('aria-hidden');
  const originalTeams = people.map(person => Number(person.dataset.team));
  const teams = [...formation.querySelectorAll('.team-outline')];
  const status = formation.querySelector('.formation-status');
  const replay = formation.querySelector('.formation-replay');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let started = false;
  let visible = false;
  let groupTimer = 0;
  let finishTimer = 0;
  let layoutFrame = 0;
  let selected = null, destination = null, drag = null, ready = false, flashTimer = 0;
  const members = team => people.filter(person => Number(person.dataset.team) === team);
  const invalidGroups = target => {
    if (!selected || target === Number(selected.dataset.team)) return [];
    const source = Number(selected.dataset.team), invalid = [];
    if (members(source).length <= 2) invalid.push(source);
    if (target !== null && members(target).length >= 5) invalid.push(target);
    return invalid;
  };
  const clearHighlights = () => {
    teams.forEach(team => team.classList.remove('is-target', 'is-invalid'));
    people.forEach(person => person.classList.remove('is-invalid'));
  };
  const highlight = target => {
    clearTimeout(flashTimer); clearHighlights(); destination = target;
    const invalid = invalidGroups(target);
    if (target !== null && selected) teams[target].classList.add('is-target');
    invalid.forEach(index => {
      teams[index].classList.add('is-invalid');
      members(index).forEach(person => person.classList.add('is-invalid'));
    });
    return invalid;
  };
  const cancel = (keepFlash = false) => {
    if (drag && selected?.hasPointerCapture(drag.id)) selected.releasePointerCapture(drag.id);
    people.forEach(person => { person.classList.remove('is-dragging', 'is-selected'); person.setAttribute('aria-pressed', 'false'); });
    selected = null; drag = null; destination = null;
    formation.classList.remove('is-selecting');
    if (!keepFlash) { clearTimeout(flashTimer); clearHighlights(); }
  };
  const select = person => {
    cancel(); selected = person; person.classList.add('is-selected');
    person.setAttribute('aria-pressed', 'true'); formation.classList.add('is-selecting');
    destination = Number(person.dataset.team);
    status.textContent = `Person ${Number(person.dataset.person) + 1} selected from team ${destination + 1}. Choose another team.`;
  };
  const updateMembers = () => {
    teams.forEach((team,index) => {
      const group = members(index); team.dataset.size = String(group.length);
      team.setAttribute('aria-label', `Team ${index + 1}, ${group.length} people`);
      group.forEach((person,member) => {
        person.dataset.member = String(member);
        person.setAttribute('aria-label', `Person ${Number(person.dataset.person)+1}, team ${index+1}, ${group.length} people`);
      });
    });
  };
  const drop = target => {
    if (!selected) return;
    const person = selected, source = Number(person.dataset.team);
    if (target === null || target === source) { cancel(); return; }
    const invalid = highlight(target);
    if (invalid.length) {
      status.textContent = invalid.includes(source) ? `Team ${source+1} needs at least two people. Move cancelled.` : `Team ${target+1} already has five people. Move cancelled.`;
      cancel(true); flashTimer = setTimeout(clearHighlights, 900); return;
    }
    person.dataset.team = String(target); cancel(); updateMembers(); layout(true);
    status.textContent = `Person ${Number(person.dataset.person)+1} moved to team ${target+1}.`;
  };
  const teamAt = (x,y) => {
    const index = teams.findIndex(team => { const r = team.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; });
    return index < 0 ? null : index;
  };

  const layout = (animate = false) => {
    if (!animate) stage.classList.add('is-measuring');
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
    replay.disabled = false; ready = true;
    formation.classList.add('is-interactive'); people.forEach(person => person.disabled = false);
  };
  const play = (fromReplay = false) => {
    clearTimeout(groupTimer);
    clearTimeout(finishTimer);
    cancel(); ready = false; formation.classList.remove('is-interactive');
    people.forEach((person,index) => { person.disabled = true; person.dataset.team = String(originalTeams[index]); });
    updateMembers(); layout();
    formation.dataset.phase = 'grid';
    status.textContent = 'Example: 60 students';
    replay.disabled = true;
    groupTimer = setTimeout(() => {
      groupTimer = 0;
      formation.dataset.phase = 'teams';
      status.textContent = 'Example: 16 teams of 2–5';
      finishTimer = setTimeout(settle, 1600);
    }, fromReplay ? 1900 : 250);
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
  updateMembers();
  // Programmatic focus can retain :focus-visible after a pointer drop.
  formation.addEventListener('pointerdown', () => formation.classList.add('is-pointer-interaction'));
  document.addEventListener('keydown', () => formation.classList.remove('is-pointer-interaction'));
  people.forEach((person,index) => {
    person.setAttribute('aria-pressed', 'false');
    person.addEventListener('focus', () => people.forEach(p => p.tabIndex = p === person ? 0 : -1));
    person.addEventListener('pointerdown', event => {
      if (!ready || !event.isPrimary || event.button !== 0) return;
      if (selected && selected !== person) { drop(Number(person.dataset.team)); return; }
      const wasSelected = selected === person;
      select(person); person.focus({preventScroll:true});
      const box = person.getBoundingClientRect();
      drag = { id:event.pointerId, x:event.clientX, y:event.clientY, dx:event.clientX-box.left, dy:event.clientY-box.top, moved:false, wasSelected };
      person.setPointerCapture(event.pointerId);
    });
    person.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      if (!drag.moved && Math.hypot(event.clientX-drag.x,event.clientY-drag.y) < 5) return;
      drag.moved = true; const box = stage.getBoundingClientRect();
      person.classList.add('is-dragging');
      person.style.setProperty('--drag-x', `${event.clientX-box.left-drag.dx}px`);
      person.style.setProperty('--drag-y', `${event.clientY-box.top-drag.dy}px`);
      highlight(teamAt(event.clientX,event.clientY));
    });
    person.addEventListener('pointerup', event => {
      if (!drag || drag.id !== event.pointerId) return;
      const {moved,wasSelected} = drag; drag = null;
      if (person.hasPointerCapture(event.pointerId)) person.releasePointerCapture(event.pointerId);
      person.classList.remove('is-dragging');
      if (moved) drop(teamAt(event.clientX,event.clientY));
      else if (wasSelected) cancel();
      else highlight(null);
    });
    person.addEventListener('pointercancel', () => cancel());
    person.addEventListener('lostpointercapture', () => { if (drag) cancel(); });
    person.addEventListener('click', event => {
      // Pointer actions are handled above; assistive activation produces detail=0.
      if (event.detail !== 0 || !ready) return;
      if (selected) drop(Number(person.dataset.team)); else { select(person); highlight(null); }
    });
    person.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); cancel(); status.textContent = 'Move cancelled.'; return; }
      if (['Enter',' '].includes(event.key)) {
        event.preventDefault(); if (selected) drop(destination); else { select(person); highlight(null); } return;
      }
      if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      if (!selected) { people[(index + (['ArrowLeft','ArrowUp'].includes(event.key) ? people.length-1 : 1)) % people.length].focus({preventScroll:true}); return; }
      const columns = Number(getComputedStyle(stage).getPropertyValue('--team-columns'));
      const delta = {ArrowLeft:-1,ArrowRight:1,ArrowUp:-columns,ArrowDown:columns}[event.key];
      const target = Math.max(0,Math.min(teams.length-1,(destination ?? Number(selected.dataset.team))+delta));
      const invalid = highlight(target);
      status.textContent = `Team ${target+1}, ${members(target).length} people. ${invalid.length ? 'This move would break the 2–5 person limit.' : 'Press Enter to move.'}`;
    });
  });
  teams.forEach((team,index) => {
    team.addEventListener('pointerdown', event => { if (ready && selected && event.isPrimary && event.button === 0) { event.preventDefault(); drop(index); } });
    team.addEventListener('pointerenter', () => { if (selected && !drag) highlight(index); });
  });
  document.addEventListener('pointerdown', event => { if (selected && !stage.contains(event.target)) cancel(); });
  stage.addEventListener('keydown', event => { if (event.key === 'Tab') cancel(); });
  window.addEventListener('blur', () => cancel());
  window.addEventListener('pagehide', () => cancel());
  layout();
  new ResizeObserver(() => { cancel(); layout(); }).observe(stage);
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
