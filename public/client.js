(function () {
  const Shared = window.ReinoShared;
  const { WORLD, ROLES, HOUSES, EXTERIOR_PROPS, ALL_WALLS, getHouseAt, clamp } = Shared;

  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const minimap = document.getElementById('minimap');
  const mctx = minimap.getContext('2d');

  // DOM refs
  const lobbyEl = document.getElementById('lobby');
  const hudEl = document.getElementById('hud');
  const deathBanner = document.getElementById('death-banner');
  const scoreboardEl = document.getElementById('scoreboard');
  const scoreBody = document.getElementById('score-body');
  const sbRoomEl = document.getElementById('sb-room');
  const toastEl = document.getElementById('toast');

  const inputName = document.getElementById('input-name');
  const inputRoom = document.getElementById('input-room');
  const inputBots = document.getElementById('input-bots');
  const roleCards = Array.from(document.querySelectorAll('.role-card'));

  const zoneLabel = document.getElementById('zone-label');
  const hudRoom = document.getElementById('hud-room');
  const hudRoleName = document.getElementById('hud-role-name');
  const hpText = document.getElementById('hp-text');
  const hpFill = document.getElementById('hp-fill');
  const shieldText = document.getElementById('shield-text');
  const shieldFill = document.getElementById('shield-fill');
  const abPrimaryName = document.getElementById('ab-primary-name');
  const abSpecialName = document.getElementById('ab-special-name');
  const abSpecialCd = document.getElementById('ab-special-cd');
  const abDashName = document.getElementById('ab-dash-name');
  const abDashCd = document.getElementById('ab-dash-cd');
  const gearSlotsEl = document.getElementById('gear-slots');
  const interactPrompt = document.getElementById('interact-prompt');
  const killfeedEl = document.getElementById('killfeed');

  // Estado UI / Red
  let selectedRole = 'archer';
  let ws = null;
  let youId = null;
  let joined = false;
  let muted = false;
  let audioCtx = null;

  // Estado sincronizado
  let serverState = null;
  const interpPlayers = new Map();
  const roofAlpha = {};
  for (const h of HOUSES) roofAlpha[h.id] = 1;

  // Efectos locales visuales
  const effects = [];
  const floatTexts = [];
  const killfeed = [];
  const camera = { x: WORLD.width / 2, y: WORLD.height / 2 };

  // Controles
  const keys = { up: false, down: false, left: false, right: false, firing: false };
  const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  let pendingSpecial = false;
  let pendingDash = false;
  let pendingInteract = false;

  function randomRoomCode() {
    return Math.random().toString(36).slice(2, 7).toUpperCase();
  }

  // Leer ?sala= de la URL
  const urlParams = new URLSearchParams(window.location.search);
  const initialRoom = (urlParams.get('sala') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  inputRoom.value = initialRoom || randomRoomCode();
  inputName.value = localStorage.getItem('reino_name') || '';

  function updateRoomUrl(code) {
    const clean = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (!clean) return;
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('sala', clean);
      window.history.replaceState({}, '', u.toString());
    } catch {
      // Ignorar si se abrió por file://
    }
  }

  function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.remove('hidden');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toastEl.classList.add('hidden'), 2200);
  }

  async function copyRoomLink() {
    const code = (inputRoom.value || hudRoom.textContent || 'A1B2').toUpperCase().replace(/[^A-Z0-9]/g, '');
    updateRoomUrl(code);
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast(`🔗 Enlace de sala ${code} copiado`);
    } catch {
      showToast(`Comparte esta URL: ${window.location.href}`);
    }
  }

  // Audio procedural sencillo (sin archivos externos)
  function ensureAudio() {
    if (muted) return null;
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function playTone({ freq = 440, endFreq = 220, duration = 0.12, type = 'triangle', gain = 0.08 }) {
    const ac = ensureAudio();
    if (!ac) return;
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + duration);
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  function playSound(evName) {
    if (muted) return;
    switch (evName) {
      case 'archer':
        playTone({ freq: 520, endFreq: 180, duration: 0.09, type: 'triangle', gain: 0.07 });
        break;
      case 'archer_special':
        playTone({ freq: 680, endFreq: 210, duration: 0.15, type: 'triangle', gain: 0.09 });
        break;
      case 'mage':
        playTone({ freq: 380, endFreq: 760, duration: 0.14, type: 'sine', gain: 0.07 });
        break;
      case 'slash':
        playTone({ freq: 240, endFreq: 90, duration: 0.1, type: 'sawtooth', gain: 0.06 });
        break;
      case 'explosion':
        playTone({ freq: 150, endFreq: 42, duration: 0.22, type: 'sawtooth', gain: 0.1 });
        break;
      case 'nova':
        playTone({ freq: 620, endFreq: 140, duration: 0.28, type: 'sine', gain: 0.1 });
        break;
      case 'parry':
        playTone({ freq: 1100, endFreq: 1650, duration: 0.08, type: 'square', gain: 0.06 });
        break;
      case 'chestOpen':
        playTone({ freq: 440, endFreq: 880, duration: 0.2, type: 'sine', gain: 0.09 });
        setTimeout(() => playTone({ freq: 660, endFreq: 1320, duration: 0.22, type: 'triangle', gain: 0.08 }), 90);
        break;
      case 'pickup':
        playTone({ freq: 587, endFreq: 988, duration: 0.14, type: 'triangle', gain: 0.08 });
        break;
      case 'hit':
        playTone({ freq: 220, endFreq: 110, duration: 0.06, type: 'square', gain: 0.04 });
        break;
    }
  }

  // Selección de rol en el lobby
  roleCards.forEach((card) => {
    card.addEventListener('click', () => {
      roleCards.forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
      selectedRole = card.dataset.role;
    });
  });

  document.getElementById('btn-new-room').addEventListener('click', () => {
    inputRoom.value = randomRoomCode();
    updateRoomUrl(inputRoom.value);
  });
  document.getElementById('btn-copy-lobby').addEventListener('click', copyRoomLink);
  document.getElementById('btn-copy-hud').addEventListener('click', copyRoomLink);

  document.getElementById('btn-mute').addEventListener('click', (e) => {
    muted = !muted;
    e.target.textContent = muted ? '🔇 Silencio' : '🔊 Sonido';
  });

  document.getElementById('btn-role-switch').addEventListener('click', () => {
    lobbyEl.classList.remove('hidden');
  });

  inputBots.addEventListener('change', () => {
    if (ws && ws.readyState === 1 && joined) {
      ws.send(JSON.stringify({ type: 'setBots', botCount: Number(inputBots.value) }));
    }
  });

  function joinGame() {
    ensureAudio();
    const name = inputName.value.trim() || 'Aventurero';
    const roomCode = (inputRoom.value.trim() || randomRoomCode()).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const botCount = Number(inputBots.value);
    localStorage.setItem('reino_name', name);
    inputRoom.value = roomCode;
    updateRoomUrl(roomCode);

    if (ws && ws.readyState === 1 && joined) {
      // Si ya estamos en la sala y solo cambiamos rol o bots
      if (hudRoom.textContent === roomCode) {
        ws.send(JSON.stringify({ type: 'changeRole', role: selectedRole }));
        ws.send(JSON.stringify({ type: 'setBots', botCount }));
        lobbyEl.classList.add('hidden');
        return;
      }
      ws.close();
    }

    const isFile = window.location.protocol === 'file:';
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = isFile ? 'ws://localhost:3000' : `${proto}//${window.location.host}`;
    ws = new WebSocket(wsUrl);

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'join', roomCode, name, role: selectedRole, botCount }));
    });

    ws.addEventListener('error', () => {
      showToast('No se pudo conectar al servidor. Abre http://localhost:3000');
    });

    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'welcome') {
        youId = msg.youId;
        joined = true;
        hudRoom.textContent = msg.roomCode;
        sbRoomEl.textContent = msg.roomCode;
        lobbyEl.classList.add('hidden');
        hudEl.classList.remove('hidden');
      } else if (msg.type === 'state') {
        handleState(msg);
      }
    });

    ws.addEventListener('close', () => {
      if (joined) {
        showToast('Conexión cerrada con la sala');
      }
    });
  }

  document.getElementById('btn-play').addEventListener('click', joinGame);

  function handleState(state) {
    serverState = state;
    const seenIds = new Set();

    for (const p of state.players) {
      seenIds.add(p.id);
      if (!interpPlayers.has(p.id)) {
        interpPlayers.set(p.id, { ...p });
      } else {
        const cur = interpPlayers.get(p.id);
        cur.tx = p.x;
        cur.ty = p.y;
        cur.taim = p.aim;
        Object.assign(cur, {
          name: p.name,
          role: p.role,
          isBot: p.isBot,
          hp: p.hp,
          maxHp: p.maxHp,
          shield: p.shield,
          maxShield: p.maxShield,
          alive: p.alive,
          kills: p.kills,
          deaths: p.deaths,
          lootCount: p.lootCount,
          poisoned: p.poisoned,
          slowed: p.slowed,
          cdSpecialLeft: p.cdSpecialLeft,
          cdDashLeft: p.cdDashLeft,
          gear: p.gear
        });
      }
    }
    for (const id of interpPlayers.keys()) {
      if (!seenIds.has(id)) interpPlayers.delete(id);
    }

    const you = state.players.find((p) => p.id === youId);
    for (const ev of state.events || []) {
      const distToCam = you ? Math.hypot(ev.x - you.x, ev.y - you.y) : 0;
      const audible = !you || distToCam < 850;

      if (ev.type === 'shoot') {
        if (audible) playSound(ev.role);
      } else if (ev.type === 'slash') {
        effects.push({ kind: 'slash', ...ev, born: performance.now(), life: 190 });
        if (audible) playSound('slash');
      } else if (ev.type === 'whirlwind') {
        effects.push({ kind: 'whirlwind', ...ev, born: performance.now(), life: 320 });
        if (audible) playSound('slash');
      } else if (ev.type === 'nova') {
        effects.push({ kind: 'nova', ...ev, born: performance.now(), life: 420 });
        if (audible) playSound('nova');
      } else if (ev.type === 'explosion') {
        effects.push({ kind: 'explosion', ...ev, born: performance.now(), life: 280 });
        if (audible) playSound('explosion');
      } else if (ev.type === 'parry') {
        effects.push({ kind: 'parry', x: ev.x, y: ev.y, born: performance.now(), life: 220 });
        if (audible) playSound('parry');
      } else if (ev.type === 'dash') {
        effects.push({ kind: 'dash', ...ev, born: performance.now(), life: 240 });
      } else if (ev.type === 'hit') {
        floatTexts.push({
          x: ev.x + (Math.random() - 0.5) * 18,
          y: ev.y - 22,
          text: `-${ev.dmg}`,
          color: ev.color || '#f87171',
          born: performance.now(),
          life: 650
        });
        if (ev.attackerId === youId) playSound('hit');
      } else if (ev.type === 'chestOpen') {
        effects.push({ kind: 'burst', x: ev.x, y: ev.y, color: '#fbbf24', born: performance.now(), life: 500 });
        if (ev.playerId === youId) {
          playSound('chestOpen');
          floatTexts.push({
            x: ev.x,
            y: ev.y - 28,
            text: `Botín de ${ROLES[ev.role].name}!`,
            color: '#fbbf24',
            born: performance.now(),
            life: 1200
          });
        }
      } else if (ev.type === 'pickup') {
        if (ev.playerId === youId) {
          playSound('pickup');
          floatTexts.push({
            x: ev.x,
            y: ev.y - 28,
            text: `+ ${ev.label}`,
            color: ev.color || '#4ade80',
            born: performance.now(),
            life: 1300
          });
        }
      } else if (ev.type === 'kill') {
        killfeed.unshift({
          text: `${ev.attackerName} eliminó a ${ev.victimName}`,
          born: performance.now()
        });
        if (killfeed.length > 5) killfeed.pop();
        renderKillfeed();
      }
    }

    updateHUD(state);
  }

  function renderKillfeed() {
    killfeedEl.innerHTML = '';
    for (const k of killfeed) {
      const div = document.createElement('div');
      div.className = 'kill-item';
      div.textContent = k.text;
      killfeedEl.appendChild(div);
    }
  }

  function updateHUD(state) {
    const you = state.players.find((p) => p.id === youId);
    if (!you) return;

    const role = ROLES[you.role];
    hudRoleName.textContent = `${role.name}`;
    hudRoleName.style.color = role.accent;

    hpText.textContent = `${you.hp} / ${you.maxHp}`;
    hpFill.style.width = `${clamp((you.hp / Math.max(1, you.maxHp)) * 100, 0, 100)}%`;
    shieldText.textContent = `${you.shield} / ${you.maxShield}`;
    shieldFill.style.width = `${clamp((you.shield / Math.max(1, you.maxShield)) * 100, 0, 100)}%`;

    abPrimaryName.textContent = role.primaryName;
    abSpecialName.textContent = role.specialName;
    abDashName.textContent = role.dashName;

    abSpecialCd.textContent = you.cdSpecialLeft > 0 ? `${(you.cdSpecialLeft / 1000).toFixed(1)}s` : 'Listo';
    abSpecialCd.style.color = you.cdSpecialLeft > 0 ? '#94a3b8' : '#38bdf8';
    abDashCd.textContent = you.cdDashLeft > 0 ? `${(you.cdDashLeft / 1000).toFixed(1)}s` : 'Listo';
    abDashCd.style.color = you.cdDashLeft > 0 ? '#94a3b8' : '#38bdf8';

    deathBanner.classList.toggle('hidden', you.alive);

    // Zona / Casa actual
    const house = getHouseAt(you.x, you.y);
    if (house) {
      zoneLabel.textContent = `🏠 ${house.name} — ${house.tag}`;
    } else {
      zoneLabel.textContent = '🌲 Aldea del Reino';
    }

    // Prompt de cofre cercano
    const nearChest = state.chests.find(
      (c) => !c.opened && Math.hypot(c.x - you.x, c.y - you.y) <= 68
    );
    if (nearChest && you.alive) {
      interactPrompt.textContent = `[E] Abrir cofre (Botín de ${role.name})`;
      interactPrompt.classList.remove('hidden');
    } else {
      interactPrompt.classList.add('hidden');
    }

    // Ranuras de equipamiento
    const slots = [
      { key: 'weapon', label: 'Arma' },
      { key: 'ammo', label: 'Encanto' },
      { key: 'relic', label: 'Reliquia' },
      { key: 'armor', label: 'Armadura' }
    ];
    gearSlotsEl.innerHTML = '';
    for (const s of slots) {
      const item = you.gear && you.gear[s.key];
      const div = document.createElement('div');
      div.className = 'gear-slot';
      if (item) {
        div.style.borderColor = item.rarityColor;
        div.style.boxShadow = `0 0 12px ${item.rarityColor}33`;
        div.title = `${item.name} (${item.rarityLabel})\n${item.desc}`;
        div.innerHTML = `<span>${item.icon}</span><small style="color:${item.rarityColor}">${item.rarityLabel}</small>`;
      } else {
        div.title = `Ranura vacía: ${s.label}\nAbre cofres dentro de las casas`;
        div.innerHTML = `<span style="opacity:0.25">❔</span><small>${s.label}</small>`;
      }
      gearSlotsEl.appendChild(div);
    }

    // Actualizar marcador si está visible
    if (!scoreboardEl.classList.contains('hidden')) {
      const sorted = [...state.players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      scoreBody.innerHTML = '';
      for (const p of sorted) {
        const tr = document.createElement('tr');
        const rInfo = ROLES[p.role];
        tr.innerHTML = `
          <td>${p.id === youId ? '⭐ ' : ''}${escapeHtml(p.name)}</td>
          <td style="color:${rInfo.accent}">${rInfo.name}</td>
          <td><strong>${p.kills}</strong></td>
          <td>${p.deaths}</td>
          <td>${p.lootCount}</td>
        `;
        scoreBody.appendChild(tr);
      }
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  // Input listeners
  window.addEventListener('keydown', (e) => {
    if (document.activeElement && ['INPUT', 'SELECT'].includes(document.activeElement.tagName)) return;
    const code = e.code;
    if (code === 'KeyW' || code === 'ArrowUp') keys.up = true;
    if (code === 'KeyS' || code === 'ArrowDown') keys.down = true;
    if (code === 'KeyA' || code === 'ArrowLeft') keys.left = true;
    if (code === 'KeyD' || code === 'ArrowRight') keys.right = true;
    if (code === 'Space') {
      e.preventDefault();
      pendingDash = true;
    }
    if (code === 'KeyQ') pendingSpecial = true;
    if (code === 'KeyE') pendingInteract = true;
    if (code === 'KeyR' && joined) {
      lobbyEl.classList.toggle('hidden');
    }
    if (code === 'Tab' && joined) {
      e.preventDefault();
      scoreboardEl.classList.remove('hidden');
    }
  });

  window.addEventListener('keyup', (e) => {
    const code = e.code;
    if (code === 'KeyW' || code === 'ArrowUp') keys.up = false;
    if (code === 'KeyS' || code === 'ArrowDown') keys.down = false;
    if (code === 'KeyA' || code === 'ArrowLeft') keys.left = false;
    if (code === 'KeyD' || code === 'ArrowRight') keys.right = false;
    if (code === 'Tab') {
      scoreboardEl.classList.add('hidden');
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  canvas.addEventListener('mousedown', (e) => {
    if (!joined || !lobbyEl.classList.contains('hidden')) return;
    ensureAudio();
    if (e.button === 0) keys.firing = true;
    if (e.button === 2) pendingSpecial = true;
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) keys.firing = false;
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Enviar inputs al servidor a 30Hz
  setInterval(() => {
    if (!ws || ws.readyState !== 1 || !joined || !lobbyEl.classList.contains('hidden')) return;
    const you = interpPlayers.get(youId);
    const worldMouseX = camera.x - canvas.width / 2 + mouse.x;
    const worldMouseY = camera.y - canvas.height / 2 + mouse.y;
    const aim = you ? Math.atan2(worldMouseY - you.y, worldMouseX - you.x) : 0;

    ws.send(
      JSON.stringify({
        type: 'input',
        up: keys.up,
        down: keys.down,
        left: keys.left,
        right: keys.right,
        aim,
        firing: keys.firing,
        special: pendingSpecial,
        dash: pendingDash,
        interact: pendingInteract
      })
    );
    pendingSpecial = false;
    pendingDash = false;
    pendingInteract = false;
  }, 33);

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // Dibujo de caminos entre casas
  function drawVillageGround() {
    // Hierba base
    ctx.fillStyle = '#1f3622';
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    // Patrón sutil de cuadrícula de césped
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= WORLD.width; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, WORLD.height);
      ctx.stroke();
    }
    for (let y = 0; y <= WORLD.height; y += 80) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD.width, y);
      ctx.stroke();
    }

    // Caminos de adoquines conectando el centro con las casas
    const cx = 1200;
    const cy = 885;
    ctx.strokeStyle = '#47433c';
    ctx.lineWidth = 74;
    ctx.lineCap = 'round';
    for (const h of HOUSES) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(h.x + h.w / 2, h.y + h.h / 2);
      ctx.stroke();
    }
    ctx.strokeStyle = '#5c564d';
    ctx.lineWidth = 56;
    for (const h of HOUSES) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(h.x + h.w / 2, h.y + h.h / 2);
      ctx.stroke();
    }

    // Borde del mundo
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, WORLD.width - 6, WORLD.height - 6);
  }

  function drawHouseInteriors() {
    for (const h of HOUSES) {
      // Suelo interior de madera/piedra
      ctx.fillStyle = h.floorColor;
      ctx.fillRect(h.x, h.y, h.w, h.h);

      // Tablas / losas sutiles
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 1;
      for (let py = h.y + 24; py < h.y + h.h; py += 24) {
        ctx.beginPath();
        ctx.moveTo(h.x, py);
        ctx.lineTo(h.x + h.w, py);
        ctx.stroke();
      }

      // Umbrales de puertas marcados en dorado tenue
      ctx.fillStyle = 'rgba(251, 191, 36, 0.22)';
      for (const door of h.doors) {
        if (door.side === 'top' || door.side === 'bottom') {
          const dx = h.x + h.w * door.offset - door.width / 2;
          const dy = door.side === 'top' ? h.y : h.y + h.h - 18;
          ctx.fillRect(dx, dy, door.width, 18);
        } else {
          const dx = door.side === 'left' ? h.x : h.x + h.w - 18;
          const dy = h.y + h.h * door.offset - door.width / 2;
          ctx.fillRect(dx, dy, 18, door.width);
        }
      }
    }

    // Muros y muebles
    for (const w of ALL_WALLS) {
      if (w.isFurniture) {
        if (w.kind === 'altar') {
          ctx.fillStyle = '#4c1d95';
          ctx.fillRect(w.x, w.y, w.w, w.h);
          ctx.strokeStyle = '#a78bfa';
          ctx.lineWidth = 2;
          ctx.strokeRect(w.x + 2, w.y + 2, w.w - 4, w.h - 4);
        } else if (w.kind === 'anvil') {
          ctx.fillStyle = '#334155';
          ctx.fillRect(w.x, w.y, w.w, w.h);
          ctx.strokeStyle = '#f97316';
          ctx.lineWidth = 2;
          ctx.strokeRect(w.x + 2, w.y + 2, w.w - 4, w.h - 4);
        } else if (w.kind === 'pillar') {
          ctx.fillStyle = '#475569';
          ctx.fillRect(w.x, w.y, w.w, w.h);
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 2;
          ctx.strokeRect(w.x + 1, w.y + 1, w.w - 2, w.h - 2);
        } else {
          ctx.fillStyle = '#6b4423';
          ctx.fillRect(w.x, w.y, w.w, w.h);
          ctx.strokeStyle = '#3e2411';
          ctx.lineWidth = 2;
          ctx.strokeRect(w.x, w.y, w.w, w.h);
        }
      } else {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(w.x, w.y, w.w, w.h);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.strokeRect(w.x, w.y, w.w, w.h);
      }
    }
  }

  function drawChestsAndLoot(now) {
    if (!serverState) return;
    const you = interpPlayers.get(youId);

    for (const chest of serverState.chests) {
      ctx.save();
      ctx.translate(chest.x, chest.y);
      if (!chest.opened) {
        // Aura dorada del cofre
        const pulse = 0.5 + 0.5 * Math.sin(now * 0.005);
        ctx.fillStyle = `rgba(251, 191, 36, ${0.15 + pulse * 0.14})`;
        ctx.beginPath();
        ctx.arc(0, 0, 28, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#92400e';
        ctx.fillRect(-16, -12, 32, 24);
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(-16, -12, 32, 24);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(-4, -3, 8, 7);
      } else {
        ctx.fillStyle = 'rgba(71, 85, 105, 0.55)';
        ctx.fillRect(-15, -10, 30, 20);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-15, -10, 30, 20);
      }
      ctx.restore();
    }

    for (const item of serverState.loot) {
      const bob = Math.sin(now * 0.006 + item.x) * 3;
      const matchesRole = !item.forRole || (you && item.forRole === you.role);
      ctx.save();
      ctx.translate(item.x, item.y + bob);
      ctx.globalAlpha = matchesRole ? 1 : 0.45;

      ctx.fillStyle = `${item.rarityColor}33`;
      ctx.beginPath();
      ctx.arc(0, 0, 17, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = item.rarityColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = '15px Segoe UI Emoji, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.icon, 0, 1);

      if (you && Math.hypot(you.x - item.x, you.y - item.y) < 110) {
        ctx.font = '600 11px Inter, sans-serif';
        ctx.fillStyle = item.rarityColor;
        const suffix = item.forRole && !matchesRole ? ` (${ROLES[item.forRole].name})` : '';
        ctx.fillText(`${item.name}${suffix}`, 0, -21);
      }
      ctx.restore();
    }
  }

  function drawExteriorProps() {
    for (const prop of EXTERIOR_PROPS) {
      ctx.save();
      ctx.translate(prop.x, prop.y);
      if (prop.kind === 'tree') {
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath();
        ctx.arc(4, 6, prop.r + 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#14532d';
        ctx.beginPath();
        ctx.arc(0, 0, prop.r + 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#166534';
        ctx.beginPath();
        ctx.arc(-4, -4, prop.r * 0.72, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#475569';
        ctx.beginPath();
        ctx.arc(0, 0, prop.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawPlayer(p) {
    if (!p.alive) return;
    const role = ROLES[p.role];
    const isYou = p.id === youId;
    const aim = isYou
      ? Math.atan2(
          camera.y - canvas.height / 2 + mouse.y - p.y,
          camera.x - canvas.width / 2 + mouse.x - p.x
        )
      : p.aim;

    ctx.save();
    ctx.translate(p.x, p.y);

    // Sombra
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 14, 16, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Indicador de estado (veneno o ralentizado)
    if (p.poisoned) {
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 23, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.slowed) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 23, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Cuerpo rotado hacia el cursor
    ctx.save();
    ctx.rotate(aim);

    // Arma según el rol
    if (p.role === 'archer') {
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(10, 0, 15, -Math.PI * 0.42, Math.PI * 0.42);
      ctx.stroke();
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(14, -14);
      ctx.lineTo(14, 14);
      ctx.stroke();
    } else if (p.role === 'mage') {
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(6, 10);
      ctx.lineTo(24, 6);
      ctx.stroke();
      ctx.fillStyle = '#c084fc';
      ctx.beginPath();
      ctx.arc(25, 6, 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.role === 'swordsman') {
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(10, -3, 24, 6);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(8, -8, 4, 16);
    }

    // Cuerpo del personaje
    ctx.fillStyle = role.color;
    ctx.beginPath();
    ctx.arc(0, 0, WORLD.playerRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = isYou ? 3 : 2;
    ctx.strokeStyle = isYou ? '#ffffff' : '#0f172a';
    ctx.stroke();

    // Detalle de cabeza / casco / sombrero
    if (p.role === 'mage') {
      ctx.fillStyle = '#581c87';
      ctx.beginPath();
      ctx.arc(-2, 0, 10, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.role === 'swordsman') {
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.arc(2, 0, 9, -Math.PI * 0.6, Math.PI * 0.6);
      ctx.fill();
    } else {
      ctx.fillStyle = '#14532d';
      ctx.beginPath();
      ctx.arc(-1, 0, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Nombre y barra de vida flotante
    ctx.font = '700 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = isYou ? '#fef08a' : '#f8fafc';
    ctx.fillText(p.name, 0, -29);

    const bw = 38;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(-bw / 2, -24, bw, 5);
    ctx.fillStyle = isYou ? '#22c55e' : '#ef4444';
    ctx.fillRect(-bw / 2, -24, bw * clamp(p.hp / Math.max(1, p.maxHp), 0, 1), 5);
    if (p.shield > 0) {
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(-bw / 2, -26, bw * clamp(p.shield / Math.max(1, p.maxShield), 0, 1), 2);
    }

    ctx.restore();
  }

  function drawProjectiles() {
    if (!serverState) return;
    for (const p of serverState.projectiles) {
      ctx.save();
      ctx.translate(p.x, p.y);
      const ang = Math.atan2(p.vy, p.vx);
      if (p.kind === 'arrow' || p.kind === 'poison_arrow') {
        ctx.rotate(ang);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-12, 0);
        ctx.lineTo(10, 0);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(6, -4);
        ctx.lineTo(6, 4);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = `${p.color}44`;
        ctx.beginPath();
        ctx.arc(0, 0, p.r + 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawHouseRoofs(you) {
    const insideHouse = you && you.alive ? getHouseAt(you.x, you.y) : null;
    for (const h of HOUSES) {
      const targetAlpha = insideHouse && insideHouse.id === h.id ? 0.06 : 0.96;
      roofAlpha[h.id] += (targetAlpha - roofAlpha[h.id]) * 0.16;

      if (roofAlpha[h.id] < 0.08) continue;

      ctx.save();
      ctx.globalAlpha = roofAlpha[h.id];
      ctx.fillStyle = h.roofColor;
      ctx.fillRect(h.x - 4, h.y - 4, h.w + 8, h.h + 8);

      // Tejas / cumbrera del tejado
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 3;
      ctx.strokeRect(h.x - 4, h.y - 4, h.w + 8, h.h + 8);
      ctx.beginPath();
      ctx.moveTo(h.x + 20, h.y + h.h / 2);
      ctx.lineTo(h.x + h.w - 20, h.y + h.h / 2);
      ctx.stroke();

      // Cartel con el nombre de la casa
      ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
      const labelW = 190;
      ctx.fillRect(h.x + h.w / 2 - labelW / 2, h.y + h.h / 2 - 22, labelW, 44);
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(h.x + h.w / 2 - labelW / 2, h.y + h.h / 2 - 22, labelW, 44);

      ctx.fillStyle = '#f8fafc';
      ctx.font = '700 13px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(h.name, h.x + h.w / 2, h.y + h.h / 2 - 2);
      ctx.fillStyle = '#fbbf24';
      ctx.font = '600 11px Inter, sans-serif';
      ctx.fillText(h.tag, h.x + h.w / 2, h.y + h.h / 2 + 14);
      ctx.restore();
    }
  }

  function drawEffects(now) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      const age = now - e.born;
      if (age >= e.life) {
        effects.splice(i, 1);
        continue;
      }
      const p = age / e.life;
      ctx.save();
      ctx.globalAlpha = 1 - p;

      if (e.kind === 'slash') {
        ctx.translate(e.x, e.y);
        ctx.strokeStyle = e.color || '#fde047';
        ctx.lineWidth = 10 * (1 - p) + 2;
        ctx.beginPath();
        ctx.arc(0, 0, e.range * (0.75 + p * 0.25), e.aim - e.arc / 2, e.aim + e.arc / 2);
        ctx.stroke();
      } else if (e.kind === 'whirlwind') {
        ctx.translate(e.x, e.y);
        ctx.strokeStyle = '#fb923c';
        ctx.lineWidth = 8 * (1 - p) + 2;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * (0.6 + p * 0.4), p * Math.PI * 2, p * Math.PI * 2 + Math.PI * 1.6);
        ctx.stroke();
      } else if (e.kind === 'nova' || e.kind === 'explosion') {
        ctx.translate(e.x, e.y);
        ctx.fillStyle = `${e.color}33`;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * p, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 4;
        ctx.stroke();
      } else if (e.kind === 'parry') {
        ctx.translate(e.x, e.y);
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 18 * p, 0, Math.PI * 2);
        ctx.stroke();
      } else if (e.kind === 'dash') {
        ctx.strokeStyle = e.color || '#fff';
        ctx.lineWidth = 6 * (1 - p);
        ctx.beginPath();
        ctx.moveTo(e.x1, e.y1);
        ctx.lineTo(e.x2, e.y2);
        ctx.stroke();
      } else if (e.kind === 'burst') {
        ctx.translate(e.x, e.y);
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 46 * p, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    for (let i = floatTexts.length - 1; i >= 0; i--) {
      const f = floatTexts[i];
      const age = now - f.born;
      if (age >= f.life) {
        floatTexts.splice(i, 1);
        continue;
      }
      const p = age / f.life;
      ctx.save();
      ctx.globalAlpha = 1 - p;
      ctx.font = '800 13px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - p * 28);
      ctx.restore();
    }
  }

  function drawMinimap() {
    mctx.clearRect(0, 0, minimap.width, minimap.height);
    const sx = minimap.width / WORLD.width;
    const sy = minimap.height / WORLD.height;

    mctx.fillStyle = '#142317';
    mctx.fillRect(0, 0, minimap.width, minimap.height);

    const you = interpPlayers.get(youId);
    const inside = you ? getHouseAt(you.x, you.y) : null;

    for (const h of HOUSES) {
      mctx.fillStyle = inside && inside.id === h.id ? '#fbbf24' : '#475569';
      mctx.fillRect(h.x * sx, h.y * sy, h.w * sx, h.h * sy);
    }

    if (serverState) {
      for (const c of serverState.chests) {
        if (c.opened) continue;
        mctx.fillStyle = '#fbbf24';
        mctx.fillRect(c.x * sx - 1.5, c.y * sy - 1.5, 3, 3);
      }
      for (const p of interpPlayers.values()) {
        if (!p.alive) continue;
        mctx.fillStyle = p.id === youId ? '#ffffff' : ROLES[p.role].color;
        mctx.beginPath();
        mctx.arc(p.x * sx, p.y * sy, p.id === youId ? 3.5 : 2.5, 0, Math.PI * 2);
        mctx.fill();
      }
    }
  }

  function frame(now) {
    // Interpolar posiciones
    for (const p of interpPlayers.values()) {
      if (p.tx !== undefined) {
        p.x += (p.tx - p.x) * 0.35;
        p.y += (p.ty - p.y) * 0.35;
      }
    }

    const you = interpPlayers.get(youId);
    if (you) {
      camera.x += (you.x - camera.x) * 0.22;
      camera.y += (you.y - camera.y) * 0.22;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2 - camera.x, canvas.height / 2 - camera.y);

    drawVillageGround();
    drawHouseInteriors();
    drawChestsAndLoot(now);
    drawExteriorProps();
    for (const p of interpPlayers.values()) {
      drawPlayer(p);
    }
    drawProjectiles();
    drawHouseRoofs(you);
    drawEffects(now);

    ctx.restore();
    drawMinimap();

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
