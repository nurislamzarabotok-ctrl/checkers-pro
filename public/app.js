(() => {
  'use strict';

  const CAT = window.CHECKERS_CATALOG;
  const {
    RARITIES,
    CHEST_TIERS,
    CHEST_GRADES,
    BOARD_THEMES,
    PIECE_STYLES,
    AVATAR_FRAMES,
    PLAYER_TITLES,
    DAILY_QUEST_TEMPLATES,
    ACHIEVEMENTS_CATALOG,
    getChestTierByLevel,
    getLevelRewardSpec
  } = CAT;

  /* ======================== STORAGE, INDEXEDDB FOR GUESTS & XSS ESCAPE ======================== */
  const STORAGE_KEY = 'checkers_pro_v5';
  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('checkers_pro_v4') || localStorage.getItem('checkers_pro_v3');
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }
  function saveStore(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (_) {}
  }
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
  }

  // Persistent IndexedDB Engine for Guest Profile, Match History & Unfinished Game State
  // Never deletes guest data automatically; persists across refreshes, tab closes, and browser restarts!
  const GuestIndexedDB = (() => {
    const DB_NAME = 'CheckersProGuestDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'guest_store';
    let dbPromise = null;

    function openDB() {
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve) => {
        if (!window.indexedDB) return resolve(null);
        try {
          const req = window.indexedDB.open(DB_NAME, DB_VERSION);
          req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              db.createObjectStore(STORE_NAME);
            }
          };
          req.onsuccess = (e) => resolve(e.target.result);
          req.onerror = () => resolve(null);
        } catch (_) {
          resolve(null);
        }
      });
      return dbPromise;
    }

    async function get(key) {
      const db = await openDB();
      if (!db) return null;
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const req = tx.objectStore(STORE_NAME).get(key);
          req.onsuccess = () => resolve(req.result ?? null);
          req.onerror = () => resolve(null);
        } catch (_) {
          resolve(null);
        }
      });
    }

    async function set(key, val) {
      const db = await openDB();
      if (!db) return false;
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).put(val, key);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch (_) {
          resolve(false);
        }
      });
    }

    async function loadAllGuestData() {
      const [profile, history, activeGame] = await Promise.all([
        get('guest_profile'),
        get('guest_history'),
        get('active_game_state')
      ]);
      return { profile, history, activeGame };
    }

    return { get, set, loadAllGuestData };
  })();

  async function hashClientPassword(password, salt) {
    const data = salt + ':' + String(password);
    if (window.crypto && window.crypto.subtle) {
      const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < data.length; i++) {
      const ch = data.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
  }

  function generateGuestNickname() {
    const num = Math.floor(1000 + Math.random() * 9000);
    return `Guest_${num}`;
  }

  /* ======================== LEVELS & 20 RANKS x 3 STRIPES ======================== */
  const RANK_TIERS = [
    { name: 'Новичок',            icon: '🌱', color: '#94a3b8' },
    { name: 'Рядовой',            icon: '🛡️', color: '#a3e635' },
    { name: 'Ефрейтор',           icon: '⚔️', color: '#4ade80' },
    { name: 'Сержант',            icon: '🎖️', color: '#34d399' },
    { name: 'Старшина',           icon: '🔰', color: '#2dd4bf' },
    { name: 'Прапорщик',          icon: '⭐', color: '#38bdf8' },
    { name: 'Младший лейтенант',  icon: '🌟', color: '#60a5fa' },
    { name: 'Лейтенант',          icon: '💫', color: '#818cf8' },
    { name: 'Старший лейтенант',  icon: '⚡', color: '#a78bfa' },
    { name: 'Капитан',            icon: '🦅', color: '#c084fc' },
    { name: 'Майор',              icon: '🦁', color: '#e879f9' },
    { name: 'Подполковник',       icon: '🔥', color: '#f472b6' },
    { name: 'Полковник',          icon: '💎', color: '#fb7185' },
    { name: 'Генерал-майор',      icon: '🏅', color: '#fb923c' },
    { name: 'Генерал-лейтенант',  icon: '🏆', color: '#fbbf24' },
    { name: 'Генерал армии',      icon: '👑', color: '#facc15' },
    { name: 'Маршал',             icon: '🔱', color: '#f59e0b' },
    { name: 'Гроссмейстер',       icon: '♟️', color: '#f97316' },
    { name: 'Легенда Арены',      icon: '🐉', color: '#ef4444' },
    { name: 'Бессмертный Титан',  icon: '🌌', color: '#22d3ee' }
  ];

  function xpNeededForLevel(level) {
    return Math.round(100 + (level - 1) * 30 + Math.floor(Math.sqrt(level - 1) * 18));
  }

  function getLevelInfoFromXp(totalXp) {
    let xp = Math.max(0, Math.floor(totalXp || 0));
    let level = 1;
    while (true) {
      const need = xpNeededForLevel(level);
      if (xp < need) {
        return { level, xpInLevel: xp, xpForNext: need, pct: Math.min(100, Math.round((xp / need) * 100)) };
      }
      xp -= need;
      level++;
      if (level > 1000000) return { level, xpInLevel: xp, xpForNext: need, pct: 100 };
    }
  }

  function getRankStartLevel(stageIndex) {
    if (stageIndex <= 0) return 1;
    if (stageIndex >= 60) return 10000 + (stageIndex - 59) * 500;
    const t = stageIndex / 59;
    return Math.max(stageIndex * 2 + 1, Math.round(1 + 9999 * Math.pow(t, 2.15)));
  }

  function getRankForLevel(level) {
    const lv = Math.max(1, Math.floor(level || 1));
    if (lv >= 10000) {
      const prestige = Math.floor((lv - 10000) / 500) + 1;
      const tier = RANK_TIERS[RANK_TIERS.length - 1];
      return {
        tierIndex: RANK_TIERS.length - 1,
        name: tier.name, icon: tier.icon, color: tier.color,
        stripes: 3, roman: 'III', prestige,
        fullLabel: `${tier.name} III • Престиж ${prestige}`,
        nextLabel: `Престиж ${prestige + 1}`,
        nextLevel: 10000 + prestige * 500
      };
    }
    let stage = 0;
    for (let s = 0; s < 60; s++) {
      if (lv >= getRankStartLevel(s)) stage = s;
      else break;
    }
    const tierIndex = Math.min(RANK_TIERS.length - 1, Math.floor(stage / 3));
    const stripes = (stage % 3) + 1;
    const roman = ['I', 'II', 'III'][stripes - 1];
    const tier = RANK_TIERS[tierIndex];

    const nextStage = stage + 1;
    let nextLabel, nextLevel;
    if (nextStage >= 60) {
      nextLabel = `${RANK_TIERS[RANK_TIERS.length - 1].name} • Престиж 1`;
      nextLevel = 10000;
    } else {
      const nt = RANK_TIERS[Math.floor(nextStage / 3)];
      const nr = ['I', 'II', 'III'][nextStage % 3];
      nextLabel = `${nt.name} ${nr}`;
      nextLevel = getRankStartLevel(nextStage);
    }

    return {
      tierIndex, name: tier.name, icon: tier.icon, color: tier.color,
      stripes, roman, prestige: 0,
      fullLabel: `${tier.name} ${roman}`,
      nextLabel, nextLevel
    };
  }

  function renderStripesHtml(stripes, color) {
    return `<span class="inline-flex items-center gap-0.5 ml-1" style="color:${color}" title="Полосок: ${stripes} из 3">
      <span class="rank-stripe ${stripes >= 1 ? 'filled' : ''}"></span>
      <span class="rank-stripe ${stripes >= 2 ? 'filled' : ''}"></span>
      <span class="rank-stripe ${stripes >= 3 ? 'filled' : ''}"></span>
    </span>`;
  }

  /* ======================== WORLD RULESETS ======================== */
  const RULESETS = {
    russian: {
      id: 'russian', name: 'Русские шашки', region: '🇷🇺 СНГ / Россия',
      size: 8, rows: 3, orthogonal: false, menCaptureBack: true, flyingKing: true, majorityCapture: false, promoteMidJump: true, giveaway: false,
      desc: 'Доска 8×8. Простые шашки бьют вперёд и назад, дамка летает по всей диагонали. Превращение в дамку происходит прямо во время боя.'
    },
    international: {
      id: 'international', name: 'Международные (100-клеточные)', region: '🌍 Всемирные (FMJD)',
      size: 10, rows: 4, orthogonal: false, menCaptureBack: true, flyingKing: true, majorityCapture: true, promoteMidJump: false, giveaway: false,
      desc: 'Доска 10×10, по 20 шашек. Действует правило большинства (нужно бить максимум шашек). Дамка летающая, превращение в конце хода.'
    },
    english: {
      id: 'english', name: 'Английские / Американские', region: '🇬🇧 🇺🇸 США / Британия',
      size: 8, rows: 3, orthogonal: false, menCaptureBack: false, flyingKing: false, majorityCapture: false, promoteMidJump: false, giveaway: false,
      desc: 'Доска 8×8. Простые шашки бьют только вперёд. Дамка ходит и бьёт только на 1 клетку по диагонали. Достижение дамки завершает ход.'
    },
    brazilian: {
      id: 'brazilian', name: 'Бразильские шашки', region: '🇧🇷 Бразилия',
      size: 8, rows: 3, orthogonal: false, menCaptureBack: true, flyingKing: true, majorityCapture: true, promoteMidJump: false, giveaway: false,
      desc: 'Правила международных шашек на классической доске 8×8: бой назад, летающая дамка и обязательное правило большинства.'
    },
    spanish: {
      id: 'spanish', name: 'Испанские (Damas)', region: '🇪🇸 Испания / Латинская Америка',
      size: 8, rows: 3, orthogonal: false, menCaptureBack: false, flyingKing: true, majorityCapture: true, promoteMidJump: false, giveaway: false,
      desc: 'Простые шашки бьют только вперёд, но дамка летающая. Обязательно бить максимум фигур (при равенстве — больше дамок).'
    },
    turkish: {
      id: 'turkish', name: 'Турецкие шашки (Dama)', region: '🇹🇷 Турция / Ближний Восток',
      size: 8, rows: 2, orthogonal: true, menCaptureBack: false, flyingKing: true, majorityCapture: true, promoteMidJump: false, giveaway: false,
      desc: 'Ходы по вертикали и горизонтали! По 16 шашек на 2-3 и 6-7 рядах. Простые ходят и бьют вперёд и вбок; дамка летает ортогонально.'
    },
    giveaway: {
      id: 'giveaway', name: 'Поддавки (Антишашки)', region: '🎲 Популярный вариант',
      size: 8, rows: 3, orthogonal: false, menCaptureBack: true, flyingKing: true, majorityCapture: false, promoteMidJump: true, giveaway: true,
      desc: 'Русские правила с обратной целью: побеждает тот, кто первым отдаст все свои шашки или останется без ходов!'
    }
  };

  const APP_THEMES = [
    { id: 'dark', name: 'Клубная', bg: '#262522', surf: '#302e2b', txt: '#f8fafc' },
    { id: 'slate', name: 'Ночной синий', bg: '#0f172a', surf: '#1e293b', txt: '#f8fafc' },
    { id: 'light', name: 'Светлая', bg: '#eef1f5', surf: '#ffffff', txt: '#0f172a' },
    { id: 'oled', name: 'OLED Чёрная', bg: '#000000', surf: '#14141a', txt: '#ffffff' },
    { id: 'forest', name: 'Лесной бархат', bg: '#0d1b15', surf: '#13281f', txt: '#ecfdf5' }
  ];

  const APP_ACCENTS = [
    { id: 'emerald', name: 'Изумруд', hex: '#81b64c' },
    { id: 'amber', name: 'Золото', hex: '#f59e0b' },
    { id: 'sapphire', name: 'Сапфир', hex: '#3b82f6' },
    { id: 'amethyst', name: 'Аметист', hex: '#a855f7' },
    { id: 'ruby', name: 'Рубин', hex: '#f43f5e' },
    { id: 'cyan', name: 'Бирюза', hex: '#06b6d4' }
  ];

  const AVATARS = [
    { icon: '👑', bg: 'linear-gradient(135deg,#f59e0b,#d97706)' },
    { icon: '🦁', bg: 'linear-gradient(135deg,#ea580c,#9a3412)' },
    { icon: '🦊', bg: 'linear-gradient(135deg,#f97316,#c2410c)' },
    { icon: '🦅', bg: 'linear-gradient(135deg,#0284c7,#1e3a8a)' },
    { icon: '🐉', bg: 'linear-gradient(135deg,#10b981,#065f46)' },
    { icon: '⚡', bg: 'linear-gradient(135deg,#8b5cf6,#4c1d95)' },
    { icon: '🎯', bg: 'linear-gradient(135deg,#e11d48,#881337)' },
    { icon: '♟️', bg: 'linear-gradient(135deg,#475569,#0f172a)' },
    { icon: '🌟', bg: 'linear-gradient(135deg,#eab308,#a16207)' },
    { icon: '🔥', bg: 'linear-gradient(135deg,#ef4444,#991b1b)' },
    { icon: '🧊', bg: 'linear-gradient(135deg,#06b6d4,#155e75)' },
    { icon: '🍀', bg: 'linear-gradient(135deg,#22c55e,#14532d)' }
  ];

  /* ======================== MODULAR AUDIO SYSTEM (WAV FILES + WEB AUDIO ENGINE + MOBILE AUTOPLAY UNLOCK) ======================== */
  const SoundFX = (() => {
    let ctx = null;
    let unlocked = false;
    let preloadTriggered = false;
    const decodedBuffers = new Map();
    const htmlAudioPool = new Map();
    const activeInstances = new Map(); // Prevents simultaneous overlap of identical sounds
    const lastPlayedAt = new Map();    // Cooldown tracker to prevent overly frequent repetition

    // Background Music state
    let bgmAudioEl = null;
    let bgmBufferSource = null;
    let bgmGainNode = null;
    let bgmIsPreviewing = false;

    // Extensible Sound Registry — new sound effects can be added at any time via SoundFX.registerSound(id, spec)
    const SOUND_REGISTRY = {
      // 1. Перемещение шашки
      move: {
        id: 'move',
        label: 'Перемещение шашки',
        category: 'sfx',
        file: 'sounds/move.wav',
        cooldownMs: 55,
        durationMs: 110,
        gain: 0.90,
        synth(c, dest, vol, now) {
          const osc = c.createOscillator(), g = c.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(210, now);
          osc.frequency.exponentialRampToValueAtTime(88, now + 0.085);
          g.gain.setValueAtTime(vol, now);
          g.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
          osc.connect(g); g.connect(dest);
          osc.start(now); osc.stop(now + 0.10);
          return () => { try { osc.stop(); } catch (_) {} };
        }
      },
      // 2. Взятие шашки
      capture: {
        id: 'capture',
        label: 'Взятие шашки',
        category: 'sfx',
        file: 'sounds/capture.wav',
        cooldownMs: 65,
        durationMs: 160,
        gain: 0.95,
        synth(c, dest, vol, now) {
          const osc = c.createOscillator(), g = c.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(350, now);
          osc.frequency.exponentialRampToValueAtTime(105, now + 0.13);
          g.gain.setValueAtTime(vol * 0.95, now);
          g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
          osc.connect(g); g.connect(dest);
          osc.start(now); osc.stop(now + 0.15);
          return () => { try { osc.stop(); } catch (_) {} };
        }
      },
      // 3. Превращение в дамку
      king: {
        id: 'king',
        label: 'Превращение в дамку',
        category: 'sfx',
        file: 'sounds/king.wav',
        cooldownMs: 180,
        durationMs: 420,
        gain: 0.90,
        synth(c, dest, vol, now) {
          const oscs = [];
          [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
            const osc = c.createOscillator(), g = c.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.06);
            g.gain.setValueAtTime(vol * 0.75, now + i * 0.06);
            g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.25);
            osc.connect(g); g.connect(dest);
            osc.start(now + i * 0.06); osc.stop(now + i * 0.06 + 0.26);
            oscs.push(osc);
          });
          return () => oscs.forEach(o => { try { o.stop(); } catch (_) {} });
        }
      },
      // 4. Выбор шашки
      select: {
        id: 'select',
        label: 'Выбор шашки',
        category: 'sfx',
        file: 'sounds/select.wav',
        cooldownMs: 45,
        durationMs: 65,
        gain: 0.70,
        synth(c, dest, vol, now) {
          const osc = c.createOscillator(), g = c.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(510, now);
          osc.frequency.exponentialRampToValueAtTime(280, now + 0.045);
          g.gain.setValueAtTime(vol * 0.65, now);
          g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
          osc.connect(g); g.connect(dest);
          osc.start(now); osc.stop(now + 0.055);
          return () => { try { osc.stop(); } catch (_) {} };
        }
      },
      // 5a. Победа
      win: {
        id: 'win',
        label: 'Победа в партии',
        category: 'sfx',
        file: 'sounds/win.wav',
        cooldownMs: 300,
        durationMs: 620,
        gain: 0.95,
        synth(c, dest, vol, now) {
          const oscs = [];
          [440, 554.37, 659.25, 880].forEach((freq, i) => {
            const osc = c.createOscillator(), g = c.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + i * 0.085);
            g.gain.setValueAtTime(vol * 0.85, now + i * 0.085);
            g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.085 + 0.34);
            osc.connect(g); g.connect(dest);
            osc.start(now + i * 0.085); osc.stop(now + i * 0.085 + 0.35);
            oscs.push(osc);
          });
          return () => oscs.forEach(o => { try { o.stop(); } catch (_) {} });
        }
      },
      // 5b. Поражение
      loss: {
        id: 'loss',
        label: 'Поражение в партии',
        category: 'sfx',
        file: 'sounds/loss.wav',
        cooldownMs: 300,
        durationMs: 550,
        gain: 0.85,
        synth(c, dest, vol, now) {
          const oscs = [];
          [392.00, 349.23, 311.13, 261.63].forEach((freq, i) => {
            const osc = c.createOscillator(), g = c.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.095);
            g.gain.setValueAtTime(vol * 0.75, now + i * 0.095);
            g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.095 + 0.28);
            osc.connect(g); g.connect(dest);
            osc.start(now + i * 0.095); osc.stop(now + i * 0.095 + 0.29);
            oscs.push(osc);
          });
          return () => oscs.forEach(o => { try { o.stop(); } catch (_) {} });
        }
      },
      // 5c. Ничья
      draw: {
        id: 'draw',
        label: 'Ничья',
        category: 'sfx',
        file: 'sounds/draw.wav',
        cooldownMs: 300,
        durationMs: 380,
        gain: 0.85,
        synth(c, dest, vol, now) {
          const oscs = [];
          [440, 523.25, 493.88].forEach((freq, i) => {
            const osc = c.createOscillator(), g = c.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + i * 0.09);
            g.gain.setValueAtTime(vol * 0.75, now + i * 0.09);
            g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.22);
            osc.connect(g); g.connect(dest);
            osc.start(now + i * 0.09); osc.stop(now + i * 0.09 + 0.23);
            oscs.push(osc);
          });
          return () => oscs.forEach(o => { try { o.stop(); } catch (_) {} });
        }
      },
      // 6a. Начало партии
      game_start: {
        id: 'game_start',
        label: 'Начало партии',
        category: 'sfx',
        file: 'sounds/game_start.wav',
        cooldownMs: 250,
        durationMs: 360,
        gain: 0.85,
        synth(c, dest, vol, now) {
          const oscs = [];
          [440, 659.25].forEach((freq, i) => {
            const osc = c.createOscillator(), g = c.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.08);
            g.gain.setValueAtTime(vol * 0.8, now + i * 0.08);
            g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.24);
            osc.connect(g); g.connect(dest);
            osc.start(now + i * 0.08); osc.stop(now + i * 0.08 + 0.25);
            oscs.push(osc);
          });
          return () => oscs.forEach(o => { try { o.stop(); } catch (_) {} });
        }
      },
      // 6b. Окончание партии
      game_end: {
        id: 'game_end',
        label: 'Окончание партии',
        category: 'sfx',
        file: 'sounds/game_end.wav',
        cooldownMs: 250,
        durationMs: 340,
        gain: 0.85,
        synth(c, dest, vol, now) {
          const osc = c.createOscillator(), g = c.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(329.63, now);
          g.gain.setValueAtTime(vol * 0.8, now);
          g.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
          osc.connect(g); g.connect(dest);
          osc.start(now); osc.stop(now + 0.32);
          return () => { try { osc.stop(); } catch (_) {} };
        }
      },
      // 7. Нажатие кнопок интерфейса
      ui_click: {
        id: 'ui_click',
        label: 'Нажатие кнопки интерфейса',
        category: 'sfx',
        file: 'sounds/ui_click.wav',
        cooldownMs: 45,
        durationMs: 38,
        gain: 0.55,
        synth(c, dest, vol, now) {
          const osc = c.createOscillator(), g = c.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(720, now);
          osc.frequency.exponentialRampToValueAtTime(340, now + 0.028);
          g.gain.setValueAtTime(vol * 0.5, now);
          g.gain.exponentialRampToValueAtTime(0.001, now + 0.032);
          osc.connect(g); g.connect(dest);
          osc.start(now); osc.stop(now + 0.035);
          return () => { try { osc.stop(); } catch (_) {} };
        }
      },
      // 8. Приглашение в игру
      invite: {
        id: 'invite',
        label: 'Приглашение в игру',
        category: 'notifications',
        file: 'sounds/invite.wav',
        cooldownMs: 250,
        durationMs: 400,
        gain: 0.90,
        synth(c, dest, vol, now) {
          const oscs = [];
          [587.33, 739.99, 880].forEach((freq, i) => {
            const osc = c.createOscillator(), g = c.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.075);
            g.gain.setValueAtTime(vol * 0.8, now + i * 0.075);
            g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.075 + 0.22);
            osc.connect(g); g.connect(dest);
            osc.start(now + i * 0.075); osc.stop(now + i * 0.075 + 0.23);
            oscs.push(osc);
          });
          return () => oscs.forEach(o => { try { o.stop(); } catch (_) {} });
        }
      },
      // 9a. Подключение соперника
      opponent_connect: {
        id: 'opponent_connect',
        label: 'Подключение соперника',
        category: 'notifications',
        file: 'sounds/opponent_connect.wav',
        cooldownMs: 250,
        durationMs: 280,
        gain: 0.90,
        synth(c, dest, vol, now) {
          const oscs = [];
          [493.88, 739.99].forEach((freq, i) => {
            const osc = c.createOscillator(), g = c.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.075);
            g.gain.setValueAtTime(vol * 0.8, now + i * 0.075);
            g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.075 + 0.18);
            osc.connect(g); g.connect(dest);
            osc.start(now + i * 0.075); osc.stop(now + i * 0.075 + 0.19);
            oscs.push(osc);
          });
          return () => oscs.forEach(o => { try { o.stop(); } catch (_) {} });
        }
      },
      // 9b. Отключение соперника
      opponent_disconnect: {
        id: 'opponent_disconnect',
        label: 'Отключение соперника',
        category: 'notifications',
        file: 'sounds/opponent_disconnect.wav',
        cooldownMs: 250,
        durationMs: 300,
        gain: 0.90,
        synth(c, dest, vol, now) {
          const oscs = [];
          [587.33, 392.00].forEach((freq, i) => {
            const osc = c.createOscillator(), g = c.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.085);
            g.gain.setValueAtTime(vol * 0.8, now + i * 0.085);
            g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.085 + 0.19);
            osc.connect(g); g.connect(dest);
            osc.start(now + i * 0.085); osc.stop(now + i * 0.085 + 0.20);
            oscs.push(osc);
          });
          return () => oscs.forEach(o => { try { o.stop(); } catch (_) {} });
        }
      },
      // 10a. Обратный отсчёт
      countdown_tick: {
        id: 'countdown_tick',
        label: 'Обратный отсчёт времени',
        category: 'notifications',
        file: 'sounds/countdown_tick.wav',
        cooldownMs: 750,
        durationMs: 60,
        gain: 0.75,
        synth(c, dest, vol, now) {
          const osc = c.createOscillator(), g = c.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(940, now);
          osc.frequency.exponentialRampToValueAtTime(440, now + 0.045);
          g.gain.setValueAtTime(vol * 0.75, now);
          g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
          osc.connect(g); g.connect(dest);
          osc.start(now); osc.stop(now + 0.055);
          return () => { try { osc.stop(); } catch (_) {} };
        }
      },
      // 10b. Предупреждение о заканчивающемся времени
      low_time: {
        id: 'low_time',
        label: 'Предупреждение о малом времени',
        category: 'notifications',
        file: 'sounds/low_time.wav',
        cooldownMs: 450,
        durationMs: 320,
        gain: 0.90,
        synth(c, dest, vol, now) {
          const oscs = [];
          [0, 0.13].forEach((offset) => {
            const osc = c.createOscillator(), g = c.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(784, now + offset);
            g.gain.setValueAtTime(vol * 0.65, now + offset);
            g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.095);
            osc.connect(g); g.connect(dest);
            osc.start(now + offset); osc.stop(now + offset + 0.10);
            oscs.push(osc);
          });
          return () => oscs.forEach(o => { try { o.stop(); } catch (_) {} });
        }
      },
      // Legacy / CS2 Case & Emote aliases
      lowtime: { aliasOf: 'low_time' },
      unbox_rare: { aliasOf: 'king' },
      tick: {
        id: 'tick',
        label: 'Щелчок рулетки CS2',
        category: 'sfx',
        file: 'sounds/ui_click.wav',
        cooldownMs: 28,
        durationMs: 35,
        gain: 0.60,
        synth(c, dest, vol, now) {
          const osc = c.createOscillator(), g = c.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(880, now);
          osc.frequency.exponentialRampToValueAtTime(420, now + 0.025);
          g.gain.setValueAtTime(vol * 0.55, now);
          g.gain.exponentialRampToValueAtTime(0.001, now + 0.028);
          osc.connect(g); g.connect(dest);
          osc.start(now); osc.stop(now + 0.03);
          return () => { try { osc.stop(); } catch (_) {} };
        }
      },
      emote: {
        id: 'emote',
        label: 'Эмодзи-реакция',
        category: 'notifications',
        file: 'sounds/select.wav',
        cooldownMs: 140,
        durationMs: 120,
        gain: 0.65,
        synth(c, dest, vol, now) {
          const osc = c.createOscillator(), g = c.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(520, now);
          osc.frequency.exponentialRampToValueAtTime(780, now + 0.08);
          g.gain.setValueAtTime(vol * 0.55, now);
          g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
          osc.connect(g); g.connect(dest);
          osc.start(now); osc.stop(now + 0.13);
          return () => { try { osc.stop(); } catch (_) {} };
        }
      }
    };

    function registerSound(id, spec) {
      if (!id || !spec) return;
      SOUND_REGISTRY[id] = { id, category: 'sfx', cooldownMs: 60, durationMs: 150, gain: 0.85, ...spec };
    }

    function resolveSpec(type) {
      let spec = SOUND_REGISTRY[type];
      if (spec && spec.aliasOf) spec = SOUND_REGISTRY[spec.aliasOf];
      return spec || null;
    }

    function ensureCtx() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          try { ctx = new AC(); } catch (_) {}
        }
      }
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      return ctx;
    }

    async function preloadWavFiles() {
      if (preloadTriggered) return;
      preloadTriggered = true;
      const c = ensureCtx();
      const uniqueFiles = new Set();
      Object.values(SOUND_REGISTRY).forEach(s => { if (s && s.file) uniqueFiles.add(s.file); });
      uniqueFiles.add('sounds/bgm_ambient.wav');

      for (const fileUrl of uniqueFiles) {
        if (window.location.protocol.startsWith('http') && c) {
          try {
            const res = await fetch(fileUrl);
            if (res.ok) {
              const arr = await res.arrayBuffer();
              const audioBuf = await c.decodeAudioData(arr);
              decodedBuffers.set(fileUrl, audioBuf);
              continue;
            }
          } catch (_) {}
        }
        // Fallback for local file:// or before decode completes: HTMLAudioElement cache
        try {
          const a = new Audio(fileUrl);
          a.preload = 'auto';
          htmlAudioPool.set(fileUrl, a);
        } catch (_) {}
      }
    }

    function computeCategoryEffectiveVolume(category) {
      const s = state?.settings;
      if (!s || !s.soundEnabled) return 0;
      const master = Math.max(0, Math.min(100, Number(s.volume ?? 60))) / 100;
      if (master <= 0) return 0;

      if (category === 'music') {
        if (!s.musicEnabled && !bgmIsPreviewing) return 0;
        const mVol = Math.max(0, Math.min(100, Number(s.musicVolume ?? 25))) / 100;
        return master * mVol;
      }
      if (category === 'notifications') {
        if (s.notificationsEnabled === false) return 0;
        const nVol = Math.max(0, Math.min(100, Number(s.notificationsVolume ?? 50))) / 100;
        return master * nVol;
      }
      // Default: 'sfx'
      if (s.sfxEnabled === false) return 0;
      const xVol = Math.max(0, Math.min(100, Number(s.sfxVolume ?? 55))) / 100;
      return master * xVol;
    }

    function stopSoundInstance(soundId) {
      const prev = activeInstances.get(soundId);
      if (prev) {
        try { prev.stop(); } catch (_) {}
        activeInstances.delete(soundId);
      }
    }

    function stopAll() {
      for (const [id] of activeInstances) {
        stopSoundInstance(id);
      }
      stopMusic();
    }

    function play(type, options = {}) {
      const s = state?.settings;
      // When master sound is off, never play any audio effect!
      if (!s || !s.soundEnabled) return false;

      const spec = resolveSpec(type);
      if (!spec) return false;

      const isPreview = Boolean(options.isPreview);
      const effVol = computeCategoryEffectiveVolume(spec.category);
      if (effVol <= 0 && !isPreview) return false;

      // If previewing while category is muted, use master * category slider (or 0.5 fallback) so user can still hear only if master is enabled
      const finalGain = Math.min(1, (effVol > 0 ? effVol : ((Number(s.volume ?? 60) / 100) * 0.5)) * (spec.gain || 0.85));
      if (finalGain <= 0.001) return false;

      const nowMs = performance.now();
      const lastMs = lastPlayedAt.get(spec.id) || 0;
      const cooldown = spec.cooldownMs || 50;

      // Prevent overly frequent repetition
      if (!isPreview && (nowMs - lastMs) < cooldown) {
        return false;
      }

      // Prevent simultaneous overlap of identical sounds
      const existing = activeInstances.get(spec.id);
      if (existing && nowMs < existing.endTime) {
        if (!isPreview && (nowMs - lastMs) < Math.max(cooldown, (spec.durationMs || 100) * 0.65)) {
          return false;
        }
        stopSoundInstance(spec.id);
      }

      lastPlayedAt.set(spec.id, nowMs);
      const c = ensureCtx();

      // 1. Play decoded WAV AudioBuffer via Web Audio API if loaded
      if (c && spec.file && decodedBuffers.has(spec.file)) {
        try {
          const buf = decodedBuffers.get(spec.file);
          const src = c.createBufferSource();
          const gainNode = c.createGain();
          src.buffer = buf;
          gainNode.gain.setValueAtTime(finalGain, c.currentTime);
          src.connect(gainNode);
          gainNode.connect(c.destination);
          src.start(0);
          const durMs = Math.max(spec.durationMs || 100, Math.round(buf.duration * 1000));
          const record = {
            endTime: nowMs + durMs,
            stop: () => { try { src.stop(); src.disconnect(); } catch (_) {} }
          };
          activeInstances.set(spec.id, record);
          src.onended = () => {
            if (activeInstances.get(spec.id) === record) activeInstances.delete(spec.id);
          };
          return true;
        } catch (_) {}
      }

      // 2. Try HTMLAudioElement WAV file if loaded
      const cachedAudio = spec.file ? htmlAudioPool.get(spec.file) : null;
      if (cachedAudio && cachedAudio.readyState >= 2) {
        try {
          cachedAudio.pause();
          cachedAudio.currentTime = 0;
          cachedAudio.volume = Math.max(0, Math.min(1, finalGain));
          const playPromise = cachedAudio.play();
          if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {
              if (c && typeof spec.synth === 'function') {
                spec.synth(c, c.destination, finalGain * 0.45, c.currentTime);
              }
            });
          }
          const durMs = spec.durationMs || 150;
          activeInstances.set(spec.id, {
            endTime: nowMs + durMs,
            stop: () => { try { cachedAudio.pause(); cachedAudio.currentTime = 0; } catch (_) {} }
          });
          return true;
        } catch (_) {}
      }

      // 3. Always-available Web Audio synth fallback
      if (c && typeof spec.synth === 'function') {
        const stopFn = spec.synth(c, c.destination, finalGain * 0.45, c.currentTime);
        activeInstances.set(spec.id, {
          endTime: nowMs + (spec.durationMs || 120),
          stop: typeof stopFn === 'function' ? stopFn : () => {}
        });
        return true;
      }
      return false;
    }

    function preview(type) {
      if (!state?.settings?.soundEnabled) return false;
      return play(type, { isPreview: true });
    }

    // Background Music Controller
    function startMusic(forPreview = false) {
      if (forPreview) bgmIsPreviewing = true;
      const s = state?.settings;
      if (!s || !s.soundEnabled || (!s.musicEnabled && !bgmIsPreviewing)) {
        stopMusic();
        return false;
      }
      const vol = computeCategoryEffectiveVolume('music') || (bgmIsPreviewing ? (Number(s.volume ?? 60) / 100) * (Number(s.musicVolume ?? 25) / 100) : 0);
      if (vol <= 0.001) {
        stopMusic();
        return false;
      }

      const c = ensureCtx();
      const bgmUrl = 'sounds/bgm_ambient.wav';

      if (c && decodedBuffers.has(bgmUrl)) {
        if (bgmBufferSource) {
          if (bgmGainNode) bgmGainNode.gain.setTargetAtTime(vol * 0.55, c.currentTime, 0.08);
          return true;
        }
        try {
          const src = c.createBufferSource();
          const g = c.createGain();
          src.buffer = decodedBuffers.get(bgmUrl);
          src.loop = true;
          g.gain.setValueAtTime(vol * 0.55, c.currentTime);
          src.connect(g);
          g.connect(c.destination);
          src.start(0);
          bgmBufferSource = src;
          bgmGainNode = g;
          return true;
        } catch (_) {}
      }

      // HTMLAudioElement fallback for background music loop
      try {
        if (!bgmAudioEl) {
          bgmAudioEl = new Audio(bgmUrl);
          bgmAudioEl.loop = true;
        }
        bgmAudioEl.volume = Math.max(0, Math.min(1, vol * 0.65));
        if (bgmAudioEl.paused) {
          const p = bgmAudioEl.play();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        }
        return true;
      } catch (_) {}
      return false;
    }

    function stopMusic() {
      bgmIsPreviewing = false;
      if (bgmBufferSource) {
        try { bgmBufferSource.stop(); bgmBufferSource.disconnect(); } catch (_) {}
        bgmBufferSource = null;
        bgmGainNode = null;
      }
      if (bgmAudioEl) {
        try { bgmAudioEl.pause(); } catch (_) {}
      }
      const btnLbl = document.getElementById('previewMusicBtnLabel');
      if (btnLbl) btnLbl.textContent = 'Прослушать музыку';
    }

    function toggleMusicPreview() {
      if (!state?.settings?.soundEnabled) return false;
      if (bgmIsPreviewing || (bgmBufferSource || (bgmAudioEl && !bgmAudioEl.paused))) {
        if (!state.settings.musicEnabled) {
          stopMusic();
          return false;
        }
      }
      bgmIsPreviewing = !bgmIsPreviewing;
      if (bgmIsPreviewing) {
        startMusic(true);
        const btnLbl = document.getElementById('previewMusicBtnLabel');
        if (btnLbl) btnLbl.textContent = 'Остановить прослушивание';
        return true;
      } else {
        syncSettings();
        return false;
      }
    }

    function syncSettings() {
      const s = state?.settings;
      if (!s || !s.soundEnabled) {
        stopAll();
        return;
      }
      if (s.musicEnabled || bgmIsPreviewing) {
        const vol = computeCategoryEffectiveVolume('music');
        if (vol <= 0.001) {
          stopMusic();
        } else {
          if (bgmGainNode && ctx) {
            bgmGainNode.gain.setTargetAtTime(vol * 0.55, ctx.currentTime, 0.05);
          }
          if (bgmAudioEl && !bgmAudioEl.paused) {
            bgmAudioEl.volume = Math.max(0, Math.min(1, vol * 0.65));
          } else if (unlocked && s.musicEnabled) {
            startMusic(false);
          }
        }
      } else {
        stopMusic();
      }
    }

    // Mobile Browser Autoplay Restriction Handler (Unlocks Web Audio + HTMLAudio on first user gesture)
    function initMobileUnlock() {
      const unlockHandler = () => {
        const c = ensureCtx();
        if (c && !unlocked) {
          try {
            const silentBuf = c.createBuffer(1, 1, 22050);
            const src = c.createBufferSource();
            src.buffer = silentBuf;
            src.connect(c.destination);
            src.start(0);
            unlocked = true;
          } catch (_) {}
        }
        preloadWavFiles();
        if (state?.settings?.soundEnabled && state?.settings?.musicEnabled) {
          startMusic(false);
        }
      };

      ['pointerdown', 'touchend', 'click', 'keydown'].forEach(evt => {
        window.addEventListener(evt, unlockHandler, { passive: true, once: false });
      });

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          if (bgmAudioEl && !bgmAudioEl.paused) bgmAudioEl.pause();
          if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
        } else {
          if (state?.settings?.soundEnabled) {
            if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
            if (state.settings.musicEnabled) startMusic(false);
          }
        }
      });
    }

    function getSoundLabel(id) {
      const spec = resolveSpec(id);
      return spec ? spec.label : id;
    }

    return {
      play,
      preview,
      stopAll,
      startMusic,
      stopMusic,
      toggleMusicPreview,
      syncSettings,
      initMobileUnlock,
      registerSound,
      getSoundLabel,
      SOUND_REGISTRY
    };
  })();

  function vibrate(pattern) {
    if (state.settings.vibration && navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch (_) {}
    }
  }

  /* ======================== DEFAULT SETTINGS & ACCOUNT (MODERATE DEFAULT VOLUMES) ======================== */
  function defaultSettings() {
    return {
      timeControl: '300+3',
      hintStyle: 'dots',
      showHints: true,
      highlightForced: true,
      highlightLastMove: true,
      autoMoveForced: false,
      confirmMove: false,
      allowUndo: true,
      appTheme: 'dark',
      appAccent: 'emerald',
      boardSize: 640,
      animSpeed: 200,
      zenMode: false,
      showMaterial: true,
      showCoords: true,
      autoFlipLocal: false,
      lowTimeAlert: true,
      // Moderate default audio settings for new users:
      soundEnabled: true,
      musicEnabled: false,
      sfxEnabled: true,
      notificationsEnabled: true,
      volume: 60,
      musicVolume: 25,
      sfxVolume: 55,
      notificationsVolume: 50,
      vibration: true,
      // Chat & AI settings:
      ignoreEmojis: false,
      ignoreMessages: false,
      aiCommentary: true,
      geminiApiKey: '',
      geminiModel: 'gemini-2.5-flash',
      playAssistMode: 'rethink' // 'free' (hints + undo), 'rethink' (undo only), 'honest' (no hints, no undo)
    };
  }

  /* ======================== 5 AI BOT LEVELS & 3 ASSIST MODES ECONOMY ======================== */
  const AI_BOT_PROFILES = {
    1: {
      level: 1,
      name: 'ИИ • Новичок',
      elo: 750,
      expMult: 0.70,
      coinMult: 0.70,
      depth: 1,
      blunderChance: 0.42,
      noise: 175,
      thinkMs: 320,
      desc: '🌱 <b>1. Новичок (750 ELO • ×0.7 EXP):</b> Смотрит только на 1 ход вперёд, часто оставляет шашки под боем (42% шанс ошибки), оголяет задний ряд и не замечает ловушек.'
    },
    2: {
      level: 2,
      name: 'ИИ • Любитель',
      elo: 1150,
      expMult: 1.00,
      coinMult: 1.00,
      depth: 2,
      blunderChance: 0.22,
      noise: 55,
      thinkMs: 380,
      desc: '🎲 <b>2. Любитель (1150 ELO • ×1.0 EXP):</b> Знает базовые правила и простые удары, но иногда (22% шанс) допускает позиционные ошибки и пропускает двухходовые комбинации.'
    },
    3: {
      level: 3,
      name: 'ИИ • Средний',
      elo: 1500,
      expMult: 1.30,
      coinMult: 1.30,
      depth: 3,
      blunderChance: 0.08,
      noise: 16,
      thinkMs: 440,
      desc: '🎯 <b>3. Средний (1500 ELO • ×1.3 EXP):</b> Крепкий клубный игрок. Контролирует центр, бережёт задний ряд и просчитывает тактику на 3 полухода вперёд.'
    },
    4: {
      level: 4,
      name: 'ИИ • Мастер',
      elo: 1850,
      expMult: 1.65,
      coinMult: 1.65,
      depth: 5,
      blunderChance: 0.0,
      noise: 4,
      thinkMs: 520,
      desc: '⚔️ <b>4. Мастер (1850 ELO • ×1.65 EXP):</b> Глубокий расчёт на 5 полуходов, защита «золотой шашки», связки, прорывы в дамки и точная техника в эндшпиле.'
    },
    5: {
      level: 5,
      name: 'ИИ • Гроссмейстер',
      elo: 2300,
      expMult: 2.20,
      coinMult: 2.20,
      depth: 6,
      blunderChance: 0.0,
      noise: 0,
      thinkMs: 620,
      desc: '👑 <b>5. Гроссмейстер (2300 ELO • ×2.2 EXP):</b> Безошибочный расчёт на 6+ полуходов с форсированным продлением серий взятий, доминацией дамок и контролем темпа.'
    }
  };

  const PLAY_ASSIST_MODES = {
    free: {
      id: 'free',
      name: '🟢 Свободный (Подсказки + Одуматься)',
      shortName: 'Свободный',
      allowHints: true,
      allowUndo: true,
      expMult: 0.75,
      coinMult: 0.75
    },
    rethink: {
      id: 'rethink',
      name: '🟡 Только одуматься (Без подсказок)',
      shortName: 'Одуматься',
      allowHints: false,
      allowUndo: true,
      expMult: 1.00,
      coinMult: 1.00
    },
    honest: {
      id: 'honest',
      name: '🔴 Честно (Без подсказок и без отмены)',
      shortName: 'Честно',
      allowHints: false,
      allowUndo: false,
      expMult: 1.50,
      coinMult: 1.50
    }
  };

  function getMatchEconomyMultipliers() {
    const assistId = state.settings.playAssistMode || 'rethink';
    const assist = PLAY_ASSIST_MODES[assistId] || PLAY_ASSIST_MODES.rethink;
    const bot = AI_BOT_PROFILES[state.aiDifficulty] || AI_BOT_PROFILES[3];

    let modeMult = 1.0;
    let modeLabel = 'ИИ';
    if (state.mode === 'ai') {
      modeMult = bot.expMult;
      modeLabel = `${bot.name} (×${bot.expMult})`;
    } else if (state.mode === 'online' || state.mode === 'bluetooth') {
      modeMult = 1.55;
      modeLabel = 'Живой соперник (×1.55)';
    } else if (state.mode === 'local') {
      modeMult = 0.50;
      modeLabel = 'Вживую (×0.50)';
    }

    // In Online/Bluetooth against a real player, undo is always disabled (= Honest multiplier)
    const effectiveAssist = (state.mode === 'online' || state.mode === 'bluetooth')
      ? PLAY_ASSIST_MODES.honest
      : assist;

    const tc = state.settings.timeControl || 'none';
    const timeMult = tc === '180+2' ? 1.25 : (tc === '300+3' || tc === '900+10' ? 1.15 : (tc === '600+0' ? 1.10 : 1.0));

    const totalExpMult = Number((modeMult * effectiveAssist.expMult * timeMult).toFixed(2));
    const totalCoinMult = Number((modeMult * effectiveAssist.coinMult * timeMult).toFixed(2));

    return {
      totalExpMult,
      totalCoinMult,
      modeMult,
      modeLabel,
      assist: effectiveAssist,
      timeMult
    };
  }

  function createFreshDailyQuests() {
    const todayKey = new Date().toISOString().slice(0, 10);
    return {
      dateKey: todayKey,
      quests: DAILY_QUEST_TEMPLATES.map(q => ({
        ...q,
        progress: 0,
        claimed: false
      }))
    };
  }

  function ensureAccountFields(acc) {
    if (!acc) return acc;
    if (typeof acc.coins !== 'number') acc.coins = 500;
    if (typeof acc.crystals !== 'number') acc.crystals = 25;
    if (typeof acc.elo !== 'number') acc.elo = 1200;
    if (typeof acc.peakElo !== 'number') acc.peakElo = Math.max(1200, acc.elo || 1200);
    if (typeof acc.xp !== 'number') acc.xp = 0;
    if (typeof acc.wins !== 'number') acc.wins = 0;
    if (typeof acc.losses !== 'number') acc.losses = 0;
    if (typeof acc.draws !== 'number') acc.draws = 0;
    if (typeof acc.streak !== 'number') acc.streak = 0;
    if (typeof acc.bestStreak !== 'number') acc.bestStreak = 0;
    if (typeof acc.kingsPromoted !== 'number') acc.kingsPromoted = 0;
    if (typeof acc.capturesTotal !== 'number') acc.capturesTotal = 0;
    if (typeof acc.tournamentsWon !== 'number') acc.tournamentsWon = 0;
    if (typeof acc.chestsOpened !== 'number') acc.chestsOpened = 0;
    if (!acc.avatarFrame) acc.avatarFrame = 'default';
    if (!acc.playerTitle) acc.playerTitle = 'Новичок шашек';
    if (!acc.boosters || typeof acc.boosters !== 'object') {
      acc.boosters = { undo: 3, hint: 3, shield: 1, ticket: 2 };
    }
    if (!Array.isArray(acc.unlockedBoards) || acc.unlockedBoards.length < 4) {
      const setB = new Set(['emerald', 'wood', 'marble', 'nordic', ...(acc.unlockedBoards || [])]);
      acc.unlockedBoards = Array.from(setB);
    }
    if (!Array.isArray(acc.unlockedPieces) || acc.unlockedPieces.length < 4) {
      const setP = new Set(['classic', 'minimal', 'wood_piece', 'slate_piece', ...(acc.unlockedPieces || [])]);
      acc.unlockedPieces = Array.from(setP);
    }
    if (!Array.isArray(acc.unlockedFrames) || acc.unlockedFrames.length === 0) {
      acc.unlockedFrames = ['default', 'bronze_ring'];
    }
    if (!Array.isArray(acc.unlockedTitles) || acc.unlockedTitles.length === 0) {
      acc.unlockedTitles = ['Новичок шашек'];
    }
    if (!acc.fragments || typeof acc.fragments !== 'object') acc.fragments = {};
    if (!Array.isArray(acc.chestsInventory)) {
      // Give new player 1 starter Grade III Common chest so they can try CS2 opening immediately!
      acc.chestsInventory = [
        { id: 'ch_starter_1', type: 'common', tier: 1, tierName: 'Обычный', grade: 3, roman: 'III', label: 'Стартовый сундук • Обычный III разряд' }
      ];
    }
    if (!Array.isArray(acc.claimedLevels)) acc.claimedLevels = [];
    if (!Array.isArray(acc.claimedAchievements)) acc.claimedAchievements = [];
    const todayKey = new Date().toISOString().slice(0, 10);
    if (!acc.dailyQuests || acc.dailyQuests.dateKey !== todayKey) {
      acc.dailyQuests = createFreshDailyQuests();
    }
    return acc;
  }

  function createDefaultAccount(name = 'Игрок', opts = {}) {
    const acc = {
      id: 'acc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name,
      email: opts.email || '',
      registered: Boolean(opts.registered),
      passwordSalt: opts.passwordSalt || null,
      passwordHash: opts.passwordHash || null,
      flag: opts.flag || '🇰🇿',
      avatarIdx: opts.avatarIdx ?? 0,
      avatarPhoto: opts.avatarPhoto || null,
      avatarFrame: opts.avatarFrame || 'default',
      playerTitle: opts.playerTitle || 'Новичок шашек',
      elo: 1200,
      peakElo: 1200,
      xp: 0,
      coins: 500,
      crystals: 25,
      wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0,
      kingsPromoted: 0, capturesTotal: 0, tournamentsWon: 0, chestsOpened: 0,
      rulesPlayed: ['russian'],
      boosters: { undo: 3, hint: 3, shield: 1, ticket: 2 },
      unlockedBoards: ['emerald', 'wood', 'marble', 'nordic'],
      unlockedPieces: ['classic', 'minimal', 'wood_piece', 'slate_piece'],
      unlockedFrames: ['default', 'bronze_ring'],
      unlockedTitles: ['Новичок шашек'],
      fragments: {},
      chestsInventory: [
        { id: 'ch_start_' + Date.now(), type: 'common', tier: 1, tierName: 'Обычный', grade: 3, roman: 'III', label: 'Подарочный сундук • Обычный III разряд' }
      ],
      claimedLevels: [],
      claimedAchievements: [],
      dailyQuests: createFreshDailyQuests(),
      settings: opts.settings ? { ...defaultSettings(), ...opts.settings } : defaultSettings(),
      boardTheme: opts.boardTheme || 'emerald',
      pieceStyle: opts.pieceStyle || 'classic',
      ruleId: opts.ruleId || 'russian',
      mode: opts.mode || 'ai',
      aiDifficulty: opts.aiDifficulty || 2,
      history: Array.isArray(opts.history) ? opts.history : []
    };
    return ensureAccountFields(acc);
  }

  const saved = loadStore();
  const initialAccounts = saved?.accounts?.length
    ? saved.accounts.map(acc => {
        ensureAccountFields(acc);
        if (!acc.registered && (!acc.name || acc.name === 'Игрок' || acc.name === 'Гость')) {
          acc.name = generateGuestNickname();
        }
        return acc;
      })
    : [createDefaultAccount(generateGuestNickname(), { registered: false })];

  const state = {
    accounts: initialAccounts,
    activeAccountId: saved?.activeAccountId || initialAccounts[0].id,
    serverToken: saved?.serverToken || null,
    hasChosenAuthSession: Boolean(saved?.hasChosenAuthSession),
    savedGameSnapshot: saved?.savedGameSnapshot || null,
    settings: Object.assign(defaultSettings(), saved?.settings || {}),
    boardTheme: saved?.boardTheme || 'emerald',
    pieceStyle: saved?.pieceStyle || 'classic',
    styleRarityFilter: 'all',
    ruleId: saved?.ruleId || 'russian',
    mode: 'ai',
    aiDifficulty: saved?.aiDifficulty || 3,
    playerColorPref: saved?.playerColorPref || 'w',
    tabletopMode: saved?.tabletopMode || false,
    history: Array.isArray(saved?.history) ? saved.history : [],
    selectedHistoryIds: new Set(),
    activeTab: 'home',
    currentPage: 'lobby',
    sidePanelTab: 'moves',
    unreadChat: 0,
    publicRooms: [],
    liveTournaments: [],
    activeTournament: null,
    rouletteSpinning: false
  };

  function getActiveAccount() {
    const found = state.accounts.find(a => a.id === state.activeAccountId) || state.accounts[0];
    return ensureAccountFields(found);
  }

  function isCurrentUserGuest() {
    const acc = getActiveAccount();
    return !acc || !acc.registered;
  }

  function promptGuestRegistrationForFeature(featureLabel = 'Игра с реальными соперниками') {
    const acc = getActiveAccount();
    openModal(
      '🔒 Доступно после регистрации',
      `<div class="space-y-2.5">
        <p>Вы сейчас играете в гостевом профиле <b>${escapeHtml(acc.name)}</b> (сохранённом в <b>IndexedDB</b>).</p>
        <p class="text-xs">Гостям доступна <b>игра против компьютера (ИИ)</b>, выбор всех 5 уровней сложности и сохранение истории партий и статистики.</p>
        <p class="text-xs text-amber-300 font-bold">«${escapeHtml(featureLabel)}», создание комнат и приглашение друзей доступны только зарегистрированным пользователям. При регистрации весь ваш гостевой прогресс перенесётся в аккаунт автоматически!</p>
      </div>`,
      [
        { label: 'Играть с ИИ', cls: 'card border', onClick: () => { closeModal(); state.mode = 'ai'; renderModesAndRulesUI(); } },
        {
          label: '🔐 Зарегистрироваться и перенести прогресс',
          cls: 'accent-bg',
          onClick: () => {
            closeModal();
            window.openCenteredAuthScreen && window.openCenteredAuthScreen('register');
          }
        }
      ]
    );
  }

  let serverSyncTimer = null;
  function scheduleServerProfileSync() {
    if (!net.serverOnline || !state.serverToken) return;
    clearTimeout(serverSyncTimer);
    serverSyncTimer = setTimeout(() => {
      const acc = getActiveAccount();
      fetch('/api/profile/sync', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + state.serverToken },
        body: JSON.stringify({
          flag: acc.flag, avatarIdx: acc.avatarIdx, avatarPhoto: acc.avatarPhoto,
          avatarFrame: acc.avatarFrame, playerTitle: acc.playerTitle,
          xp: acc.xp, coins: acc.coins, crystals: acc.crystals,
          wins: acc.wins, losses: acc.losses, draws: acc.draws,
          streak: acc.streak, bestStreak: acc.bestStreak,
          kingsPromoted: acc.kingsPromoted, capturesTotal: acc.capturesTotal,
          tournamentsWon: acc.tournamentsWon, chestsOpened: acc.chestsOpened,
          peakElo: acc.peakElo, boosters: acc.boosters,
          unlockedBoards: acc.unlockedBoards, unlockedPieces: acc.unlockedPieces,
          unlockedFrames: acc.unlockedFrames, unlockedTitles: acc.unlockedTitles,
          fragments: acc.fragments, chestsInventory: acc.chestsInventory,
          claimedLevels: acc.claimedLevels, claimedAchievements: acc.claimedAchievements,
          dailyQuests: acc.dailyQuests,
          activeGameState: state.savedGameSnapshot || null,
          settings: state.settings, boardTheme: state.boardTheme, pieceStyle: state.pieceStyle,
          history: state.history.slice(0, 100)
        })
      }).catch(() => {});
    }, 650);
  }

  function persist() {
    const acc = getActiveAccount();
    if (acc) {
      // Guests are strictly locked to AI mode
      if (!acc.registered) state.mode = 'ai';
      acc.settings = { ...state.settings };
      acc.boardTheme = state.boardTheme;
      acc.pieceStyle = state.pieceStyle;
      acc.ruleId = state.ruleId;
      acc.mode = state.mode;
      acc.aiDifficulty = state.aiDifficulty;
      acc.history = state.history;
      acc.activeGameState = state.savedGameSnapshot || null;

      // Always persist Guest profile, match history & active game to IndexedDB (never auto-deleted!)
      if (!acc.registered) {
        GuestIndexedDB.set('guest_profile', JSON.parse(JSON.stringify(acc)));
        GuestIndexedDB.set('guest_history', JSON.parse(JSON.stringify(state.history)));
        GuestIndexedDB.set('active_game_state', state.savedGameSnapshot ? JSON.parse(JSON.stringify(state.savedGameSnapshot)) : null);
      }
    }
    saveStore({
      accounts: state.accounts,
      activeAccountId: state.activeAccountId,
      serverToken: state.serverToken,
      hasChosenAuthSession: state.hasChosenAuthSession,
      savedGameSnapshot: state.savedGameSnapshot,
      settings: state.settings,
      boardTheme: state.boardTheme,
      pieceStyle: state.pieceStyle,
      ruleId: state.ruleId,
      mode: state.mode,
      aiDifficulty: state.aiDifficulty,
      playerColorPref: state.playerColorPref,
      tabletopMode: state.tabletopMode,
      history: state.history
    });
    scheduleServerProfileSync();
  }

  function activateAccount(acc) {
    if (!acc) return;
    ensureAccountFields(acc);
    state.activeAccountId = acc.id;
    state.settings = Object.assign(defaultSettings(), acc.settings || {});
    state.boardTheme = acc.unlockedBoards.includes(acc.boardTheme) ? acc.boardTheme : 'emerald';
    state.pieceStyle = acc.unlockedPieces.includes(acc.pieceStyle) ? acc.pieceStyle : 'classic';
    state.ruleId = acc.ruleId || 'russian';
    state.mode = acc.registered ? (acc.mode || 'ai') : 'ai';
    state.aiDifficulty = acc.aiDifficulty || 3;
    state.history = Array.isArray(acc.history) ? acc.history : [];
    if (acc.activeGameState && !acc.activeGameState.over) {
      state.savedGameSnapshot = acc.activeGameState;
    }
    state.selectedHistoryIds.clear();
    applyThemeAndPrefs();
    renderSettingsUI();
    renderStylesUI();
    renderModesAndRulesUI();
    renderChestsUI();
    renderTournamentsUI();
    updateAllUI();
    drawBoard();
  }

  /* ======================== DAILY QUEST PROGRESS & LEVEL REWARDS AUTO-CHECK ======================== */
  function recordDailyQuestMetric(metric, amount = 1) {
    const acc = getActiveAccount();
    if (!acc.dailyQuests || !Array.isArray(acc.dailyQuests.quests)) return;
    for (const q of acc.dailyQuests.quests) {
      if (q.claimed) continue;
      if (q.metric === 'streak' && metric === 'streak') {
        q.progress = Math.max(q.progress, acc.streak || 0);
      } else if (q.metric === metric) {
        q.progress = Math.min(q.target, (q.progress || 0) + amount);
      }
    }
  }

  function claimDailyQuest(questId) {
    const acc = getActiveAccount();
    const q = acc.dailyQuests?.quests?.find(x => x.id === questId);
    if (!q || q.claimed || q.progress < q.target) return;
    q.claimed = true;
    const prevLv = getLevelInfoFromXp(acc.xp).level;
    acc.xp += q.xp;
    acc.coins += q.coins;
    acc.crystals += (q.crystals || 0);
    const newLv = getLevelInfoFromXp(acc.xp).level;
    checkAndQueueLevelUpRewards(prevLv, newLv);
    persist();
    updateAllUI();
    SoundFX.play('win');
    showToast(`Квест выполнен! +${q.xp} EXP, +${q.coins} 🪙`, 'success');
  }

  function checkAndQueueLevelUpRewards(prevLv, newLv) {
    if (newLv <= prevLv) return;
    showToast(`🎉 Повышение уровня! Теперь вы ${newLv} уровня! Откройте шкалу уровней за наградами.`, 'success');
  }

  function claimSingleLevelReward(levelNum, silent = false) {
    const acc = getActiveAccount();
    const curLv = getLevelInfoFromXp(acc.xp).level;
    if (levelNum > curLv || acc.claimedLevels.includes(levelNum)) return false;

    const spec = getLevelRewardSpec(levelNum);
    acc.claimedLevels.push(levelNum);
    acc.coins += spec.coins;
    acc.crystals += spec.crystals;

    // Add chest to inventory
    acc.chestsInventory.unshift({
      id: 'ch_lv_' + levelNum + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      type: spec.chest.type,
      tier: spec.chest.tier,
      tierName: spec.chest.tierName,
      grade: spec.chest.grade,
      roman: spec.chest.roman,
      label: spec.chest.label
    });

    // If milestone exclusive cosmetic
    if (spec.exclusive) {
      if (spec.exclusive.type === 'board' && !acc.unlockedBoards.includes(spec.exclusive.id)) {
        acc.unlockedBoards.push(spec.exclusive.id);
      } else if (spec.exclusive.type === 'piece' && !acc.unlockedPieces.includes(spec.exclusive.id)) {
        acc.unlockedPieces.push(spec.exclusive.id);
      } else if (spec.exclusive.type === 'frame' && !acc.unlockedFrames.includes(spec.exclusive.id)) {
        acc.unlockedFrames.push(spec.exclusive.id);
      } else if (spec.exclusive.type === 'title' && !acc.unlockedTitles.includes(spec.exclusive.id)) {
        acc.unlockedTitles.push(spec.exclusive.id);
      }
    }

    if (!silent) {
      persist();
      updateAllUI();
      renderChestsUI();
      renderLevelRoadModal();
      SoundFX.play('win');
      showToast(`Награда за ${levelNum} ур. получена: +${spec.coins} 🪙 и ${spec.chest.label}!`, 'success');
    }
    return true;
  }

  function claimAllAvailableLevelRewards() {
    const acc = getActiveAccount();
    const curLv = getLevelInfoFromXp(acc.xp).level;
    let count = 0;
    for (let lv = 1; lv <= curLv; lv++) {
      if (!acc.claimedLevels.includes(lv)) {
        if (claimSingleLevelReward(lv, true)) count++;
      }
    }
    if (count > 0) {
      persist();
      updateAllUI();
      renderChestsUI();
      renderLevelRoadModal();
      SoundFX.play('win');
      showToast(`Получены награды за ${count} ур.! Проверьте вкладку «Сундуки CS2».`, 'success');
    } else {
      showToast('Все доступные награды за текущие уровни уже собраны!', 'info');
    }
  }

  /* ======================== GEMINI AI MOVE & CHAT COMMENTATOR ======================== */
  function generateLocalGrandmasterComment(payload) {
    const {
      moveNotation = '', capturesCount = 0, promotes = false,
      moveNumber = 1, materialDiff = 0, playerMessage = '', eventType = 'move', ruleName = 'Русские шашки'
    } = payload || {};

    if (eventType === 'chat' && playerMessage) {
      const q = String(playerMessage).toLowerCase();
      if (q.includes('привет') || q.includes('здрав') || q.includes('салам')) {
        return 'Приветствую за доской! Я ИИ-комментатор Gemini. Желаю точного расчёта и красивых комбинаций!';
      }
      if (q.includes('совет') || q.includes('подскаж') || q.includes('как выиграть')) {
        return 'Контролируйте центр (поля c5, d4, e5, f4), берегите золотую шашку на крайнем ряду и готовьте прорыв в дамки!';
      }
      if (q.includes('кто ты') || q.includes('гемини') || q.includes('gemini')) {
        return 'Я — шашечный ИИ-аналитик на базе Gemini. Слежу за каждым темпом и комментирую тактические удары!';
      }
      return `Интересная реплика! А на доске после хода ${moveNotation || 'соперника'} завязывается острая тактическая борьба.`;
    }
    if (promotes && capturesCount > 0) {
      return `Фантастический удар ${moveNotation} с прорывом в дамки! Теперь вся большая дорога под прицелом! 👑`;
    }
    if (promotes) {
      return `Превращение в дамку (${moveNotation})! Настоящий переломный момент в партии. 👑`;
    }
    if (capturesCount >= 3) {
      return `Невероятная комбинация ${moveNotation}! Серия из ${capturesCount} взятий крушит оборонительные редуты! 🔥`;
    }
    if (capturesCount === 2) {
      return `Двойной удар ${moveNotation}! Минус две шашки за один темп — гроссмейстерский расчёт! ⚡`;
    }
    if (capturesCount === 1) {
      const arr = [
        `Тактический размен ${moveNotation} — диагонали вскрываются для манёвра.`,
        `Точное взятие ${moveNotation}! Ни малейшей пощады к открытым полям.`,
        `Удар ${moveNotation} меняет структуру центра в дисциплине «${ruleName}».`
      ];
      return arr[(moveNumber + capturesCount) % arr.length];
    }
    if (moveNumber <= 4) {
      const opens = [
        `Дебютный ход ${moveNotation}: классическая борьба за центральные поля доски.`,
        `Ход ${moveNotation} — крепкое развитие фланга с подготовкой связки.`,
        `Спокойное начало (${moveNotation}). Оба игрока выстраивают ударные колонны.`
      ];
      return opens[moveNumber % opens.length];
    }
    const mids = [
      `Позиционный манёвр ${moveNotation}: создаётся скрытая угроза прорыва по флангу.`,
      `Ход ${moveNotation} сковывает фигуры соперника — отличная профилактика!`,
      `Тонкий темповый ход ${moveNotation}. Главное — не угодить в ответную ловушку!`,
      `Напряжение растёт после ${moveNotation} (баланс материала: ${materialDiff >= 0 ? '+' + materialDiff : materialDiff}).`
    ];
    return mids[moveNumber % mids.length];
  }

  async function requestGeminiAIComment(payload) {
    if (state.settings.ignoreMessages || !state.settings.aiCommentary) return;
    const apiKey = (state.settings.geminiApiKey || '').trim();
    const preferredModel = (state.settings.geminiModel || 'gemini-2.5-flash').trim();

    // 1. Try direct Google Gemini REST API if user entered a free Gemini API key
    if (apiKey && apiKey.length >= 20) {
      const prompt = payload.eventType === 'chat'
        ? `Ты — гроссмейстер и комментатор в игре «Шашки Pro». Игрок написал в чате: "${payload.playerMessage}". Правила: ${payload.ruleName}, ход №${payload.moveNumber}. Ответь остроумно, дружелюбно и по-шашечному на русском языке (1 короткое предложение до 130 символов, без маркдауна).`
        : `Ты — гроссмейстер-комментатор в игре «Шашки Pro» (${payload.ruleName}). Сделан ход №${payload.moveNumber}: ${payload.moveNotation} (${payload.turnColor === 'w' ? 'Белые' : 'Чёрные'}). Взято шашек: ${payload.capturesCount}. Дамка: ${payload.promotes ? 'Да' : 'Нет'}. Дай живой комментарий к этому ходу на русском языке (1 короткое предложение до 125 символов, без кавычек и звездочек).`;

      const modelsToTry = Array.from(new Set([
        preferredModel,
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
        'gemini-1.5-flash'
      ]));

      for (const modelName of modelsToTry) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;
          const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 80, temperature: 0.75 }
            })
          });
          if (resp.ok) {
            const data = await resp.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (text) {
              appendChat('🤖 Gemini ИИ', text.replace(/[*"]/g, ''), false, true);
              return;
            }
          }
        } catch (_) {}
      }
    }

    // 2. Try Server Proxy (/api/ai/comment) if server is online
    if (net.serverOnline) {
      try {
        const resp = await fetch('/api/ai/comment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, apiKey, model: preferredModel })
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data?.comment) {
            appendChat('🤖 Gemini ИИ', data.comment, false, true);
            return;
          }
        }
      } catch (_) {}
    }

    // 3. Always-working built-in Grandmaster AI fallback
    const fallbackText = generateLocalGrandmasterComment(payload);
    appendChat('🤖 Gemini ИИ', fallbackText, false, true);
  }

  /* ======================== CHECKERS RULES ENGINE ======================== */
  function createInitialBoard(rule) {
    const N = rule.size;
    const board = Array.from({ length: N }, () => Array(N).fill(null));
    let idCounter = 1;
    if (rule.orthogonal) {
      for (let r = 1; r <= 2; r++) for (let c = 0; c < N; c++) board[r][c] = { color: 'b', king: false, id: idCounter++ };
      for (let r = N - 3; r <= N - 2; r++) for (let c = 0; c < N; c++) board[r][c] = { color: 'w', king: false, id: idCounter++ };
    } else {
      for (let r = 0; r < rule.rows; r++) for (let c = 0; c < N; c++) if ((r + c) % 2 === 1) board[r][c] = { color: 'b', king: false, id: idCounter++ };
      for (let r = N - rule.rows; r < N; r++) for (let c = 0; c < N; c++) if ((r + c) % 2 === 1) board[r][c] = { color: 'w', king: false, id: idCounter++ };
    }
    return board;
  }

  function cloneBoard(board) {
    return board.map(row => row.map(cell => (cell ? { ...cell } : null)));
  }

  function inBounds(r, c, N) { return r >= 0 && r < N && c >= 0 && c < N; }
  function isPromoRow(r, color, N) { return (color === 'w' && r === 0) || (color === 'b' && r === N - 1); }

  function getCapturesFrom(board, r, c, piece, rule, capturedKeys = new Set(), path = [[r, c]], captures = [], kingCaps = 0, becameKingMid = false) {
    const N = rule.size;
    const color = piece.color;
    const isKing = piece.king || becameKingMid;
    const results = [];

    const dirs = rule.orthogonal
      ? (isKing ? [[-1, 0], [1, 0], [0, -1], [0, 1]] : (color === 'w' ? [[-1, 0], [0, -1], [0, 1]] : [[1, 0], [0, -1], [0, 1]]))
      : (isKing || rule.menCaptureBack ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : (color === 'w' ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]));

    for (const [dr, dc] of dirs) {
      if (isKing && rule.flyingKing) {
        let nr = r + dr, nc = c + dc;
        let foundEnemy = null;
        while (inBounds(nr, nc, N)) {
          const cell = board[nr][nc];
          const key = nr + ',' + nc;
          if (cell) {
            if (cell.color === color || capturedKeys.has(key)) break;
            if (foundEnemy) break;
            foundEnemy = { r: nr, c: nc, key, isKing: cell.king };
          } else if (foundEnemy) {
            const nextKeys = new Set(capturedKeys);
            nextKeys.add(foundEnemy.key);
            const nextPath = [...path, [nr, nc]];
            const nextCaps = [...captures, [foundEnemy.r, foundEnemy.c]];
            const nextKingCaps = kingCaps + (foundEnemy.isKing ? 1 : 0);
            const sub = getCapturesFrom(board, nr, nc, piece, rule, nextKeys, nextPath, nextCaps, nextKingCaps, becameKingMid);
            if (sub.length > 0) results.push(...sub);
            else results.push({
              from: path[0], to: [nr, nc], path: nextPath, captures: nextCaps,
              promotes: !piece.king && (becameKingMid || isPromoRow(nr, color, N)),
              kingCapturesCount: nextKingCaps
            });
          }
          nr += dr; nc += dc;
        }
      } else {
        const mr = r + dr, mc = c + dc;
        const lr = r + dr * 2, lc = c + dc * 2;
        if (!inBounds(lr, lc, N)) continue;
        const mid = board[mr][mc];
        const land = board[lr][lc];
        const mKey = mr + ',' + mc;
        if (mid && mid.color !== color && !capturedKeys.has(mKey) && (!land || (lr === path[0][0] && lc === path[0][1]))) {
          const nextKeys = new Set(capturedKeys);
          nextKeys.add(mKey);
          const nextPath = [...path, [lr, lc]];
          const nextCaps = [...captures, [mr, mc]];
          const nextKingCaps = kingCaps + (mid.king ? 1 : 0);
          const touchesPromo = !isKing && isPromoRow(lr, color, N);

          if (touchesPromo && rule.id === 'english') {
            results.push({ from: path[0], to: [lr, lc], path: nextPath, captures: nextCaps, promotes: true, kingCapturesCount: nextKingCaps });
          } else {
            const nextMidKing = becameKingMid || (touchesPromo && rule.promoteMidJump);
            const sub = getCapturesFrom(board, lr, lc, piece, rule, nextKeys, nextPath, nextCaps, nextKingCaps, nextMidKing);
            if (sub.length > 0) results.push(...sub);
            else results.push({
              from: path[0], to: [lr, lc], path: nextPath, captures: nextCaps,
              promotes: !piece.king && (nextMidKing || isPromoRow(lr, color, N)),
              kingCapturesCount: nextKingCaps
            });
          }
        }
      }
    }
    return results;
  }

  function getQuietMovesFrom(board, r, c, piece, rule) {
    const N = rule.size;
    const moves = [];
    const color = piece.color;
    const dirs = rule.orthogonal
      ? (piece.king ? [[-1, 0], [1, 0], [0, -1], [0, 1]] : (color === 'w' ? [[-1, 0], [0, -1], [0, 1]] : [[1, 0], [0, -1], [0, 1]]))
      : (piece.king ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : (color === 'w' ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]));

    for (const [dr, dc] of dirs) {
      if (piece.king && rule.flyingKing) {
        let nr = r + dr, nc = c + dc;
        while (inBounds(nr, nc, N) && !board[nr][nc]) {
          moves.push({ from: [r, c], to: [nr, nc], path: [[r, c], [nr, nc]], captures: [], promotes: false, kingCapturesCount: 0 });
          nr += dr; nc += dc;
        }
      } else {
        const nr = r + dr, nc = c + dc;
        if (inBounds(nr, nc, N) && !board[nr][nc]) {
          moves.push({ from: [r, c], to: [nr, nc], path: [[r, c], [nr, nc]], captures: [], promotes: !piece.king && isPromoRow(nr, color, N), kingCapturesCount: 0 });
        }
      }
    }
    return moves;
  }

  function getAllLegalMoves(board, color, rule) {
    const N = rule.size;
    let captures = [];
    let quiet = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const p = board[r][c];
        if (!p || p.color !== color) continue;
        board[r][c] = null;
        const caps = getCapturesFrom(board, r, c, p, rule);
        board[r][c] = p;
        if (caps.length) captures.push(...caps);
        else if (captures.length === 0) quiet.push(...getQuietMovesFrom(board, r, c, p, rule));
      }
    }
    if (captures.length > 0) {
      if (rule.majorityCapture) {
        const maxLen = Math.max(...captures.map(m => m.captures.length));
        captures = captures.filter(m => m.captures.length === maxLen);
        if (rule.id === 'spanish') {
          const maxK = Math.max(...captures.map(m => m.kingCapturesCount));
          captures = captures.filter(m => m.kingCapturesCount === maxK);
        }
      }
      return captures;
    }
    return quiet;
  }

  function applyMoveToBoard(board, move) {
    const next = cloneBoard(board);
    const [fr, fc] = move.from;
    const [tr, tc] = move.to;
    const piece = next[fr][fc];
    if (!piece) return next;
    next[fr][fc] = null;
    for (const [cr, cc] of move.captures) next[cr][cc] = null;
    next[tr][tc] = { ...piece, king: piece.king || move.promotes };
    return next;
  }

  function squareToNotation(r, c, N) { return String.fromCharCode(97 + c) + (N - r); }
  function formatMoveNotation(move, N) {
    const sep = move.captures.length > 0 ? ':' : '-';
    return move.path.map(([r, c]) => squareToNotation(r, c, N)).join(sep);
  }

  /* ======================== 5-LEVEL AI ENGINE WITH REALISTIC PERSONALITIES & MISTAKES ======================== */
  function evaluateBoard(board, aiColor, rule, difficulty = 3) {
    const N = rule.size;
    let score = 0;
    let aiPieces = 0, oppPieces = 0;
    let aiKings = 0, oppKings = 0;

    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const p = board[r][c];
        if (!p) continue;
        const isAI = p.color === aiColor;
        if (isAI) { aiPieces++; if (p.king) aiKings++; }
        else { oppPieces++; if (p.king) oppKings++; }

        // Base material value
        let val = p.king ? (difficulty >= 4 ? 355 : 320) : 100;

        // Forward advancement
        const adv = p.color === 'w' ? (N - 1 - r) : r;
        if (!p.king) {
          val += adv * (difficulty === 1 ? 3 : 8);
          // Near-promotion threat bonus for levels 3..5
          if (difficulty >= 3 && adv >= N - 2) val += 22;
        }

        // Center control (Level 1 ignores center; Levels 3..5 strongly fight for center)
        if (difficulty >= 2) {
          const centerDist = Math.abs(c - (N - 1) / 2) + Math.abs(r - (N - 1) / 2);
          const centerWeight = difficulty >= 4 ? 6 : 3.5;
          val += Math.max(0, (N / 2 - centerDist) * centerWeight);
        }

        // Back-row defense & "Golden Checker" (Золотая шашка) for Levels 3..5
        if (difficulty >= 3 && !p.king) {
          const isBackRow = (p.color === 'w' && r === N - 1) || (p.color === 'b' && r === 0);
          if (isBackRow) {
            val += difficulty >= 4 ? 18 : 11;
            // Central back-row "golden" square
            if (c >= 2 && c <= N - 3) val += difficulty >= 4 ? 14 : 6;
          }
        }

        // Main diagonal control for Kings on Levels 4..5
        if (difficulty >= 4 && p.king && r === c) {
          val += 24;
        }

        // Level 1 beginner quirk: slightly overvalues edge squares and leaves center gaps
        if (difficulty === 1 && (c === 0 || c === N - 1)) {
          val += 9;
        }

        score += isAI ? val : -val;
      }
    }

    // Endgame exchange incentive for Levels 4..5 when ahead in material
    if (difficulty >= 4 && aiPieces + oppPieces <= 8 && aiPieces !== oppPieces) {
      const ahead = aiPieces > oppPieces;
      score += ahead ? (20 - oppPieces * 3) : -(20 - aiPieces * 3);
    }

    return rule.giveaway ? -score : score;
  }

  function chooseAIMove(board, color, rule, difficulty = 3) {
    const moves = getAllLegalMoves(board, color, rule);
    if (moves.length === 0) return null;
    if (moves.length === 1) return moves[0];

    const lv = Math.max(1, Math.min(5, Number(difficulty) || 3));
    const profile = AI_BOT_PROFILES[lv] || AI_BOT_PROFILES[3];
    const maxDepth = profile.depth;
    const deadline = performance.now() + (lv === 5 ? 850 : (lv === 4 ? 600 : 350));

    function minimax(b, depth, alpha, beta, maximizing, curColor, extendCaptures) {
      if (performance.now() > deadline) return evaluateBoard(b, color, rule, lv);
      const legal = getAllLegalMoves(b, curColor, rule);
      if (legal.length === 0) {
        const winScore = maximizing ? -99999 - depth : 99999 + depth;
        return rule.giveaway ? -winScore : winScore;
      }

      // Quiescence capture extension for Level 4 and 5: don't stop mid-capture chain!
      const isForcedCapture = legal[0].captures.length > 0;
      let effectiveDepth = depth;
      if (effectiveDepth <= 0) {
        if (lv >= 4 && isForcedCapture && extendCaptures > 0) {
          effectiveDepth = 1;
          extendCaptures--;
        } else {
          return evaluateBoard(b, color, rule, lv);
        }
      }

      if (lv >= 3) {
        legal.sort((a, bMove) => (bMove.captures.length * 12 + (bMove.promotes ? 7 : 0)) - (a.captures.length * 12 + (a.promotes ? 7 : 0)));
      }

      const opp = curColor === 'w' ? 'b' : 'w';
      if (maximizing) {
        let best = -Infinity;
        for (const m of legal) {
          const val = minimax(applyMoveToBoard(b, m), effectiveDepth - 1, alpha, beta, false, opp, extendCaptures);
          if (val > best) best = val;
          if (best > alpha) alpha = best;
          if (beta <= alpha) break;
        }
        return best;
      } else {
        let best = Infinity;
        for (const m of legal) {
          const val = minimax(applyMoveToBoard(b, m), effectiveDepth - 1, alpha, beta, true, opp, extendCaptures);
          if (val < best) best = val;
          if (best < beta) beta = best;
          if (beta <= alpha) break;
        }
        return best;
      }
    }

    const opp = color === 'w' ? 'b' : 'w';
    const maxExt = lv === 5 ? 3 : (lv === 4 ? 2 : 0);

    const scored = moves.map(m => {
      const nextB = applyMoveToBoard(board, m);
      let sc = minimax(nextB, maxDepth - 1, -Infinity, Infinity, false, opp, maxExt);

      // Level 1 beginner blunder simulation: sometimes doesn't notice opponent's immediate capture reply!
      if (lv === 1 && Math.random() < 0.45) {
        sc = evaluateBoard(nextB, color, rule, 1);
      }

      if (profile.noise > 0) {
        sc += (Math.random() - 0.5) * profile.noise;
      }
      return { move: m, score: sc };
    });

    scored.sort((a, b) => b.score - a.score);

    // Easy levels (1: Новичок, 2: Любитель, 3: Средний) intentionally make occasional human-like mistakes!
    if (scored.length >= 2 && profile.blunderChance > 0 && Math.random() < profile.blunderChance) {
      if (lv === 1) {
        // Beginner can pick 2nd or 3rd move (even if it drops a piece!)
        const pickIdx = Math.min(scored.length - 1, 1 + Math.floor(Math.random() * Math.min(3, scored.length - 1)));
        return scored[pickIdx].move;
      }
      if (lv === 2) {
        // Amateur picks 2nd best move if it's not an instant game loss
        return scored[1].move;
      }
      if (lv === 3 && Math.abs(scored[0].score - scored[1].score) < 65) {
        return scored[1].move;
      }
    }

    return scored[0].move;
  }

  /* ======================== LIVE GAME STATE ======================== */
  const game = {
    active: false, board: null, initialBoardSnapshot: null, turn: 'w', legalMoves: [],
    selected: null, chainPiece: null, chainOriginBoard: null, chainCapturedKeys: new Set(),
    chainCandidateMoves: [], chainStepIndex: 0,
    pendingConfirmMove: null, pendingAnimFrom: null,
    lastMove: null, hintMove: null, moveHistory: [], undoStack: [],
    liveReviewIndex: null, // null = live game; 0..moveHistory.length = viewing past board position
    flipped: false, over: false, resultText: '', startedAt: Date.now(),
    humanColor: 'w',
    isSpectator: false,
    spectatorsCount: 0,
    waitingForOpponent: false,
    sessionCapturesExp: 0,
    sessionKingsExp: 0,
    sessionComboExp: 0,
    tournamentMatchContext: null,
    opponent: { name: 'ИИ • Средний', flag: '🤖', elo: 1500, avatarIdx: 7, avatarPhoto: null, frame: 'default' },
    clocks: { w: null, b: null, inc: 0, lowAlertedW: false, lowAlertedB: false },
    clockInterval: null, aiTimeout: null,
    anim: null,
    fadingCaptures: [], // Smooth scale/fade-out animation for each captured piece as it gets eaten
    particles: [], drag: null, replay: null
  };

  /* ======================== NETWORK (SERVER SOCKET.IO + LOCAL BROADCAST RELAY + WEBRTC + BLUETOOTH) ======================== */
  const net = {
    socket: null, serverOnline: false, roomId: null,
    pc: null, dc: null, connected: false, isHost: false,
    transport: null, btDevice: null, btChar: null,
    bcChannel: null
  };

  // Local BroadcastChannel Relay so two tabs/windows can test Room Codes, Spectators, and Bluetooth PIN even if offline!
  function initLocalBroadcastRelay() {
    if (typeof BroadcastChannel !== 'function') return;
    try {
      const bc = new BroadcastChannel('checkers_pro_live_relay_v5');
      net.bcChannel = bc;
      bc.onmessage = (ev) => {
        const msg = ev.data;
        if (!msg || typeof msg !== 'object') return;
        // Only handle via BroadcastChannel if not already handled by server socket
        if (net.serverOnline && msg.viaServer) return;

        if (msg.action === 'bc_join_room' && game.waitingForOpponent && net.roomId === msg.roomId && !game.isSpectator) {
          net.transport = 'broadcast';
          net.connected = true;
          game.waitingForOpponent = false;
          document.getElementById('waitingOpponentOverlay').classList.add('hidden');
          game.opponent = msg.profile || { name: 'Игрок 2', flag: '🌍', elo: 1200, avatarIdx: 2 };
          const acc = getActiveAccount();
          bc.postMessage({
            action: 'bc_match_started',
            roomId: net.roomId,
            ruleId: state.ruleId,
            timeControl: state.settings.timeControl,
            hostProfile: { name: acc.name, flag: acc.flag, elo: acc.elo, avatarIdx: acc.avatarIdx },
            guestProfile: game.opponent
          });
          SoundFX.play('opponent_connect');
          openGameArena(true, true);
          showToast(`Подключился игрок: ${game.opponent.name}! Партия началась.`, 'success');
        } else if (msg.action === 'bc_match_started' && net.roomId === msg.roomId && !net.isHost && !game.isSpectator) {
          net.transport = 'broadcast';
          net.connected = true;
          game.waitingForOpponent = false;
          document.getElementById('waitingOpponentOverlay').classList.add('hidden');
          state.ruleId = msg.ruleId || state.ruleId;
          game.humanColor = 'b';
          game.flipped = true;
          game.opponent = msg.hostProfile || { name: 'Игрок 1', flag: '🌍', elo: 1200, avatarIdx: 0 };
          SoundFX.play('opponent_connect');
          openGameArena(true, true);
          showToast(`Вы вошли в комнату #${msg.roomId}! Соперник: ${game.opponent.name}`, 'success');
        } else if (msg.action === 'bc_spectate_join' && net.roomId === msg.roomId && net.isHost) {
          game.spectatorsCount = (game.spectatorsCount || 0) + 1;
          updateHeaderUI();
          const acc = getActiveAccount();
          bc.postMessage({
            action: 'bc_spectate_state',
            roomId: net.roomId,
            ruleId: state.ruleId,
            board: game.board,
            turn: game.turn,
            moveHistory: game.moveHistory,
            spectatorsCount: game.spectatorsCount,
            waitingForOpponent: game.waitingForOpponent,
            profiles: {
              w: { name: acc.name, flag: acc.flag, elo: acc.elo, avatarIdx: acc.avatarIdx },
              b: game.waitingForOpponent ? null : game.opponent
            }
          });
        } else if (msg.action === 'bc_spectate_state' && game.isSpectator && net.roomId === msg.roomId) {
          state.ruleId = msg.ruleId || state.ruleId;
          game.spectatorsCount = msg.spectatorsCount || 1;
          game.opponent = msg.profiles?.b || { name: 'Ожидание игрока...', flag: '⏳', elo: '---', avatarIdx: 3 };
          if (msg.board) game.board = cloneBoard(msg.board);
          if (msg.turn) game.turn = msg.turn;
          if (Array.isArray(msg.moveHistory)) game.moveHistory = msg.moveHistory;
          updateAllUI();
          drawBoard();
        } else if (msg.action === 'bc_net_msg' && net.roomId === msg.roomId && msg.senderId !== state.activeAccountId) {
          handleNetMessage(msg.payload);
        }
      };
    } catch (_) {}
  }

  function initOptionalServerBackend() {
    initLocalBroadcastRelay();
    if (typeof window.io === 'function' && window.location.protocol.startsWith('http')) {
      try {
        const sock = window.io({ reconnectionAttempts: 5, timeout: 3500 });
        sock.on('connect', () => {
          net.socket = sock;
          net.serverOnline = true;
          const badge = document.getElementById('serverModeBadge');
          if (badge) {
            badge.textContent = '● Онлайн-сервер активен';
            badge.className = 'text-[10px] text-emerald-400 mt-0.5 font-bold';
          }
          if (state.serverToken) sock.emit('auth_token', { token: state.serverToken });
          sock.emit('list_rooms');
          sock.emit('list_tournaments');
        });

        sock.on('rooms_list', (data) => {
          state.publicRooms = Array.isArray(data?.rooms) ? data.rooms : [];
          renderOnlineRoomsList();
        });

        sock.on('tournaments_list', (data) => {
          if (Array.isArray(data?.tournaments) && data.tournaments.length > 0) {
            state.liveTournaments = data.tournaments;
            renderTournamentsUI();
          }
        });

        sock.on('room_created', (data) => {
          net.roomId = data.roomId;
          net.transport = 'server';
          net.isHost = true;
          net.connected = false;
          game.isSpectator = false;
          game.waitingForOpponent = true;
          const statusEl = document.getElementById('serverRoomStatus');
          if (statusEl) statusEl.textContent = `Комната #${data.roomId} создана! Ожидаем подключения соперника...`;
          const btStatusEl = document.getElementById('btPinStatus');
          if (btStatusEl && data.mode === 'bluetooth') btStatusEl.textContent = `Bluetooth PIN: ${data.roomId} — введите на втором устройстве!`;
          openWaitingRoomArena(data.roomId, data.mode === 'bluetooth' ? 'Ожидание Bluetooth-устройства по PIN...' : 'Ожидание реального игрока по коду...');
          copyToClipboard(data.roomId);
        });

        sock.on('matchmaking_waiting', () => {
          net.transport = 'server';
          game.isSpectator = false;
          game.waitingForOpponent = true;
          openWaitingRoomArena('ПОИСК...', 'Поиск реального соперника в очереди...');
        });

        sock.on('match_found', (data) => {
          net.transport = 'server';
          net.connected = true;
          net.roomId = data.roomId;
          game.isSpectator = false;
          game.waitingForOpponent = false;
          game.spectatorsCount = Number(data.spectatorsCount) || 0;
          document.getElementById('waitingOpponentOverlay').classList.add('hidden');
          state.mode = data.mode === 'bluetooth' ? 'bluetooth' : 'online';
          state.ruleId = data.ruleId || state.ruleId;
          game.humanColor = data.color;
          game.flipped = data.color === 'b';
          game.opponent = data.opponent || { name: 'Реальный игрок', flag: '🌍', elo: 1200, avatarIdx: 3 };
          SoundFX.play('opponent_connect');
          openGameArena(true, true);
          showToast(`Матч начался! Ваш соперник: ${game.opponent.name}`, 'success');
        });

        sock.on('spectator_joined', (data) => {
          net.transport = 'server';
          net.connected = true;
          net.roomId = data.roomId;
          game.isSpectator = true;
          game.waitingForOpponent = Boolean(data.waitingForOpponent);
          game.spectatorsCount = Number(data.spectatorsCount) || 1;
          state.mode = 'online';
          state.ruleId = data.ruleId || state.ruleId;
          game.humanColor = 'w';
          game.flipped = false;
          game.opponent = data.profiles?.b || { name: 'Ожидание 2-го игрока...', flag: '⏳', elo: 1200, avatarIdx: 3 };
          openGameArena(true, true);
          if (data.boardState?.board) {
            game.board = cloneBoard(data.boardState.board);
            game.turn = data.boardState.turn || 'w';
            game.moveHistory = Array.isArray(data.boardState.moveHistory) ? data.boardState.moveHistory : [];
          }
          updateAllUI();
          drawBoard();
          showToast(`👁 Вы вошли в комнату #${data.roomId} как зритель!`, 'info');
        });

        sock.on('spectator_match_started', (data) => {
          if (!game.isSpectator) return;
          game.waitingForOpponent = false;
          game.opponent = data.profiles?.b || game.opponent;
          game.spectatorsCount = Number(data.spectatorsCount) || game.spectatorsCount;
          document.getElementById('waitingOpponentOverlay').classList.add('hidden');
          updateAllUI();
          drawBoard();
          showToast('Второй игрок подключился! Партия началась.', 'success');
        });

        sock.on('spectators_update', (data) => {
          game.spectatorsCount = Number(data.spectatorsCount) || 0;
          updateHeaderUI();
          if (data.spectatorName && !game.isSpectator) {
            showToast(`👁 Зритель ${data.spectatorName} присоединился к просмотру (${game.spectatorsCount})`, 'info');
          }
        });

        sock.on('room_error', (data) => {
          if (data?.canSpectate && data?.roomId) {
            openModal('Комната уже играет', `${escapeHtml(data.message)}`, [
              { label: 'Отмена', cls: 'card border', onClick: closeModal },
              {
                label: '👁 Войти как зритель', cls: 'accent-bg', onClick: () => {
                  closeModal();
                  joinRoomByCode(data.roomId, true);
                }
              }
            ]);
            return;
          }
          showToast(data?.message || 'Ошибка комнаты', 'error');
        });

        sock.on('tournament_error', (data) => showToast(data?.message || 'Ошибка турнира', 'error'));
        sock.on('net_msg', (msg) => handleNetMessage(msg));
        sock.on('opponent_left', () => {
          SoundFX.play('opponent_disconnect');
          if (game.isSpectator) {
            showToast('Один из игроков покинул комнату', 'info');
            return;
          }
          if (!game.over && net.transport === 'server' && !game.waitingForOpponent) {
            finishGame(game.humanColor, 'Соперник покинул партию');
          }
        });
      } catch (_) {}
    }
  }

  function openWaitingRoomArena(codeText, titleText) {
    game.waitingForOpponent = true;
    openGameArena(true, true);
    game.waitingForOpponent = true;
    const overlay = document.getElementById('waitingOpponentOverlay');
    document.getElementById('waitingOverlayTitle').textContent = titleText || 'Ожидание реального соперника...';
    document.getElementById('waitingCodeBox').textContent = codeText || '----';
    overlay.classList.remove('hidden');
    SoundFX.play('invite');
  }

  function createOnlineOrBluetoothRoom(mode = 'online') {
    if (isCurrentUserGuest()) {
      promptGuestRegistrationForFeature('Создание комнат, приглашение друзей и игра с реальными пользователями');
      return;
    }
    const acc = getActiveAccount();
    state.mode = mode;
    game.isSpectator = false;
    if (net.serverOnline && net.socket) {
      net.socket.emit('create_room', {
        ruleId: state.ruleId,
        timeControl: state.settings.timeControl,
        mode,
        name: acc.name,
        elo: acc.elo,
        flag: acc.flag,
        avatarIdx: acc.avatarIdx
      });
      return;
    }
    // Offline / Cross-tab BroadcastChannel real room code waiting (never starts a fake bot!)
    const code = String(Math.floor(1000 + Math.random() * 9000));
    net.roomId = code;
    net.isHost = true;
    net.transport = 'broadcast';
    net.connected = false;
    game.humanColor = 'w';
    game.flipped = false;
    openWaitingRoomArena(code, mode === 'bluetooth' ? 'Ожидание Bluetooth-подключения по PIN...' : 'Ожидание реального соперника по коду...');
    copyToClipboard(code);
  }

  function joinRoomByCode(rawCode, asSpectator = false) {
    if (isCurrentUserGuest()) {
      promptGuestRegistrationForFeature('Вход в комнаты по коду и игра с реальными пользователями');
      return;
    }
    const code = String(rawCode || '').trim().toUpperCase();
    if (!code) {
      showToast('Введите код комнаты', 'error');
      return;
    }
    const acc = getActiveAccount();
    if (net.serverOnline && net.socket) {
      net.socket.emit('join_room', {
        roomId: code,
        asSpectator,
        name: acc.name,
        elo: acc.elo,
        flag: acc.flag,
        avatarIdx: acc.avatarIdx
      });
      return;
    }
    // Cross-tab BroadcastChannel fallback
    if (net.bcChannel) {
      net.roomId = code;
      net.isHost = false;
      net.transport = 'broadcast';
      if (asSpectator) {
        game.isSpectator = true;
        game.waitingForOpponent = false;
        openGameArena(true, true);
        net.bcChannel.postMessage({
          action: 'bc_spectate_join',
          roomId: code,
          profile: { name: acc.name, flag: acc.flag, elo: acc.elo, avatarIdx: acc.avatarIdx }
        });
        showToast(`👁 Подключение к комнате #${code} в режиме зрителя...`, 'info');
      } else {
        game.isSpectator = false;
        net.bcChannel.postMessage({
          action: 'bc_join_room',
          roomId: code,
          profile: { name: acc.name, flag: acc.flag, elo: acc.elo, avatarIdx: acc.avatarIdx }
        });
        showToast(`Подключение к комнате #${code}...`, 'info');
      }
    }
  }

  function resetNetwork() {
    if (net.dc) { try { net.dc.close(); } catch (_) {} }
    if (net.pc) { try { net.pc.close(); } catch (_) {} }
    if (net.btDevice && net.btDevice.gatt?.connected) { try { net.btDevice.gatt.disconnect(); } catch (_) {} }
    if (net.socket && net.roomId) { try { net.socket.emit('leave_room', { roomId: net.roomId }); } catch (_) {} }
    if (net.socket && game.waitingForOpponent) { try { net.socket.emit('cancel_find_match'); } catch (_) {} }
    net.pc = null; net.dc = null; net.connected = false; net.transport = null; net.roomId = null; net.btDevice = null; net.btChar = null;
    game.waitingForOpponent = false;
    game.isSpectator = false;
    game.spectatorsCount = 0;
    const wOv = document.getElementById('waitingOpponentOverlay');
    if (wOv) wOv.classList.add('hidden');
  }

  function sendNetMessage(payload) {
    if (net.transport === 'server' && net.socket && net.roomId) {
      net.socket.emit('net_msg', { roomId: net.roomId, payload });
      return;
    }
    if (net.transport === 'broadcast' && net.bcChannel && net.roomId) {
      net.bcChannel.postMessage({
        action: 'bc_net_msg',
        roomId: net.roomId,
        senderId: state.activeAccountId,
        payload
      });
      return;
    }
    const str = JSON.stringify(payload);
    if (net.transport === 'webrtc' && net.dc && net.dc.readyState === 'open') {
      net.dc.send(str);
    } else if (net.transport === 'bluetooth' && net.btChar) {
      try { net.btChar.writeValue(new TextEncoder().encode(str)).catch(() => {}); } catch (_) {}
    }
  }

  function handleNetMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'move') {
      const rule = RULESETS[state.ruleId];
      game.legalMoves = getAllLegalMoves(game.board, game.turn, rule);
      const matched = game.legalMoves.find(m =>
        m.from[0] === msg.move.from[0] && m.from[1] === msg.move.from[1] &&
        m.to[0] === msg.move.to[0] && m.to[1] === msg.move.to[1] &&
        m.captures.length === msg.move.captures.length
      );
      if (matched) {
        executeCompleteMove(matched, true);
      } else if (msg.boardAfter) {
        game.board = cloneBoard(msg.boardAfter);
        game.turn = msg.nextTurn || (game.turn === 'w' ? 'b' : 'w');
        game.legalMoves = getAllLegalMoves(game.board, game.turn, rule);
        updateAllUI();
        drawBoard();
      }
    } else if (msg.type === 'chat') {
      if (state.settings.ignoreMessages) return;
      const sender = msg.isSpectator ? `👁 ${msg.senderName || 'Зритель'}` : (msg.senderName || game.opponent.name);
      appendChat(sender, String(msg.text || '').slice(0, 160), false);
    } else if (msg.type === 'emote') {
      if (state.settings.ignoreEmojis) return;
      triggerFloatingEmote(String(msg.emote || '👋').slice(0, 4), 'top');
    } else if (msg.type === 'resign') {
      SoundFX.play('opponent_disconnect');
      finishGame(game.isSpectator ? (game.turn === 'w' ? 'b' : 'w') : game.humanColor, 'Соперник сдался!');
    } else if (msg.type === 'draw_offer' && !game.isSpectator) {
      SoundFX.play('invite');
      openModal('Предложение ничьей', `${escapeHtml(game.opponent.name)} предлагает ничью. Принять?`, [
        { label: 'Отклонить', cls: 'card border', onClick: () => { sendNetMessage({ type: 'draw_decline' }); closeModal(); } },
        { label: 'Принять ничью', cls: 'accent-bg', onClick: () => { sendNetMessage({ type: 'draw_accept' }); closeModal(); finishGame('draw', 'Ничья по соглашению'); } }
      ]);
    } else if (msg.type === 'draw_accept') {
      finishGame('draw', 'Ничья по соглашению');
    } else if (msg.type === 'draw_decline') {
      showToast('Соперник отклонил ничью', 'info');
    } else if (msg.type === 'hello') {
      game.opponent = { name: String(msg.name || 'Друг').slice(0, 20), flag: msg.flag || '🌍', elo: Number(msg.elo) || 1200, avatarIdx: Number(msg.avatarIdx) || 2, avatarPhoto: null };
      game.waitingForOpponent = false;
      document.getElementById('waitingOpponentOverlay').classList.add('hidden');
      SoundFX.play('opponent_connect');
      updatePlayerBars();
      showToast(`Подключён игрок: ${game.opponent.name}`, 'success');
    }
  }

  async function initP2PConnection(isHost) {
    resetNetwork();
    net.isHost = isHost;
    net.transport = 'webrtc';
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    net.pc = pc;
    const setupChannel = (dc) => {
      net.dc = dc;
      dc.onopen = () => {
        net.connected = true;
        game.waitingForOpponent = false;
        document.getElementById('waitingOpponentOverlay').classList.add('hidden');
        const acc = getActiveAccount();
        sendNetMessage({ type: 'hello', name: acc.name, flag: acc.flag, elo: acc.elo, avatarIdx: acc.avatarIdx });
        state.mode = 'online';
        game.humanColor = net.isHost ? 'w' : 'b';
        game.flipped = game.humanColor === 'b';
        SoundFX.play('opponent_connect');
        openGameArena(true, true);
        showToast('P2P-соединение установлено! Партия началась.', 'success');
      };
      dc.onmessage = (e) => { try { handleNetMessage(JSON.parse(e.data)); } catch (_) {} };
      dc.onclose = () => { net.connected = false; SoundFX.play('opponent_disconnect'); updateConnectionBanner(); showToast('Соединение P2P закрыто', 'info'); };
    };
    if (isHost) setupChannel(pc.createDataChannel('checkers'));
    else pc.ondatachannel = (e) => setupChannel(e.channel);
    return pc;
  }

  function waitIceComplete(pc) {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') return resolve();
      const timeout = setTimeout(resolve, 2500);
      pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') { clearTimeout(timeout); resolve(); } };
    });
  }

  /* ======================== PAGE NAVIGATION & RESUME GAME FROM SAME SPOT ======================== */
  function saveLiveMatchSnapshot() {
    if (game.over || game.replay || game.isSpectator || game.waitingForOpponent || !game.active) return;
    state.savedGameSnapshot = {
      over: false,
      savedAt: Date.now(),
      ruleId: state.ruleId,
      mode: state.mode,
      aiDifficulty: state.aiDifficulty,
      playAssistMode: state.settings.playAssistMode || 'rethink',
      board: cloneBoard(game.board),
      initialBoardSnapshot: game.initialBoardSnapshot ? cloneBoard(game.initialBoardSnapshot) : null,
      turn: game.turn,
      humanColor: game.humanColor,
      flipped: game.flipped,
      lastMove: game.lastMove,
      moveHistory: game.moveHistory,
      undoStack: game.undoStack,
      clocks: { ...game.clocks },
      opponent: { ...game.opponent },
      sessionCapturesExp: game.sessionCapturesExp || 0,
      sessionKingsExp: game.sessionKingsExp || 0,
      sessionComboExp: game.sessionComboExp || 0,
      startedAt: game.startedAt || Date.now()
    };
  }

  function resumeSavedMatchFromSnapshot() {
    if (game.active && !game.over && !game.replay && game.moveHistory.length > 0) {
      openGameArena(false, true);
      return;
    }
    const snap = state.savedGameSnapshot;
    if (!snap || snap.over || !Array.isArray(snap.board)) {
      showToast('Нет незавершённой партии для продолжения', 'info');
      return;
    }
    if (isCurrentUserGuest() && snap.mode && snap.mode !== 'ai') {
      snap.mode = 'ai';
    }
    state.ruleId = RULESETS[snap.ruleId] ? snap.ruleId : 'russian';
    state.mode = snap.mode || 'ai';
    if (snap.aiDifficulty) state.aiDifficulty = Number(snap.aiDifficulty) || 2;
    const rule = RULESETS[state.ruleId];

    game.active = true;
    game.over = false;
    game.replay = null;
    game.liveReviewIndex = null;
    game.isSpectator = false;
    game.waitingForOpponent = false;
    game.board = cloneBoard(snap.board);
    game.initialBoardSnapshot = snap.initialBoardSnapshot ? cloneBoard(snap.initialBoardSnapshot) : createInitialBoard(rule);
    game.turn = snap.turn || 'w';
    game.humanColor = snap.humanColor || 'w';
    game.flipped = Boolean(snap.flipped);
    game.lastMove = snap.lastMove || null;
    game.moveHistory = Array.isArray(snap.moveHistory) ? snap.moveHistory : [];
    game.undoStack = Array.isArray(snap.undoStack) ? snap.undoStack : [];
    game.clocks = snap.clocks || { w: 300, b: 300, inc: 3, lowAlertedW: false, lowAlertedB: false };
    game.opponent = snap.opponent || { name: '🤖 Бот ИИ', flag: '🤖', elo: 1200, avatarIdx: 3 };
    game.sessionCapturesExp = Number(snap.sessionCapturesExp) || 0;
    game.sessionKingsExp = Number(snap.sessionKingsExp) || 0;
    game.sessionComboExp = Number(snap.sessionComboExp) || 0;
    game.startedAt = snap.startedAt || Date.now();
    game.selected = null;
    clearChainState(false);
    game.hintMove = null;
    game.anim = null;
    game.legalMoves = getAllLegalMoves(game.board, game.turn, rule);

    document.getElementById('replayBanner').classList.add('hidden');
    document.getElementById('liveReviewBanner').classList.add('hidden');
    document.getElementById('spectatorModeBanner').classList.add('hidden');
    document.getElementById('waitingOpponentOverlay').classList.add('hidden');

    state.currentPage = 'arena';
    document.body.classList.add('arena-lock');
    document.getElementById('lobbyShell').classList.add('hidden');
    document.getElementById('gameArenaPage').classList.remove('hidden');
    window.scrollTo(0, 0);

    updateAllUI();
    requestAnimationFrame(resizeCanvas);
    startClockLoop();
    maybeTriggerOpponentTurn();
    showToast(`Партия продолжена с того же места (ход #${game.moveHistory.length})!`, 'success');
  }

  function openGameArena(startFresh = true, keepNetwork = false) {
    if (isCurrentUserGuest() && state.mode !== 'ai') {
      state.mode = 'ai';
      renderModesAndRulesUI();
      promptGuestRegistrationForFeature('Игра с реальными пользователями, создание комнат и приглашение друзей');
      return;
    }
    // If user clicked "Играть сейчас" while in Online or Bluetooth mode and NOT yet connected, create a real waiting room with code!
    if ((state.mode === 'online' || state.mode === 'bluetooth') && !net.connected && !game.waitingForOpponent && !keepNetwork) {
      createOnlineOrBluetoothRoom(state.mode);
      return;
    }
    state.currentPage = 'arena';
    document.body.classList.add('arena-lock');
    document.getElementById('lobbyShell').classList.add('hidden');
    document.getElementById('gameArenaPage').classList.remove('hidden');
    window.scrollTo(0, 0);
    if (startFresh || !game.active) {
      startNewGame(keepNetwork);
    } else {
      updateAllUI();
      requestAnimationFrame(resizeCanvas);
    }
  }

  function openLobbyPage(tabId = 'home') {
    state.currentPage = 'lobby';
    document.body.classList.remove('arena-lock');
    document.getElementById('mobileEmojiSheet').classList.add('hidden');
    document.getElementById('mobileChatSheet').classList.add('hidden');
    document.getElementById('gameArenaPage').classList.add('hidden');
    document.getElementById('lobbyShell').classList.remove('hidden');
    switchTab(tabId);
    updateLobbyResumeButtons();
    window.scrollTo(0, 0);
  }

  function updateLobbyResumeButtons() {
    const hasLiveOrSaved = (game.active && !game.over && !game.replay && game.moveHistory.length > 0) ||
      (state.savedGameSnapshot && !state.savedGameSnapshot.over && Array.isArray(state.savedGameSnapshot.board));
    document.getElementById('resumeGameSidebarBtn').classList.toggle('hidden', !hasLiveOrSaved);
    document.getElementById('resumeGameMobileBtn').classList.toggle('hidden', !hasLiveOrSaved);

    const resumeBanner = document.getElementById('savedMatchResumeBanner');
    if (resumeBanner) {
      resumeBanner.classList.toggle('hidden', !hasLiveOrSaved);
      if (hasLiveOrSaved) {
        const snap = (game.active && !game.over && !game.replay && game.moveHistory.length > 0)
          ? { ruleId: state.ruleId, opponent: game.opponent, moveHistory: game.moveHistory, turn: game.turn }
          : state.savedGameSnapshot;
        const ruleName = RULESETS[snap?.ruleId]?.name || 'Русские шашки';
        const oppName = snap?.opponent?.name || 'Бот ИИ';
        const movesCnt = Array.isArray(snap?.moveHistory) ? snap.moveHistory.length : 0;
        const turnTxt = snap?.turn === 'b' ? 'Ход чёрных' : 'Ход белых';
        const descEl = document.getElementById('savedMatchResumeDesc');
        if (descEl) {
          descEl.textContent = `${ruleName} против «${oppName}» • Сделано ходов: ${movesCnt} (${turnTxt})`;
        }
      }
    }

    const guestBanner = document.getElementById('guestStatusBanner');
    if (guestBanner) {
      const isGuest = isCurrentUserGuest();
      guestBanner.classList.toggle('hidden', !isGuest);
      if (isGuest) {
        const acc = getActiveAccount();
        const nameEl = document.getElementById('guestBannerNickname');
        if (nameEl) nameEl.textContent = acc.name;
      }
    }
  }

  /* ======================== ZERO-SCROLL DYNAMIC CANVAS & 72+ SKINS RENDERER ======================== */
  const canvas = document.getElementById('boardCanvas');
  const ctx = canvas.getContext('2d');
  let boardPx = 400;
  let marginPx = 22;
  let cellPx = 44;

  function resizeCanvas() {
    if (!canvas || state.currentPage !== 'arena') return;
    const col = document.getElementById('arenaBoardCol');
    const shell = document.getElementById('boardShell');
    if (!col || !shell) return;
    const colRect = col.getBoundingClientRect();
    if (colRect.width <= 0 || colRect.height <= 0) return;

    const topH = document.getElementById('topPlayerBar').offsetHeight || 46;
    const botH = document.getElementById('bottomPlayerBar').offsetHeight || 46;
    const repEl = document.getElementById('replayBanner');
    const specEl = document.getElementById('spectatorModeBanner');
    const repH = (repEl.classList.contains('hidden') ? 0 : (repEl.offsetHeight + 6)) +
                 (specEl.classList.contains('hidden') ? 0 : (specEl.offsetHeight + 6));
    const gaps = 16;

    const availH = Math.max(200, colRect.height - topH - botH - repH - gaps);
    const availW = Math.max(200, colRect.width - 4);
    const maxPref = Number(state.settings.boardSize) || 640;
    const shellSize = Math.floor(Math.min(availH, availW, maxPref));

    shell.style.width = shellSize + 'px';
    shell.style.height = shellSize + 'px';
    document.getElementById('topPlayerBar').style.maxWidth = shellSize + 'px';
    document.getElementById('bottomPlayerBar').style.maxWidth = shellSize + 'px';

    const innerPad = window.innerWidth >= 640 ? 12 : 8;
    const size = Math.max(180, shellSize - innerPad);
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.floor(size * dpr);
    canvas.height = Math.floor(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    boardPx = size;

    const rule = RULESETS[state.ruleId];
    marginPx = state.settings.showCoords ? Math.max(14, Math.round(size * 0.046)) : 5;
    cellPx = (boardPx - marginPx * 2) / rule.size;
    drawBoard();
  }

  function boardToScreen(r, c) {
    const N = RULESETS[state.ruleId].size;
    const dr = game.flipped ? (N - 1 - r) : r;
    const dc = game.flipped ? (N - 1 - c) : c;
    return { x: marginPx + dc * cellPx, y: marginPx + dr * cellPx };
  }

  function screenToBoard(px, py) {
    const N = RULESETS[state.ruleId].size;
    const dc = Math.floor((px - marginPx) / cellPx);
    const dr = Math.floor((py - marginPx) / cellPx);
    if (dr < 0 || dr >= N || dc < 0 || dc >= N) return null;
    return [game.flipped ? (N - 1 - dr) : dr, game.flipped ? (N - 1 - dc) : dc];
  }

  // Rich custom canvas texture renderer for all 36 Board Styles
  function drawSquarePattern(x, y, size, isDark, theme, r, c) {
    const pat = theme.pattern || 'classic';
    ctx.fillStyle = theme.grain || 'rgba(0,0,0,0.05)';
    if (pat === 'wood' && isDark) {
      ctx.fillRect(x, y + size * 0.18, size, size * 0.11);
      ctx.fillRect(x, y + size * 0.62, size, size * 0.08);
    } else if (pat === 'marble') {
      ctx.beginPath();
      ctx.moveTo(x + size * 0.1, y + size * 0.8);
      ctx.quadraticCurveTo(x + size * 0.5, y + size * 0.4, x + size * 0.9, y + size * 0.2);
      ctx.strokeStyle = theme.grain;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    } else if (pat === 'carbon' && isDark) {
      ctx.fillRect(x + 2, y + 2, size * 0.42, size * 0.42);
      ctx.fillRect(x + size * 0.52, y + size * 0.52, size * 0.42, size * 0.42);
    } else if (pat === 'stars' && isDark) {
      const sx = x + ((r * 17 + c * 31) % 70 + 15) * 0.01 * size;
      const sy = y + ((r * 29 + c * 13) % 70 + 15) * 0.01 * size;
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath(); ctx.arc(sx, sy, 1.3, 0, Math.PI * 2); ctx.fill();
    } else if (pat === 'lava' && isDark) {
      ctx.strokeStyle = 'rgba(249, 115, 22, 0.28)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + size * 0.15, y + size * 0.2);
      ctx.lineTo(x + size * 0.55, y + size * 0.5);
      ctx.lineTo(x + size * 0.85, y + size * 0.78);
      ctx.stroke();
    } else if (pat === 'matrix' && isDark) {
      ctx.fillStyle = 'rgba(34, 197, 94, 0.18)';
      ctx.fillRect(x + size * 0.25, y + size * 0.15, 2, size * 0.7);
      ctx.fillRect(x + size * 0.68, y + size * 0.25, 2, size * 0.5);
    } else if (pat === 'gold' && isDark) {
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.24)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 3, y + 3, size - 6, size - 6);
    } else if (pat === 'runes' && isDark) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size * 0.32, 0, Math.PI * 2);
      ctx.stroke();
    } else if (pat === 'scales' && isDark) {
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.22)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size * 0.7, size * 0.35, Math.PI, 0);
      ctx.stroke();
    } else if (isDark) {
      ctx.fillRect(x, y + size * 0.22, size, size * 0.10);
    }
  }

  // Rich custom canvas piece renderer for all 36 Piece Styles
  function drawPiece(cx, cy, radius, color, isKing, styleId, alpha = 1) {
    const st = PIECE_STYLES[styleId] || PIECE_STYLES.classic;
    const eff = st.effect || 'classic';
    ctx.save();
    ctx.globalAlpha = alpha;

    // Drop shadow / outer aura
    ctx.beginPath();
    ctx.arc(cx, cy + radius * 0.13, radius * 0.98, 0, Math.PI * 2);
    ctx.fillStyle = (eff === 'neon' || eff === 'plasma' || eff === 'dragon')
      ? (color === 'w' ? 'rgba(56,189,248,0.4)' : 'rgba(244,63,94,0.45)')
      : 'rgba(0, 0, 0, 0.38)';
    ctx.fill();

    // 3D cylinder base edge
    ctx.beginPath();
    ctx.arc(cx, cy + radius * 0.06, radius, 0, Math.PI * 2);
    ctx.fillStyle = color === 'w' ? st.wEdge : st.bEdge;
    ctx.fill();

    // Main top gradient
    const grad = ctx.createRadialGradient(cx - radius * 0.32, cy - radius * 0.34, radius * 0.1, cx, cy, radius);
    grad.addColorStop(0, color === 'w' ? st.wTop : st.bTop);
    grad.addColorStop(0.74, color === 'w' ? st.wMid : st.bMid);
    grad.addColorStop(1, color === 'w' ? st.wEdge : st.bEdge);

    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.96, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Inner rings & special effects per style
    const ringCol = color === 'w' ? st.wRing : st.bRing;
    if (eff === 'minimal') {
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.82, 0, Math.PI * 2);
      ctx.strokeStyle = color === 'w' ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (eff === 'diamond' || eff === 'frost') {
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.74, 0, Math.PI * 2);
      ctx.strokeStyle = ringCol;
      ctx.lineWidth = Math.max(1.4, radius * 0.07);
      ctx.stroke();
      // Facet polygon
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        const px = cx + Math.cos(a) * radius * 0.48;
        const py = cy + Math.sin(a) * radius * 0.48;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = ringCol;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else if (eff === 'star' || eff === 'dragon' || eff === 'goldcoin') {
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.76, 0, Math.PI * 2);
      ctx.strokeStyle = ringCol;
      ctx.lineWidth = Math.max(1.6, radius * 0.08);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.34, 0, Math.PI * 2);
      ctx.strokeStyle = ringCol;
      ctx.lineWidth = 1.3;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.72, 0, Math.PI * 2);
      ctx.strokeStyle = ringCol;
      ctx.lineWidth = Math.max(1.3, radius * 0.075);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.45, 0, Math.PI * 2);
      ctx.strokeStyle = ringCol;
      ctx.lineWidth = Math.max(1, radius * 0.05);
      ctx.stroke();
    }

    if (eff === 'crystal' || eff === 'diamond' || eff === 'plasma') {
      ctx.beginPath();
      ctx.ellipse(cx - radius * 0.25, cy - radius * 0.32, radius * 0.34, radius * 0.17, -0.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.42)';
      ctx.fill();
    }

    if (isKing) {
      const cr = radius * 0.48;
      ctx.fillStyle = color === 'w' ? st.crownW : st.crownB;
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx - cr, cy + cr * 0.55);
      ctx.lineTo(cx - cr * 0.85, cy - cr * 0.45);
      ctx.lineTo(cx - cr * 0.35, cy + cr * 0.05);
      ctx.lineTo(cx, cy - cr * 0.65);
      ctx.lineTo(cx + cr * 0.35, cy + cr * 0.05);
      ctx.lineTo(cx + cr * 0.85, cy - cr * 0.45);
      ctx.lineTo(cx + cr, cy + cr * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function getActiveTargetSquares() {
    if (!game.selected) return [];
    const [sr, sc] = game.selected;
    const moves = game.chainPiece
      ? game.chainCandidateMoves
      : game.legalMoves.filter(m => m.from[0] === sr && m.from[1] === sc);
    const stepIdx = game.chainPiece ? game.chainStepIndex + 1 : 1;
    const map = new Map();
    for (const m of moves) {
      if (stepIdx < m.path.length) {
        const pt = m.path[stepIdx];
        const key = pt[0] + ',' + pt[1];
        if (!map.has(key)) map.set(key, { r: pt[0], c: pt[1], isCapture: m.captures.length > 0 });
      }
    }
    return Array.from(map.values());
  }

  function getDisplayedBoardAndMove() {
    if (game.liveReviewIndex !== null && !game.replay) {
      const idx = Math.max(0, Math.min(game.moveHistory.length, game.liveReviewIndex));
      if (idx === 0) {
        return {
          board: game.initialBoardSnapshot || createInitialBoard(RULESETS[state.ruleId]),
          lastMove: null,
          isReview: true,
          stepIdx: 0
        };
      }
      const rec = game.moveHistory[idx - 1];
      return {
        board: rec?.boardAfter || game.board,
        lastMove: rec?.moveObj || null,
        isReview: true,
        stepIdx: idx
      };
    }
    return { board: game.board, lastMove: game.lastMove, isReview: false, stepIdx: game.moveHistory.length };
  }

  function setLiveReviewStep(stepIdx) {
    if (game.replay) return;
    const total = game.moveHistory.length;
    if (stepIdx === null || stepIdx >= total) {
      game.liveReviewIndex = null;
      document.getElementById('liveReviewBanner').classList.add('hidden');
      document.getElementById('liveRevStepLabel').textContent = 'LIVE';
    } else {
      const clamped = Math.max(0, Math.min(total, Number(stepIdx) || 0));
      game.liveReviewIndex = clamped;
      const moveNote = clamped > 0 ? game.moveHistory[clamped - 1]?.notation : 'Старт';
      document.getElementById('liveReviewBannerText').textContent = `⏪ Просмотр: ход ${clamped}/${total} (${moveNote})`;
      document.getElementById('liveReviewBanner').classList.remove('hidden');
      document.getElementById('liveRevStepLabel').textContent = `${clamped}/${total}`;
    }
    updateMoveLogUI();
    drawBoard();
  }

  function drawBoard() {
    if (!game.board || state.currentPage !== 'arena') return;
    const rule = RULESETS[state.ruleId];
    const theme = BOARD_THEMES[state.boardTheme] || BOARD_THEMES.emerald;
    const N = rule.size;
    const disp = getDisplayedBoardAndMove();
    const activeBoard = disp.board;
    const activeLastMove = disp.lastMove;

    ctx.fillStyle = theme.frame;
    ctx.fillRect(0, 0, boardPx, boardPx);

    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const { x, y } = boardToScreen(r, c);
        const isDark = (r + c) % 2 === 1;
        ctx.fillStyle = isDark ? theme.dark : theme.light;
        ctx.fillRect(x, y, cellPx, cellPx);
        drawSquarePattern(x, y, cellPx, isDark, theme, r, c);
        if (theme.gridGlow) {
          ctx.strokeStyle = theme.gridGlow;
          ctx.lineWidth = 0.85;
          ctx.strokeRect(x + 0.5, y + 0.5, cellPx - 1, cellPx - 1);
        }
      }
    }

    if (state.settings.highlightLastMove && activeLastMove && !game.replay) {
      ctx.fillStyle = theme.lastMove;
      for (const [r, c] of [activeLastMove.from, activeLastMove.to]) {
        const { x, y } = boardToScreen(r, c);
        ctx.fillRect(x, y, cellPx, cellPx);
      }
      // If multi-hop path exists, lightly highlight intermediate jump squares so player sees how it ate 2+ figures!
      if (Array.isArray(activeLastMove.path) && activeLastMove.path.length > 2) {
        ctx.save();
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.72)';
        ctx.lineWidth = Math.max(2.5, cellPx * 0.065);
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        activeLastMove.path.forEach(([pr, pc], idx) => {
          const pt = boardToScreen(pr, pc);
          const cx = pt.x + cellPx / 2, cy = pt.y + cellPx / 2;
          if (idx === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
        });
        ctx.stroke();
        ctx.restore();
      }
    }

    if (!disp.isReview && state.settings.highlightForced && !game.over && !game.replay && isHumanTurn()) {
      const forced = game.chainPiece ? game.chainCandidateMoves : game.legalMoves.filter(m => m.captures.length > 0);
      if (forced.length > 0) {
        const seen = new Set();
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = Math.max(2.5, cellPx * 0.07);
        for (const m of forced) {
          const [r, c] = game.chainPiece ? game.chainPiece : m.from;
          const k = r + ',' + c;
          if (seen.has(k)) continue;
          seen.add(k);
          const { x, y } = boardToScreen(r, c);
          ctx.strokeRect(x + 2, y + 2, cellPx - 4, cellPx - 4);
        }
      }
    }

    if (!disp.isReview && game.selected) {
      const { x, y } = boardToScreen(game.selected[0], game.selected[1]);
      ctx.fillStyle = theme.select;
      ctx.fillRect(x, y, cellPx, cellPx);
    }

    if (!disp.isReview && game.pendingConfirmMove) {
      const { x, y } = boardToScreen(game.pendingConfirmMove.to[0], game.pendingConfirmMove.to[1]);
      ctx.fillStyle = 'rgba(16, 185, 129, 0.45)';
      ctx.fillRect(x, y, cellPx, cellPx);
    }

    if (!disp.isReview && game.hintMove) {
      ctx.save();
      ctx.strokeStyle = '#10b981';
      ctx.fillStyle = '#10b981';
      ctx.lineWidth = Math.max(4, cellPx * 0.10);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      game.hintMove.path.forEach(([pr, pc], idx) => {
        const pt = boardToScreen(pr, pc);
        const cx = pt.x + cellPx / 2, cy = pt.y + cellPx / 2;
        if (idx === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
      });
      ctx.stroke();
      const lastP = game.hintMove.path[game.hintMove.path.length - 1];
      const prevP = game.hintMove.path[game.hintMove.path.length - 2];
      const a = boardToScreen(prevP[0], prevP[1]);
      const b = boardToScreen(lastP[0], lastP[1]);
      const bx = b.x + cellPx / 2, by = b.y + cellPx / 2;
      const ang = Math.atan2(by - (a.y + cellPx / 2), bx - (a.x + cellPx / 2));
      const head = cellPx * 0.28;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - head * Math.cos(ang - 0.5), by - head * Math.sin(ang - 0.5));
      ctx.lineTo(bx - head * Math.cos(ang + 0.5), by - head * Math.sin(ang + 0.5));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    if (!disp.isReview && state.settings.showHints && game.selected && !game.replay) {
      const targets = getActiveTargetSquares();
      const hStyle = state.settings.hintStyle || 'dots';
      for (const t of targets) {
        const { x, y } = boardToScreen(t.r, t.c);
        const cx = x + cellPx / 2, cy = y + cellPx / 2;
        const col = t.isCapture ? 'rgba(244, 63, 94, 0.82)' : 'rgba(16, 185, 129, 0.82)';
        if (hStyle === 'fill') {
          ctx.fillStyle = t.isCapture ? 'rgba(244, 63, 94, 0.36)' : 'rgba(16, 185, 129, 0.34)';
          ctx.fillRect(x + 2, y + 2, cellPx - 4, cellPx - 4);
        } else if (hStyle === 'rings') {
          ctx.beginPath(); ctx.arc(cx, cy, cellPx * 0.34, 0, Math.PI * 2);
          ctx.strokeStyle = col; ctx.lineWidth = Math.max(3, cellPx * 0.08); ctx.stroke();
        } else {
          ctx.beginPath(); ctx.arc(cx, cy, t.isCapture ? cellPx * 0.24 : cellPx * 0.17, 0, Math.PI * 2);
          ctx.fillStyle = col; ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.88)'; ctx.lineWidth = 2; ctx.stroke();
        }
      }
    }

    if (state.settings.showCoords) {
      ctx.fillStyle = theme.coord;
      ctx.font = `700 ${Math.max(9, Math.round(marginPx * 0.56))}px Inter, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < N; i++) {
        const colIdx = game.flipped ? (N - 1 - i) : i;
        const rowNum = game.flipped ? (i + 1) : (N - i);
        const cx = marginPx + i * cellPx + cellPx / 2;
        const cy = marginPx + i * cellPx + cellPx / 2;
        ctx.fillText(String.fromCharCode(97 + colIdx), cx, boardPx - marginPx / 2);
        ctx.fillText(String(rowNum), marginPx / 2, cy);
      }
    }

    const pieceRadius = cellPx * 0.40;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const p = activeBoard[r][c];
        if (!p) continue;
        if (!disp.isReview && game.drag && game.drag.r === r && game.drag.c === c) continue;
        if (!disp.isReview && game.anim && game.anim.hideTarget && game.anim.finalTo[0] === r && game.anim.finalTo[1] === c) continue;
        const { x, y } = boardToScreen(r, c);
        const cx = x + cellPx / 2, cy = y + cellPx / 2;
        const isCapturedMidChain = !disp.isReview && game.chainCapturedKeys.has(r + ',' + c);
        drawPiece(cx, cy, pieceRadius, p.color, p.king, state.pieceStyle, isCapturedMidChain ? 0.35 : 1);
        if (isCapturedMidChain) {
          ctx.save();
          ctx.strokeStyle = '#f43f5e'; ctx.lineWidth = Math.max(2.5, cellPx * 0.07); ctx.lineCap = 'round';
          const d = pieceRadius * 0.52;
          ctx.beginPath(); ctx.moveTo(cx - d, cy - d); ctx.lineTo(cx + d, cy + d);
          ctx.moveTo(cx + d, cy - d); ctx.lineTo(cx - d, cy + d); ctx.stroke();
          ctx.restore();
        }
      }
    }

    // Smooth Hop-by-Hop Multi-Capture Animation & Uneaten/Fading Captured Pieces
    if (!disp.isReview && game.anim) {
      const now = performance.now();
      const hops = game.anim.hops || [];
      let activeHop = hops[hops.length - 1];
      let activeHopIdx = hops.length - 1;
      for (let i = 0; i < hops.length; i++) {
        if (now <= hops[i].endWithPause) {
          activeHop = hops[i];
          activeHopIdx = i;
          break;
        }
      }

      // Draw any captured pieces on current or future hops that haven't been jumped over yet!
      for (let i = activeHopIdx; i < hops.length; i++) {
        const h = hops[i];
        if (h.capture && !h.captureTriggered) {
          const hopProgress = Math.max(0, Math.min(1, (now - h.start) / Math.max(1, h.dur)));
          if (i === activeHopIdx && hopProgress >= 0.48) {
            h.captureTriggered = true;
            spawnCaptureBurst(h.capture.r, h.capture.c);
            SoundFX.play('capture');
            vibrate(22);
            game.fadingCaptures.push({
              r: h.capture.r,
              c: h.capture.c,
              color: h.capture.color,
              king: h.capture.king,
              start: now,
              dur: 240
            });
          } else {
            const pt = boardToScreen(h.capture.r, h.capture.c);
            drawPiece(pt.x + cellPx / 2, pt.y + cellPx / 2, pieceRadius, h.capture.color, h.capture.king, state.pieceStyle, 1);
          }
        }
      }

      // Draw the moving/jumping piece on its current hop with smooth ease-in-out arc
      if (activeHop) {
        const rawT = Math.max(0, Math.min(1, (now - activeHop.start) / Math.max(1, activeHop.dur)));
        // Smooth cubic ease-in-out
        const ease = rawT < 0.5 ? 4 * rawT * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 3) / 2;
        const pA = boardToScreen(activeHop.from[0], activeHop.from[1]);
        const pB = boardToScreen(activeHop.to[0], activeHop.to[1]);
        const arcLift = activeHop.capture ? 0.30 : 0.18;
        const cx = pA.x + (pB.x - pA.x) * ease + cellPx / 2;
        const cy = pA.y + (pB.y - pA.y) * ease + cellPx / 2 - Math.sin(rawT * Math.PI) * cellPx * arcLift;
        const scaleBoost = 1 + Math.sin(rawT * Math.PI) * (activeHop.capture ? 0.12 : 0.05);
        drawPiece(cx, cy, pieceRadius * scaleBoost, game.anim.piece.color, activeHop.kingAtHop, state.pieceStyle);
      }

      const lastHop = hops[hops.length - 1];
      if (!lastHop || now >= lastHop.endWithPause) {
        const doneCb = game.anim.onComplete;
        game.anim = null;
        if (typeof doneCb === 'function') setTimeout(doneCb, 20);
      }
    }

    // Draw smoothly shrinking & fading captured pieces right after being eaten
    if (!disp.isReview && game.fadingCaptures.length > 0) {
      const now = performance.now();
      const remainingFades = [];
      for (const fc of game.fadingCaptures) {
        const t = Math.min(1, (now - fc.start) / Math.max(1, fc.dur));
        if (t < 1) {
          const pt = boardToScreen(fc.r, fc.c);
          const alpha = Math.max(0, 1 - t);
          const rad = pieceRadius * (1 - t * 0.45);
          drawPiece(pt.x + cellPx / 2, pt.y + cellPx / 2, rad, fc.color, fc.king, state.pieceStyle, alpha);
          remainingFades.push(fc);
        }
      }
      game.fadingCaptures = remainingFades;
    }

    if (!disp.isReview && game.drag) {
      drawPiece(game.drag.x, game.drag.y, pieceRadius * 1.12, game.drag.piece.color, game.drag.piece.king, state.pieceStyle, 0.94);
    }

    if (game.particles.length > 0) {
      const nextP = [];
      for (const pt of game.particles) {
        pt.x += pt.vx; pt.y += pt.vy; pt.life -= 0.045;
        if (pt.life > 0) {
          ctx.save(); ctx.globalAlpha = pt.life; ctx.fillStyle = pt.color;
          ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * pt.life, 0, Math.PI * 2); ctx.fill();
          ctx.restore(); nextP.push(pt);
        }
      }
      game.particles = nextP;
    }

    if (game.anim || game.fadingCaptures.length > 0 || game.particles.length > 0) {
      requestAnimationFrame(drawBoard);
    }
  }

  function spawnCaptureBurst(r, c) {
    const { x, y } = boardToScreen(r, c);
    const cx = x + cellPx / 2, cy = y + cellPx / 2;
    for (let i = 0; i < 12; i++) {
      const ang = (Math.PI * 2 * i) / 12 + Math.random() * 0.4;
      const spd = 1.4 + Math.random() * 2.4;
      game.particles.push({ x: cx, y: cy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, size: 3 + Math.random() * 3, color: i % 2 === 0 ? '#f59e0b' : '#f43f5e', life: 1 });
    }
  }

  function triggerFloatingEmote(emoji, side = 'bottom') {
    if (side === 'top' && state.settings.ignoreEmojis) return;
    const layer = document.getElementById('emojiOverlay');
    if (!layer) return;
    const el = document.createElement('div');
    el.className = 'emoji-float';
    el.textContent = emoji;
    const xPct = 20 + Math.random() * 60;
    el.style.left = xPct + '%';
    el.style.top = side === 'top' ? '26%' : '78%';
    layer.appendChild(el);
    SoundFX.play('emote');
    setTimeout(() => el.remove(), 1650);
  }

  /* ======================== GAMEPLAY CONTROLLER ======================== */
  function isHumanTurn() {
    if (game.over || game.replay || game.isSpectator || game.waitingForOpponent) return false;
    if (state.mode === 'local') return true;
    return game.turn === game.humanColor;
  }

  function parseTimeControl(tc) {
    if (!tc || tc === 'none') return { base: null, inc: 0 };
    const [b, i] = tc.split('+').map(Number);
    return { base: b || 300, inc: i || 0 };
  }

  function formatClock(sec) {
    if (sec === null || sec === undefined) return '∞';
    const s = Math.max(0, Math.ceil(sec));
    return `${Math.floor(s / 60)}:${s % 60 < 10 ? '0' : ''}${s % 60}`;
  }

  function startClockLoop() {
    if (game.clockInterval) clearInterval(game.clockInterval);
    if (game.clocks.w === null) return;
    let last = performance.now();
    let lastTickSecW = null;
    let lastTickSecB = null;
    game.clockInterval = setInterval(() => {
      if (game.over || game.replay || game.waitingForOpponent || state.currentPage !== 'arena') {
        last = performance.now();
        return;
      }
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      game.clocks[game.turn] -= dt;
      const curRem = game.clocks[game.turn];
      if (state.settings.lowTimeAlert && curRem <= 20 && curRem > 0) {
        if (game.turn === 'w' && !game.clocks.lowAlertedW) { game.clocks.lowAlertedW = true; SoundFX.play('low_time'); }
        if (game.turn === 'b' && !game.clocks.lowAlertedB) { game.clocks.lowAlertedB = true; SoundFX.play('low_time'); }
        // Per-second countdown tick during the last 10 seconds
        if (curRem <= 10) {
          const secCeil = Math.ceil(curRem);
          if (game.turn === 'w' && secCeil !== lastTickSecW) {
            lastTickSecW = secCeil;
            SoundFX.play('countdown_tick');
          } else if (game.turn === 'b' && secCeil !== lastTickSecB) {
            lastTickSecB = secCeil;
            SoundFX.play('countdown_tick');
          }
        }
      }
      if (game.clocks[game.turn] <= 0) {
        game.clocks[game.turn] = 0; updateClocksUI();
        finishGame(game.turn === 'w' ? 'b' : 'w', 'Время вышло!');
      } else updateClocksUI();
    }, 200);
  }

  function updateClocksUI() {
    const topColor = game.flipped ? 'w' : 'b';
    const botColor = game.flipped ? 'b' : 'w';
    const topEl = document.getElementById('topClock');
    const botEl = document.getElementById('bottomClock');
    topEl.textContent = formatClock(game.clocks[topColor]);
    botEl.textContent = formatClock(game.clocks[botColor]);
    topEl.classList.toggle('text-rose-400', game.clocks[topColor] !== null && game.clocks[topColor] < 20);
    botEl.classList.toggle('text-rose-400', game.clocks[botColor] !== null && game.clocks[botColor] < 20);
  }

  function clearChainState(restoreBoard = false) {
    if (restoreBoard && game.chainOriginBoard) game.board = cloneBoard(game.chainOriginBoard);
    game.chainPiece = null;
    game.chainOriginBoard = null;
    game.chainCapturedKeys = new Set();
    game.chainCandidateMoves = [];
    game.chainStepIndex = 0;
    document.getElementById('chainBanner').classList.add('hidden');
  }

  function setupOpponentForMode() {
    const acc = getActiveAccount();
    if (game.tournamentMatchContext) {
      game.opponent = { ...game.tournamentMatchContext.opponent };
      game.humanColor = 'w';
      game.flipped = false;
      return;
    }
    if (state.mode === 'ai') {
      const bot = AI_BOT_PROFILES[state.aiDifficulty] || AI_BOT_PROFILES[3];
      game.opponent = { name: bot.name, flag: '🤖', elo: bot.elo, avatarIdx: 7, avatarPhoto: null };
      game.humanColor = state.playerColorPref === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : state.playerColorPref;
    } else if (state.mode === 'local') {
      const p2 = document.getElementById('localP2Name').value.trim() || 'Игрок 2';
      game.opponent = { name: p2, flag: '🤝', elo: 'Вживую', avatarIdx: 2, avatarPhoto: null };
      game.humanColor = 'w';
    } else if ((state.mode === 'online' || state.mode === 'bluetooth') && !net.connected) {
      game.opponent = { name: 'Ожидание игрока...', flag: '⏳', elo: '---', avatarIdx: 3, avatarPhoto: null };
      game.humanColor = 'w';
    }
    game.flipped = game.humanColor === 'b';
    if (!acc.rulesPlayed) acc.rulesPlayed = [];
    if (!acc.rulesPlayed.includes(state.ruleId)) { acc.rulesPlayed.push(state.ruleId); persist(); }
  }

  function startNewGame(keepNetwork = false) {
    if (game.aiTimeout) clearTimeout(game.aiTimeout);
    if (game.clockInterval) clearInterval(game.clockInterval);

    const rule = RULESETS[state.ruleId];
    game.active = true;
    game.replay = null;
    game.liveReviewIndex = null;
    document.getElementById('replayBanner').classList.add('hidden');
    document.getElementById('liveReviewBanner').classList.add('hidden');
    document.getElementById('spectatorModeBanner').classList.toggle('hidden', !game.isSpectator);
    game.board = createInitialBoard(rule);
    game.initialBoardSnapshot = cloneBoard(game.board);
    game.turn = 'w';
    game.selected = null;
    clearChainState(false);
    game.pendingConfirmMove = null;
    game.pendingAnimFrom = null;
    document.getElementById('confirmMoveBar').classList.add('hidden');
    game.lastMove = null;
    game.hintMove = null;
    game.moveHistory = [];
    game.undoStack = [];
    game.over = false;
    game.resultText = '';
    game.startedAt = Date.now();
    game.sessionCapturesExp = 0;
    game.sessionKingsExp = 0;
    game.sessionComboExp = 0;
    game.anim = null;
    game.fadingCaptures = [];
    game.particles = [];

    if (!keepNetwork) setupOpponentForMode();

    const tc = parseTimeControl(state.settings.timeControl);
    game.clocks = { w: tc.base, b: tc.base, inc: tc.inc, lowAlertedW: false, lowAlertedB: false };
    game.legalMoves = getAllLegalMoves(game.board, game.turn, rule);

    document.getElementById('chatMessages').innerHTML = '';
    document.getElementById('mobileChatMessages').innerHTML = '';
    state.unreadChat = 0;
    updateChatUnreadBadges();
    const mults = getMatchEconomyMultipliers();
    appendChat('Система', `Партия началась (${rule.name} • Награды: ×${mults.totalExpMult})`, true);

    if (state.mode === 'ai' && state.settings.aiCommentary && !state.settings.ignoreMessages) {
      setTimeout(() => {
        appendChat('🤖 Gemini ИИ', `Приветствую в партии против «${game.opponent.name}»! Режим: ${mults.assist.shortName} (множитель ×${mults.totalExpMult}).`, false, true);
      }, 450);
    }

    saveLiveMatchSnapshot();
    persist();
    updateAllUI();
    requestAnimationFrame(resizeCanvas);
    if (!game.waitingForOpponent) {
      SoundFX.play('game_start');
    }
    startClockLoop();
    maybeTriggerOpponentTurn();
  }

  function executeCompleteMove(move, fromRemote = false, animFromOverride = null) {
    const rule = RULESETS[state.ruleId];
    if (game.liveReviewIndex !== null) setLiveReviewStep(null);
    if (game.chainOriginBoard) game.board = cloneBoard(game.chainOriginBoard);

    const boardBeforeMove = cloneBoard(game.board);
    game.undoStack.push({
      board: cloneBoard(game.board),
      turn: game.turn,
      lastMove: game.lastMove,
      moveHistoryLen: game.moveHistory.length
    });

    const movingColor = game.turn;
    const isPlayerAction = !game.isSpectator && (state.mode === 'local' || movingColor === game.humanColor);
    const movingPiece = game.board[move.from[0]][move.from[1]];
    const baseAnimSpeed = Number(state.settings.animSpeed);
    const nextBoard = applyMoveToBoard(game.board, move);

    // Build smooth hop-by-hop sequence so multi-captures visibly eat each piece one by one!
    let totalAnimDuration = 0;
    if (baseAnimSpeed > 0 && movingPiece) {
      const hops = [];
      const now = performance.now();
      const singleHopDur = Math.max(190, baseAnimSpeed + 35);
      const pauseBetweenHops = 85;

      if (animFromOverride) {
        // Final hop of a manual step-by-step chain
        const lastCapCoord = move.captures.length > 0 ? move.captures[move.captures.length - 1] : null;
        const capPiece = lastCapCoord ? boardBeforeMove[lastCapCoord[0]]?.[lastCapCoord[1]] : null;
        hops.push({
          from: animFromOverride,
          to: move.to,
          capture: (lastCapCoord && capPiece) ? { r: lastCapCoord[0], c: lastCapCoord[1], color: capPiece.color, king: capPiece.king } : null,
          captureTriggered: false,
          kingAtHop: movingPiece.king || move.promotes,
          start: now,
          dur: singleHopDur,
          endWithPause: now + singleHopDur
        });
        totalAnimDuration = singleHopDur;
      } else {
        // Full move path (1, 2, 3, or more hops!)
        let curTime = now;
        let curKing = movingPiece.king;
        const pathPts = (Array.isArray(move.path) && move.path.length >= 2) ? move.path : [move.from, move.to];
        for (let i = 0; i < pathPts.length - 1; i++) {
          const pFrom = pathPts[i];
          const pTo = pathPts[i + 1];
          const capCoord = move.captures[i] || null;
          const capPiece = capCoord ? boardBeforeMove[capCoord[0]]?.[capCoord[1]] : null;
          if (!curKing && (rule.promoteMidJump || i === pathPts.length - 2) && isPromoRow(pTo[0], movingColor, rule.size)) {
            curKing = true;
          }
          const isLastHop = (i === pathPts.length - 2);
          const pause = isLastHop ? 0 : pauseBetweenHops;
          hops.push({
            from: pFrom,
            to: pTo,
            capture: (capCoord && capPiece) ? { r: capCoord[0], c: capCoord[1], color: capPiece.color, king: capPiece.king } : null,
            captureTriggered: false,
            kingAtHop: curKing,
            start: curTime,
            dur: singleHopDur,
            endWithPause: curTime + singleHopDur + pause
          });
          curTime += singleHopDur + pause;
        }
        totalAnimDuration = curTime - now;
      }

      game.anim = {
        piece: { ...movingPiece },
        finalTo: move.to,
        hops,
        hideTarget: true,
        onComplete: null
      };
    }

    const acc = getActiveAccount();
    const prevLv = getLevelInfoFromXp(acc.xp).level;
    const mults = getMatchEconomyMultipliers();

    // 1. EXP & Coins for Capturing Opponent Pieces (+5 EXP base per captured piece + combo bonus for 2+ pieces!)
    if (move.captures.length > 0) {
      if (baseAnimSpeed === 0) {
        move.captures.forEach(([cr, cc]) => spawnCaptureBurst(cr, cc));
        SoundFX.play('capture');
        vibrate([25, 30, 25]);
      }

      if (isPlayerAction && state.mode !== 'local') {
        const capCount = move.captures.length;
        const rawCapExp = capCount * 5;
        const rawComboExp = capCount >= 3 ? 25 : (capCount === 2 ? 10 : 0);
        const scaledCapExp = Math.max(1, Math.round(rawCapExp * mults.totalExpMult));
        const scaledComboExp = Math.round(rawComboExp * mults.totalExpMult);
        acc.capturesTotal = (acc.capturesTotal || 0) + capCount;
        acc.xp += (scaledCapExp + scaledComboExp);
        acc.coins += Math.max(1, Math.round(capCount * 4 * mults.totalCoinMult));
        game.sessionCapturesExp += scaledCapExp;
        game.sessionComboExp += scaledComboExp;
        recordDailyQuestMetric('captures', capCount);
      }
    } else {
      SoundFX.play('move');
      vibrate(14);
    }

    // 2. EXP for Promoting to King (+15 EXP base, scaled by economy multiplier!)
    if (move.promotes) {
      SoundFX.play('king');
      vibrate([30, 40, 50]);
      if (isPlayerAction && state.mode !== 'local') {
        const scaledKingExp = Math.max(5, Math.round(15 * mults.totalExpMult));
        acc.kingsPromoted = (acc.kingsPromoted || 0) + 1;
        acc.xp += scaledKingExp;
        acc.coins += Math.max(2, Math.round(10 * mults.totalCoinMult));
        game.sessionKingsExp += scaledKingExp;
        recordDailyQuestMetric('kings', 1);
      }
    }

    const newLvAfterAction = getLevelInfoFromXp(acc.xp).level;
    checkAndQueueLevelUpRewards(prevLv, newLvAfterAction);

    const notation = formatMoveNotation(move, rule.size);
    game.board = nextBoard;
    game.lastMove = move;
    game.selected = null;
    clearChainState(false);
    game.hintMove = null;
    game.pendingConfirmMove = null;
    game.pendingAnimFrom = null;
    document.getElementById('confirmMoveBar').classList.add('hidden');

    if (game.clocks[game.turn] !== null && game.clocks.inc) game.clocks[game.turn] += game.clocks.inc;

    game.moveHistory.push({
      notation,
      color: movingColor,
      boardAfter: cloneBoard(game.board),
      moveObj: { from: move.from, to: move.to, path: move.path, captures: move.captures },
      capturesCount: move.captures.length,
      promotes: move.promotes
    });

    const nextTurn = game.turn === 'w' ? 'b' : 'w';

    if (!fromRemote && net.connected && !game.isSpectator) {
      sendNetMessage({
        type: 'move',
        move,
        notation,
        boardAfter: game.board,
        nextTurn,
        promotes: move.promotes,
        capturesCount: move.captures.length,
        clocks: game.clocks
      });
    }

    // Trigger Gemini AI commentary in AI mode
    if (state.mode === 'ai' && state.settings.aiCommentary && !state.settings.ignoreMessages) {
      const shouldComment = (movingColor === game.humanColor) || move.captures.length >= 2 || move.promotes;
      if (shouldComment) {
        const counts = countPieces(game.board);
        const matDiff = counts[game.humanColor] - counts[game.humanColor === 'w' ? 'b' : 'w'];
        requestGeminiAIComment({
          eventType: 'move',
          moveNotation: notation,
          turnColor: movingColor,
          capturesCount: move.captures.length,
          promotes: move.promotes,
          moveNumber: game.moveHistory.length,
          materialDiff: matDiff,
          ruleName: rule.name
        });
      }
    }

    game.turn = nextTurn;
    if (state.mode === 'local' && state.settings.autoFlipLocal) game.flipped = game.turn === 'b';

    game.legalMoves = getAllLegalMoves(game.board, game.turn, rule);

    if (game.legalMoves.length === 0) {
      const winner = rule.giveaway ? game.turn : (game.turn === 'w' ? 'b' : 'w');
      const reason = rule.giveaway ? 'У игрока не осталось ходов (Поддавки)!' : 'Нет доступных ходов!';
      if (totalAnimDuration > 250) {
        updateAllUI();
        drawBoard();
        setTimeout(() => finishGame(winner, reason), totalAnimDuration + 60);
      } else {
        finishGame(winner, reason);
      }
      return;
    }

    saveLiveMatchSnapshot();
    persist();
    updateAllUI();
    drawBoard();

    const waitBeforeNextTurn = Math.max(0, totalAnimDuration);

    if (isHumanTurn() && state.settings.autoMoveForced && game.legalMoves.length === 1 && game.legalMoves[0].captures.length > 0) {
      setTimeout(() => {
        if (!game.over && isHumanTurn() && game.legalMoves.length === 1) executeCompleteMove(game.legalMoves[0]);
      }, waitBeforeNextTurn + 220);
      return;
    }

    if (waitBeforeNextTurn > 220) {
      setTimeout(() => maybeTriggerOpponentTurn(), waitBeforeNextTurn + 40);
    } else {
      maybeTriggerOpponentTurn();
    }
  }

  function maybeTriggerOpponentTurn() {
    if (game.over || game.replay || game.isSpectator || game.waitingForOpponent) return;
    if (state.mode !== 'ai' && !game.tournamentMatchContext) return;
    if (game.turn === game.humanColor) return;

    const rule = RULESETS[state.ruleId];
    const diff = game.tournamentMatchContext ? (game.tournamentMatchContext.botDiff || 3) : state.aiDifficulty;
    const botProfile = AI_BOT_PROFILES[diff] || AI_BOT_PROFILES[3];
    const delay = botProfile.thinkMs || 420;

    const thinkTxt = `${game.opponent.name} думает...`;
    document.getElementById('statusBadge').textContent = thinkTxt;
    document.getElementById('statusBadgeTop').textContent = thinkTxt;

    if (game.aiTimeout) clearTimeout(game.aiTimeout);
    game.aiTimeout = setTimeout(() => {
      if (game.over || game.replay) return;
      const move = chooseAIMove(game.board, game.turn, rule, diff);
      if (move) {
        executeCompleteMove(move, true);
        if (move.captures.length >= 2 && Math.random() < 0.65) {
          triggerFloatingEmote('🔥', 'top');
        }
      }
    }, delay);
  }

  function finishGame(winnerColor, reason) {
    if (game.over) return;
    game.over = true;
    game.liveReviewIndex = null;
    document.getElementById('liveReviewBanner').classList.add('hidden');
    clearChainState(false);
    if (game.clockInterval) clearInterval(game.clockInterval);
    if (game.aiTimeout) clearTimeout(game.aiTimeout);

    const acc = getActiveAccount();
    const prevLv = getLevelInfoFromXp(acc.xp).level;
    const prevRank = getRankForLevel(prevLv).fullLabel;
    const mults = getMatchEconomyMultipliers();
    let outcomeForUser = 'draw';
    let eloDelta = 0;
    let matchXpGain = 0;
    let streakBonusXp = 0;
    let dominationBonusXp = 0;
    let coinsGain = 0;
    let shieldUsed = false;

    if (game.isSpectator) {
      SoundFX.play('game_end');
      const winnerLabel = winnerColor === 'draw' ? 'Ничья' : (winnerColor === 'w' ? 'Белые победили' : 'Чёрные победили');
      game.resultText = `${winnerLabel} — ${reason}`;
      updateAllUI();
      drawBoard();
      openModal('Матч завершён (Режим зрителя)', `<p>${escapeHtml(game.resultText)}</p>`, [
        { label: 'В лобби', cls: 'accent-bg', onClick: () => { closeModal(); resetNetwork(); openLobbyPage('home'); } }
      ]);
      return;
    }

    SoundFX.play('game_end');

    if (winnerColor === 'draw') {
      game.resultText = `Ничья — ${reason}`;
      outcomeForUser = 'draw';
      if (state.mode !== 'local') {
        acc.draws += 1;
        matchXpGain = Math.round(50 * mults.totalExpMult);
        coinsGain = Math.round(40 * mults.totalCoinMult);
        acc.xp += matchXpGain;
        acc.coins += coinsGain;
      }
      setTimeout(() => SoundFX.play('draw'), 160);
    } else {
      const winnerLabel = winnerColor === 'w' ? 'Белые победили' : 'Чёрные победили';
      game.resultText = `${winnerLabel} — ${reason}`;
      if (state.mode === 'local') {
        outcomeForUser = 'win';
        setTimeout(() => SoundFX.play('win'), 160);
      } else {
        const userWon = winnerColor === game.humanColor;
        outcomeForUser = userWon ? 'win' : 'loss';
        const oppElo = typeof game.opponent.elo === 'number' ? game.opponent.elo : 1200;
        const expected = 1 / (1 + Math.pow(10, (oppElo - acc.elo) / 400));
        eloDelta = Math.round(28 * ((userWon ? 1 : 0) - expected));

        if (userWon) {
          acc.elo = Math.max(400, acc.elo + eloDelta);
          acc.peakElo = Math.max(acc.peakElo || 1200, acc.elo);
          acc.wins += 1;
          acc.streak = (acc.streak || 0) + 1;
          acc.bestStreak = Math.max(acc.bestStreak || 0, acc.streak);

          // Check domination situational bonus (winning with >= 4 pieces remaining)
          const pCounts = countPieces(game.board);
          const myRemaining = pCounts[game.humanColor] || 0;
          if (myRemaining >= 4) {
            dominationBonusXp = Math.round(25 * mults.totalExpMult);
          }

          matchXpGain = Math.round(100 * mults.totalExpMult);
          streakBonusXp = Math.round(Math.min(100, acc.streak * 20) * mults.totalExpMult);
          coinsGain = Math.round((85 + Math.min(90, acc.streak * 15) + (myRemaining >= 4 ? 25 : 0)) * mults.totalCoinMult);
          acc.xp += (matchXpGain + streakBonusXp + dominationBonusXp);
          acc.coins += coinsGain;

          recordDailyQuestMetric('wins', 1);
          recordDailyQuestMetric('streak', acc.streak);
          setTimeout(() => SoundFX.play('win'), 160);
        } else {
          // LOSS: Match completion EXP is 0 (does NOT grant match EXP on loss!)
          acc.losses += 1;
          matchXpGain = 0;
          streakBonusXp = 0;
          if ((acc.boosters?.shield || 0) > 0 && (acc.streak >= 2 || eloDelta < -10)) {
            acc.boosters.shield -= 1;
            shieldUsed = true;
            eloDelta = 0;
          } else {
            acc.elo = Math.max(400, acc.elo + eloDelta);
            acc.streak = 0;
          }
          setTimeout(() => SoundFX.play('loss'), 160);
        }
      }
    }

    const newLv = getLevelInfoFromXp(acc.xp).level;
    const newRank = getRankForLevel(newLv).fullLabel;
    checkAndQueueLevelUpRewards(prevLv, newLv);

    const record = {
      id: 'gm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      date: new Date().toISOString(),
      ruleId: state.ruleId,
      mode: state.mode,
      playerName: acc.name,
      opponentName: game.opponent.name,
      outcome: outcomeForUser,
      winnerColor, reason, eloDelta,
      movesCount: game.moveHistory.length,
      durationSec: Math.max(1, Math.round((Date.now() - game.startedAt) / 1000)),
      moves: game.moveHistory.map(m => ({ notation: m.notation, color: m.color, boardAfter: m.boardAfter }))
    };
    state.history.unshift(record);
    if (state.history.length > 100) state.history.pop();
    state.savedGameSnapshot = null;
    persist();

    if (net.serverOnline && state.serverToken && net.transport === 'server') {
      try { net.socket.emit('report_result', { roomId: net.roomId, winnerColor, movesCount: record.movesCount }); } catch (_) {}
    }

    updateAllUI();
    drawBoard();

    if (game.tournamentMatchContext) {
      const ctxTourney = game.tournamentMatchContext;
      game.tournamentMatchContext = null;
      handleTournamentMatchCompleted(outcomeForUser === 'win', ctxTourney);
      return;
    }

    const totalActionXp = game.sessionCapturesExp + game.sessionKingsExp + game.sessionComboExp;
    const totalMatchXp = matchXpGain + streakBonusXp + dominationBonusXp + totalActionXp;
    const rankUpBanner = newRank !== prevRank
      ? `<div class="mt-2 p-2.5 rounded-xl accent-soft font-extrabold text-xs">🎖 Новое звание: ${newRank}!</div>`
      : '';
    const shieldBanner = shieldUsed
      ? `<div class="mt-2 p-2 rounded-xl bg-sky-500/20 text-sky-300 font-bold text-xs">🛡️ Сработал Щит защиты рейтинга! Серия побед и ELO сохранены.</div>`
      : '';

    const breakdownHtml = `
      <div class="mt-3 p-3 rounded-2xl card border space-y-1.5 text-xs">
        <div class="flex justify-between text-[11px] text-muted pb-1 border-b" style="border-color:var(--border-color)">
          <span>Множитель (${escapeHtml(mults.modeLabel)} • ${escapeHtml(mults.assist.shortName)}):</span>
          <b class="accent-text">×${mults.totalExpMult} EXP</b>
        </div>
        <div class="flex justify-between"><span>Исход (${outcomeForUser === 'win' ? 'Победа' : (outcomeForUser === 'draw' ? 'Ничья' : 'Поражение — 0 EXP')}):</span><b class="${matchXpGain > 0 ? 'text-emerald-400' : 'text-rose-400'}">+${matchXpGain} EXP</b></div>
        ${streakBonusXp > 0 ? `<div class="flex justify-between"><span>🔥 Бонус серии побед (${acc.streak} подр.):</span><b class="text-orange-400">+${streakBonusXp} EXP</b></div>` : ''}
        ${dominationBonusXp > 0 ? `<div class="flex justify-between"><span>👑 Чистая доминация на доске:</span><b class="text-sky-400">+${dominationBonusXp} EXP</b></div>` : ''}
        ${totalActionXp > 0 ? `<div class="flex justify-between"><span>⚔️ Взятия, комбо-удары и дамки:</span><b class="text-amber-400">+${totalActionXp} EXP</b></div>` : ''}
        <div class="flex justify-between pt-1 border-t font-extrabold" style="border-color:var(--border-color)"><span>Итого заработано:</span><span class="accent-text">+${totalMatchXp} EXP ${coinsGain > 0 ? `• +${coinsGain} 🪙` : ''}</span></div>
      </div>
    `;
    const eloStr = eloDelta !== 0 ? `<div class="mt-1.5 font-bold ${eloDelta > 0 ? 'text-emerald-400' : 'text-rose-400'}">Рейтинг ELO: ${eloDelta > 0 ? '+' : ''}${eloDelta} (${acc.elo})</div>` : '';

    openModal(
      outcomeForUser === 'win' ? `🏆 Победа! (Серия 🔥 ${acc.streak})` : (outcomeForUser === 'draw' ? '🤝 Ничья' : 'Партия завершена'),
      `<p>${escapeHtml(game.resultText)}</p><p class="text-xs mt-1">Ходов: ${record.movesCount} • ${RULESETS[state.ruleId].name}</p>${eloStr}${breakdownHtml}${shieldBanner}${rankUpBanner}`,
      [
        { label: '🎁 Награды уровней', cls: 'card border', onClick: () => { closeModal(); openLevelRoadModal(); } },
        { label: 'Реванш', cls: 'accent-bg', onClick: () => { closeModal(); startNewGame(); } }
      ]
    );
  }

  /* ======================== POINTER INPUT ======================== */
  function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * boardPx, y: ((e.clientY - rect.top) / rect.height) * boardPx };
  }

  function handleSquareAttempt(r, c) {
    if (!isHumanTurn() || game.pendingConfirmMove) return;

    if (game.selected) {
      const [sr, sc] = game.selected;
      const candidates = game.chainPiece
        ? game.chainCandidateMoves
        : game.legalMoves.filter(m => m.from[0] === sr && m.from[1] === sc);
      const stepIdx = game.chainPiece ? game.chainStepIndex + 1 : 1;

      const matching = candidates.filter(m => stepIdx < m.path.length && m.path[stepIdx][0] === r && m.path[stepIdx][1] === c);

      if (matching.length > 0) {
        const continuing = matching.filter(m => m.path.length - 1 > stepIdx);
        const completed = matching.find(m => m.path.length - 1 === stepIdx);

        if (continuing.length > 0) {
          if (!game.chainPiece) {
            game.chainOriginBoard = cloneBoard(game.board);
            game.chainCapturedKeys = new Set();
          }
          const prevPt = continuing[0].path[stepIdx - 1];
          const piece = game.board[prevPt[0]][prevPt[1]];
          if (piece) {
            game.board[prevPt[0]][prevPt[1]] = null;
            const capPt = continuing[0].captures[stepIdx - 1];
            if (capPt) {
              game.chainCapturedKeys.add(capPt[0] + ',' + capPt[1]);
              spawnCaptureBurst(capPt[0], capPt[1]);
            }
            const rule = RULESETS[state.ruleId];
            const midKing = piece.king || (rule.promoteMidJump && isPromoRow(r, piece.color, rule.size));
            game.board[r][c] = { ...piece, king: midKing };
            const animDur = Number(state.settings.animSpeed);
            if (animDur > 0) {
              game.anim = { piece: { ...piece, king: midKing }, from: prevPt, to: [r, c], start: performance.now(), dur: Math.min(animDur, 160), hideTarget: true };
            }
          }
          game.selected = [r, c];
          game.chainPiece = [r, c];
          game.chainCandidateMoves = continuing;
          game.chainStepIndex = stepIdx;

          const remaining = continuing[0].path.length - 1 - stepIdx;
          document.getElementById('chainBannerText').textContent = `Продолжите серию взятия! (ещё ${remaining})`;
          document.getElementById('chainBanner').classList.remove('hidden');
          SoundFX.play('capture'); vibrate(20);
          updateHeaderUI(); drawBoard();
          return;
        }

        if (completed) {
          const finalHopFrom = completed.path[stepIdx - 1];
          if (state.settings.confirmMove && !game.chainPiece) {
            game.pendingConfirmMove = completed;
            game.pendingAnimFrom = finalHopFrom;
            document.getElementById('confirmMoveBar').classList.remove('hidden');
            drawBoard();
            return;
          }
          executeCompleteMove(completed, false, finalHopFrom);
          return;
        }
      }

      if (!game.chainPiece) {
        const directFinal = candidates.filter(m => m.to[0] === r && m.to[1] === c);
        if (directFinal.length === 1) {
          if (state.settings.confirmMove) {
            game.pendingConfirmMove = directFinal[0];
            game.pendingAnimFrom = null;
            document.getElementById('confirmMoveBar').classList.remove('hidden');
            drawBoard();
            return;
          }
          executeCompleteMove(directFinal[0], false, null);
          return;
        }
      }
    }

    if (!game.chainPiece) {
      const piece = game.board[r][c];
      if (piece && piece.color === game.turn) {
        const hasMoves = game.legalMoves.some(m => m.from[0] === r && m.from[1] === c);
        if (hasMoves) {
          game.selected = [r, c]; game.hintMove = null;
          SoundFX.play('select'); drawBoard();
        } else if (game.legalMoves.some(m => m.captures.length > 0)) {
          showToast('Обязательный бой! Выберите подсвеченную шашку.', 'info');
        }
      } else {
        game.selected = null; drawBoard();
      }
    } else {
      showToast('Завершите серию взятия этой шашкой!', 'info');
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (game.liveReviewIndex !== null) {
      setLiveReviewStep(null);
      showToast('Возврат к текущей позиции партии', 'info');
      return;
    }
    if (!isHumanTurn() || game.pendingConfirmMove) return;
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = getCanvasCoords(e);
    const sq = screenToBoard(x, y);
    if (!sq) return;
    const [r, c] = sq;
    const piece = game.board[r][c];

    if (piece && piece.color === game.turn && (!game.chainPiece || (game.chainPiece[0] === r && game.chainPiece[1] === c))) {
      const hasMoves = game.chainPiece ? true : game.legalMoves.some(m => m.from[0] === r && m.from[1] === c);
      if (hasMoves) {
        game.selected = [r, c];
        game.drag = { r, c, x, y, piece, startX: x, startY: y, moved: false };
        SoundFX.play('select'); drawBoard();
        return;
      }
    }
    handleSquareAttempt(r, c);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!game.drag) return;
    const { x, y } = getCanvasCoords(e);
    if (Math.hypot(x - game.drag.startX, y - game.drag.startY) > 6) game.drag.moved = true;
    game.drag.x = x; game.drag.y = y; drawBoard();
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!game.drag) return;
    const { x, y } = getCanvasCoords(e);
    const wasMoved = game.drag.moved;
    const fromR = game.drag.r, fromC = game.drag.c;
    game.drag = null;
    if (wasMoved) {
      const sq = screenToBoard(x, y);
      if (sq && (sq[0] !== fromR || sq[1] !== fromC)) handleSquareAttempt(sq[0], sq[1]);
    }
    drawBoard();
  });

  canvas.addEventListener('pointercancel', () => { if (game.drag) { game.drag = null; drawBoard(); } });

  /* ======================== CS2 CASE OPENING SYSTEM (10 TIERS x 3 GRADES) ======================== */
  function rollRarityForChest(chestType = 'common', grade = 3) {
    // Rare chest or Grade I chest has significantly higher chances for Uncommon, Rare, Legendary
    const isRare = chestType === 'rare' || grade === 1;
    const weights = isRare
      ? { common: 22, uncommon: 43, rare: 26, legendary: 9 }
      : (grade === 2 ? { common: 45, uncommon: 36, rare: 15, legendary: 4 } : { common: 56, uncommon: 30, rare: 11, legendary: 3 });

    const total = weights.common + weights.uncommon + weights.rare + weights.legendary;
    let r = Math.random() * total;
    for (const [key, w] of Object.entries(weights)) {
      if (r < w) return key;
      r -= w;
    }
    return 'common';
  }

  function generateDropItemForRarity(rarityKey, grade = 3) {
    const rInfo = RARITIES[rarityKey] || RARITIES.common;
    const boards = Object.values(BOARD_THEMES).filter(b => !b.defaultUnlocked && b.rarity === rarityKey);
    const pieces = Object.values(PIECE_STYLES).filter(p => !p.defaultUnlocked && p.rarity === rarityKey);
    const frames = Object.values(AVATAR_FRAMES).filter(f => f.id !== 'default' && f.rarity === rarityKey);
    const titles = PLAYER_TITLES.filter(t => t.rarity === rarityKey);

    const rollType = Math.random();
    // Grade I guarantees a full skin/frame/title or big crystal pack!
    const isFragment = (grade === 2 && rarityKey !== 'common' && Math.random() < 0.38);

    if (rollType < 0.42 && boards.length > 0) {
      const b = boards[Math.floor(Math.random() * boards.length)];
      return {
        kind: isFragment ? 'fragment_board' : 'board',
        targetId: b.id,
        rarity: rarityKey,
        icon: isFragment ? '🧩' : '🎨',
        title: isFragment ? `Фрагмент: ${b.name}` : `Доска: ${b.name}`,
        subtitle: isFragment ? 'Фрагмент доски (1/3)' : `Стиль доски (${rInfo.name})`
      };
    }
    if (rollType < 0.78 && pieces.length > 0) {
      const p = pieces[Math.floor(Math.random() * pieces.length)];
      return {
        kind: isFragment ? 'fragment_piece' : 'piece',
        targetId: p.id,
        rarity: rarityKey,
        icon: isFragment ? '🧩' : '♟️',
        title: isFragment ? `Фрагмент: ${p.name}` : `Шашки: ${p.name}`,
        subtitle: isFragment ? 'Фрагмент шашек (1/3)' : `Стиль фигур (${rInfo.name})`
      };
    }
    if (rollType < 0.90 && frames.length > 0) {
      const f = frames[Math.floor(Math.random() * frames.length)];
      return {
        kind: 'frame',
        targetId: f.id,
        rarity: rarityKey,
        icon: '🖼️',
        title: `Рамка: ${f.name}`,
        subtitle: `Рамка аватара (${rInfo.name})`
      };
    }
    if (titles.length > 0) {
      const t = titles[Math.floor(Math.random() * titles.length)];
      return {
        kind: 'title',
        targetId: t.id,
        rarity: rarityKey,
        icon: '🎖️',
        title: `Титул: ${t.id}`,
        subtitle: `Почётный титул (${rInfo.name})`
      };
    }
    return {
      kind: 'exp_pack',
      targetId: 'exp',
      rarity: rarityKey,
      xpAmount: rarityKey === 'legendary' ? 600 : (rarityKey === 'rare' ? 300 : 120),
      icon: '⚡',
      title: `+${rarityKey === 'legendary' ? 600 : (rarityKey === 'rare' ? 300 : 120)} EXP`,
      subtitle: `Бонус опыта (${rInfo.name})`
    };
  }

  function renderRouletteCardHtml(item) {
    const r = RARITIES[item.rarity] || RARITIES.common;
    return `<div class="cs2-item-card" style="border: 2px solid ${r.border}; box-shadow: ${r.glow}; background: linear-gradient(180deg, rgba(15,23,42,0.92) 0%, ${r.bg} 100%);">
      <span class="text-[9px] font-black uppercase px-1.5 py-0.5 rounded" style="background:${r.bg}; color:${r.color}">${r.name}</span>
      <div class="text-3xl my-1">${item.icon}</div>
      <div class="w-full">
        <div class="text-[11px] font-extrabold truncate text-white">${escapeHtml(item.title)}</div>
        <div class="text-[9px] text-slate-300 truncate">${escapeHtml(item.subtitle)}</div>
      </div>
    </div>`;
  }

  function initDefaultRoulettePreview() {
    const track = document.getElementById('cs2RouletteTrack');
    if (!track || state.rouletteSpinning) return;
    const previewItems = [];
    for (let i = 0; i < 16; i++) {
      const rKey = i % 9 === 0 ? 'legendary' : (i % 4 === 0 ? 'rare' : (i % 2 === 0 ? 'uncommon' : 'common'));
      previewItems.push(generateDropItemForRarity(rKey, 2));
    }
    track.style.transition = 'none';
    track.style.transform = 'translateX(0px)';
    track.innerHTML = previewItems.map(renderRouletteCardHtml).join('');
  }

  function spinCS2Roulette(chestSpec) {
    if (state.rouletteSpinning) return;
    state.rouletteSpinning = true;

    const acc = getActiveAccount();
    const lvInfo = getLevelInfoFromXp(acc.xp);
    const tierObj = CHEST_TIERS.find(t => t.tier === chestSpec.tier) || getChestTierByLevel(lvInfo.level);
    const gradeObj = CHEST_GRADES[chestSpec.grade || 3] || CHEST_GRADES[3];

    document.getElementById('rouletteCaseTitle').textContent = `Открывается: ${chestSpec.label || `${chestSpec.type === 'rare' ? 'Редкий' : 'Обычный'} сундук (${tierObj.name} • ${gradeObj.label})`}`;
    document.getElementById('rouletteCaseSubtitle').textContent = 'Крутим ленту наград CS2...';

    const TOTAL_CARDS = 46;
    const WIN_INDEX = 38;
    const items = [];
    for (let i = 0; i < TOTAL_CARDS; i++) {
      const rKey = rollRarityForChest(chestSpec.type, gradeObj.grade);
      items.push(generateDropItemForRarity(rKey, gradeObj.grade));
    }
    const wonItem = items[WIN_INDEX];

    const track = document.getElementById('cs2RouletteTrack');
    track.style.transition = 'none';
    track.style.transform = 'translateX(0px)';
    track.innerHTML = items.map(renderRouletteCardHtml).join('');

    // Force reflow
    void track.offsetWidth;

    const viewport = track.parentElement;
    const vpWidth = viewport.clientWidth || 600;
    const cardW = 124;
    const gapW = 10;
    const stepW = cardW + gapW;
    const jitter = Math.floor((Math.random() - 0.5) * 56);
    const targetCenter = 24 + WIN_INDEX * stepW + cardW / 2 + jitter;
    const translatePx = Math.max(0, targetCenter - vpWidth / 2);

    const spinDurationMs = 4600;
    track.style.transition = `transform ${spinDurationMs}ms cubic-bezier(0.11, 0.84, 0.16, 1)`;
    track.style.transform = `translateX(-${translatePx}px)`;

    // Play ticking sounds as cards pass the laser line
    let lastTickIdx = -1;
    const startTs = performance.now();
    function tickWatcher(now) {
      if (!state.rouletteSpinning) return;
      const elapsed = Math.min(1, (now - startTs) / spinDurationMs);
      const eased = 1 - Math.pow(1 - elapsed, 3.6);
      const curX = translatePx * eased + vpWidth / 2;
      const curIdx = Math.floor((curX - 24) / stepW);
      if (curIdx !== lastTickIdx && curIdx >= 0 && curIdx < TOTAL_CARDS) {
        lastTickIdx = curIdx;
        SoundFX.play('tick');
      }
      if (elapsed < 1) requestAnimationFrame(tickWatcher);
    }
    requestAnimationFrame(tickWatcher);

    setTimeout(() => {
      state.rouletteSpinning = false;
      applyChestRewardsToAccount(wonItem, tierObj, gradeObj, chestSpec);
    }, spinDurationMs + 180);
  }

  function applyChestRewardsToAccount(wonItem, tierObj, gradeObj, chestSpec) {
    const acc = getActiveAccount();
    const prevLv = getLevelInfoFromXp(acc.xp).level;
    acc.chestsOpened = (acc.chestsOpened || 0) + 1;

    // 1. Base currency according to Tier (1..10) & Grade (III, II, I)
    const coinsWon = Math.round(tierObj.baseCoins * gradeObj.coinMult * (chestSpec.type === 'rare' ? 1.4 : 1));
    const crystalsWon = gradeObj.grade === 1 ? (4 + tierObj.tier * 2) : (chestSpec.type === 'rare' ? 3 : 0);
    acc.coins += coinsWon;
    acc.crystals += crystalsWon;

    // 2. Booster according to Grade
    const boosterKeys = gradeObj.grade === 1
      ? ['ticket', 'shield', 'hint', 'undo']
      : ['undo', 'hint', 'shield'];
    const bKey = boosterKeys[Math.floor(Math.random() * boosterKeys.length)];
    const bNames = { undo: '↩️ Отмена хода', hint: '💡 Подсказка хода', shield: '🛡️ Щит защиты рейтинга', ticket: '🎟️ Билет на турнир' };
    acc.boosters[bKey] = (acc.boosters[bKey] || 0) + 1;

    // 3. Apply Main Won Roulette Cosmetic / Fragment / EXP
    let statusNote = '';
    if (wonItem.kind === 'board') {
      if (!acc.unlockedBoards.includes(wonItem.targetId)) {
        acc.unlockedBoards.push(wonItem.targetId);
        statusNote = '✨ Новый стиль игровой доски разблокирован!';
      } else {
        const compXp = 90;
        acc.xp += compXp;
        statusNote = `Дубликат конвертирован в +${compXp} EXP!`;
      }
    } else if (wonItem.kind === 'piece') {
      if (!acc.unlockedPieces.includes(wonItem.targetId)) {
        acc.unlockedPieces.push(wonItem.targetId);
        statusNote = '✨ Новый стиль шашек разблокирован!';
      } else {
        const compXp = 90;
        acc.xp += compXp;
        statusNote = `Дубликат конвертирован в +${compXp} EXP!`;
      }
    } else if (wonItem.kind === 'fragment_board' || wonItem.kind === 'fragment_piece') {
      const fKey = `${wonItem.kind === 'fragment_board' ? 'board' : 'piece'}:${wonItem.targetId}`;
      acc.fragments[fKey] = (acc.fragments[fKey] || 0) + 1;
      if (acc.fragments[fKey] >= 3) {
        acc.fragments[fKey] -= 3;
        if (wonItem.kind === 'fragment_board' && !acc.unlockedBoards.includes(wonItem.targetId)) {
          acc.unlockedBoards.push(wonItem.targetId);
          statusNote = '🎉 Собрано 3/3 фрагментов! Целый стиль доски автоматически скрафчен!';
        } else if (wonItem.kind === 'fragment_piece' && !acc.unlockedPieces.includes(wonItem.targetId)) {
          acc.unlockedPieces.push(wonItem.targetId);
          statusNote = '🎉 Собрано 3/3 фрагментов! Целый стиль шашек автоматически скрафчен!';
        } else {
          acc.xp += 120;
          statusNote = 'Фрагменты (3/3) обменяны на +120 EXP!';
        }
      } else {
        statusNote = `Прогресс сборки скина из фрагментов: ${acc.fragments[fKey]} / 3`;
      }
    } else if (wonItem.kind === 'frame') {
      if (!acc.unlockedFrames.includes(wonItem.targetId)) {
        acc.unlockedFrames.push(wonItem.targetId);
        statusNote = '✨ Новая рамка аватара разблокирована!';
      } else {
        acc.xp += 80;
        statusNote = 'Дубликат рамки: +80 EXP';
      }
    } else if (wonItem.kind === 'title') {
      if (!acc.unlockedTitles.includes(wonItem.targetId)) {
        acc.unlockedTitles.push(wonItem.targetId);
        statusNote = '✨ Новый титул разблокирован!';
      } else {
        acc.xp += 80;
        statusNote = 'Дубликат титула: +80 EXP';
      }
    } else if (wonItem.kind === 'exp_pack') {
      acc.xp += (wonItem.xpAmount || 150);
      statusNote = `Бонусный опыт зачислен!`;
    }

    const newLv = getLevelInfoFromXp(acc.xp).level;
    checkAndQueueLevelUpRewards(prevLv, newLv);
    persist();
    updateAllUI();
    renderChestsUI();
    renderStylesUI();

    if (wonItem.rarity === 'legendary' || wonItem.rarity === 'rare') {
      SoundFX.play('unbox_rare');
      vibrate([40, 50, 80]);
    } else {
      SoundFX.play('win');
    }

    const rInfo = RARITIES[wonItem.rarity] || RARITIES.common;
    openModal(
      `🎉 Выигрыш из сундука (${tierObj.name} • ${gradeObj.label})`,
      `<div class="text-center space-y-3 py-2">
        <div class="mx-auto w-24 h-24 rounded-3xl flex items-center justify-center text-5xl" style="background:${rInfo.bg}; border:2px solid ${rInfo.border}; box-shadow:${rInfo.glow};">
          ${wonItem.icon}
        </div>
        <div>
          <span class="text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full" style="background:${rInfo.bg}; color:${rInfo.color}">${rInfo.name}</span>
          <h4 class="text-lg font-black text-white mt-1">${escapeHtml(wonItem.title)}</h4>
          <p class="text-xs text-muted">${escapeHtml(wonItem.subtitle)}</p>
          ${statusNote ? `<p class="text-xs font-extrabold accent-text mt-1">${escapeHtml(statusNote)}</p>` : ''}
        </div>
        <div class="p-3 rounded-2xl card border text-xs space-y-1 text-left">
          <div class="font-bold text-muted mb-1">Дополнительное содержимое сундука (${gradeObj.label}):</div>
          <div class="flex justify-between"><span>Валюта:</span><b class="text-amber-400">+${coinsWon} 🪙 ${crystalsWon > 0 ? `• +${crystalsWon} 💎` : ''}</b></div>
          <div class="flex justify-between"><span>Бустер:</span><b class="text-emerald-400">+1 ${bNames[bKey]}</b></div>
        </div>
      </div>`,
      [
        {
          label: (wonItem.kind === 'board' || wonItem.kind === 'piece') ? 'Применить стиль сейчас' : 'Отлично!',
          cls: 'accent-bg',
          onClick: () => {
            if (wonItem.kind === 'board' && acc.unlockedBoards.includes(wonItem.targetId)) {
              state.boardTheme = wonItem.targetId;
            } else if (wonItem.kind === 'piece' && acc.unlockedPieces.includes(wonItem.targetId)) {
              state.pieceStyle = wonItem.targetId;
            } else if (wonItem.kind === 'frame' && acc.unlockedFrames.includes(wonItem.targetId)) {
              acc.avatarFrame = wonItem.targetId;
            } else if (wonItem.kind === 'title' && acc.unlockedTitles.includes(wonItem.targetId)) {
              acc.playerTitle = wonItem.targetId;
            }
            persist();
            updateAllUI();
            renderStylesUI();
            closeModal();
          }
        }
      ]
    );
  }

  function renderChestsUI() {
    const acc = getActiveAccount();
    const lvInfo = getLevelInfoFromXp(acc.xp);
    const tierObj = getChestTierByLevel(lvInfo.level);

    document.getElementById('chestViewCoins').textContent = acc.coins;
    document.getElementById('chestViewCrystals').textContent = acc.crystals;
    document.getElementById('currentChestTierBadge').textContent = `Тир ${tierObj.tier}/10: ${tierObj.name} (${tierObj.icon})`;
    document.getElementById('stdChestTierTag').textContent = `${tierObj.name} • I–III разряд`;

    // Boosters counts
    document.getElementById('boosterUndoCount').textContent = acc.boosters?.undo || 0;
    document.getElementById('boosterHintCount').textContent = acc.boosters?.hint || 0;
    document.getElementById('boosterShieldCount').textContent = acc.boosters?.shield || 0;
    document.getElementById('boosterTicketCount').textContent = acc.boosters?.ticket || 0;

    // Owned chests in inventory
    const inv = acc.chestsInventory || [];
    const commonInv = inv.filter(c => c.type === 'common');
    const rareInv = inv.filter(c => c.type === 'rare');
    document.getElementById('chestsBadgeDesktop').textContent = inv.length;

    const btnCommonInv = document.getElementById('openCommonChestInvBtn');
    const btnRareInv = document.getElementById('openRareChestInvBtn');
    document.getElementById('invCommonCount').textContent = commonInv.length;
    document.getElementById('invRareCount').textContent = rareInv.length;
    btnCommonInv.classList.toggle('hidden', commonInv.length === 0);
    btnRareInv.classList.toggle('hidden', rareInv.length === 0);

    const ownedGrid = document.getElementById('ownedChestsGrid');
    if (inv.length === 0) {
      ownedGrid.innerHTML = `<div class="col-span-full text-center py-6 card border rounded-2xl text-xs text-muted">
        У вас пока нет неоткрытых наградных сундуков в инвентаре. Повышайте уровень, забирайте награды в «Дороге уровней» или побеждайте в турнирах!
      </div>`;
    } else {
      ownedGrid.innerHTML = inv.map(ch => {
        const isRare = ch.type === 'rare';
        return `<div class="card border-2 rounded-2xl p-3.5 flex items-center justify-between gap-3" style="border-color:${isRare ? 'rgba(245,158,11,0.55)' : 'rgba(59,130,246,0.4)'}">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="text-2xl">${isRare ? '👑' : '📦'}</span>
            <div class="min-w-0">
              <div class="text-xs font-extrabold truncate">${escapeHtml(ch.label || `${ch.tierName} • ${ch.roman} разряд`)}</div>
              <div class="text-[10px] text-muted">${isRare ? 'Редкий сундук' : 'Обычный сундук'} • Разряд ${ch.roman || 'III'}</div>
            </div>
          </div>
          <button data-openinv="${ch.id}" class="open-inv-chest-btn px-3 py-1.5 rounded-xl accent-bg text-xs font-extrabold shrink-0">
            Открыть
          </button>
        </div>`;
      }).join('');
      ownedGrid.querySelectorAll('.open-inv-chest-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (state.rouletteSpinning) return;
          const idx = acc.chestsInventory.findIndex(x => x.id === btn.dataset.openinv);
          if (idx === -1) return;
          const [ch] = acc.chestsInventory.splice(idx, 1);
          persist();
          renderChestsUI();
          spinCS2Roulette(ch);
        });
      });
    }

    // 10 Tiers reference
    const tiersGrid = document.getElementById('chestTiersReferenceGrid');
    tiersGrid.innerHTML = CHEST_TIERS.map(t => {
      const unlocked = lvInfo.level >= t.minLevel;
      const isCurrent = t.tier === tierObj.tier;
      return `<div class="p-2.5 rounded-2xl card border text-center ${isCurrent ? 'ring-2' : (unlocked ? '' : 'opacity-45')}" style="${isCurrent ? 'border-color:var(--accent)' : ''}">
        <div class="text-xl">${t.icon}</div>
        <div class="text-[11px] font-extrabold mt-0.5 truncate" style="color:${t.color}">${t.tier}. ${t.name}</div>
        <div class="text-[10px] text-muted">Ур. ${t.minLevel}+ • III/II/I</div>
      </div>`;
    }).join('');

    initDefaultRoulettePreview();
  }

  /* ======================== SWIPEABLE HORIZONTAL LEVEL ROAD MODAL ======================== */
  function openLevelRoadModal() {
    renderLevelRoadModal();
    document.getElementById('levelRoadModalOverlay').classList.remove('hidden');
    setTimeout(() => scrollToCurrentLevelInRoad(), 80);
  }

  function closeLevelRoadModal() {
    document.getElementById('levelRoadModalOverlay').classList.add('hidden');
  }

  function scrollToCurrentLevelInRoad() {
    const track = document.getElementById('levelRoadTrack');
    const curEl = track?.querySelector('[data-current-level="true"]');
    if (track && curEl) {
      const left = curEl.offsetLeft - track.clientWidth / 2 + curEl.clientWidth / 2;
      track.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
    }
  }

  function renderLevelRoadModal() {
    const acc = getActiveAccount();
    const lvInfo = getLevelInfoFromXp(acc.xp);
    const curLv = lvInfo.level;
    const maxDisplayLv = Math.max(100, curLv + 20);
    const track = document.getElementById('levelRoadTrack');
    if (!track) return;

    let html = '';
    for (let lv = 1; lv <= maxDisplayLv; lv++) {
      const spec = getLevelRewardSpec(lv);
      const reached = lv <= curLv;
      const claimed = acc.claimedLevels.includes(lv);
      const isCurrent = lv === curLv;
      const borderCol = spec.kind === 'milestone'
        ? '#f59e0b'
        : (spec.kind === 'anniversary' ? '#ec4899' : (isCurrent ? 'var(--accent)' : 'var(--border-color)'));

      html += `<div data-lvcard="${lv}" ${isCurrent ? 'data-current-level="true"' : ''} class="w-48 shrink-0 rounded-2xl card border-2 p-3.5 flex flex-col justify-between gap-2.5 transition ${reached ? '' : 'opacity-60'}" style="border-color:${borderCol}; ${spec.kind === 'milestone' ? 'background:linear-gradient(180deg, rgba(245,158,11,0.14) 0%, rgba(30,41,59,0.5) 100%)' : ''}">
        <div>
          <div class="flex items-center justify-between gap-1">
            <span class="text-xs font-black px-2 py-0.5 rounded-lg ${isCurrent ? 'accent-bg' : 'elevated'}">УРОВЕНЬ ${lv}</span>
            ${spec.kind === 'milestone' ? '<span class="text-[10px] font-black text-amber-400">★ ЭТАП</span>' : (spec.kind === 'anniversary' ? '<span class="text-[10px] font-black text-pink-400">ЮБИЛЕЙ</span>' : '')}
          </div>
          <div class="text-[10px] text-muted font-semibold mt-1">${escapeHtml(spec.kindLabel)}</div>
        </div>

        <div class="space-y-1.5 text-xs my-1">
          <div class="p-2 rounded-xl surface border flex items-center gap-2">
            <span class="text-lg">${spec.chest.type === 'rare' ? '👑' : '📦'}</span>
            <div class="min-w-0">
              <div class="text-[11px] font-extrabold truncate">${escapeHtml(spec.chest.tierName)} • ${spec.chest.roman} разр.</div>
              <div class="text-[9px] text-muted">${spec.chest.type === 'rare' ? 'Редкий сундук' : 'Обычный сундук'}</div>
            </div>
          </div>
          <div class="flex items-center justify-between px-1 font-bold text-[11px]">
            <span class="text-amber-400">🪙 +${spec.coins}</span>
            ${spec.crystals > 0 ? `<span class="text-cyan-400">💎 +${spec.crystals}</span>` : ''}
          </div>
          ${spec.exclusive ? `<div class="p-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-[10px] font-extrabold text-amber-300 text-center">🏆 ${escapeHtml(spec.exclusive.label)}</div>` : ''}
          ${spec.stakeUnlocked ? `<div class="text-[9px] text-emerald-400 font-bold text-center">🔓 ${escapeHtml(spec.stakeUnlocked)}</div>` : ''}
        </div>

        <div>
          ${claimed
            ? `<div class="w-full py-1.5 rounded-xl elevated text-[11px] font-bold text-center text-emerald-400">✓ Получено</div>`
            : (reached
                ? `<button data-claimlv="${lv}" class="claim-lv-btn w-full py-1.5 rounded-xl accent-bg text-[11px] font-black">Забрать награду!</button>`
                : `<div class="w-full py-1.5 rounded-xl surface border text-[10px] font-semibold text-center text-muted">Нужен Ур. ${lv}</div>`
              )
          }
        </div>
      </div>`;
    }
    track.innerHTML = html;

    track.querySelectorAll('.claim-lv-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        claimSingleLevelReward(Number(btn.dataset.claimlv));
      });
    });
  }

  /* ======================== TOURNAMENTS SYSTEM (LIVE REAL-TIME + CUSTOM + 3 PRIZE PLACES) ======================== */
  const TOURNAMENT_BOT_POOL = [
    { name: 'Гроссмейстер_КЗ', flag: '🇰🇿', elo: 1580, avatarIdx: 0, isBot: true },
    { name: 'Шашечный_Барс',   flag: '🇷🇺', elo: 1420, avatarIdx: 1, isBot: true },
    { name: 'Мастер_Диагонали',flag: '🇧🇾', elo: 1360, avatarIdx: 4, isBot: true },
    { name: 'Дамка_Экспресс',  flag: '🇺🇦', elo: 1290, avatarIdx: 5, isBot: true },
    { name: 'Тактик_Тимур',    flag: '🇺🇿', elo: 1240, avatarIdx: 2, isBot: true },
    { name: 'Стратег_Берлин',  flag: '🇩🇪', elo: 1510, avatarIdx: 3, isBot: true },
    { name: 'Валькирия_Блиц',  flag: '🇺🇸', elo: 1380, avatarIdx: 6, isBot: true }
  ];

  function buildLocalSystemTournaments() {
    const now = Date.now();
    // 5-minute deterministic cycle so real-time countdowns tick smoothly
    const cycleMs = 240 * 1000;
    const baseCycle = Math.floor(now / cycleMs) * cycleMs;

    return [
      {
        id: 'LIVE-BLITZ-1',
        isSystem: true,
        title: '⚡ Блиц-Кубок Арены',
        ruleId: 'russian',
        ruleName: 'Русские шашки 8×8',
        timeControl: '180+2',
        format: 'knockout',
        formatName: 'Олимпийский плей-офф',
        maxPlayers: 8,
        entryCoins: 0,
        registrationEndsAt: baseCycle + 150 * 1000,
        endsAt: baseCycle + 240 * 1000,
        participants: TOURNAMENT_BOT_POOL.slice(0, 5).map(b => ({ ...b, score: 0 })),
        prizes: [
          { place: 1, xp: 500, coins: 600, crystals: 15, chestType: 'rare', chestGrade: 1, title: 'Чемпион Блиц-Арены' },
          { place: 2, xp: 300, coins: 350, crystals: 8, chestType: 'rare', chestGrade: 2 },
          { place: 3, xp: 150, coins: 180, crystals: 4, chestType: 'common', chestGrade: 1 }
        ]
      },
      {
        id: 'LIVE-FMJD-2',
        isSystem: true,
        title: '🌍 Гран-При FMJD 10×10',
        ruleId: 'international',
        ruleName: 'Международные 10×10',
        timeControl: '300+3',
        format: 'arena',
        formatName: 'Арена Блиц-Марафон',
        maxPlayers: 8,
        entryCoins: 100,
        registrationEndsAt: baseCycle + 210 * 1000,
        endsAt: baseCycle + 330 * 1000,
        participants: TOURNAMENT_BOT_POOL.slice(1, 6).map(b => ({ ...b, score: 0 })),
        prizes: [
          { place: 1, xp: 650, coins: 850, crystals: 20, chestType: 'rare', chestGrade: 1, title: 'Гроссмейстер FMJD' },
          { place: 2, xp: 400, coins: 450, crystals: 10, chestType: 'rare', chestGrade: 2 },
          { place: 3, xp: 200, coins: 220, crystals: 5, chestType: 'common', chestGrade: 1 }
        ]
      },
      {
        id: 'LIVE-BRAZIL-3',
        isSystem: true,
        title: '🔥 Кубок Мастеров Рио (Идёт матч)',
        ruleId: 'brazilian',
        ruleName: 'Бразильские 8×8',
        timeControl: '180+2',
        format: 'roundrobin',
        formatName: 'Круговая лига',
        maxPlayers: 6,
        entryCoins: 150,
        registrationEndsAt: baseCycle + 60 * 1000, // Closes early in cycle so user sees live "In Progress - Wait" state!
        endsAt: baseCycle + 240 * 1000,
        participants: TOURNAMENT_BOT_POOL.slice(0, 6).map((b, i) => ({ ...b, score: (6 - i) * 2 })),
        prizes: [
          { place: 1, xp: 750, coins: 1000, crystals: 25, chestType: 'rare', chestGrade: 1, title: 'Мастер Рио' },
          { place: 2, xp: 450, coins: 550, crystals: 12, chestType: 'rare', chestGrade: 2 },
          { place: 3, xp: 250, coins: 280, crystals: 6, chestType: 'common', chestGrade: 1 }
        ]
      },
      {
        id: 'LIVE-GIVEAWAY-4',
        isSystem: true,
        title: '🎲 Турнир Королей Поддавков',
        ruleId: 'giveaway',
        ruleName: 'Поддавки 8×8',
        timeControl: '180+2',
        format: 'kinghill',
        formatName: 'Царь Горы',
        maxPlayers: 8,
        entryCoins: 50,
        registrationEndsAt: baseCycle + 190 * 1000,
        endsAt: baseCycle + 290 * 1000,
        participants: TOURNAMENT_BOT_POOL.slice(2, 6).map(b => ({ ...b, score: 0 })),
        prizes: [
          { place: 1, xp: 550, coins: 700, crystals: 15, chestType: 'rare', chestGrade: 1, title: 'Гений Поддавков' },
          { place: 2, xp: 320, coins: 400, crystals: 8, chestType: 'common', chestGrade: 1 },
          { place: 3, xp: 160, coins: 200, crystals: 4, chestType: 'common', chestGrade: 2 }
        ]
      }
    ];
  }

  function formatCountdown(ms) {
    const sec = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function renderTournamentsUI() {
    const acc = getActiveAccount();
    document.getElementById('tourneyTicketsCount').textContent = acc.boosters?.ticket || 0;

    if (!state.liveTournaments || state.liveTournaments.length === 0) {
      state.liveTournaments = buildLocalSystemTournaments();
    }

    // Active Tournament Stage
    const stageEl = document.getElementById('activeTournamentStage');
    const actT = state.activeTournament;
    if (actT) {
      stageEl.classList.remove('hidden');
      document.getElementById('activeTourneyBadge').textContent = actT.finished ? 'Турнир завершён' : `Раунд ${actT.round} из ${actT.maxRounds}`;
      document.getElementById('activeTourneyCodePill').textContent = `Код приглашения: ${actT.id}`;
      document.getElementById('activeTourneyTitle').textContent = actT.title;
      document.getElementById('activeTourneyMeta').textContent = `${actT.formatName} • ${actT.ruleName} • Участников: ${actT.participants.length}`;
      document.getElementById('activeTourneyRoundLabel').textContent = actT.finished ? 'Итоговый пьедестал' : `Раунд ${actT.round} / ${actT.maxRounds}`;

      document.getElementById('playNextTourneyMatchBtn').classList.toggle('hidden', Boolean(actT.finished));
      document.getElementById('simTourneyRoundBtn').classList.toggle('hidden', Boolean(actT.finished));

      const sorted = [...actT.participants].sort((a, b) => (b.score || 0) - (a.score || 0) || (b.elo || 1200) - (a.elo || 1200));
      const medals = ['🥇 1 Место', '🥈 2 Место', '🥉 3 Место'];
      const podiumColors = ['border-amber-400 bg-amber-500/10', 'border-slate-300 bg-slate-400/10', 'border-amber-700 bg-amber-700/10'];

      document.getElementById('activeTourneyPodium').innerHTML = [0, 1, 2].map(idx => {
        const p = sorted[idx];
        const prize = actT.prizes[idx];
        return `<div class="p-3.5 rounded-2xl card border-2 ${podiumColors[idx]} space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-xs font-black">${medals[idx]}</span>
            <span class="text-[11px] font-extrabold accent-text">${p ? `${p.score || 0} очк.` : ''}</span>
          </div>
          <div class="text-sm font-black truncate">${p ? `${p.flag || '🌍'} ${escapeHtml(p.name)}` : 'Ожидание...'}</div>
          <div class="text-[10px] text-muted font-bold">
            Приз: <span class="text-emerald-400">+${prize.xp} EXP</span> • <span class="text-amber-400">+${prize.coins} 🪙</span> • <span class="text-pink-400">${prize.chestType === 'rare' ? '👑 Редкий' : '📦 Обычный'} сундук ${['I','II','III'][prize.chestGrade - 1]} разр.</span>
          </div>
        </div>`;
      }).join('');

      document.getElementById('activeTourneyStandings').innerHTML = sorted.map((p, i) => `
        <div class="px-3 py-2 rounded-xl surface border flex items-center justify-between text-xs ${p.isUser ? 'ring-1' : ''}" style="${p.isUser ? 'border-color:var(--accent)' : ''}">
          <div class="flex items-center gap-2">
            <span class="font-mono font-bold text-muted w-5">${i + 1}.</span>
            <span>${p.flag || '🌍'}</span>
            <span class="font-extrabold">${escapeHtml(p.name)} ${p.isUser ? '(Вы)' : ''}</span>
            <span class="text-[10px] text-muted">${p.elo || 1200} ELO</span>
          </div>
          <div class="font-black accent-text">${p.score || 0} очк.</div>
        </div>
      `).join('');
    } else {
      stageEl.classList.add('hidden');
    }

    // Live Automated Tournaments list
    const now = Date.now();
    const listEl = document.getElementById('liveSystemTournamentsList');
    listEl.innerHTML = state.liveTournaments.map(t => {
      const isRegOpen = now < t.registrationEndsAt;
      const isInProgress = !isRegOpen && now < t.endsAt;
      const timeLeftMs = isRegOpen ? (t.registrationEndsAt - now) : Math.max(0, t.endsAt - now);

      return `<div class="card border rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div class="space-y-1.5 min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-black">${escapeHtml(t.title)}</span>
            <span class="text-[10px] px-2 py-0.5 rounded-full font-extrabold ${isRegOpen ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}">
              ${isRegOpen ? `● Регистрация открыта (${formatCountdown(timeLeftMs)})` : `⏳ Идёт турнир • Ожидание (${formatCountdown(timeLeftMs)})`}
            </span>
          </div>
          <div class="text-xs text-muted flex flex-wrap items-center gap-2">
            <span>${escapeHtml(t.formatName)}</span><span>•</span>
            <span>${escapeHtml(t.ruleName)}</span><span>•</span>
            <span>Вход: ${t.entryCoins > 0 ? `🪙 ${t.entryCoins} или 🎟️ Билет` : 'Бесплатно'}</span>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-[11px] font-bold pt-0.5">
            <span class="px-2 py-0.5 rounded bg-amber-500/15 text-amber-400">🥇 1 место: +${t.prizes[0].xp} EXP + 👑 Сундук I разр.</span>
            <span class="px-2 py-0.5 rounded elevated text-slate-300">🥈 2 место: +${t.prizes[1].xp} EXP + Сундук</span>
            <span class="px-2 py-0.5 rounded elevated text-amber-600">🥉 3 место: +${t.prizes[2].xp} EXP + Сундук</span>
          </div>
        </div>
        <div class="flex flex-col sm:items-end gap-1.5 shrink-0 w-full sm:w-auto">
          ${isRegOpen
            ? `<button data-jointourney="${t.id}" class="join-live-tourney-btn w-full sm:w-auto px-4 py-2.5 rounded-xl accent-btn-3d text-xs font-black">
                Присоединиться →
              </button>`
            : `<div class="flex gap-1.5 w-full sm:w-auto">
                <button disabled class="px-3 py-2 rounded-xl elevated text-muted text-[11px] font-bold opacity-70 cursor-not-allowed">
                  Ждите ${formatCountdown(timeLeftMs)}
                </button>
                <button data-spectatetourney="${t.id}" class="spectate-live-tourney-btn px-3 py-2 rounded-xl card border text-sky-400 text-[11px] font-extrabold">
                  👁 Смотреть
                </button>
              </div>`
          }
        </div>
      </div>`;
    }).join('');

    listEl.querySelectorAll('.join-live-tourney-btn').forEach(btn => {
      btn.addEventListener('click', () => joinLiveOrCustomTournament(btn.dataset.jointourney));
    });
    listEl.querySelectorAll('.spectate-live-tourney-btn').forEach(btn => {
      btn.addEventListener('click', () => spectateTournamentMatch(btn.dataset.spectatetourney));
    });
  }

  function joinLiveOrCustomTournament(tourneyId) {
    const acc = getActiveAccount();
    const t = state.liveTournaments.find(x => x.id === tourneyId);
    if (!t) {
      showToast('Турнир не найден', 'error');
      return;
    }
    if (Date.now() >= t.registrationEndsAt && t.isSystem) {
      showToast('Время регистрации вышло! Дождитесь завершения текущего розыгрыша.', 'error');
      return;
    }
    if (t.entryCoins > 0) {
      if ((acc.boosters?.ticket || 0) > 0) {
        acc.boosters.ticket -= 1;
        showToast('Использован 🎟️ Билет на турнир!', 'info');
      } else if (acc.coins >= t.entryCoins) {
        acc.coins -= t.entryCoins;
      } else {
        showToast(`Недостаточно монет (${t.entryCoins} 🪙) или билетов для входа!`, 'error');
        return;
      }
    }

    const maxP = t.maxPlayers || 8;
    const roster = [
      { name: acc.name, flag: acc.flag, elo: acc.elo, avatarIdx: acc.avatarIdx, isUser: true, score: 0 }
    ];
    for (const p of (t.participants || [])) {
      if (roster.length < maxP && p.name !== acc.name) roster.push({ ...p, score: 0 });
    }
    let botIdx = 0;
    while (roster.length < maxP) {
      const b = TOURNAMENT_BOT_POOL[botIdx % TOURNAMENT_BOT_POOL.length];
      if (!roster.some(r => r.name === b.name)) roster.push({ ...b, score: 0 });
      botIdx++;
    }

    state.activeTournament = {
      id: t.id,
      title: t.title,
      ruleId: t.ruleId,
      ruleName: t.ruleName,
      timeControl: t.timeControl || '180+2',
      format: t.format,
      formatName: t.formatName,
      round: 1,
      maxRounds: 3,
      finished: false,
      participants: roster,
      prizes: t.prizes
    };
    persist();
    renderTournamentsUI();
    showToast(`Вы зарегистрированы в турнире «${t.title}»! Нажмите «Сыграть матч раунда».`, 'success');
  }

  function spectateTournamentMatch(tourneyId) {
    const t = state.liveTournaments.find(x => x.id === tourneyId) || state.liveTournaments[0];
    if (!t) return;
    state.ruleId = t.ruleId || 'russian';
    game.isSpectator = true;
    game.spectatorsCount = 4 + Math.floor(Math.random() * 9);
    const p1 = TOURNAMENT_BOT_POOL[0];
    const p2 = TOURNAMENT_BOT_POOL[1];
    game.opponent = { name: p2.name, flag: p2.flag, elo: p2.elo, avatarIdx: p2.avatarIdx };
    openGameArena(true, true);
    showToast(`👁 Вы смотрите Live-матч турнира «${t.title}»: ${p1.name} vs ${p2.name}`, 'info');

    // Run live AI vs AI move loop for the spectator!
    function stepSpectatorTourneyAI() {
      if (!game.isSpectator || game.over || state.currentPage !== 'arena') return;
      const rule = RULESETS[state.ruleId];
      const move = chooseAIMove(game.board, game.turn, rule, 2);
      if (move) {
        executeCompleteMove(move, true);
        game.aiTimeout = setTimeout(stepSpectatorTourneyAI, 900);
      }
    }
    game.aiTimeout = setTimeout(stepSpectatorTourneyAI, 900);
  }

  function startActiveTournamentMatch() {
    const actT = state.activeTournament;
    if (!actT || actT.finished) return;
    const sorted = [...actT.participants].sort((a, b) => (b.score || 0) - (a.score || 0));
    const others = sorted.filter(p => !p.isUser);
    const opp = others[(actT.round - 1) % others.length] || others[0];

    state.ruleId = actT.ruleId;
    state.mode = 'ai';
    state.settings.timeControl = actT.timeControl || '180+2';
    game.isSpectator = false;
    game.tournamentMatchContext = {
      tournamentId: actT.id,
      round: actT.round,
      opponent: opp,
      botDiff: opp.elo >= 1500 ? 3 : 2
    };
    openGameArena(true, true);
    showToast(`Турнирный матч (Раунд ${actT.round}): против ${opp.name}!`, 'info');
  }

  function handleTournamentMatchCompleted(userWon, ctxTourney) {
    const actT = state.activeTournament;
    if (!actT) return;
    advanceTournamentRound(userWon ? 3 : 0);
  }

  function advanceTournamentRound(userPointsEarned) {
    const actT = state.activeTournament;
    if (!actT || actT.finished) return;

    for (const p of actT.participants) {
      if (p.isUser) {
        p.score = (p.score || 0) + userPointsEarned;
      } else {
        const r = Math.random();
        p.score = (p.score || 0) + (r < 0.48 ? 3 : (r < 0.65 ? 1 : 0));
      }
    }

    if (actT.round >= actT.maxRounds) {
      actT.finished = true;
      awardTournamentPrizes(actT);
    } else {
      actT.round += 1;
      openLobbyPage('tournaments');
      renderTournamentsUI();
      showToast(`Раунд завершён! Переходим к раунду ${actT.round} из ${actT.maxRounds}.`, 'info');
    }
  }

  function awardTournamentPrizes(actT) {
    const acc = getActiveAccount();
    const prevLv = getLevelInfoFromXp(acc.xp).level;
    const sorted = [...actT.participants].sort((a, b) => (b.score || 0) - (a.score || 0) || (b.elo || 1200) - (a.elo || 1200));
    const userPlace = sorted.findIndex(p => p.isUser) + 1;
    const prize = actT.prizes.find(pr => pr.place === userPlace);

    openLobbyPage('tournaments');

    if (prize && userPlace <= 3) {
      acc.tournamentsWon = (acc.tournamentsWon || 0) + 1;
      acc.xp += prize.xp;
      acc.coins += prize.coins;
      acc.crystals += (prize.crystals || 0);
      const tierObj = getChestTierByLevel(getLevelInfoFromXp(acc.xp).level);
      const roman = ['I', 'II', 'III'][(prize.chestGrade || 1) - 1] || 'I';
      const newChest = {
        id: 'ch_trn_' + Date.now(),
        type: prize.chestType || 'rare',
        tier: tierObj.tier,
        tierName: tierObj.name,
        grade: prize.chestGrade || 1,
        roman,
        label: `Призовой сундук за ${userPlace} место • ${tierObj.name} ${roman} разряд`
      };
      acc.chestsInventory.unshift(newChest);
      if (prize.title && !acc.unlockedTitles.includes(prize.title)) {
        acc.unlockedTitles.push(prize.title);
      }

      const newLv = getLevelInfoFromXp(acc.xp).level;
      checkAndQueueLevelUpRewards(prevLv, newLv);
      persist();
      updateAllUI();
      renderChestsUI();
      renderTournamentsUI();
      SoundFX.play('unbox_rare');

      const placeEmojis = { 1: '🥇 1-е МЕСТО!', 2: '🥈 2-е МЕСТО!', 3: '🥉 3-е МЕСТО!' };
      openModal(
        `🏆 Призовое ${placeEmojis[userPlace]}`,
        `<div class="space-y-3 text-center">
          <div class="text-4xl">${userPlace === 1 ? '🥇' : (userPlace === 2 ? '🥈' : '🥉')}</div>
          <div class="text-base font-black text-white">Вы заняли ${userPlace} место в турнире «${escapeHtml(actT.title)}»!</div>
          <div class="p-3.5 rounded-2xl card border space-y-1.5 text-xs text-left">
            <div class="flex justify-between"><span>Бонус опыта:</span><b class="text-emerald-400">+${prize.xp} EXP</b></div>
            <div class="flex justify-between"><span>Призовые монеты:</span><b class="text-amber-400">+${prize.coins} 🪙</b></div>
            <div class="flex justify-between"><span>Кристаллы:</span><b class="text-cyan-400">+${prize.crystals || 0} 💎</b></div>
            <div class="flex justify-between"><span>Подарочный кейс:</span><b class="text-pink-400">${escapeHtml(newChest.label)}</b></div>
            ${prize.title ? `<div class="flex justify-between"><span>Титул чемпиона:</span><b class="text-amber-300">«${escapeHtml(prize.title)}»</b></div>` : ''}
          </div>
        </div>`,
        [
          { label: 'Остаться в турнирах', cls: 'card border', onClick: closeModal },
          {
            label: '📦 Открыть призовой сундук!', cls: 'accent-bg', onClick: () => {
              closeModal();
              switchTab('chests');
            }
          }
        ]
      );
    } else {
      persist();
      renderTournamentsUI();
      openModal(
        'Турнир завершён',
        `<p>Вы заняли <b>${userPlace} место</b> в турнире «${escapeHtml(actT.title)}». Призовые сундуки и EXP вручаются за 1-е, 2-е и 3-е места — попробуйте снова!</p>`,
        [{ label: 'Понятно', cls: 'accent-bg', onClick: closeModal }]
      );
    }
  }

  /* ======================== UI RENDERERS ======================== */
  function setAvatarEl(el, idx, photoDataUrl = null, frameId = 'default') {
    if (!el) return;
    const frameObj = AVATAR_FRAMES[frameId] || AVATAR_FRAMES.default;
    el.style.cssText = frameObj.css || '';
    if (photoDataUrl) {
      el.style.background = 'transparent';
      el.innerHTML = `<img src="${photoDataUrl}" alt="avatar" class="w-full h-full object-cover" />`;
    } else {
      const av = AVATARS[(idx || 0) % AVATARS.length] || AVATARS[0];
      el.style.background = av.bg;
      el.textContent = av.icon;
    }
  }

  function countPieces(board) {
    let w = 0, b = 0;
    if (!board) return { w: 0, b: 0 };
    for (const row of board) for (const cell of row) if (cell) { if (cell.color === 'w') w++; else b++; }
    return { w, b };
  }

  function applyThemeAndPrefs() {
    document.documentElement.setAttribute('data-theme', state.settings.appTheme || 'dark');
    document.documentElement.setAttribute('data-accent', state.settings.appAccent || 'emerald');
    document.querySelectorAll('.zen-hide').forEach(el => {
      el.classList.toggle('hidden', Boolean(state.settings.zenMode));
    });
  }

  function renderOnlineRoomsList() {
    const box = document.getElementById('onlineActiveRoomsList');
    const lbl = document.getElementById('activeRoomsCountLabel');
    if (!box) return;
    const rooms = state.publicRooms || [];
    if (lbl) lbl.textContent = `${rooms.length} комнат`;

    if (rooms.length === 0) {
      box.innerHTML = `<div class="p-3 rounded-xl card border text-center text-[11px] text-muted">
        Нет открытых комнат на сервере. Нажмите <b>«➕ Создать комнату с кодом»</b> и пригласите друга или зрителей!
      </div>`;
      return;
    }

    box.innerHTML = rooms.map(r => {
      const ruleName = RULESETS[r.ruleId]?.name || r.ruleId;
      return `<div class="p-2.5 rounded-xl card border flex items-center justify-between gap-2 text-xs">
        <div class="min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="font-mono font-black accent-text">#${escapeHtml(r.roomId)}</span>
            <span class="font-bold truncate">${escapeHtml(r.hostName)} ${r.guestName ? `vs ${escapeHtml(r.guestName)}` : '(Ждёт игрока...)'}</span>
          </div>
          <div class="text-[10px] text-muted">${escapeHtml(ruleName)} • 👁 Зрителей: ${r.spectatorsCount || 0}</div>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          ${r.waitingForOpponent
            ? `<button data-joinroom="${r.roomId}" class="quick-join-room-btn px-2.5 py-1 rounded-lg accent-bg text-[11px] font-extrabold">Играть</button>`
            : ''
          }
          <button data-specroom="${r.roomId}" class="quick-spec-room-btn px-2.5 py-1 rounded-lg surface border text-sky-400 text-[11px] font-extrabold">👁 Смотреть</button>
        </div>
      </div>`;
    }).join('');

    box.querySelectorAll('.quick-join-room-btn').forEach(b => {
      b.addEventListener('click', () => joinRoomByCode(b.dataset.joinroom, false));
    });
    box.querySelectorAll('.quick-spec-room-btn').forEach(b => {
      b.addEventListener('click', () => joinRoomByCode(b.dataset.specroom, true));
    });
  }

  function renderDailyQuestsUI() {
    const acc = getActiveAccount();
    const quests = acc.dailyQuests?.quests || [];
    const html = quests.map(q => {
      const pct = Math.min(100, Math.round(((q.progress || 0) / q.target) * 100));
      const ready = q.progress >= q.target && !q.claimed;
      return `<div class="p-3 rounded-2xl card border flex items-center justify-between gap-3">
        <div class="flex items-center gap-2.5 min-w-0 flex-1">
          <div class="w-9 h-9 rounded-xl elevated flex items-center justify-center text-lg shrink-0">${q.icon}</div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-extrabold truncate">${escapeHtml(q.title)}</span>
              <span class="text-[10px] font-bold text-emerald-400 shrink-0">+${q.xp} EXP • +${q.coins} 🪙</span>
            </div>
            <div class="text-[11px] text-muted truncate">${escapeHtml(q.desc)}</div>
            <div class="mt-1.5 flex items-center gap-2">
              <div class="flex-1 h-1.5 rounded-full elevated overflow-hidden">
                <div class="h-full accent-bg transition-all" style="width:${pct}%"></div>
              </div>
              <span class="text-[10px] font-mono text-muted">${q.progress}/${q.target}</span>
            </div>
          </div>
        </div>
        <div class="shrink-0">
          ${q.claimed
            ? `<span class="text-[11px] font-extrabold text-emerald-400 px-2">✓ Взято</span>`
            : (ready
                ? `<button data-claimdq="${q.id}" class="claim-dq-btn px-3 py-1.5 rounded-xl accent-bg text-xs font-black">Забрать!</button>`
                : `<span class="text-[10px] text-muted font-semibold px-1.5">В бою</span>`
              )
          }
        </div>
      </div>`;
    }).join('');

    ['homeDailyQuestsList', 'accountDailyQuestsList'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = html;
      el.querySelectorAll('.claim-dq-btn').forEach(btn => {
        btn.addEventListener('click', () => claimDailyQuest(btn.dataset.claimdq));
      });
    });
  }

  function updatePlayerBars() {
    if (!game.board) return;
    const acc = getActiveAccount();
    const lvInfo = getLevelInfoFromXp(acc.xp);
    const rank = getRankForLevel(lvInfo.level);
    const counts = countPieces(game.board);
    const localP1 = document.getElementById('localP1Name')?.value.trim() || acc.name;

    const whiteInfo = state.mode === 'local'
      ? { name: localP1, tag: 'Белые', avatarIdx: acc.avatarIdx, photo: acc.avatarPhoto, frame: acc.avatarFrame, rankMini: '' }
      : (game.humanColor === 'w'
        ? { name: acc.name, tag: acc.elo + ' ELO', avatarIdx: acc.avatarIdx, photo: acc.avatarPhoto, frame: acc.avatarFrame, rankMini: `${rank.icon} ${rank.name} ${rank.roman} • Ур.${lvInfo.level}` }
        : { name: game.opponent.name, tag: String(game.opponent.elo), avatarIdx: game.opponent.avatarIdx, photo: game.opponent.avatarPhoto, frame: game.opponent.frame || 'default', rankMini: '' });

    const blackInfo = state.mode === 'local'
      ? { name: game.opponent.name, tag: 'Чёрные', avatarIdx: game.opponent.avatarIdx, photo: null, frame: 'default', rankMini: '' }
      : (game.humanColor === 'b'
        ? { name: acc.name, tag: acc.elo + ' ELO', avatarIdx: acc.avatarIdx, photo: acc.avatarPhoto, frame: acc.avatarFrame, rankMini: `${rank.icon} ${rank.name} ${rank.roman} • Ур.${lvInfo.level}` }
        : { name: game.opponent.name, tag: String(game.opponent.elo), avatarIdx: game.opponent.avatarIdx, photo: game.opponent.avatarPhoto, frame: game.opponent.frame || 'default', rankMini: '' });

    const topColor = game.flipped ? 'w' : 'b';
    const botColor = game.flipped ? 'b' : 'w';
    const topInfo = topColor === 'w' ? whiteInfo : blackInfo;
    const botInfo = botColor === 'w' ? whiteInfo : blackInfo;

    setAvatarEl(document.getElementById('topPlayerAvatar'), topInfo.avatarIdx, topInfo.photo, topInfo.frame);
    document.getElementById('topPlayerName').textContent = topInfo.name;
    document.getElementById('topPlayerTag').textContent = topInfo.tag;
    document.getElementById('topPlayerColorLabel').textContent = topColor === 'w' ? 'Белые' : 'Чёрные';
    document.getElementById('topPlayerPieces').textContent = `${counts[topColor]} ш.`;
    document.getElementById('topTurnDot').classList.toggle('hidden', game.over || game.turn !== topColor);

    setAvatarEl(document.getElementById('bottomPlayerAvatar'), botInfo.avatarIdx, botInfo.photo, botInfo.frame);
    document.getElementById('bottomPlayerName').textContent = botInfo.name;
    document.getElementById('bottomPlayerRankMini').textContent = botInfo.rankMini || botInfo.tag;
    document.getElementById('bottomPlayerColorLabel').textContent = botColor === 'w' ? 'Белые' : 'Чёрные';
    document.getElementById('bottomPlayerPieces').textContent = `${counts[botColor]} ш.`;
    document.getElementById('bottomTurnDot').classList.toggle('hidden', game.over || game.turn !== botColor);

    const topDiff = counts[topColor] - counts[botColor];
    const botDiff = counts[botColor] - counts[topColor];
    const topMat = document.getElementById('topMaterialBadge');
    const botMat = document.getElementById('bottomMaterialBadge');
    topMat.classList.toggle('hidden', !state.settings.showMaterial || topDiff <= 0);
    botMat.classList.toggle('hidden', !state.settings.showMaterial || botDiff <= 0);
    if (topDiff > 0) topMat.textContent = `+${topDiff}`;
    if (botDiff > 0) botMat.textContent = `+${botDiff}`;

    document.getElementById('topPlayerBar').classList.toggle('rotate-180-player', state.mode === 'local' && state.tabletopMode);
    updateClocksUI();
  }

  function updateMoveLogUI() {
    const list = document.getElementById('moveLogList');
    const total = game.moveHistory.length;
    document.getElementById('moveCountBadge').textContent = `${total} ходов`;
    const revLabel = document.getElementById('liveRevStepLabel');
    if (revLabel) {
      revLabel.textContent = game.liveReviewIndex === null ? 'LIVE' : `${game.liveReviewIndex}/${total}`;
    }
    if (total === 0) {
      list.innerHTML = '<div class="text-muted text-center py-8 font-sans">Сделайте первый ход</div>';
      return;
    }
    let html = '';
    for (let i = 0; i < total; i += 2) {
      const num = Math.floor(i / 2) + 1;
      const wM = game.moveHistory[i];
      const bM = game.moveHistory[i + 1];
      const wActive = game.liveReviewIndex === (i + 1);
      const bActive = game.liveReviewIndex === (i + 2);
      html += `<div class="grid grid-cols-12 gap-1 px-2 py-1 rounded-lg ${num % 2 === 0 ? 'elevated/40' : ''}">
        <span class="col-span-2 text-muted">${num}.</span>
        <button data-revstep="${i + 1}" class="live-rev-jump col-span-5 text-left font-semibold rounded px-1 hover:bg-white/10 transition ${wActive ? 'accent-bg' : ''}">${wM ? wM.notation + (wM.promotes ? '👑' : '') : ''}</button>
        ${bM
          ? `<button data-revstep="${i + 2}" class="live-rev-jump col-span-5 text-left font-semibold rounded px-1 hover:bg-white/10 transition ${bActive ? 'accent-bg' : 'text-muted'}">${bM.notation + (bM.promotes ? '👑' : '')}</button>`
          : `<span class="col-span-5"></span>`
        }
      </div>`;
    }
    list.innerHTML = html;
    list.querySelectorAll('.live-rev-jump').forEach(btn => {
      btn.addEventListener('click', () => {
        setLiveReviewStep(Number(btn.dataset.revstep));
      });
    });
    if (game.liveReviewIndex === null) {
      list.scrollTop = list.scrollHeight;
    }
  }

  function updateConnectionBanner() {
    const card = document.getElementById('connectionStatusCard');
    const isNetMode = state.mode === 'online' || state.mode === 'bluetooth' || game.isSpectator;
    card.classList.toggle('hidden', !isNetMode);
    if (!isNetMode) return;
    const label = document.getElementById('connLabel');
    const dot = document.getElementById('connDot');
    if (game.isSpectator) {
      label.textContent = `👁 Режим зрителя ${net.roomId ? '#' + net.roomId : ''}`;
      dot.className = 'w-2 h-2 rounded-full bg-sky-400 shrink-0';
    } else if (game.waitingForOpponent) {
      label.textContent = `Ожидание игрока (Код: ${net.roomId || '...'})`;
      dot.className = 'w-2 h-2 rounded-full bg-amber-400 pulse-dot shrink-0';
    } else if (net.connected && net.transport === 'server') {
      label.textContent = `Онлайн #${net.roomId || ''} (👁 ${game.spectatorsCount || 0})`;
      dot.className = 'w-2 h-2 rounded-full bg-emerald-400 shrink-0';
    } else if (net.connected && net.transport === 'broadcast') {
      label.textContent = `Комната #${net.roomId || ''} подключена`;
      dot.className = 'w-2 h-2 rounded-full bg-emerald-400 shrink-0';
    } else if (net.connected && net.transport === 'webrtc') {
      label.textContent = 'P2P-комната подключена';
      dot.className = 'w-2 h-2 rounded-full bg-emerald-400 shrink-0';
    } else if (net.connected && net.transport === 'bluetooth') {
      label.textContent = 'Bluetooth подключён';
      dot.className = 'w-2 h-2 rounded-full bg-sky-400 shrink-0';
    } else {
      label.textContent = 'Ожидание подключения...';
      dot.className = 'w-2 h-2 rounded-full bg-amber-400 shrink-0';
    }
  }

  function updateHeaderUI() {
    const acc = getActiveAccount();
    const lvInfo = getLevelInfoFromXp(acc.xp);
    const rank = getRankForLevel(lvInfo.level);
    const rule = RULESETS[state.ruleId];
    const modeNames = { ai: 'Против ИИ Gemini', local: 'Вживую', online: 'Онлайн', bluetooth: 'Bluetooth' };

    setAvatarEl(document.getElementById('sidebarAvatar'), acc.avatarIdx, acc.avatarPhoto, acc.avatarFrame);
    document.getElementById('sidebarUsername').textContent = acc.name;
    document.getElementById('sidebarRankShort').textContent = `Ур. ${lvInfo.level} • ${rank.name} ${rank.roman}`;
    document.getElementById('sidebarElo').textContent = `${acc.elo} ELO`;
    document.getElementById('sidebarCoins').textContent = `🪙 ${acc.coins}`;
    document.getElementById('sidebarCrystals').textContent = `💎 ${acc.crystals}`;
    document.getElementById('sidebarStreak').textContent = `🔥 ${acc.streak || 0}`;

    setAvatarEl(document.getElementById('mobileHeaderAvatar'), acc.avatarIdx, acc.avatarPhoto, acc.avatarFrame);
    document.getElementById('mobileHeaderLevel').textContent = `Ур.${lvInfo.level}`;
    document.getElementById('mobileCoinsPill').textContent = `🪙 ${acc.coins}`;
    document.getElementById('mobileStreakPill').textContent = `🔥 ${acc.streak || 0}`;
    document.getElementById('historyBadgeDesktop').textContent = state.history.length;
    document.getElementById('chestsBadgeDesktop').textContent = (acc.chestsInventory || []).length;

    setAvatarEl(document.getElementById('heroAvatar'), acc.avatarIdx, acc.avatarPhoto, acc.avatarFrame);
    document.getElementById('heroName').textContent = acc.name;
    document.getElementById('heroFlag').textContent = acc.flag;
    document.getElementById('heroTitleBadge').textContent = acc.playerTitle || 'Новичок шашек';
    document.getElementById('heroRankRow').innerHTML = `
      <span class="inline-flex items-center text-xs font-extrabold px-2.5 py-0.5 rounded-lg card border" style="color:${rank.color}">
        ${rank.icon} ${rank.fullLabel} ${renderStripesHtml(rank.stripes, rank.color)}
      </span>
      <span class="text-xs font-bold text-muted">Уровень ${lvInfo.level} (${lvInfo.xpInLevel}/${lvInfo.xpForNext} EXP)</span>
    `;
    document.getElementById('heroEloBadge').textContent = `${acc.elo} ELO`;
    document.getElementById('heroWinsBadge').textContent = `Побед: ${acc.wins}`;
    document.getElementById('heroStreakBadge').textContent = `🔥 Серия побед: ${acc.streak || 0}`;
    document.getElementById('heroRulePill').textContent = `${rule.name} (${rule.size}×${rule.size})`;

    document.getElementById('arenaTitle').textContent = rule.name;
    document.getElementById('arenaSubtitle').textContent = game.isSpectator
      ? `👁 Просмотр матча ${net.roomId ? '#' + net.roomId : ''}`
      : `${modeNames[state.mode]} • ${rule.size}×${rule.size}`;
    document.getElementById('ruleQuickTag').textContent = `${rule.size}×${rule.size}`;

    const specPill = document.getElementById('arenaSpectatorPill');
    const showSpec = game.isSpectator || state.mode === 'online' || game.spectatorsCount > 0;
    specPill.classList.toggle('hidden', !showSpec);
    specPill.classList.toggle('inline-flex', showSpec);
    document.getElementById('arenaSpectatorCount').textContent = game.spectatorsCount || 0;
    document.getElementById('arenaStreakPill').textContent = `🔥 ${acc.streak || 0}`;

    const stTxt = game.over
      ? game.resultText
      : (game.waitingForOpponent
          ? 'Ожидание игрока...'
          : (game.replay
              ? 'Режим повтора'
              : (game.chainPiece ? 'Продолжите взятие!' : (game.turn === 'w' ? 'Ход белых' : 'Ход чёрных'))));
    document.getElementById('statusBadge').textContent = stTxt;
    document.getElementById('statusBadgeTop').textContent = stTxt;

    document.getElementById('soundIconOn').classList.toggle('hidden', !state.settings.soundEnabled);
    document.getElementById('soundIconOff').classList.toggle('hidden', state.settings.soundEnabled);

    const qIgEm = document.getElementById('quickIgnoreEmojisBtn');
    const qIgMs = document.getElementById('quickIgnoreMsgsBtn');
    if (qIgEm) qIgEm.textContent = `🔕 Игнор эмодзи: ${state.settings.ignoreEmojis ? 'ВКЛ' : 'Выкл'}`;
    if (qIgMs) qIgMs.textContent = `🔇 Игнор чата: ${state.settings.ignoreMessages ? 'ВКЛ' : 'Выкл'}`;

    const mults = getMatchEconomyMultipliers();
    const canUndo = !game.isSpectator && mults.assist.allowUndo && state.settings.allowUndo && (game.undoStack.length > 0 || Boolean(game.chainPiece)) && !game.over && !(net.connected && (net.transport === 'webrtc' || net.transport === 'server' || net.transport === 'broadcast'));
    ['undoBtn', 'mobUndoBtn'].forEach(id => {
      const b = document.getElementById(id);
      if (b) { b.disabled = !canUndo; b.classList.toggle('opacity-40', !canUndo); }
    });
    const canHint = !game.isSpectator && mults.assist.allowHints && !game.over && !(net.connected && (net.transport === 'webrtc' || net.transport === 'server' || net.transport === 'broadcast'));
    ['hintBtn', 'mobHintBtn'].forEach(id => {
      const b = document.getElementById(id);
      if (b) { b.classList.toggle('opacity-40', !canHint); }
    });
    updateLobbyResumeButtons();
  }

  function updateAllUI() {
    applyThemeAndPrefs();
    updateHeaderUI();
    updatePlayerBars();
    updateMoveLogUI();
    updateConnectionBanner();
    renderDailyQuestsUI();
    renderAccountUI();
    renderHistoryUI();
  }

  /* ======================== MODES & RULES UI ======================== */
  function renderModesAndRulesUI() {
    const isGuest = isCurrentUserGuest();
    if (isGuest && state.mode !== 'ai') {
      state.mode = 'ai';
    }
    document.querySelectorAll('.mode-card').forEach(btn => {
      const m = btn.dataset.mode;
      const active = m === state.mode;
      const lockedForGuest = isGuest && m !== 'ai';
      btn.style.borderColor = active ? 'var(--accent)' : 'var(--border-color)';
      btn.classList.toggle('accent-soft', active);
      btn.classList.toggle('opacity-65', lockedForGuest);
      let lockBadge = btn.querySelector('.guest-lock-pill');
      if (lockedForGuest) {
        if (!lockBadge) {
          lockBadge = document.createElement('div');
          lockBadge.className = 'guest-lock-pill text-[9px] font-extrabold text-amber-400 mt-1';
          lockBadge.textContent = '🔒 Только с аккаунтом';
          btn.appendChild(lockBadge);
        }
      } else if (lockBadge) {
        lockBadge.remove();
      }
    });
    document.getElementById('modeOptionsAI').classList.toggle('hidden', state.mode !== 'ai');
    document.getElementById('modeOptionsLocal').classList.toggle('hidden', state.mode !== 'local');
    document.getElementById('modeOptionsOnline').classList.toggle('hidden', state.mode !== 'online');
    document.getElementById('modeOptionsBluetooth').classList.toggle('hidden', state.mode !== 'bluetooth');

    document.getElementById('aiDifficultySelect').value = String(state.aiDifficulty);
    const botProf = AI_BOT_PROFILES[state.aiDifficulty] || AI_BOT_PROFILES[3];
    const personaBox = document.getElementById('aiBotPersonaDesc');
    if (personaBox) personaBox.innerHTML = botProf.desc;

    // 3 Play Assist Modes UI
    const assistId = state.settings.playAssistMode || 'rethink';
    document.querySelectorAll('.assist-mode-btn').forEach(btn => {
      const active = btn.dataset.assist === assistId;
      btn.style.borderColor = active ? 'var(--accent)' : 'var(--border-color)';
      btn.classList.toggle('accent-soft', active);
    });

    // Live Match Economy Reward Calculator
    const mults = getMatchEconomyMultipliers();
    const estWinExp = Math.round(100 * mults.totalExpMult);
    const estWinCoins = Math.round(90 * mults.totalCoinMult);
    const previewVal = document.getElementById('matchRewardPreviewValue');
    if (previewVal) {
      previewVal.textContent = `Победа: +${estWinExp} EXP (+бонусы за взятия) • +${estWinCoins} 🪙 (×${mults.totalExpMult})`;
    }

    document.getElementById('lobbyTimeControl').value = state.settings.timeControl;
    document.getElementById('toggleTabletopBtn').classList.toggle('on', state.tabletopMode);

    document.querySelectorAll('.player-color-btn').forEach(btn => {
      const active = btn.dataset.color === state.playerColorPref;
      btn.className = `player-color-btn px-3 py-1.5 rounded-xl text-xs font-bold ${active ? 'accent-bg' : 'surface border'}`;
    });

    const hasBT = Boolean(navigator.bluetooth);
    document.getElementById('btSupportNote').textContent = hasBT
      ? 'Доступно сопряжение по 4-значному Bluetooth PIN-коду между любыми устройствами и прямой сканер Web Bluetooth (BLE)!'
      : 'Используйте 4-значный Bluetooth PIN-код (Способ 1) или прямой P2P-код для мгновенного соединения двух устройств без настроек!';

    renderOnlineRoomsList();

    const container = document.getElementById('rulesList');
    container.innerHTML = Object.values(RULESETS).map(r => {
      const active = r.id === state.ruleId;
      return `<button data-rule="${r.id}" class="rule-select-btn w-full text-left p-3.5 rounded-2xl card border-2 transition ${active ? 'accent-soft' : ''}" style="border-color:${active ? 'var(--accent)' : 'var(--border-color)'}">
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm font-extrabold">${r.name}</span>
          <span class="text-[11px] px-2 py-0.5 rounded-lg surface border font-semibold shrink-0">${r.size}×${r.size}</span>
        </div>
        <div class="text-[11px] accent-text font-semibold mt-0.5">${r.region}</div>
        <p class="text-xs text-muted mt-1 leading-relaxed">${r.desc}</p>
      </button>`;
    }).join('');

    container.querySelectorAll('.rule-select-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.ruleId = btn.dataset.rule;
        persist(); renderModesAndRulesUI(); updateHeaderUI();
        showToast(`Выбраны правила: ${RULESETS[state.ruleId].name}`, 'success');
      });
    });
  }

  /* ======================== STYLES & SKINS UI (36 BOARDS + 36 PIECES + FRAMES + TITLES) ======================== */
  function renderStylesUI() {
    const acc = getActiveAccount();
    const filter = state.styleRarityFilter || 'all';

    document.querySelectorAll('.rfilter-btn').forEach(btn => {
      const active = btn.dataset.rfilter === filter;
      btn.className = `rfilter-btn px-3 py-1.5 rounded-xl text-xs font-extrabold ${active ? 'accent-bg' : 'card border'}`;
    });

    const allBoards = Object.values(BOARD_THEMES);
    const allPieces = Object.values(PIECE_STYLES);
    document.getElementById('unlockedBoardsCountLabel').textContent = `${acc.unlockedBoards.length} / ${allBoards.length}`;
    document.getElementById('unlockedPiecesCountLabel').textContent = `${acc.unlockedPieces.length} / ${allPieces.length}`;
    document.getElementById('unlockedFramesCountLabel').textContent = `${acc.unlockedFrames.length} / ${Object.keys(AVATAR_FRAMES).length}`;
    document.getElementById('unlockedTitlesCountLabel').textContent = `${acc.unlockedTitles.length} / ${PLAYER_TITLES.length}`;

    // 36 Board Themes
    const filteredBoards = allBoards.filter(t => {
      if (filter === 'unlocked') return acc.unlockedBoards.includes(t.id);
      if (filter !== 'all') return t.rarity === filter;
      return true;
    });
    const bGrid = document.getElementById('boardThemesGrid');
    bGrid.innerHTML = filteredBoards.map(t => {
      const unlocked = acc.unlockedBoards.includes(t.id);
      const active = t.id === state.boardTheme;
      const rInfo = RARITIES[t.rarity] || RARITIES.common;
      const frags = acc.fragments?.[`board:${t.id}`] || 0;
      return `<button data-btheme="${t.id}" class="btheme-btn p-3 rounded-2xl card border-2 text-left transition relative overflow-hidden ${unlocked ? '' : 'opacity-75'}" style="border-color:${active ? 'var(--accent)' : rInfo.border}">
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-[9px] font-black uppercase px-1.5 py-0.5 rounded" style="background:${rInfo.bg}; color:${rInfo.color}">${rInfo.name}</span>
          <span class="text-[10px] font-bold ${unlocked ? (active ? 'accent-text' : 'text-emerald-400') : 'text-amber-400'}">${unlocked ? (active ? '✓ Активно' : 'Доступно') : `🔒 Сундук ${frags > 0 ? `(${frags}/3 🧩)` : ''}`}</span>
        </div>
        <div class="w-full aspect-[4/3] rounded-xl overflow-hidden grid grid-cols-4 grid-rows-3 border mb-2" style="border-color:${t.frame}; background:${t.frame}; padding:3px;">
          ${Array.from({ length: 12 }, (_, i) => `<div style="background:${(Math.floor(i / 4) + (i % 4)) % 2 ? t.dark : t.light}"></div>`).join('')}
        </div>
        <div class="text-xs font-extrabold truncate">${escapeHtml(t.name)}</div>
        <div class="text-[10px] text-muted">${t.defaultUnlocked ? 'Базовый стиль (4/4)' : 'Эксклюзив из сундука CS2'}</div>
      </button>`;
    }).join('');

    bGrid.querySelectorAll('.btheme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.btheme;
        const t = BOARD_THEMES[id];
        if (!acc.unlockedBoards.includes(id)) {
          const frags = acc.fragments?.[`board:${id}`] || 0;
          openModal('🔒 Стиль доски закрыт', `
            <p>Стиль доски <b>«${escapeHtml(t.name)}»</b> (${RARITIES[t.rarity]?.name || 'Редкий'}) добывается через открытие <b>Обычных и Редких сундуков CS2</b> или сборку из 3 фрагментов (сейчас: <b>${frags}/3</b>).</p>
          `, [
            { label: 'Закрыть', cls: 'card border', onClick: closeModal },
            { label: '📦 Перейти к сундукам', cls: 'accent-bg', onClick: () => { closeModal(); switchTab('chests'); } }
          ]);
          return;
        }
        state.boardTheme = id;
        persist(); renderStylesUI(); drawBoard();
        showToast(`Выбран стиль доски: ${t.name}`, 'success');
      });
    });

    // 36 Piece Styles
    const filteredPieces = allPieces.filter(ps => {
      if (filter === 'unlocked') return acc.unlockedPieces.includes(ps.id);
      if (filter !== 'all') return ps.rarity === filter;
      return true;
    });
    const pGrid = document.getElementById('pieceStylesGrid');
    pGrid.innerHTML = filteredPieces.map(ps => {
      const unlocked = acc.unlockedPieces.includes(ps.id);
      const active = ps.id === state.pieceStyle;
      const rInfo = RARITIES[ps.rarity] || RARITIES.common;
      const frags = acc.fragments?.[`piece:${ps.id}`] || 0;
      return `<button data-pstyle="${ps.id}" class="pstyle-btn p-3.5 rounded-2xl card border-2 text-left transition ${unlocked ? '' : 'opacity-75'}" style="border-color:${active ? 'var(--accent)' : rInfo.border}">
        <div class="flex items-center justify-between mb-2">
          <span class="text-[9px] font-black uppercase px-1.5 py-0.5 rounded" style="background:${rInfo.bg}; color:${rInfo.color}">${rInfo.name}</span>
          <span class="text-[10px] font-bold ${unlocked ? (active ? 'accent-text' : 'text-emerald-400') : 'text-amber-400'}">${unlocked ? (active ? '✓ Активно' : 'Доступно') : `🔒 Сундук ${frags > 0 ? `(${frags}/3 🧩)` : ''}`}</span>
        </div>
        <div class="flex items-center gap-3 mb-2.5">
          <div class="w-9 h-9 rounded-full shadow-md border-2" style="background:radial-gradient(circle at 30% 30%, ${ps.wTop}, ${ps.wMid}); border-color:${ps.wEdge};"></div>
          <div class="w-9 h-9 rounded-full shadow-md border-2 flex items-center justify-center text-xs" style="background:radial-gradient(circle at 30% 30%, ${ps.bTop}, ${ps.bMid}); border-color:${ps.bEdge}; color:${ps.crownB};">♛</div>
        </div>
        <div class="text-xs font-extrabold truncate">${escapeHtml(ps.name)}</div>
        <div class="text-[10px] text-muted truncate">${escapeHtml(ps.desc)}</div>
      </button>`;
    }).join('');

    pGrid.querySelectorAll('.pstyle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.pstyle;
        const ps = PIECE_STYLES[id];
        if (!acc.unlockedPieces.includes(id)) {
          const frags = acc.fragments?.[`piece:${id}`] || 0;
          openModal('🔒 Стиль шашек закрыт', `
            <p>Стиль фигур <b>«${escapeHtml(ps.name)}»</b> (${RARITIES[ps.rarity]?.name || 'Редкий'}) выпадает из <b>Обычных и Редких сундуков CS2</b> или собирается из 3 фрагментов (сейчас: <b>${frags}/3</b>).</p>
          `, [
            { label: 'Закрыть', cls: 'card border', onClick: closeModal },
            { label: '📦 Открыть сундуки', cls: 'accent-bg', onClick: () => { closeModal(); switchTab('chests'); } }
          ]);
          return;
        }
        state.pieceStyle = id;
        persist(); renderStylesUI(); drawBoard();
        showToast(`Выбран стиль шашек: ${ps.name}`, 'success');
      });
    });

    // Avatar Frames
    const fGrid = document.getElementById('avatarFramesGrid');
    fGrid.innerHTML = Object.values(AVATAR_FRAMES).map(fr => {
      const unlocked = acc.unlockedFrames.includes(fr.id);
      const active = acc.avatarFrame === fr.id;
      const rInfo = RARITIES[fr.rarity] || RARITIES.common;
      return `<button data-frameid="${fr.id}" class="frame-pick-btn p-2.5 rounded-2xl card border-2 text-center space-y-1.5 transition ${unlocked ? '' : 'opacity-60'}" style="border-color:${active ? 'var(--accent)' : rInfo.border}">
        <div class="mx-auto w-10 h-10 rounded-xl flex items-center justify-center text-lg" style="background:linear-gradient(135deg,#334155,#0f172a); ${fr.css}">👑</div>
        <div class="text-[11px] font-extrabold truncate">${escapeHtml(fr.name)}</div>
        <div class="text-[9px] font-bold" style="color:${rInfo.color}">${unlocked ? (active ? '✓ Надет' : rInfo.name) : '🔒 В сундуке'}</div>
      </button>`;
    }).join('');
    fGrid.querySelectorAll('.frame-pick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const fid = btn.dataset.frameid;
        if (!acc.unlockedFrames.includes(fid)) {
          showToast('Эта рамка аватара выбивается в сундуках CS2 или за уровни!', 'info');
          return;
        }
        acc.avatarFrame = fid;
        persist(); updateAllUI(); renderStylesUI();
        showToast(`Надета рамка: ${AVATAR_FRAMES[fid].name}`, 'success');
      });
    });

    // Player Titles
    const tGrid = document.getElementById('playerTitlesGrid');
    tGrid.innerHTML = PLAYER_TITLES.map(tl => {
      const unlocked = acc.unlockedTitles.includes(tl.id);
      const active = acc.playerTitle === tl.id;
      const rInfo = RARITIES[tl.rarity] || RARITIES.common;
      return `<button data-titleid="${tl.id}" class="title-pick-btn px-3 py-2 rounded-xl card border flex items-center justify-between text-xs transition ${unlocked ? '' : 'opacity-60'}" style="border-color:${active ? 'var(--accent)' : rInfo.border}">
        <span class="font-extrabold truncate">${escapeHtml(tl.id)}</span>
        <span class="text-[10px] font-bold ml-1 shrink-0" style="color:${rInfo.color}">${unlocked ? (active ? '✓' : rInfo.name) : '🔒'}</span>
      </button>`;
    }).join('');
    tGrid.querySelectorAll('.title-pick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tid = btn.dataset.titleid;
        if (!acc.unlockedTitles.includes(tid)) {
          showToast('Этот титул можно выиграть в сундуках CS2 или турнирах!', 'info');
          return;
        }
        acc.playerTitle = tid;
        persist(); updateAllUI(); renderStylesUI();
        showToast(`Выбран титул: «${tid}»`, 'success');
      });
    });

    // App Themes & Accents
    const atGrid = document.getElementById('appThemesGrid');
    atGrid.innerHTML = APP_THEMES.map(t => {
      const active = state.settings.appTheme === t.id;
      return `<button data-atheme="${t.id}" class="atheme-btn p-3 rounded-2xl border-2 text-left transition" style="background:${t.bg}; color:${t.txt}; border-color:${active ? 'var(--accent)' : 'rgba(148,163,184,0.22)'}">
        <div class="flex items-center gap-1.5 mb-2">
          <span class="w-4 h-4 rounded-full border border-white/20" style="background:${t.surf}"></span>
          <span class="w-4 h-4 rounded-full" style="background:var(--accent)"></span>
        </div>
        <div class="text-xs font-extrabold">${t.name}</div>
      </button>`;
    }).join('');
    atGrid.querySelectorAll('.atheme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.settings.appTheme = btn.dataset.atheme;
        persist(); applyThemeAndPrefs(); renderStylesUI();
      });
    });

    const acGrid = document.getElementById('appAccentsGrid');
    acGrid.innerHTML = APP_ACCENTS.map(a => {
      const active = state.settings.appAccent === a.id;
      return `<button data-accentpick="${a.id}" class="aaccent-btn p-2.5 rounded-2xl card border-2 flex items-center gap-2 transition" style="border-color:${active ? a.hex : 'var(--border-color)'}">
        <span class="w-5 h-5 rounded-full shrink-0 shadow" style="background:${a.hex}"></span>
        <span class="text-xs font-bold truncate">${a.name}</span>
      </button>`;
    }).join('');
    acGrid.querySelectorAll('.aaccent-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.settings.appAccent = btn.dataset.accentpick;
        persist(); applyThemeAndPrefs(); renderStylesUI();
      });
    });
  }

  /* ======================== HISTORY UI & REPLAY ======================== */
  function renderHistoryUI() {
    const filter = document.getElementById('historyFilterSelect').value;
    const list = document.getElementById('historyList');
    const items = state.history.filter(h => filter === 'all' || h.outcome === filter);

    const delSelBtn = document.getElementById('deleteSelectedHistoryBtn');
    document.getElementById('selectedHistoryCount').textContent = state.selectedHistoryIds.size;
    delSelBtn.classList.toggle('hidden', state.selectedHistoryIds.size === 0);

    if (items.length === 0) {
      list.innerHTML = `<div class="text-center py-10 card border rounded-2xl">
        <div class="text-3xl mb-2">📜</div>
        <div class="text-sm font-bold">История игр пуста</div>
        <p class="text-xs text-muted mt-1">Завершённые партии появятся здесь автоматически</p>
      </div>`;
      return;
    }

    const modeLabels = { ai: '🤖 ИИ', local: '🤝 Вживую', online: '🌐 Онлайн', bluetooth: '📶 Bluetooth' };
    list.innerHTML = items.map(h => {
      const dt = new Date(h.date);
      const dateStr = dt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' +
        dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      const badgeCls = h.outcome === 'win' ? 'bg-emerald-500/15 text-emerald-400' : (h.outcome === 'loss' ? 'bg-rose-500/15 text-rose-400' : 'bg-sky-500/15 text-sky-400');
      const outcomeTxt = h.outcome === 'win' ? 'Победа' : (h.outcome === 'loss' ? 'Поражение' : 'Ничья');
      const checked = state.selectedHistoryIds.has(h.id);
      const ruleName = RULESETS[h.ruleId]?.name || h.ruleId;

      return `<div class="card border rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-start gap-3 min-w-0 flex-1">
          <input type="checkbox" data-hid="${h.id}" class="history-cb mt-1 w-4 h-4 rounded cursor-pointer" style="accent-color: var(--accent);" ${checked ? 'checked' : ''} />
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-xs font-extrabold px-2 py-0.5 rounded-lg ${badgeCls}">${outcomeTxt}</span>
              <span class="text-xs font-bold truncate">${escapeHtml(h.playerName)} vs ${escapeHtml(h.opponentName)}</span>
              ${h.eloDelta ? `<span class="text-[11px] font-bold ${h.eloDelta > 0 ? 'text-emerald-400' : 'text-rose-400'}">${h.eloDelta > 0 ? '+' : ''}${h.eloDelta} ELO</span>` : ''}
            </div>
            <div class="text-[11px] text-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span>${ruleName}</span><span>•</span><span>${modeLabels[h.mode] || h.mode}</span><span>•</span><span>${h.movesCount} ходов</span><span>•</span><span>${dateStr}</span>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          ${h.moves?.length ? `<button data-replay="${h.id}" class="replay-open-btn px-3 py-1.5 rounded-xl surface border text-xs font-bold hover:opacity-90">▶ Повтор</button>` : ''}
          <button data-del="${h.id}" class="history-del-btn px-2.5 py-1.5 rounded-xl bg-rose-500/15 text-rose-400 text-xs font-bold hover:bg-rose-500/25" title="Удалить">🗑️</button>
        </div>
      </div>`;
    }).join('');

    list.querySelectorAll('.history-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) state.selectedHistoryIds.add(cb.dataset.hid);
        else state.selectedHistoryIds.delete(cb.dataset.hid);
        renderHistoryUI();
      });
    });

    list.querySelectorAll('.history-del-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.del;
        openModal('Удалить партию?', 'Запись будет удалена из истории игр.', [
          { label: 'Отмена', cls: 'card border', onClick: closeModal },
          {
            label: 'Удалить', cls: 'bg-rose-500 text-white', onClick: () => {
              state.history = state.history.filter(x => x.id !== id);
              state.selectedHistoryIds.delete(id);
              persist(); closeModal(); updateAllUI();
              showToast('Партия удалена', 'info');
            }
          }
        ]);
      });
    });

    list.querySelectorAll('.replay-open-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const rec = state.history.find(x => x.id === btn.dataset.replay);
        if (rec) startReplay(rec);
      });
    });
  }

  function startReplay(rec) {
    if (game.clockInterval) clearInterval(game.clockInterval);
    if (game.aiTimeout) clearTimeout(game.aiTimeout);
    state.ruleId = rec.ruleId;
    game.active = true;
    game.replay = { record: rec, index: 0 };
    game.board = createInitialBoard(RULESETS[rec.ruleId]);
    game.selected = null;
    clearChainState(false);
    game.hintMove = null;
    game.lastMove = null;
    document.getElementById('replayBanner').classList.remove('hidden');
    document.getElementById('replayInfoText').textContent = `${rec.playerName} vs ${rec.opponentName}`;
    state.currentPage = 'arena';
    document.body.classList.add('arena-lock');
    document.getElementById('lobbyShell').classList.add('hidden');
    document.getElementById('gameArenaPage').classList.remove('hidden');
    updateReplayStep(0);
  }

  function updateReplayStep(idx) {
    if (!game.replay) return;
    const moves = game.replay.record.moves || [];
    const clamped = Math.max(0, Math.min(moves.length, idx));
    game.replay.index = clamped;
    game.board = clamped === 0
      ? createInitialBoard(RULESETS[game.replay.record.ruleId])
      : cloneBoard(moves[clamped - 1].boardAfter);
    document.getElementById('replayStepLabel').textContent = `${clamped}/${moves.length}`;
    updateAllUI();
    requestAnimationFrame(resizeCanvas);
  }

  /* ======================== SETTINGS & OVERHAULED ACCOUNT UI ======================== */
  function renderSettingsUI() {
    document.getElementById('settingTimeControl').value = state.settings.timeControl;
    document.getElementById('settingHintStyle').value = state.settings.hintStyle || 'dots';
    document.getElementById('settingBoardSize').value = String(state.settings.boardSize || 640);
    document.getElementById('settingAnimSpeed').value = String(state.settings.animSpeed);

    const masterVol = Number(state.settings.volume ?? 60);
    const musicVol = Number(state.settings.musicVolume ?? 25);
    const sfxVol = Number(state.settings.sfxVolume ?? 55);
    const notifVol = Number(state.settings.notificationsVolume ?? 50);

    document.getElementById('settingVolume').value = String(masterVol);
    document.getElementById('volumeValueLabel').textContent = masterVol + '%';

    const mInput = document.getElementById('settingMusicVolume');
    const mLbl = document.getElementById('musicVolumeValueLabel');
    if (mInput) mInput.value = String(musicVol);
    if (mLbl) mLbl.textContent = musicVol + '%';

    const xInput = document.getElementById('settingSfxVolume');
    const xLbl = document.getElementById('sfxVolumeValueLabel');
    if (xInput) xInput.value = String(sfxVol);
    if (xLbl) xLbl.textContent = sfxVol + '%';

    const nInput = document.getElementById('settingNotificationsVolume');
    const nLbl = document.getElementById('notificationsVolumeValueLabel');
    if (nInput) nInput.value = String(notifVol);
    if (nLbl) nLbl.textContent = notifVol + '%';

    const masterBadge = document.getElementById('masterSoundStateBadge');
    if (masterBadge) {
      const on = Boolean(state.settings.soundEnabled);
      masterBadge.textContent = on ? 'Звук включён' : 'Звук полностью отключён';
      masterBadge.className = on
        ? 'text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold'
        : 'text-[10px] px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-bold';
    }

    const keyInput = document.getElementById('settingGeminiApiKey');
    if (keyInput) keyInput.value = state.settings.geminiApiKey || '';
    const modelSel = document.getElementById('settingGeminiModel');
    if (modelSel) modelSel.value = state.settings.geminiModel || 'gemini-2.5-flash';
    const keyInd = document.getElementById('geminiKeySavedIndicator');
    if (keyInd) {
      const mName = state.settings.geminiModel || 'gemini-2.5-flash';
      keyInd.textContent = (state.settings.geminiApiKey && state.settings.geminiApiKey.length >= 20)
        ? `✓ Персональный ключ (${mName}) сохранён`
        : '✓ Встроенный ИИ-комментатор Gemini активен';
    }
    document.querySelectorAll('.setting-toggle').forEach(btn => {
      const k = btn.dataset.setting;
      const val = state.settings[k] !== undefined ? Boolean(state.settings[k]) : true;
      btn.classList.toggle('on', val);
    });
    SoundFX.syncSettings();
  }

  function renderAccountUI() {
    const acc = getActiveAccount();
    const lvInfo = getLevelInfoFromXp(acc.xp);
    const rank = getRankForLevel(lvInfo.level);
    const chestTier = getChestTierByLevel(lvInfo.level);

    setAvatarEl(document.getElementById('profileBigAvatar'), acc.avatarIdx, acc.avatarPhoto, acc.avatarFrame);
    document.getElementById('profileNameDisplay').textContent = acc.name;
    document.getElementById('profileCountryDisplay').textContent = acc.flag;
    document.getElementById('profileTitleBadge').textContent = `«${acc.playerTitle || 'Новичок шашек'}»`;
    document.getElementById('profileRankBadge').innerHTML = `
      <span class="inline-flex items-center text-xs font-extrabold px-2.5 py-0.5 rounded-lg card border" style="color:${rank.color}">
        ${rank.icon} ${rank.fullLabel} ${renderStripesHtml(rank.stripes, rank.color)}
      </span>`;
    document.getElementById('profileLevelText').textContent = `Уровень ${lvInfo.level}`;
    document.getElementById('profileChestTierLabel').textContent = `Тир сундуков: ${chestTier.icon} ${chestTier.name}`;
    document.getElementById('profileXpText').textContent = `${lvInfo.xpInLevel} / ${lvInfo.xpForNext} EXP`;
    document.getElementById('profileXpBar').style.width = `${Math.max(6, lvInfo.pct)}%`;

    document.getElementById('accountNameInput').value = acc.name;
    document.getElementById('accountFlagSelect').value = acc.flag;

    const total = acc.wins + acc.losses + acc.draws;
    const wr = total > 0 ? Math.round((acc.wins / total) * 100) : 0;
    document.getElementById('statElo').textContent = acc.elo;
    document.getElementById('statPeakElo').textContent = acc.peakElo || acc.elo;
    document.getElementById('statLevel').textContent = lvInfo.level;
    document.getElementById('statStreak').textContent = `🔥 ${acc.streak || 0}`;
    document.getElementById('statBestStreak').textContent = acc.bestStreak || 0;
    document.getElementById('statWinrate').textContent = wr + '%';

    document.getElementById('statWLD').textContent = `${acc.wins} / ${acc.draws} / ${acc.losses}`;
    document.getElementById('statCaptures').textContent = acc.capturesTotal || 0;
    document.getElementById('statKings').textContent = acc.kingsPromoted || 0;
    document.getElementById('statTourneys').textContent = acc.tournamentsWon || 0;
    document.getElementById('statChests').textContent = acc.chestsOpened || 0;
    document.getElementById('statStylesOwned').textContent = `${(acc.unlockedBoards?.length || 4) + (acc.unlockedPieces?.length || 4)} / 72`;

    document.getElementById('nextRankPreview').textContent = `${rank.nextLabel} (на уровне ${rank.nextLevel})`;
    document.getElementById('currentRankStripesBig').innerHTML = renderStripesHtml(rank.stripes, rank.color);

    const avGrid = document.getElementById('avatarPickerGrid');
    avGrid.innerHTML = AVATARS.map((av, idx) => `
      <button data-av="${idx}" class="av-pick-btn h-10 rounded-xl flex items-center justify-center text-lg transition ${(!acc.avatarPhoto && acc.avatarIdx === idx) ? 'ring-2 ring-white scale-105' : 'opacity-80 hover:opacity-100'}" style="background:${av.bg}">
        ${av.icon}
      </button>
    `).join('');
    avGrid.querySelectorAll('.av-pick-btn').forEach(b => {
      b.addEventListener('click', () => {
        acc.avatarIdx = Number(b.dataset.av);
        acc.avatarPhoto = null;
        persist(); updateAllUI();
      });
    });

    const accList = document.getElementById('accountsList');
    accList.innerHTML = state.accounts.map(a => {
      const active = a.id === state.activeAccountId;
      return `<button data-accid="${a.id}" class="acc-switch-btn px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ${active ? 'accent-bg' : 'card border'}">
        <span>${AVATARS[(a.avatarIdx || 0) % AVATARS.length].icon}</span><span>${escapeHtml(a.name)}</span>
      </button>`;
    }).join('');

    const authStatusEl = document.getElementById('accountAuthStatus');
    const emailDispEl = document.getElementById('accountEmailDisplay');
    const logoutBtn = document.getElementById('logoutAccountBtn');
    const sideAuthBtn = document.getElementById('sidebarAuthBtn');
    if (authStatusEl) {
      authStatusEl.textContent = acc.registered ? '✓ Зарегистрированный аккаунт' : 'Гостевой режим';
      authStatusEl.className = acc.registered ? 'font-bold text-emerald-400' : 'font-bold text-muted';
    }
    if (emailDispEl) emailDispEl.textContent = acc.email || '';
    if (logoutBtn) logoutBtn.classList.toggle('hidden', !acc.registered);
    if (sideAuthBtn) {
      sideAuthBtn.textContent = acc.registered ? '🚪 Выйти из аккаунта' : '🔐 Войти / Регистрация';
      sideAuthBtn.className = acc.registered
        ? 'w-full py-2 px-3 rounded-xl surface border text-xs font-bold hover:opacity-90 transition'
        : 'w-full py-2 px-3 rounded-xl accent-bg text-xs font-extrabold transition shadow-sm';
    }

    accList.querySelectorAll('.acc-switch-btn').forEach(b => {
      b.addEventListener('click', () => {
        const targetAcc = state.accounts.find(x => x.id === b.dataset.accid);
        if (!targetAcc) return;
        activateAccount(targetAcc);
        persist();
        showToast(`Активный аккаунт: ${targetAcc.name}`, 'success');
      });
    });

    // Overhauled 24 Claimable Achievements
    let unlockedCount = 0;
    const achGrid = document.getElementById('achievementsGrid');
    achGrid.innerHTML = ACHIEVEMENTS_CATALOG.map(ach => {
      const curVal = Math.min(ach.target, ach.val(acc));
      const completed = curVal >= ach.target;
      const claimed = acc.claimedAchievements.includes(ach.id);
      if (completed) unlockedCount++;
      const pct = Math.min(100, Math.round((curVal / ach.target) * 100));

      return `<div class="card border rounded-2xl p-3 flex flex-col justify-between gap-2 ${completed ? '' : 'opacity-75'}" style="${completed && !claimed ? 'border-color:var(--accent)' : ''}">
        <div class="flex items-start gap-2.5">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${completed ? 'accent-soft' : 'elevated'}">${ach.icon}</div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-1">
              <span class="text-xs font-extrabold truncate">${escapeHtml(ach.title)}</span>
              <span class="text-[9px] px-1.5 py-0.5 rounded elevated text-muted font-bold shrink-0">${escapeHtml(ach.cat)}</span>
            </div>
            <div class="text-[11px] text-muted">${escapeHtml(ach.desc)}</div>
          </div>
        </div>
        <div class="space-y-1.5">
          <div class="flex items-center justify-between text-[10px] font-bold">
            <span class="text-emerald-400">+${ach.xp} EXP • +${ach.coins} 🪙 • +${ach.crystals} 💎</span>
            <span class="font-mono text-muted">${curVal}/${ach.target}</span>
          </div>
          <div class="h-1.5 rounded-full elevated overflow-hidden">
            <div class="h-full accent-bg" style="width:${pct}%"></div>
          </div>
          ${claimed
            ? `<div class="text-[10px] font-extrabold text-emerald-400 text-right">✓ Награда получена</div>`
            : (completed
                ? `<button data-claimach="${ach.id}" class="claim-ach-btn w-full py-1 rounded-xl accent-bg text-[11px] font-black">Забрать награду!</button>`
                : ''
              )
          }
        </div>
      </div>`;
    }).join('');

    document.getElementById('achievementsProgressLabel').textContent = `${unlockedCount} / ${ACHIEVEMENTS_CATALOG.length}`;

    achGrid.querySelectorAll('.claim-ach-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const ach = ACHIEVEMENTS_CATALOG.find(x => x.id === btn.dataset.claimach);
        if (!ach || acc.claimedAchievements.includes(ach.id)) return;
        const prevLv = getLevelInfoFromXp(acc.xp).level;
        acc.claimedAchievements.push(ach.id);
        acc.xp += ach.xp;
        acc.coins += ach.coins;
        acc.crystals += (ach.crystals || 0);
        const newLv = getLevelInfoFromXp(acc.xp).level;
        checkAndQueueLevelUpRewards(prevLv, newLv);
        persist();
        updateAllUI();
        SoundFX.play('win');
        showToast(`Достижение «${ach.title}»: +${ach.xp} EXP, +${ach.coins} 🪙!`, 'success');
      });
    });
  }

  /* ======================== CHAT, MODAL & TOAST ======================== */
  function updateChatUnreadBadges() {
    ['chatUnreadDesktop', 'chatUnreadMobile'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = state.unreadChat;
      el.classList.toggle('hidden', state.unreadChat <= 0);
    });
  }

  function appendChat(sender, text, isSystem = false, isAI = false) {
    if (!isSystem && state.settings.ignoreMessages && sender !== getActiveAccount().name) return;
    const badge = isAI ? `<span class="text-[9px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-400 font-bold mr-1">AI</span>` : '';
    const html = isSystem
      ? `<div class="text-muted italic text-center">${escapeHtml(text)}</div>`
      : `<div>${badge}<span class="font-bold ${isAI ? 'text-sky-400' : 'accent-text'}">${escapeHtml(sender)}:</span> <span>${escapeHtml(text)}</span></div>`;
    ['chatMessages', 'mobileChatMessages'].forEach(id => {
      const box = document.getElementById(id);
      if (!box) return;
      box.insertAdjacentHTML('beforeend', html);
      box.scrollTop = box.scrollHeight;
    });
    if (!isSystem && state.sidePanelTab !== 'chat') {
      state.unreadChat++;
      updateChatUnreadBadges();
    }
  }

  function sendChatMessage(rawText) {
    const txt = String(rawText || '').trim().slice(0, 160);
    if (!txt) return;
    const acc = getActiveAccount();
    appendChat(game.isSpectator ? `👁 ${acc.name}` : acc.name, txt, false);
    if (net.connected) {
      sendNetMessage({ type: 'chat', text: txt, senderName: acc.name, isSpectator: game.isSpectator });
    } else if (state.mode === 'ai') {
      const rule = RULESETS[state.ruleId];
      requestGeminiAIComment({
        eventType: 'chat',
        playerMessage: txt,
        moveNotation: game.lastMove ? formatMoveNotation(game.lastMove, rule.size) : '',
        moveNumber: game.moveHistory.length,
        ruleName: rule.name
      });
    }
  }

  function openModal(title, bodyHtml, actions = []) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = bodyHtml;
    const actBox = document.getElementById('modalActions');
    actBox.innerHTML = '';
    actions.forEach(a => {
      const btn = document.createElement('button');
      btn.className = `px-4 py-2 rounded-xl text-xs font-bold transition ${a.cls || 'card border'}`;
      btn.textContent = a.label;
      btn.addEventListener('click', a.onClick);
      actBox.appendChild(btn);
    });
    document.getElementById('modalOverlay').classList.remove('hidden');
  }

  function closeModal() { document.getElementById('modalOverlay').classList.add('hidden'); }

  function showToast(text, type = 'info') {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    const bg = type === 'success' ? 'bg-emerald-600 text-white' : (type === 'error' ? 'bg-rose-600 text-white' : 'surface border');
    el.className = `pointer-events-auto px-4 py-2.5 rounded-2xl shadow-xl text-xs font-bold text-center transition-all duration-300 ${bg}`;
    el.textContent = text;
    container.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(-6px)'; setTimeout(() => el.remove(), 300); }, 2800);
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => showToast(`Код ${text} скопирован!`, 'success')).catch(() => fallbackCopy(text));
    } else fallbackCopy(text);
  }
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); showToast(`Код ${text} скопирован!`, 'success'); } catch (_) {}
    ta.remove();
  }

  /* ======================== LOBBY TAB SWITCHER ======================== */
  function switchTab(tabId) {
    state.activeTab = tabId;
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    const target = document.getElementById('tab-' + tabId);
    if (target) target.classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
    if (tabId === 'home') renderModesAndRulesUI();
    if (tabId === 'tournaments') renderTournamentsUI();
    if (tabId === 'chests') renderChestsUI();
    if (tabId === 'styles') renderStylesUI();
    if (tabId === 'history') renderHistoryUI();
    if (tabId === 'settings') renderSettingsUI();
    if (tabId === 'account') renderAccountUI();
  }

  /* ======================== EVENT BINDINGS ======================== */
  function bindEvents() {
    document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
    document.getElementById('sidebarAccountCard').addEventListener('click', () => switchTab('account'));
    document.getElementById('resumeGameSidebarBtn').addEventListener('click', () => resumeSavedMatchFromSnapshot());
    document.getElementById('resumeGameMobileBtn').addEventListener('click', () => resumeSavedMatchFromSnapshot());
    const resumeBannerBtn = document.getElementById('resumeSavedMatchBannerBtn');
    if (resumeBannerBtn) resumeBannerBtn.addEventListener('click', () => resumeSavedMatchFromSnapshot());
    const discardSavedBtn = document.getElementById('discardSavedMatchBtn');
    if (discardSavedBtn) {
      discardSavedBtn.addEventListener('click', () => {
        state.savedGameSnapshot = null;
        game.active = false;
        persist();
        updateLobbyResumeButtons();
        showToast('Сохранённая незавершённая партия удалена', 'info');
      });
    }
    const migrateBannerBtn = document.getElementById('migrateGuestBannerBtn');
    if (migrateBannerBtn) {
      migrateBannerBtn.addEventListener('click', () => {
        if (typeof window.openCenteredAuthScreen === 'function') window.openCenteredAuthScreen('register');
      });
    }

    // Clickable Level Badges -> Open Swipeable Horizontal Level Road!
    ['sidebarLevelRoadBtn', 'mobileAccountPill', 'heroOpenLevelRoadBtn', 'chestOpenLevelRoadBtn', 'profileLevelCardBtn', 'openLevelRoadBtn', 'statLevelBoxBtn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', openLevelRoadModal);
    });
    document.getElementById('closeLevelRoadModalBtn').addEventListener('click', closeLevelRoadModal);
    document.getElementById('levelRoadModalOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'levelRoadModalOverlay') closeLevelRoadModal();
    });
    document.getElementById('levelRoadScrollLeftBtn').addEventListener('click', () => {
      document.getElementById('levelRoadTrack').scrollBy({ left: -420, behavior: 'smooth' });
    });
    document.getElementById('levelRoadScrollRightBtn').addEventListener('click', () => {
      document.getElementById('levelRoadTrack').scrollBy({ left: 420, behavior: 'smooth' });
    });
    document.getElementById('levelRoadCenterMeBtn').addEventListener('click', scrollToCurrentLevelInRoad);
    document.getElementById('claimAllLevelsBtn').addEventListener('click', claimAllAvailableLevelRewards);

    // Drag-to-scroll (Swipe right/left) on Level Road Track
    const lrTrack = document.getElementById('levelRoadTrack');
    let isDownLR = false, startXLR = 0, scrollLeftLR = 0;
    lrTrack.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      isDownLR = true;
      startXLR = e.pageX - lrTrack.offsetLeft;
      scrollLeftLR = lrTrack.scrollLeft;
    });
    window.addEventListener('pointerup', () => { isDownLR = false; });
    lrTrack.addEventListener('pointermove', (e) => {
      if (!isDownLR) return;
      e.preventDefault();
      const x = e.pageX - lrTrack.offsetLeft;
      const walk = (x - startXLR) * 1.4;
      lrTrack.scrollLeft = scrollLeftLR - walk;
    });

    // Quick Play & Navigation
    document.getElementById('heroQuickPlayBtn').addEventListener('click', () => openGameArena(true));
    document.getElementById('heroQuickTourneyBtn').addEventListener('click', () => switchTab('tournaments'));
    document.getElementById('applyModeStartBtn').addEventListener('click', () => openGameArena(true));
    document.getElementById('backToLobbyBtn').addEventListener('click', () => openLobbyPage('home'));
    document.getElementById('arenaQuickStyleBtn').addEventListener('click', () => openLobbyPage('styles'));
    document.getElementById('goToChestsFromBoardsBtn').addEventListener('click', () => switchTab('chests'));
    document.getElementById('goToChestsFromPiecesBtn').addEventListener('click', () => switchTab('chests'));

    // Waiting Room Overlay & Spectator controls
    document.getElementById('copyWaitingCodeBtn').addEventListener('click', () => {
      if (net.roomId) copyToClipboard(net.roomId);
    });
    document.getElementById('cancelWaitingRoomBtn').addEventListener('click', () => {
      resetNetwork();
      openLobbyPage('home');
      showToast('Ожидание отменено', 'info');
    });
    document.getElementById('exitSpectatorBtn').addEventListener('click', () => {
      resetNetwork();
      openLobbyPage('home');
    });

    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
    document.getElementById('modalOverlay').addEventListener('click', (e) => { if (e.target.id === 'modalOverlay') closeModal(); });
    document.getElementById('quickSoundBtn').addEventListener('click', () => {
      state.settings.soundEnabled = !state.settings.soundEnabled;
      SoundFX.syncSettings();
      persist(); updateHeaderUI(); renderSettingsUI();
      showToast(state.settings.soundEnabled ? '🔊 Звук включён' : '🔇 Весь звук отключён', 'info');
    });

    // Quick Ignore Emojis & Ignore Messages buttons in Arena
    document.getElementById('quickIgnoreEmojisBtn').addEventListener('click', () => {
      state.settings.ignoreEmojis = !state.settings.ignoreEmojis;
      persist(); updateHeaderUI(); renderSettingsUI();
      showToast(state.settings.ignoreEmojis ? '🔕 Входящие эмодзи заблокированы' : '🔔 Эмодзи включены', 'info');
    });
    document.getElementById('quickIgnoreMsgsBtn').addEventListener('click', () => {
      state.settings.ignoreMessages = !state.settings.ignoreMessages;
      persist(); updateHeaderUI(); renderSettingsUI();
      showToast(state.settings.ignoreMessages ? '🔇 Входящие сообщения и комментарии скрыты' : '🔊 Чат включён', 'info');
    });

    // Desktop Side Panel Tabs (Moves / Chat)
    const setSideTab = (tab) => {
      state.sidePanelTab = tab;
      document.getElementById('sidePanelMoves').classList.toggle('hidden', tab !== 'moves');
      document.getElementById('sidePanelChat').classList.toggle('hidden', tab !== 'chat');
      document.getElementById('sideTabMovesBtn').className = `py-1.5 rounded-lg text-xs font-extrabold transition ${tab === 'moves' ? 'accent-bg' : 'text-muted'}`;
      document.getElementById('sideTabChatBtn').className = `py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${tab === 'chat' ? 'accent-bg' : 'text-muted'}`;
      if (tab === 'chat') { state.unreadChat = 0; updateChatUnreadBadges(); }
    };
    document.getElementById('sideTabMovesBtn').addEventListener('click', () => setSideTab('moves'));
    document.getElementById('sideTabChatBtn').addEventListener('click', () => setSideTab('chat'));

    // Arena Actions (Respects 3 Play Assist Modes: 'free', 'rethink', 'honest' + Boosters!)
    const doUndo = () => {
      if (game.isSpectator || game.over) return;
      if (game.liveReviewIndex !== null) setLiveReviewStep(null);
      const mults = getMatchEconomyMultipliers();
      if (!mults.assist.allowUndo) {
        showToast('🔴 В режиме «Честно» (×1.5 EXP) отмена хода отключена!', 'error');
        return;
      }
      if (!state.settings.allowUndo) {
        showToast('Отмена хода отключена в настройках', 'info');
        return;
      }
      if (game.chainPiece) {
        clearChainState(true); game.selected = null; updateAllUI(); drawBoard();
        showToast('Серия взятия отменена — выберите другой ход', 'info'); return;
      }
      if (game.undoStack.length === 0) return;
      const steps = (state.mode === 'ai' && game.turn === game.humanColor && game.undoStack.length >= 2) ? 2 : 1;
      for (let i = 0; i < steps; i++) {
        const snap = game.undoStack.pop();
        if (!snap) break;
        game.board = snap.board; game.turn = snap.turn; game.lastMove = snap.lastMove; game.moveHistory.length = snap.moveHistoryLen;
      }
      game.selected = null; clearChainState(false); game.hintMove = null; game.anim = null;
      game.legalMoves = getAllLegalMoves(game.board, game.turn, RULESETS[state.ruleId]);
      saveLiveMatchSnapshot();
      persist();
      updateAllUI(); drawBoard(); showToast('↩️ Вы одумались и вернули ход! Сходите ещё раз.', 'info');
    };
    const doHint = () => {
      if (!isHumanTurn() || game.over) return;
      if (game.liveReviewIndex !== null) setLiveReviewStep(null);
      const mults = getMatchEconomyMultipliers();
      if (!mults.assist.allowHints) {
        showToast(`В режиме «${mults.assist.shortName}» подсказки отключены для повышенного EXP!`, 'error');
        return;
      }
      if (game.chainPiece && game.chainCandidateMoves.length > 0) {
        game.hintMove = game.chainCandidateMoves[0]; drawBoard();
        showToast('Продолжите взятие по стрелке', 'info'); return;
      }
      const best = chooseAIMove(game.board, game.turn, RULESETS[state.ruleId], 4);
      if (best) { game.hintMove = best; drawBoard(); showToast(`💡 Совет Мастера: ${formatMoveNotation(best, RULESETS[state.ruleId].size)}`, 'info'); }
    };

    // Live Previous Moves Review Controls
    document.getElementById('liveRevFirstBtn').addEventListener('click', () => {
      if (game.moveHistory.length === 0) return;
      setLiveReviewStep(0);
    });
    document.getElementById('liveRevPrevBtn').addEventListener('click', () => {
      if (game.moveHistory.length === 0) return;
      const cur = game.liveReviewIndex === null ? game.moveHistory.length : game.liveReviewIndex;
      setLiveReviewStep(Math.max(0, cur - 1));
    });
    document.getElementById('liveRevNextBtn').addEventListener('click', () => {
      if (game.liveReviewIndex === null) return;
      setLiveReviewStep(game.liveReviewIndex + 1);
    });
    document.getElementById('liveRevLatestBtn').addEventListener('click', () => setLiveReviewStep(null));
    document.getElementById('liveReviewResumeBtn').addEventListener('click', () => setLiveReviewStep(null));
    const doFlip = () => { game.flipped = !game.flipped; updatePlayerBars(); drawBoard(); };
    const doResign = () => {
      if (game.over || game.replay || game.isSpectator) return;
      openModal('Сдаться?', 'При поражении EXP за матч не начисляется, а серия побед обнуляется. Сдаться?', [
        { label: 'Отмена', cls: 'card border', onClick: closeModal },
        {
          label: 'Сдаться', cls: 'bg-rose-500 text-white', onClick: () => {
            closeModal();
            if (net.connected) sendNetMessage({ type: 'resign' });
            const loser = state.mode === 'local' ? game.turn : game.humanColor;
            finishGame(loser === 'w' ? 'b' : 'w', 'Игрок сдался');
          }
        }
      ]);
    };
    const doDraw = () => {
      if (game.over || game.replay || game.isSpectator) return;
      if (net.connected) {
        sendNetMessage({ type: 'draw_offer' }); showToast('Предложение ничьей отправлено', 'info'); return;
      }
      openModal('Предложить ничью?', 'Завершить текущую партию вничью (+50 EXP)?', [
        { label: 'Продолжить', cls: 'card border', onClick: closeModal },
        { label: 'Согласиться на ничью', cls: 'accent-bg', onClick: () => { closeModal(); finishGame('draw', 'Ничья по соглашению'); } }
      ]);
    };

    document.getElementById('newGameBtn').addEventListener('click', () => startNewGame());
    document.getElementById('undoBtn').addEventListener('click', doUndo);
    document.getElementById('hintBtn').addEventListener('click', doHint);
    document.getElementById('flipBoardBtn').addEventListener('click', doFlip);
    document.getElementById('resignBtn').addEventListener('click', doResign);
    document.getElementById('drawOfferBtn').addEventListener('click', doDraw);

    // Mobile compact action bar
    document.getElementById('mobNewBtn').addEventListener('click', () => startNewGame());
    document.getElementById('mobUndoBtn').addEventListener('click', doUndo);
    document.getElementById('mobHintBtn').addEventListener('click', doHint);
    document.getElementById('mobEmojiBtn').addEventListener('click', () => {
      document.getElementById('mobileChatSheet').classList.add('hidden');
      document.getElementById('mobileEmojiSheet').classList.toggle('hidden');
    });
    document.getElementById('closeEmojiSheetBtn').addEventListener('click', () => document.getElementById('mobileEmojiSheet').classList.add('hidden'));
    document.getElementById('mobChatBtn').addEventListener('click', () => {
      document.getElementById('mobileEmojiSheet').classList.add('hidden');
      const sheet = document.getElementById('mobileChatSheet');
      sheet.classList.toggle('hidden');
      if (!sheet.classList.contains('hidden')) { state.unreadChat = 0; updateChatUnreadBadges(); }
    });
    document.getElementById('closeChatSheetBtn').addEventListener('click', () => document.getElementById('mobileChatSheet').classList.add('hidden'));
    document.getElementById('mobMoreBtn').addEventListener('click', () => {
      openModal('Действия партии', 'Выберите дополнительное действие:', [
        { label: 'Повернуть', cls: 'card border', onClick: () => { closeModal(); doFlip(); } },
        { label: 'Ничья', cls: 'card border', onClick: () => { closeModal(); doDraw(); } },
        { label: 'Сдаться', cls: 'bg-rose-500 text-white', onClick: () => { closeModal(); doResign(); } }
      ]);
    });

    // Emoji reactions
    document.querySelectorAll('.emote-btn').forEach(b => {
      b.addEventListener('click', () => {
        const em = b.dataset.emote;
        triggerFloatingEmote(em, 'bottom');
        document.getElementById('mobileEmojiSheet').classList.add('hidden');
        if (net.connected) {
          sendNetMessage({ type: 'emote', emote: em });
        } else if (state.mode === 'ai' && !state.settings.ignoreEmojis && Math.random() < 0.7) {
          const oppEmotes = ['👋', '👏', '🔥', '😎', '🤔'];
          setTimeout(() => triggerFloatingEmote(oppEmotes[Math.floor(Math.random() * oppEmotes.length)], 'top'), 750);
        }
      });
    });

    // Chat send
    document.getElementById('chatSendBtn').addEventListener('click', () => {
      const inp = document.getElementById('chatInput'); sendChatMessage(inp.value); inp.value = '';
    });
    document.getElementById('chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('chatSendBtn').click(); });
    document.getElementById('mobileChatSendBtn').addEventListener('click', () => {
      const inp = document.getElementById('mobileChatInput'); sendChatMessage(inp.value); inp.value = '';
    });
    document.getElementById('mobileChatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('mobileChatSendBtn').click(); });

    // Confirm move
    document.getElementById('confirmMoveYes').addEventListener('click', () => {
      if (game.pendingConfirmMove) executeCompleteMove(game.pendingConfirmMove, false, game.pendingAnimFrom);
    });
    document.getElementById('confirmMoveNo').addEventListener('click', () => {
      game.pendingConfirmMove = null; game.pendingAnimFrom = null;
      document.getElementById('confirmMoveBar').classList.add('hidden'); drawBoard();
    });

    document.getElementById('openRuleInfoBtn').addEventListener('click', () => {
      const r = RULESETS[state.ruleId];
      openModal(r.name, `<div class="space-y-2"><div class="text-xs font-bold accent-text">${r.region} • Доска ${r.size}×${r.size}</div><p>${r.desc}</p><ul class="text-xs space-y-1 pt-2 border-t" style="border-color: var(--border-color);"><li>• Бой назад простой: <b>${r.menCaptureBack ? 'Да' : 'Нет'}</b></li><li>• Летающая дамка: <b>${r.flyingKing ? 'Да' : 'Нет (1 клетка)'}</b></li><li>• Правило большинства: <b>${r.majorityCapture ? 'Обязательно' : 'Любой бой'}</b></li><li>• Ходы: <b>${r.orthogonal ? 'Вертикаль и горизонталь' : 'Диагональ'}</b></li></ul></div>`, [{ label: 'Понятно', cls: 'accent-bg', onClick: closeModal }]);
    });

    document.getElementById('connManageBtn').addEventListener('click', () => openLobbyPage('home'));

    // Replay
    document.getElementById('replayFirstBtn').addEventListener('click', () => updateReplayStep(0));
    document.getElementById('replayPrevBtn').addEventListener('click', () => updateReplayStep((game.replay?.index || 0) - 1));
    document.getElementById('replayNextBtn').addEventListener('click', () => updateReplayStep((game.replay?.index || 0) + 1));
    document.getElementById('replayLastBtn').addEventListener('click', () => updateReplayStep(game.replay?.record?.moves?.length || 0));
    document.getElementById('replayExitBtn').addEventListener('click', () => openLobbyPage('history'));

    // Lobby Modes & 3 Assist Modes & 5 AI Levels (Guests restricted to AI mode only!)
    document.querySelectorAll('.mode-card').forEach(btn => btn.addEventListener('click', () => {
      const targetMode = btn.dataset.mode;
      if (isCurrentUserGuest() && targetMode !== 'ai') {
        const modeTitles = {
          online: 'Онлайн-игра с реальными пользователями, создание комнат и приглашение друзей',
          bluetooth: 'Игра по Bluetooth с реальными игроками',
          local: 'Игра с другим человеком на одном экране'
        };
        promptGuestRegistrationForFeature(modeTitles[targetMode] || 'Игра с реальными пользователями');
        state.mode = 'ai';
        renderModesAndRulesUI();
        return;
      }
      state.mode = targetMode;
      persist();
      renderModesAndRulesUI();
    }));
    document.getElementById('aiDifficultySelect').addEventListener('change', (e) => {
      state.aiDifficulty = Number(e.target.value);
      persist();
      renderModesAndRulesUI();
    });
    document.querySelectorAll('.assist-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.settings.playAssistMode = btn.dataset.assist;
        persist();
        renderModesAndRulesUI();
        updateHeaderUI();
        const m = PLAY_ASSIST_MODES[btn.dataset.assist];
        if (m) showToast(`Режим: ${m.name} (×${m.expMult} EXP)`, 'info');
      });
    });
    document.getElementById('lobbyTimeControl').addEventListener('change', (e) => {
      state.settings.timeControl = e.target.value;
      persist();
      renderSettingsUI();
      renderModesAndRulesUI();
    });
    document.querySelectorAll('.player-color-btn').forEach(btn => btn.addEventListener('click', () => { state.playerColorPref = btn.dataset.color; persist(); renderModesAndRulesUI(); }));
    document.getElementById('toggleTabletopBtn').addEventListener('click', () => { state.tabletopMode = !state.tabletopMode; persist(); renderModesAndRulesUI(); updatePlayerBars(); });

    // Economy & Boosters Shop
    document.querySelectorAll('.buy-booster-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.buybooster;
        const acc = getActiveAccount();
        const catalog = {
          undo:   { cost: 90,  qty: 3, label: '↩️ Отмена хода (+3)' },
          hint:   { cost: 110, qty: 3, label: '💡 Подсказка хода (+3)' },
          shield: { cost: 220, qty: 1, label: '🛡️ Щит защиты рейтинга (+1)' },
          ticket: { cost: 160, qty: 1, label: '🎟️ Билет на турнир (+1)' }
        };
        const item = catalog[key];
        if (!item) return;
        if (acc.coins < item.cost) {
          showToast(`Недостаточно монет (нужно ${item.cost} 🪙)!`, 'error');
          return;
        }
        acc.coins -= item.cost;
        acc.boosters[key] = (acc.boosters[key] || 0) + item.qty;
        persist();
        renderChestsUI();
        updateAllUI();
        SoundFX.play('select');
        showToast(`Куплено: ${item.label}!`, 'success');
      });
    });

    document.getElementById('buyRandomFragmentBtn').addEventListener('click', () => {
      const acc = getActiveAccount();
      if (acc.coins < 240) {
        showToast('Недостаточно монет (нужно 240 🪙)!', 'error');
        return;
      }
      const lockedBoards = Object.values(BOARD_THEMES).filter(b => !acc.unlockedBoards.includes(b.id));
      const lockedPieces = Object.values(PIECE_STYLES).filter(p => !acc.unlockedPieces.includes(p.id));
      if (lockedBoards.length === 0 && lockedPieces.length === 0) {
        showToast('Все 72 стиля уже открыты!', 'success');
        return;
      }
      acc.coins -= 240;
      const pickBoard = lockedBoards.length > 0 && (lockedPieces.length === 0 || Math.random() < 0.5);
      const target = pickBoard
        ? lockedBoards[Math.floor(Math.random() * lockedBoards.length)]
        : lockedPieces[Math.floor(Math.random() * lockedPieces.length)];
      const fKey = `${pickBoard ? 'board' : 'piece'}:${target.id}`;
      acc.fragments[fKey] = (acc.fragments[fKey] || 0) + 1;

      if (acc.fragments[fKey] >= 3) {
        acc.fragments[fKey] -= 3;
        if (pickBoard) acc.unlockedBoards.push(target.id);
        else acc.unlockedPieces.push(target.id);
        SoundFX.play('unbox_rare');
        showToast(`🎉 3/3 фрагментов собрано! Открыт целый стиль «${target.name}»!`, 'success');
      } else {
        SoundFX.play('select');
        showToast(`🧩 Получен фрагмент стиля «${target.name}» (${acc.fragments[fKey]}/3)!`, 'success');
      }
      persist();
      renderChestsUI();
      renderStylesUI();
      updateAllUI();
    });

    document.getElementById('exchangeCrystalsCoinsBtn').addEventListener('click', () => {
      const acc = getActiveAccount();
      if (acc.crystals < 5) {
        showToast('Недостаточно кристаллов (нужно 5 💎)!', 'error');
        return;
      }
      acc.crystals -= 5;
      acc.coins += 250;
      persist();
      renderChestsUI();
      updateAllUI();
      SoundFX.play('win');
      showToast('Обмен выполнен: +250 🪙!', 'success');
    });

    // Real Online Room Creation, Matchmaking & Spectators
    document.getElementById('refreshOnlineRoomsBtn').addEventListener('click', () => {
      if (net.socket) net.socket.emit('list_rooms');
      renderOnlineRoomsList();
      showToast('Список комнат обновлён', 'info');
    });
    document.getElementById('serverCreateRoomBtn').addEventListener('click', () => {
      createOnlineOrBluetoothRoom('online');
    });
    document.getElementById('onlineQuickMatchBtn').addEventListener('click', () => {
      const acc = getActiveAccount();
      if (net.serverOnline && net.socket) {
        net.socket.emit('find_match', {
          ruleId: state.ruleId,
          timeControl: state.settings.timeControl,
          name: acc.name,
          elo: acc.elo,
          flag: acc.flag,
          avatarIdx: acc.avatarIdx
        });
        return;
      }
      // If offline, create a waiting room by code so they never play a fake bot!
      createOnlineOrBluetoothRoom('online');
    });
    document.getElementById('serverJoinRoomBtn').addEventListener('click', () => {
      const code = document.getElementById('serverJoinCodeInput').value;
      joinRoomByCode(code, false);
    });
    document.getElementById('serverSpectateRoomBtn').addEventListener('click', () => {
      const code = document.getElementById('serverJoinCodeInput').value;
      joinRoomByCode(code, true);
    });
    document.getElementById('onlineP2PToggleBtn').addEventListener('click', () => {
      document.getElementById('p2pPanel').classList.toggle('hidden');
    });

    // WebRTC P2P
    document.getElementById('p2pCreateOfferBtn').addEventListener('click', async () => {
      const status = document.getElementById('p2pStatusText'); status.textContent = 'Генерация P2P-кода комнаты...';
      try {
        const pc = await initP2PConnection(true);
        const offer = await pc.createOffer(); await pc.setLocalDescription(offer); await waitIceComplete(pc);
        const code = btoa(unescape(encodeURIComponent(JSON.stringify(pc.localDescription))));
        document.getElementById('p2pCodeLabel').textContent = 'Шаг 1: Отправьте этот P2P-код другу:';
        document.getElementById('p2pOutputCode').value = code;
        document.getElementById('p2pCodeBox').classList.remove('hidden');
        document.getElementById('p2pRemoteLabel').textContent = 'Шаг 2: Вставьте ответный код от друга:';
        document.getElementById('p2pRemoteBox').classList.remove('hidden');
        status.textContent = 'Комната создана. Ждём ответный код...';
        SoundFX.play('invite');
      } catch (_) { status.textContent = 'Не удалось создать P2P-комнату.'; }
    });
    document.getElementById('p2pJoinBtn').addEventListener('click', () => {
      document.getElementById('p2pCodeBox').classList.add('hidden');
      document.getElementById('p2pRemoteLabel').textContent = 'Вставьте P2P-код комнаты от друга:';
      document.getElementById('p2pRemoteBox').classList.remove('hidden');
      document.getElementById('p2pStatusText').textContent = 'Готово к подключению.';
    });
    document.getElementById('p2pCopyBtn').addEventListener('click', () => copyToClipboard(document.getElementById('p2pOutputCode').value));
    document.getElementById('p2pAcceptBtn').addEventListener('click', async () => {
      const raw = document.getElementById('p2pInputCode').value.trim();
      const status = document.getElementById('p2pStatusText');
      if (!raw) { showToast('Вставьте код от друга', 'error'); return; }
      try {
        const desc = JSON.parse(decodeURIComponent(escape(atob(raw))));
        if (desc.type === 'offer') {
          const pc = await initP2PConnection(false);
          await pc.setRemoteDescription(desc);
          const ans = await pc.createAnswer(); await pc.setLocalDescription(ans); await waitIceComplete(pc);
          const ansCode = btoa(unescape(encodeURIComponent(JSON.stringify(pc.localDescription))));
          document.getElementById('p2pCodeLabel').textContent = 'Отправьте ответный код создателю комнаты:';
          document.getElementById('p2pOutputCode').value = ansCode;
          document.getElementById('p2pCodeBox').classList.remove('hidden');
          status.textContent = 'Ответный код готов! Ждём подключения.';
        } else if (desc.type === 'answer' && net.pc) {
          await net.pc.setRemoteDescription(desc);
          status.textContent = 'Подключаемся...';
        }
      } catch (_) { showToast('Неверный формат кода', 'error'); }
    });

    // Bluetooth Full Working Pairing (4-digit Bluetooth PIN + Web Bluetooth BLE Scanner)
    document.getElementById('btCreatePinBtn').addEventListener('click', () => {
      createOnlineOrBluetoothRoom('bluetooth');
    });
    document.getElementById('btJoinPinBtn').addEventListener('click', () => {
      const pin = document.getElementById('btPinInput').value;
      joinRoomByCode(pin, false);
    });
    document.getElementById('btScanBtn').addEventListener('click', async () => {
      if (!navigator.bluetooth) {
        showToast('В этом браузере используйте Bluetooth PIN-код (Способ 1)!', 'info');
        return;
      }
      try {
        const SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
        const CHAR_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';
        const device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [SERVICE_UUID]
        });
        net.btDevice = device;
        net.transport = 'bluetooth';
        if (device.gatt) {
          try {
            const server = await device.gatt.connect();
            const service = await server.getPrimaryService(SERVICE_UUID);
            const char = await service.getCharacteristic(CHAR_UUID);
            net.btChar = char;
            await char.startNotifications();
            char.addEventListener('characteristicvaluechanged', (ev) => {
              try {
                const str = new TextDecoder().decode(ev.target.value);
                handleNetMessage(JSON.parse(str));
              } catch (_) {}
            });
          } catch (_) {}
        }
        net.connected = true;
        game.waitingForOpponent = false;
        game.opponent = { name: device.name || 'Bluetooth-устройство', flag: '📶', elo: 'BT', avatarIdx: 10, avatarPhoto: null };
        state.mode = 'bluetooth';
        SoundFX.play('opponent_connect');
        openGameArena(true, true);
        showToast(`Bluetooth подключён: ${game.opponent.name}`, 'success');
      } catch (_) {
        showToast('Сканирование Bluetooth завершено. Вы можете соединиться по PIN-коду!', 'info');
      }
    });
    document.getElementById('btFallbackP2PBtn').addEventListener('click', () => {
      state.mode = 'online';
      renderModesAndRulesUI();
      document.getElementById('p2pPanel').classList.remove('hidden');
    });

    // Tournaments Events
    document.getElementById('openCreateTourneyModalBtn').addEventListener('click', () => {
      document.getElementById('customTourneyName').focus();
    });
    document.getElementById('createCustomTourneyBtn').addEventListener('click', () => {
      const oppType = document.getElementById('customTourneyOpponents').value;
      if (isCurrentUserGuest() && oppType !== 'bots') {
        promptGuestRegistrationForFeature('Создание турнирных комнат с реальными игроками и приглашение друзей');
        return;
      }
      const title = document.getElementById('customTourneyName').value.trim() || 'Кубок Чемпионов';
      const format = document.getElementById('customTourneyFormat').value;
      const formatNames = {
        knockout: 'Олимпийский Плей-офф',
        arena: 'Арена Блиц-Марафон',
        roundrobin: 'Круговая Лига',
        kinghill: 'Царь Горы'
      };
      const ruleId = document.getElementById('customTourneyRule').value;
      const maxPlayers = Number(document.getElementById('customTourneySize').value) || 8;
      const code = 'TRN-' + Math.floor(1000 + Math.random() * 9000);

      const newTourney = {
        id: code,
        isSystem: false,
        isCustom: true,
        title,
        ruleId,
        ruleName: RULESETS[ruleId]?.name || 'Русские шашки',
        timeControl: '180+2',
        format,
        formatName: formatNames[format] || 'Плей-офф',
        opponentType: oppType,
        maxPlayers,
        entryCoins: 0,
        registrationEndsAt: Date.now() + 15 * 60 * 1000,
        endsAt: Date.now() + 45 * 60 * 1000,
        participants: [],
        prizes: [
          { place: 1, xp: 500, coins: 600, crystals: 12, chestType: 'rare', chestGrade: 1, title: 'Победитель Кубка' },
          { place: 2, xp: 300, coins: 350, crystals: 6, chestType: 'common', chestGrade: 1 },
          { place: 3, xp: 150, coins: 180, crystals: 3, chestType: 'common', chestGrade: 2 }
        ]
      };
      state.liveTournaments.unshift(newTourney);
      if (net.serverOnline && net.socket) {
        net.socket.emit('create_custom_tournament', newTourney);
      }
      SoundFX.play('invite');
      joinLiveOrCustomTournament(code);
      copyToClipboard(code);
    });

    document.getElementById('joinTourneyByCodeBtn').addEventListener('click', () => {
      if (isCurrentUserGuest()) {
        promptGuestRegistrationForFeature('Вход в турнирную комнату по приглашению друга');
        return;
      }
      const code = document.getElementById('joinTourneyCodeInput').value.trim().toUpperCase();
      if (!code) { showToast('Введите код турнира (напр. TRN-4821)', 'error'); return; }
      const found = state.liveTournaments.find(t => t.id.toUpperCase() === code);
      if (found) {
        joinLiveOrCustomTournament(found.id);
      } else {
        // Create & join dynamic room tournament with that invite code
        const dynT = {
          id: code,
          isSystem: false,
          title: `Турнир по приглашению #${code}`,
          ruleId: state.ruleId,
          ruleName: RULESETS[state.ruleId].name,
          timeControl: '180+2',
          format: 'knockout',
          formatName: 'Плей-офф по коду',
          maxPlayers: 8,
          entryCoins: 0,
          registrationEndsAt: Date.now() + 15 * 60 * 1000,
          endsAt: Date.now() + 45 * 60 * 1000,
          participants: [],
          prizes: [
            { place: 1, xp: 500, coins: 600, crystals: 12, chestType: 'rare', chestGrade: 1, title: 'Победитель Кубка' },
            { place: 2, xp: 300, coins: 350, crystals: 6, chestType: 'common', chestGrade: 1 },
            { place: 3, xp: 150, coins: 180, crystals: 3, chestType: 'common', chestGrade: 2 }
          ]
        };
        state.liveTournaments.unshift(dynT);
        joinLiveOrCustomTournament(code);
      }
    });

    document.getElementById('playNextTourneyMatchBtn').addEventListener('click', startActiveTournamentMatch);
    document.getElementById('simTourneyRoundBtn').addEventListener('click', () => {
      const pts = Math.random() < 0.65 ? 3 : 1;
      advanceTournamentRound(pts);
    });
    document.getElementById('leaveTourneyBtn').addEventListener('click', () => {
      state.activeTournament = null;
      renderTournamentsUI();
      showToast('Вы покинули турнир', 'info');
    });

    // CS2 Chest Opening Buttons
    document.getElementById('openCommonChestCoinsBtn').addEventListener('click', () => {
      if (state.rouletteSpinning) return;
      const acc = getActiveAccount();
      if (acc.coins < 150) {
        showToast('Недостаточно монет (нужно 150 🪙). Выигрывайте матчи или забирайте награды уровней!', 'error');
        return;
      }
      acc.coins -= 150;
      const tierObj = getChestTierByLevel(getLevelInfoFromXp(acc.xp).level);
      const grade = Math.random() < 0.2 ? 1 : (Math.random() < 0.55 ? 2 : 3);
      persist();
      renderChestsUI();
      spinCS2Roulette({
        type: 'common',
        tier: tierObj.tier,
        tierName: tierObj.name,
        grade,
        roman: ['I', 'II', 'III'][grade - 1],
        label: `Обычный сундук • ${tierObj.name} ${['I', 'II', 'III'][grade - 1]} разряд`
      });
    });

    document.getElementById('openCommonChestInvBtn').addEventListener('click', () => {
      if (state.rouletteSpinning) return;
      const acc = getActiveAccount();
      const idx = acc.chestsInventory.findIndex(c => c.type === 'common');
      if (idx === -1) return;
      const [ch] = acc.chestsInventory.splice(idx, 1);
      persist();
      renderChestsUI();
      spinCS2Roulette(ch);
    });

    document.getElementById('openRareChestCoinsBtn').addEventListener('click', () => {
      if (state.rouletteSpinning) return;
      const acc = getActiveAccount();
      if (acc.coins < 420) {
        showToast('Недостаточно монет (нужно 420 🪙)!', 'error');
        return;
      }
      acc.coins -= 420;
      const tierObj = getChestTierByLevel(getLevelInfoFromXp(acc.xp).level);
      const grade = Math.random() < 0.45 ? 1 : 2;
      persist();
      renderChestsUI();
      spinCS2Roulette({
        type: 'rare',
        tier: tierObj.tier,
        tierName: tierObj.name,
        grade,
        roman: ['I', 'II', 'III'][grade - 1],
        label: `Редкий сундук • ${tierObj.name} ${['I', 'II', 'III'][grade - 1]} разряд`
      });
    });

    document.getElementById('openRareChestCrystalsBtn').addEventListener('click', () => {
      if (state.rouletteSpinning) return;
      const acc = getActiveAccount();
      if (acc.crystals < 12) {
        showToast('Недостаточно кристаллов (нужно 12 💎)!', 'error');
        return;
      }
      acc.crystals -= 12;
      const tierObj = getChestTierByLevel(getLevelInfoFromXp(acc.xp).level);
      persist();
      renderChestsUI();
      spinCS2Roulette({
        type: 'rare',
        tier: tierObj.tier,
        tierName: tierObj.name,
        grade: 1,
        roman: 'I',
        label: `Редкий сундук • ${tierObj.name} I разряд`
      });
    });

    document.getElementById('openRareChestInvBtn').addEventListener('click', () => {
      if (state.rouletteSpinning) return;
      const acc = getActiveAccount();
      const idx = acc.chestsInventory.findIndex(c => c.type === 'rare');
      if (idx === -1) return;
      const [ch] = acc.chestsInventory.splice(idx, 1);
      persist();
      renderChestsUI();
      spinCS2Roulette(ch);
    });

    // Styles Rarity Filter
    document.querySelectorAll('.rfilter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.styleRarityFilter = btn.dataset.rfilter;
        renderStylesUI();
      });
    });

    // History actions
    document.getElementById('historyFilterSelect').addEventListener('change', renderHistoryUI);
    document.getElementById('deleteSelectedHistoryBtn').addEventListener('click', () => {
      const cnt = state.selectedHistoryIds.size; if (cnt === 0) return;
      openModal(`Удалить выбранные (${cnt})?`, 'Выбранные партии будут удалены безвозвратно.', [
        { label: 'Отмена', cls: 'card border', onClick: closeModal },
        { label: 'Удалить', cls: 'bg-rose-500 text-white', onClick: () => { state.history = state.history.filter(h => !state.selectedHistoryIds.has(h.id)); state.selectedHistoryIds.clear(); persist(); closeModal(); updateAllUI(); showToast(`Удалено: ${cnt}`, 'info'); } }
      ]);
    });
    document.getElementById('clearAllHistoryBtn').addEventListener('click', () => {
      if (state.history.length === 0) { showToast('История уже пуста', 'info'); return; }
      openModal('Очистить всю историю?', 'Все сохранённые партии и повторы будут удалены.', [
        { label: 'Отмена', cls: 'card border', onClick: closeModal },
        { label: 'Очистить всё', cls: 'bg-rose-500 text-white', onClick: () => { state.history = []; state.selectedHistoryIds.clear(); persist(); closeModal(); updateAllUI(); showToast('История очищена', 'info'); } }
      ]);
    });

    // Settings & Gemini API Key + Model Selector
    const geminiModelSelect = document.getElementById('settingGeminiModel');
    if (geminiModelSelect) {
      geminiModelSelect.addEventListener('change', (e) => {
        state.settings.geminiModel = e.target.value;
        persist();
        renderSettingsUI();
      });
    }
    document.getElementById('saveGeminiKeyBtn').addEventListener('click', () => {
      const val = document.getElementById('settingGeminiApiKey').value.trim();
      const mod = document.getElementById('settingGeminiModel')?.value || 'gemini-2.5-flash';
      state.settings.geminiApiKey = val;
      state.settings.geminiModel = mod;
      persist();
      renderSettingsUI();
      showToast(val ? `Ключ Gemini API (${mod}) сохранён!` : 'Включён встроенный комментатор Gemini AI', 'success');
    });
    document.getElementById('testGeminiKeyBtn').addEventListener('click', async () => {
      const val = document.getElementById('settingGeminiApiKey').value.trim();
      const mod = document.getElementById('settingGeminiModel')?.value || 'gemini-2.5-flash';
      state.settings.geminiApiKey = val;
      state.settings.geminiModel = mod;
      persist();
      renderSettingsUI();
      showToast('Генерируем тестовый комментарий ИИ Gemini...', 'info');
      await requestGeminiAIComment({
        eventType: 'move',
        moveNotation: 'c3-d4',
        turnColor: 'w',
        capturesCount: 0,
        promotes: false,
        moveNumber: 1,
        materialDiff: 0,
        ruleName: 'Русские шашки'
      });
      openModal('🤖 Тест комментатора Gemini AI', `<p>Комментатор ИИ работает отлично! Во время игры с ИИ все комментарии на ходы и ответы отображаются во вкладке <b>«Чат и ИИ»</b> на игровой арене.</p>`, [
        { label: 'Супер!', cls: 'accent-bg', onClick: closeModal }
      ]);
    });

    document.querySelectorAll('.setting-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.setting;
        state.settings[key] = !state.settings[key];
        SoundFX.syncSettings();
        if (key === 'soundEnabled' && state.settings.soundEnabled) {
          SoundFX.play('ui_click');
        } else if (key === 'sfxEnabled' && state.settings.sfxEnabled) {
          SoundFX.play('move');
        } else if (key === 'notificationsEnabled' && state.settings.notificationsEnabled) {
          SoundFX.play('invite');
        }
        persist(); applyThemeAndPrefs(); renderSettingsUI(); updatePlayerBars(); updateHeaderUI();
        if (key === 'showCoords') resizeCanvas(); else drawBoard();
      });
    });
    document.getElementById('settingTimeControl').addEventListener('change', (e) => { state.settings.timeControl = e.target.value; document.getElementById('lobbyTimeControl').value = e.target.value; persist(); showToast('Таймер применится в новой партии', 'info'); });
    document.getElementById('settingHintStyle').addEventListener('change', (e) => { state.settings.hintStyle = e.target.value; persist(); drawBoard(); });
    document.getElementById('settingBoardSize').addEventListener('change', (e) => { state.settings.boardSize = Number(e.target.value); persist(); resizeCanvas(); });
    document.getElementById('settingAnimSpeed').addEventListener('change', (e) => { state.settings.animSpeed = Number(e.target.value); persist(); });
    document.getElementById('settingVolume').addEventListener('input', (e) => {
      state.settings.volume = Number(e.target.value);
      document.getElementById('volumeValueLabel').textContent = state.settings.volume + '%';
      SoundFX.syncSettings();
      persist();
    });
    const musicVolInput = document.getElementById('settingMusicVolume');
    if (musicVolInput) {
      musicVolInput.addEventListener('input', (e) => {
        state.settings.musicVolume = Number(e.target.value);
        document.getElementById('musicVolumeValueLabel').textContent = state.settings.musicVolume + '%';
        SoundFX.syncSettings();
        persist();
      });
    }
    const sfxVolInput = document.getElementById('settingSfxVolume');
    if (sfxVolInput) {
      sfxVolInput.addEventListener('input', (e) => {
        state.settings.sfxVolume = Number(e.target.value);
        document.getElementById('sfxVolumeValueLabel').textContent = state.settings.sfxVolume + '%';
        SoundFX.syncSettings();
        persist();
      });
      sfxVolInput.addEventListener('change', () => SoundFX.preview('move'));
    }
    const notifVolInput = document.getElementById('settingNotificationsVolume');
    if (notifVolInput) {
      notifVolInput.addEventListener('input', (e) => {
        state.settings.notificationsVolume = Number(e.target.value);
        document.getElementById('notificationsVolumeValueLabel').textContent = state.settings.notificationsVolume + '%';
        SoundFX.syncSettings();
        persist();
      });
      notifVolInput.addEventListener('change', () => SoundFX.preview('invite'));
    }

    // Dedicated Channel & Studio Sound Preview Buttons
    const prevMusicBtn = document.getElementById('previewMusicBtn');
    if (prevMusicBtn) {
      prevMusicBtn.addEventListener('click', () => {
        if (!state.settings.soundEnabled) {
          showToast('Включите общий звук для прослушивания музыки', 'info');
          return;
        }
        const playing = SoundFX.toggleMusicPreview();
        const lbl = document.getElementById('lastPreviewedSoundLabel');
        if (lbl) lbl.textContent = playing ? '🎵 Играет: Фоновая музыка' : 'Фоновая музыка остановлена';
      });
    }
    const prevSfxBtn = document.getElementById('previewSfxBtn');
    if (prevSfxBtn) {
      prevSfxBtn.addEventListener('click', () => {
        if (!state.settings.soundEnabled) {
          showToast('Включите общий звук для прослушивания эффектов', 'info');
          return;
        }
        SoundFX.preview('capture');
        const lbl = document.getElementById('lastPreviewedSoundLabel');
        if (lbl) lbl.textContent = '🔊 Прослушано: Взятие шашки';
      });
    }
    const prevNotifBtn = document.getElementById('previewNotificationBtn');
    if (prevNotifBtn) {
      prevNotifBtn.addEventListener('click', () => {
        if (!state.settings.soundEnabled) {
          showToast('Включите общий звук для прослушивания уведомлений', 'info');
          return;
        }
        SoundFX.preview('invite');
        const lbl = document.getElementById('lastPreviewedSoundLabel');
        if (lbl) lbl.textContent = '🔔 Прослушано: Приглашение в игру';
      });
    }

    document.querySelectorAll('.sound-preview-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!state.settings.soundEnabled) {
          showToast('Общий звук отключён. Включите звук, чтобы прослушать эффект.', 'info');
          return;
        }
        const sndId = btn.dataset.previewSound;
        SoundFX.preview(sndId);
        const lbl = document.getElementById('lastPreviewedSoundLabel');
        if (lbl) lbl.textContent = `▶ Прослушано: ${SoundFX.getSoundLabel(sndId)}`;
      });
    });

    // Global delegated UI button click sound (respects cooldowns, non-overlapping & mute state)
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.classList.contains('sound-preview-btn')) return;
      if (['previewMusicBtn', 'previewSfxBtn', 'previewNotificationBtn', 'quickSoundBtn', 'masterSoundToggleBtn'].includes(btn.id)) return;
      SoundFX.play('ui_click');
    }, { passive: true });

    document.getElementById('resetSettingsBtn').addEventListener('click', () => { state.settings = defaultSettings(); SoundFX.syncSettings(); persist(); renderSettingsUI(); renderStylesUI(); updateAllUI(); resizeCanvas(); showToast('Настройки сброшены', 'info'); });

    // Account & Auth Modal
    document.getElementById('saveAccountBtn').addEventListener('click', () => {
      const acc = getActiveAccount();
      const name = document.getElementById('accountNameInput').value.trim();
      if (!name) { showToast('Введите имя аккаунта', 'error'); return; }
      acc.name = name; acc.flag = document.getElementById('accountFlagSelect').value;
      persist(); updateAllUI(); showToast('Профиль сохранён!', 'success');
    });

    document.getElementById('avatarPhotoUpload').addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = 96; c.height = 96;
          const g = c.getContext('2d');
          const s = Math.min(img.width, img.height);
          g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 96, 96);
          const acc = getActiveAccount();
          acc.avatarPhoto = c.toDataURL('image/jpeg', 0.82);
          persist(); updateAllUI();
          showToast('Фото аватара обновлено!', 'success');
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    });

    document.getElementById('openRanksTableBtn').addEventListener('click', () => {
      const acc = getActiveAccount();
      const curLv = getLevelInfoFromXp(acc.xp).level;
      const rows = RANK_TIERS.map((t, idx) => {
        const lv1 = getRankStartLevel(idx * 3);
        const lv2 = getRankStartLevel(idx * 3 + 1);
        const lv3 = getRankStartLevel(idx * 3 + 2);
        const isCurrent = getRankForLevel(curLv).tierIndex === idx;
        return `<div class="p-2.5 rounded-xl card border flex items-center justify-between gap-2 ${isCurrent ? 'ring-2' : ''}" style="${isCurrent ? 'border-color:var(--accent)' : ''}">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-lg">${t.icon}</span>
            <div class="min-w-0">
              <div class="text-xs font-extrabold truncate" style="color:${t.color}">${idx + 1}. ${t.name}</div>
              <div class="text-[10px] text-muted">I: Ур.${lv1} • II: Ур.${lv2} • III: Ур.${lv3}</div>
            </div>
          </div>
          <div class="shrink-0">${renderStripesHtml(3, t.color)}</div>
        </div>`;
      }).join('');
      openModal('Система воинских званий (Ур. 1 – 10 000+)', `
        <p class="text-xs mb-3">У каждого из 20 званий есть <b>3 полоски (I, II, III)</b>. Для просмотра наград за каждый уровень нажмите <b>«Шкала уровней (Свайп →)»</b>!</p>
        <div class="space-y-1.5">${rows}</div>
      `, [{ label: 'Закрыть', cls: 'accent-bg', onClick: closeModal }]);
    });

    let regSelectedAvatar = 0;
    function renderRegAvatars() {
      const grid = document.getElementById('regAvatarGrid');
      if (!grid) return;
      grid.innerHTML = AVATARS.map((av, idx) => `
        <button type="button" data-regav="${idx}" class="reg-av-btn h-9 rounded-xl flex items-center justify-center text-base transition ${regSelectedAvatar === idx ? 'ring-2 ring-white scale-105' : 'opacity-75 hover:opacity-100'}" style="background:${av.bg}">${av.icon}</button>
      `).join('');
      grid.querySelectorAll('.reg-av-btn').forEach(b => {
        b.addEventListener('click', () => { regSelectedAvatar = Number(b.dataset.regav); renderRegAvatars(); });
      });
    }

    async function refreshGuestMigrationInfo() {
      let guestAcc = state.accounts.find(a => !a.registered || a.isGuest);
      try {
        const idbData = await GuestIndexedDB.loadAllGuestData();
        if (idbData?.profile) {
          if (!guestAcc) {
            guestAcc = createDefaultAccount(idbData.profile.name || generateGuestNickname(), {
              ...idbData.profile,
              registered: false,
              isGuest: true,
              history: Array.isArray(idbData.history) ? idbData.history : (idbData.profile.history || [])
            });
            state.accounts.unshift(guestAcc);
          } else {
            // Merge latest IndexedDB guest data if guestAcc is active or has fewer matches
            if (Array.isArray(idbData.history) && idbData.history.length > (guestAcc.history?.length || 0)) {
              guestAcc.history = idbData.history;
              if (isCurrentUserGuest()) state.history = idbData.history;
            }
          }
        }
      } catch (_) {}

      const box = document.getElementById('transferGuestProgressBox');
      const summaryEl = document.getElementById('transferGuestStatsSummary');
      const guestBtnTxt = document.getElementById('playAsGuestBtnText');
      const guestInfoTxt = document.getElementById('guestIndexedDbInfoText');

      if (guestAcc) {
        const histCount = isCurrentUserGuest() ? state.history.length : (guestAcc.history?.length || 0);
        const totalGames = (guestAcc.wins || 0) + (guestAcc.losses || 0) + (guestAcc.draws || 0);
        if (box) box.classList.remove('hidden');
        if (summaryEl) {
          summaryEl.textContent = `Будут перенесены данные ${guestAcc.name} из IndexedDB: ${guestAcc.xp || 0} EXP, ${guestAcc.elo || 1200} ELO, побед: ${guestAcc.wins || 0}, партий в истории: ${Math.max(histCount, totalGames)}, монет: ${guestAcc.coins || 0} 🪙 и открытые стили.`;
        }
        if (guestBtnTxt) {
          guestBtnTxt.textContent = `Играть как гость (${guestAcc.name})`;
        }
        if (guestInfoTxt) {
          guestInfoTxt.textContent = `Ваш гостевой профиль ${guestAcc.name} сохранён в IndexedDB (партий: ${Math.max(histCount, totalGames)}, побед: ${guestAcc.wins || 0}) • Доступна игра против ИИ (5 уровней)`;
        }
      } else {
        if (guestBtnTxt) guestBtnTxt.textContent = 'Играть как гость';
      }
    }

    function setAuthTab(tab) {
      const isLogin = tab === 'login';
      const isReg = tab === 'register';
      const isForgot = tab === 'forgot';

      document.getElementById('loginForm').classList.toggle('hidden', !isLogin);
      document.getElementById('registerForm').classList.toggle('hidden', !isReg);
      const forgotForm = document.getElementById('forgotPasswordForm');
      if (forgotForm) forgotForm.classList.toggle('hidden', !isForgot);

      document.getElementById('authTabRegister').className = `py-2.5 rounded-xl text-xs font-extrabold transition ${isReg ? 'accent-bg' : 'text-muted'}`;
      document.getElementById('authTabLogin').className = `py-2.5 rounded-xl text-xs font-extrabold transition ${(isLogin || isForgot) ? 'accent-bg' : 'text-muted'}`;

      const heading = document.getElementById('authScreenHeading');
      const subheading = document.getElementById('authScreenSubheading');
      if (heading && subheading) {
        if (isReg) {
          heading.textContent = 'Создание аккаунта';
          subheading.textContent = 'Зарегистрируйтесь для игры онлайн, создания комнат и сохранения рейтинга в БД';
        } else if (isLogin) {
          heading.textContent = 'Вход в аккаунт';
          subheading.textContent = 'Войдите по Email или имени пользователя для доступа ко всем режимам игры';
        } else if (isForgot) {
          heading.textContent = 'Восстановление пароля';
          subheading.textContent = 'Укажите ваш Email или имя пользователя для установки нового пароля';
        }
      }

      document.getElementById('loginErrorMsg').classList.add('hidden');
      document.getElementById('regErrorMsg').classList.add('hidden');
      const regSucc = document.getElementById('regSuccessMsg');
      if (regSucc) regSucc.classList.add('hidden');
      const forgErr = document.getElementById('forgotErrorMsg');
      if (forgErr) forgErr.classList.add('hidden');
      const forgSucc = document.getElementById('forgotSuccessMsg');
      if (forgSucc) forgSucc.classList.add('hidden');

      if (isReg) {
        renderRegAvatars();
        refreshGuestMigrationInfo();
      }
    }

    function openAuthModal(defaultTab = 'register', prefillUser = '') {
      setAuthTab(defaultTab);
      if (prefillUser) document.getElementById('loginUsername').value = prefillUser;
      document.getElementById('loginPassword').value = '';
      document.getElementById('regPassword').value = '';
      document.getElementById('regPasswordConfirm').value = '';
      refreshGuestMigrationInfo();
      document.getElementById('authModalOverlay').classList.remove('hidden');
    }
    window.openCenteredAuthScreen = openAuthModal;

    function closeAuthModal() {
      document.getElementById('authModalOverlay').classList.add('hidden');
    }

    async function enterGuestModeAndRedirect() {
      state.serverToken = null;
      state.hasChosenAuthSession = true;
      let guest = state.accounts.find(a => !a.registered || a.isGuest);

      try {
        const idbData = await GuestIndexedDB.loadAllGuestData();
        if (idbData?.profile) {
          if (!guest) {
            guest = createDefaultAccount(idbData.profile.name || generateGuestNickname(), {
              ...idbData.profile,
              registered: false,
              isGuest: true,
              mode: 'ai',
              history: Array.isArray(idbData.history) ? idbData.history : (idbData.profile.history || []),
              savedGameSnapshot: idbData.activeGame || idbData.profile.savedGameSnapshot || null
            });
            state.accounts.unshift(guest);
          } else {
            Object.assign(guest, idbData.profile, {
              registered: false,
              isGuest: true,
              mode: 'ai'
            });
            if (Array.isArray(idbData.history) && idbData.history.length > 0) {
              guest.history = idbData.history;
            }
            if (idbData.activeGame && !idbData.activeGame.over) {
              guest.savedGameSnapshot = idbData.activeGame;
            }
          }
        }
      } catch (_) {}

      if (!guest) {
        const nick = generateGuestNickname();
        guest = createDefaultAccount(nick, { registered: false, isGuest: true, mode: 'ai' });
        state.accounts.unshift(guest);
      }
      if (!guest.name || guest.name === 'Гость') {
        guest.name = generateGuestNickname();
      }
      guest.isGuest = true;
      guest.registered = false;
      guest.mode = 'ai';
      state.mode = 'ai';

      activateAccount(guest);
      persist();
      closeAuthModal();
      openLobbyPage('home');
      showToast(`Гостевой профиль ${guest.name} активен! Данные сохраняются в IndexedDB. Доступна игра против ИИ.`, 'success');
    }

    function doLogout() {
      state.serverToken = null;
      enterGuestModeAndRedirect();
    }

    document.getElementById('serverAuthOpenBtn').addEventListener('click', () => openAuthModal('register'));
    document.getElementById('sidebarAuthBtn').addEventListener('click', () => {
      if (getActiveAccount().registered) doLogout();
      else openAuthModal('login');
    });
    document.getElementById('logoutAccountBtn').addEventListener('click', doLogout);
    document.getElementById('authModalCloseBtn').addEventListener('click', closeAuthModal);
    document.getElementById('authModalOverlay').addEventListener('click', (e) => { if (e.target.id === 'authModalOverlay') closeAuthModal(); });
    document.getElementById('authTabLogin').addEventListener('click', () => setAuthTab('login'));
    document.getElementById('authTabRegister').addEventListener('click', () => setAuthTab('register'));

    // Explicit form switching links required by user spec
    const linkToLoginFromReg = document.getElementById('linkToLoginFromReg');
    if (linkToLoginFromReg) linkToLoginFromReg.addEventListener('click', () => setAuthTab('login'));
    const linkToRegFromLogin = document.getElementById('linkToRegFromLogin');
    if (linkToRegFromLogin) linkToRegFromLogin.addEventListener('click', () => setAuthTab('register'));
    const forgotPwLink = document.getElementById('forgotPasswordLink');
    if (forgotPwLink) {
      forgotPwLink.addEventListener('click', () => {
        const curLoginVal = document.getElementById('loginUsername').value.trim();
        setAuthTab('forgot');
        if (curLoginVal) document.getElementById('forgotIdentifierInput').value = curLoginVal;
      });
    }
    const backToLoginBtn = document.getElementById('backToLoginFromForgot');
    if (backToLoginBtn) backToLoginBtn.addEventListener('click', () => setAuthTab('login'));

    // Separate "Играть как гость" button below forms
    const playAsGuestBtn = document.getElementById('playAsGuestBtn');
    if (playAsGuestBtn) {
      playAsGuestBtn.addEventListener('click', () => {
        enterGuestModeAndRedirect();
      });
    }

    // Forgot Password Form submission
    const forgotFormEl = document.getElementById('forgotPasswordForm');
    if (forgotFormEl) {
      forgotFormEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = document.getElementById('forgotErrorMsg');
        const succEl = document.getElementById('forgotSuccessMsg');
        const showErr = (m) => { errEl.textContent = m; errEl.classList.remove('hidden'); succEl.classList.add('hidden'); };
        errEl.classList.add('hidden');
        succEl.classList.add('hidden');

        const identifier = document.getElementById('forgotIdentifierInput').value.trim();
        const newPassword = document.getElementById('forgotNewPasswordInput').value;
        if (!identifier) return showErr('Введите ваш Email или имя пользователя.');
        if (!newPassword || newPassword.length < 6) return showErr('Новый пароль должен содержать минимум 6 символов.');

        let updatedOnServer = false;
        if (net.serverOnline) {
          try {
            const res = await fetch('/api/auth/reset-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ identifier, newPassword })
            });
            const data = await res.json();
            if (!res.ok) return showErr(data.error || 'Аккаунт не найден.');
            updatedOnServer = true;
          } catch (_) {}
        }

        const idLower = identifier.toLowerCase();
        const localAcc = state.accounts.find(a =>
          a.registered && (a.name.toLowerCase() === idLower || (a.email && a.email.toLowerCase() === idLower))
        );
        if (!localAcc && !updatedOnServer) {
          return showErr('Аккаунт с таким Email или именем пользователя не найден.');
        }
        if (localAcc) {
          localAcc.passwordHash = hashClientPassword(newPassword);
          persist();
        }

        succEl.textContent = 'Пароль успешно обновлён! Теперь вы можете войти.';
        succEl.classList.remove('hidden');
        setTimeout(() => {
          setAuthTab('login');
          document.getElementById('loginUsername').value = identifier;
          document.getElementById('loginPassword').value = newPassword;
        }, 900);
      });
    }

    document.querySelectorAll('.eye-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const inp = document.getElementById(btn.dataset.eye);
        if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
      });
    });

    document.getElementById('regPassword').addEventListener('input', (e) => {
      const pw = e.target.value;
      const bar = document.getElementById('pwStrengthBar');
      const lbl = document.getElementById('pwStrengthLabel');
      let score = 0;
      if (pw.length >= 6) score++;
      if (pw.length >= 10) score++;
      if (/[A-ZА-Я]/.test(pw) && /[a-zа-я]/.test(pw)) score++;
      if (/[0-9]/.test(pw)) score++;
      if (/[^a-zA-Zа-яА-Я0-9]/.test(pw)) score++;
      if (!pw) { bar.style.width = '0%'; lbl.textContent = 'Введите пароль'; lbl.className = 'text-[10px] font-bold text-muted'; }
      else if (score <= 2) { bar.style.width = '33%'; bar.style.background = '#f43f5e'; lbl.textContent = 'Слабый'; lbl.className = 'text-[10px] font-bold text-rose-400'; }
      else if (score <= 3) { bar.style.width = '66%'; bar.style.background = '#f59e0b'; lbl.textContent = 'Средний'; lbl.className = 'text-[10px] font-bold text-amber-400'; }
      else { bar.style.width = '100%'; bar.style.background = '#22c55e'; lbl.textContent = 'Надёжный'; lbl.className = 'text-[10px] font-bold text-emerald-400'; }
    });

    // 1. REGISTRATION FORM SUBMIT (With Validation, Error Handling & Guest Profile/History/Stats Migration)
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('regErrorMsg');
      const succEl = document.getElementById('regSuccessMsg');
      const showErr = (m) => { errEl.textContent = m; errEl.classList.remove('hidden'); if (succEl) succEl.classList.add('hidden'); };
      errEl.classList.add('hidden');
      if (succEl) succEl.classList.add('hidden');

      const username = document.getElementById('regUsername').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const password = document.getElementById('regPassword').value;
      const confirmPw = document.getElementById('regPasswordConfirm').value;
      const flag = document.getElementById('regFlag').value;
      const transferGuest = Boolean(document.getElementById('transferGuestCheckbox')?.checked);

      if (!/^[a-zA-Zа-яА-ЯёЁ0-9_ -]{3,20}$/.test(username)) {
        return showErr('Имя пользователя должно быть от 3 до 20 символов (буквы, цифры, _, пробел).');
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return showErr('Введите корректный адрес электронной почты (например, player@mail.ru).');
      }
      if (password.length < 6) {
        return showErr('Пароль должен содержать минимум 6 символов.');
      }
      if (password !== confirmPw) {
        return showErr('Пароли не совпадают. Проверьте поле «Повторите пароль».');
      }

      // Check local duplicate username or email among registered accounts
      const existingByName = state.accounts.find(a => a.registered && a.name.toLowerCase() === username.toLowerCase());
      if (existingByName) return showErr('Это имя пользователя уже занято. Выберите другое или войдите.');
      const existingByEmail = state.accounts.find(a => a.registered && a.email && a.email.toLowerCase() === email.toLowerCase());
      if (existingByEmail) return showErr('Эта электронная почта уже зарегистрирована.');

      // Gather guest profile, history, stats & unfinished game from IndexedDB / active guest profile for migration
      let guestSource = state.accounts.find(a => !a.registered || a.isGuest) || null;
      let guestHistory = [];
      let guestActiveGame = null;
      try {
        const idbData = await GuestIndexedDB.loadAllGuestData();
        if (idbData?.profile && !guestSource) guestSource = idbData.profile;
        if (Array.isArray(idbData?.history) && idbData.history.length > 0) guestHistory = idbData.history;
        if (idbData?.activeGame && !idbData.activeGame.over) guestActiveGame = idbData.activeGame;
      } catch (_) {}
      if (guestSource) {
        if (guestHistory.length === 0 && Array.isArray(guestSource.history)) guestHistory = guestSource.history;
        if (isCurrentUserGuest() && state.history.length > guestHistory.length) guestHistory = [...state.history];
        if (!guestActiveGame && state.savedGameSnapshot && !state.savedGameSnapshot.over) guestActiveGame = state.savedGameSnapshot;
      }

      const guestDataPayload = (transferGuest && guestSource) ? {
        elo: guestSource.elo || 1200,
        peakElo: guestSource.peakElo || guestSource.elo || 1200,
        xp: guestSource.xp || 0,
        coins: Math.max(500, guestSource.coins || 500),
        crystals: Math.max(15, guestSource.crystals || 15),
        wins: guestSource.wins || 0,
        losses: guestSource.losses || 0,
        draws: guestSource.draws || 0,
        streak: guestSource.streak || 0,
        bestStreak: guestSource.bestStreak || 0,
        capturesTotal: guestSource.capturesTotal || 0,
        kingsPromoted: guestSource.kingsPromoted || 0,
        tournamentsWon: guestSource.tournamentsWon || 0,
        chestsOpened: guestSource.chestsOpened || 0,
        claimedLevels: [...(guestSource.claimedLevels || [])],
        claimedAchievements: [...(guestSource.claimedAchievements || [])],
        chestsInventory: [...(guestSource.chestsInventory || [])],
        boosters: { ...(guestSource.boosters || { undo: 3, hint: 3, shield: 1, ticket: 2 }) },
        fragments: { ...(guestSource.fragments || {}) },
        unlockedBoards: [...(guestSource.unlockedBoards || DEFAULT_BOARD_IDS)],
        unlockedPieces: [...(guestSource.unlockedPieces || DEFAULT_PIECE_IDS)],
        unlockedFrames: [...(guestSource.unlockedFrames || ['none'])],
        unlockedTitles: [...(guestSource.unlockedTitles || ['Новичок шашек'])],
        avatarFrame: guestSource.avatarFrame || 'none',
        playerTitle: guestSource.playerTitle || 'Новичок шашек',
        dailyQuests: guestSource.dailyQuests || defaultDailyQuests(),
        history: guestHistory.map(h => ({ ...h, playerName: username })),
        activeGameState: guestActiveGame
      } : null;

      let serverUser = null;
      if (net.serverOnline) {
        try {
          const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username,
              password,
              email,
              flag,
              avatarIdx: regSelectedAvatar,
              settings: state.settings,
              boardTheme: state.boardTheme,
              pieceStyle: state.pieceStyle,
              guestData: guestDataPayload
            })
          });
          const data = await res.json();
          if (!res.ok) return showErr(data.error || 'Ошибка регистрации на сервере.');
          state.serverToken = data.token;
          serverUser = data.user || null;
          if (net.socket) net.socket.emit('auth_token', { token: data.token });
        } catch (_) {
          // Proceed with local account creation if offline
        }
      }

      const newAcc = createDefaultAccount(username, {
        email,
        registered: true,
        isGuest: false,
        passwordHash: hashClientPassword(password),
        flag,
        avatarIdx: regSelectedAvatar,
        settings: { ...state.settings },
        boardTheme: state.boardTheme,
        pieceStyle: state.pieceStyle,
        ruleId: state.ruleId,
        mode: state.mode,
        aiDifficulty: state.aiDifficulty,
        ...(guestDataPayload || {}),
        ...(serverUser ? { ...serverUser, name: serverUser.username || username, registered: true, isGuest: false } : {})
      });
      if (guestDataPayload?.activeGameState) {
        newAcc.savedGameSnapshot = guestDataPayload.activeGameState;
      }

      ensureAccountFields(newAcc);
      state.accounts.push(newAcc);
      state.hasChosenAuthSession = true;
      activateAccount(newAcc);
      persist();
      closeAuthModal();
      openLobbyPage('home');
      const migratedMsg = guestDataPayload
        ? `Гостевой прогресс, статистика и история (${newAcc.history.length} парт.) успешно перенесены в аккаунт «${username}»!`
        : `Аккаунт «${username}» успешно создан! Все режимы игры открыты.`;
      showToast(migratedMsg, 'success');
    });

    // 2. LOGIN FORM SUBMIT (Supports Email OR Username + Validation & Redirect to Main Menu)
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('loginErrorMsg');
      const showErr = (m) => { errEl.textContent = m; errEl.classList.remove('hidden'); };
      errEl.classList.add('hidden');

      const identifier = document.getElementById('loginUsername').value.trim();
      const password = document.getElementById('loginPassword').value;
      if (!identifier || !password) return showErr('Введите Email (или имя пользователя) и пароль.');

      if (net.serverOnline) {
        try {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier, username: identifier, password })
          });
          const data = await res.json();
          if (res.ok && data.user) {
            state.serverToken = data.token;
            if (net.socket) net.socket.emit('auth_token', { token: data.token });
            let localAcc = state.accounts.find(a =>
              a.name.toLowerCase() === data.user.username.toLowerCase() ||
              (a.email && data.user.email && a.email.toLowerCase() === data.user.email.toLowerCase())
            );
            if (!localAcc) {
              localAcc = createDefaultAccount(data.user.username, { registered: true, isGuest: false });
              state.accounts.push(localAcc);
            }
            Object.assign(localAcc, data.user, {
              name: data.user.username,
              registered: true,
              isGuest: false,
              passwordHash: hashClientPassword(password),
              savedGameSnapshot: data.user.activeGameState || localAcc.savedGameSnapshot || null
            });
            ensureAccountFields(localAcc);
            state.hasChosenAuthSession = true;
            activateAccount(localAcc);
            persist();
            closeAuthModal();
            openLobbyPage('home');
            showToast(`Добро пожаловать, ${localAcc.name}! Профиль, рейтинг и статистика загружены.`, 'success');
            return;
          } else if (res.status === 401) {
            // Also check if user exists only locally before failing
            const idLower = identifier.toLowerCase();
            const localMatch = state.accounts.find(a =>
              a.registered && (a.name.toLowerCase() === idLower || (a.email && a.email.toLowerCase() === idLower))
            );
            if (!localMatch) return showErr(data.error || 'Неверный Email/логин или пароль.');
          }
        } catch (_) {}
      }

      const idLower = identifier.toLowerCase();
      const target = state.accounts.find(a =>
        a.registered && (a.name.toLowerCase() === idLower || (a.email && a.email.toLowerCase() === idLower))
      );
      if (!target) {
        return showErr('Аккаунт с таким Email или именем пользователя не найден.');
      }
      if (target.passwordHash && target.passwordHash !== hashClientPassword(password)) {
        return showErr('Неверный пароль. Попробуйте ещё раз или нажмите «Забыли пароль?».');
      }

      state.hasChosenAuthSession = true;
      activateAccount(target);
      persist();
      closeAuthModal();
      openLobbyPage('home');
      showToast(`С возвращением в игру, ${target.name}!`, 'success');
    });

    document.getElementById('newProfileBtn').addEventListener('click', () => {
      openAuthModal('register');
    });

    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 120));
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (state.currentPage === 'arena') {
        if (e.key === 'f' || e.key === 'F') doFlip();
        if (e.key === 'z' && (e.ctrlKey || e.metaKey)) doUndo();
      }
    });

    // Live 1-second ticker for Real-Time Automated System Tournaments countdowns
    setInterval(() => {
      if (state.currentPage === 'lobby' && state.activeTab === 'tournaments') {
        const now = Date.now();
        if (state.liveTournaments.every(t => t.isSystem && now > t.endsAt)) {
          state.liveTournaments = buildLocalSystemTournaments();
        }
        renderTournamentsUI();
      }
    }, 1000);
  }

  /* ======================== INIT & INDEXEDDB GUEST HYDRATION ======================== */
  window.addEventListener('load', async () => {
    // Hydrate persistent Guest profile, match history & active unfinished game from IndexedDB (never auto-deleted!)
    try {
      const idbData = await GuestIndexedDB.loadAllGuestData();
      if (idbData?.profile) {
        let guestAcc = state.accounts.find(a => !a.registered || a.isGuest);
        const restoredHistory = Array.isArray(idbData.history) ? idbData.history : (idbData.profile.history || []);
        const restoredSnap = idbData.activeGame || idbData.profile.savedGameSnapshot || null;
        if (!guestAcc) {
          guestAcc = createDefaultAccount(idbData.profile.name || generateGuestNickname(), {
            ...idbData.profile,
            registered: false,
            isGuest: true,
            mode: 'ai',
            history: restoredHistory,
            savedGameSnapshot: restoredSnap
          });
          state.accounts.unshift(guestAcc);
        } else {
          Object.assign(guestAcc, idbData.profile, {
            registered: false,
            isGuest: true,
            mode: 'ai',
            history: restoredHistory.length >= (guestAcc.history?.length || 0) ? restoredHistory : guestAcc.history,
            savedGameSnapshot: restoredSnap || guestAcc.savedGameSnapshot || null
          });
        }
        if (isCurrentUserGuest()) {
          activateAccount(guestAcc);
        }
      } else {
        // Ensure current guest profile is immediately persisted to IndexedDB
        const guestAcc = state.accounts.find(a => !a.registered || a.isGuest);
        if (guestAcc) {
          GuestIndexedDB.set('guest_profile', { ...guestAcc });
          GuestIndexedDB.set('guest_history', guestAcc.history || []);
        }
      }
    } catch (_) {}

    bindEvents();
    SoundFX.initMobileUnlock();
    applyThemeAndPrefs();
    renderSettingsUI();
    renderModesAndRulesUI();
    renderStylesUI();
    renderChestsUI();
    renderTournamentsUI();
    updateAllUI();
    initOptionalServerBackend();

    // Show centered Registration / Login / Guest screen on initial entry if user hasn't chosen a session yet
    if (!state.hasChosenAuthSession) {
      if (typeof window.openCenteredAuthScreen === 'function') {
        window.openCenteredAuthScreen('register');
      }
    }
  });
})();
