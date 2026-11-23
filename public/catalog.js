'use strict';

window.CHECKERS_CATALOG = (() => {
  /* ======================== 4 RARITY LEVELS (CS2 STYLE) ======================== */
  const RARITIES = {
    common: {
      id: 'common',
      name: 'Обычный',
      color: '#3b82f6',
      bg: 'rgba(59, 130, 246, 0.14)',
      border: 'rgba(59, 130, 246, 0.45)',
      glow: '0 0 14px rgba(59, 130, 246, 0.45)',
      weightCommonChest: 56,
      weightRareChest: 22
    },
    uncommon: {
      id: 'uncommon',
      name: 'Необычный',
      color: '#a855f7',
      bg: 'rgba(168, 85, 247, 0.16)',
      border: 'rgba(168, 85, 247, 0.50)',
      glow: '0 0 18px rgba(168, 85, 247, 0.55)',
      weightCommonChest: 30,
      weightRareChest: 43
    },
    rare: {
      id: 'rare',
      name: 'Редкий',
      color: '#ec4899',
      bg: 'rgba(236, 72, 153, 0.18)',
      border: 'rgba(236, 72, 153, 0.58)',
      glow: '0 0 22px rgba(236, 72, 153, 0.65)',
      weightCommonChest: 11,
      weightRareChest: 26
    },
    legendary: {
      id: 'legendary',
      name: 'Легендарный',
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.22)',
      border: 'rgba(245, 158, 11, 0.78)',
      glow: '0 0 28px rgba(245, 158, 11, 0.85)',
      weightCommonChest: 3,
      weightRareChest: 9
    }
  };

  /* ======================== 10 CHEST TIERS x 3 GRADES (30 STAGES) ======================== */
  const CHEST_TIERS = [
    { tier: 1,  name: 'Обычный',          minLevel: 1,  icon: '📦', color: '#94a3b8', baseCoins: 60,   stakeLabel: 'Столы Новичков (50 🪙)' },
    { tier: 2,  name: 'Ученический',      minLevel: 10, icon: '🎒', color: '#84cc16', baseCoins: 110,  stakeLabel: 'Ученические столы (150 🪙)' },
    { tier: 3,  name: 'Клубный',          minLevel: 20, icon: '🧰', color: '#22c55e', baseCoins: 170,  stakeLabel: 'Клубные турниры (300 🪙)' },
    { tier: 4,  name: 'Бронзовый',        minLevel: 30, icon: '🥉', color: '#d97706', baseCoins: 240,  stakeLabel: 'Бронзовая лига (500 🪙)' },
    { tier: 5,  name: 'Серебряный',       minLevel: 40, icon: '🥈', color: '#cbd5e1', baseCoins: 330,  stakeLabel: 'Серебряная лига (800 🪙)' },
    { tier: 6,  name: 'Турнирный',        minLevel: 50, icon: '🏆', color: '#38bdf8', baseCoins: 450,  stakeLabel: 'Кубковые арены (1 200 🪙)' },
    { tier: 7,  name: 'Золотой',          minLevel: 60, icon: '🥇', color: '#facc15', baseCoins: 600,  stakeLabel: 'Золотая арена (2 000 🪙)' },
    { tier: 8,  name: 'Мастерский',       minLevel: 70, icon: '💠', color: '#a855f7', baseCoins: 800,  stakeLabel: 'Столы Мастеров (3 500 🪙)' },
    { tier: 9,  name: 'Гроссмейстерский', minLevel: 80, icon: '👑', color: '#ec4899', baseCoins: 1050, stakeLabel: 'Гран-При Гроссмейстеров (5 000 🪙)' },
    { tier: 10, name: 'Легендарный',      minLevel: 90, icon: '🐉', color: '#f59e0b', baseCoins: 1400, stakeLabel: 'Легендарный Олимп (10 000 🪙)' }
  ];

  // Grades: 3 = III разряд, 2 = II разряд, 1 = I разряд (highest value)
  const CHEST_GRADES = {
    3: { grade: 3, roman: 'III', label: 'III разряд', coinMult: 1.0, desc: 'Базовые монеты + 1 простой бустер (+ шанс на скин)' },
    2: { grade: 2, roman: 'II',  label: 'II разряд',  coinMult: 1.5, desc: 'Увеличенные монеты + бустер или фрагмент косметики' },
    1: { grade: 1, roman: 'I',   label: 'I разряд',   coinMult: 2.4, desc: 'Максимум монет + кристаллы + гарантированная редкая награда!' }
  };

  function getChestTierByLevel(level) {
    const lv = Math.max(1, Math.floor(level || 1));
    let found = CHEST_TIERS[0];
    for (const t of CHEST_TIERS) {
      if (lv >= t.minLevel) found = t;
    }
    return found;
  }

  /* ======================== 36 BOARD STYLES (4 DEFAULT + 32 CHEST EXCLUSIVES) ======================== */
  const BOARD_THEMES = {
    // --- 4 STANDARD UNLOCKED BY DEFAULT ---
    emerald: {
      id: 'emerald', name: 'Турнирный изумруд', rarity: 'common', defaultUnlocked: true,
      light: '#eeeed2', dark: '#769656', frame: '#3d502b', coord: '#d9e8c3',
      grain: 'rgba(0,0,0,0.04)', lastMove: 'rgba(246,246,105,0.52)', select: 'rgba(56,189,248,0.55)', pattern: 'classic'
    },
    wood: {
      id: 'wood', name: 'Классическое дерево', rarity: 'common', defaultUnlocked: true,
      light: '#f0d9b5', dark: '#8d5524', frame: '#4a2c11', coord: '#e7cba0',
      grain: 'rgba(60,25,0,0.09)', lastMove: 'rgba(250,204,21,0.45)', select: 'rgba(56,189,248,0.55)', pattern: 'wood'
    },
    marble: {
      id: 'marble', name: 'Королевский мрамор', rarity: 'common', defaultUnlocked: true,
      light: '#eef2f6', dark: '#475569', frame: '#1e293b', coord: '#cbd5e1',
      grain: 'rgba(255,255,255,0.08)', lastMove: 'rgba(245,158,11,0.42)', select: 'rgba(56,189,248,0.55)', pattern: 'marble'
    },
    nordic: {
      id: 'nordic', name: 'Скандинавия', rarity: 'common', defaultUnlocked: true,
      light: '#f8fafc', dark: '#64748b', frame: '#334155', coord: '#e2e8f0',
      grain: 'rgba(15,23,42,0.05)', lastMove: 'rgba(251,191,36,0.42)', select: 'rgba(14,165,233,0.55)', pattern: 'classic'
    },

    // --- 10 COMMON (ОБЫЧНЫЕ) CHEST SKINS ---
    pine_club: {
      id: 'pine_club', name: 'Сосновый бор', rarity: 'common', defaultUnlocked: false,
      light: '#f5e6c8', dark: '#5c7457', frame: '#2d3b2a', coord: '#c9dec4',
      grain: 'rgba(0,30,0,0.07)', lastMove: 'rgba(250,204,21,0.45)', select: 'rgba(56,189,248,0.55)', pattern: 'wood'
    },
    sandstone: {
      id: 'sandstone', name: 'Песчаник Сахары', rarity: 'common', defaultUnlocked: false,
      light: '#fdf3dd', dark: '#b8864b', frame: '#6e4c23', coord: '#f3d9b1',
      grain: 'rgba(80,40,0,0.07)', lastMove: 'rgba(245,158,11,0.48)', select: 'rgba(56,189,248,0.55)', pattern: 'marble'
    },
    slate_arena: {
      id: 'slate_arena', name: 'Графитовый клуб', rarity: 'common', defaultUnlocked: false,
      light: '#cbd5e1', dark: '#334155', frame: '#0f172a', coord: '#94a3b8',
      grain: 'rgba(255,255,255,0.04)', lastMove: 'rgba(56,189,248,0.45)', select: 'rgba(16,185,129,0.55)', pattern: 'classic'
    },
    walnut_classic: {
      id: 'walnut_classic', name: 'Старый орех', rarity: 'common', defaultUnlocked: false,
      light: '#e6ccb2', dark: '#6c462b', frame: '#382212', coord: '#ddb892',
      grain: 'rgba(40,18,0,0.1)', lastMove: 'rgba(250,204,21,0.45)', select: 'rgba(56,189,248,0.55)', pattern: 'wood'
    },
    ocean_breeze: {
      id: 'ocean_breeze', name: 'Морской бриз', rarity: 'common', defaultUnlocked: false,
      light: '#e0f2fe', dark: '#0369a1', frame: '#0c4a6e', coord: '#bae6fd',
      grain: 'rgba(255,255,255,0.06)', lastMove: 'rgba(250,204,21,0.45)', select: 'rgba(56,189,248,0.55)', pattern: 'ocean'
    },
    olive_grove: {
      id: 'olive_grove', name: 'Оливковая роща', rarity: 'common', defaultUnlocked: false,
      light: '#f4f1de', dark: '#6b705c', frame: '#3a3d31', coord: '#ddbea9',
      grain: 'rgba(0,0,0,0.05)', lastMove: 'rgba(245,158,11,0.45)', select: 'rgba(56,189,248,0.55)', pattern: 'wood'
    },
    coffee_roast: {
      id: 'coffee_roast', name: 'Кофейная обжарка', rarity: 'common', defaultUnlocked: false,
      light: '#ede0d4', dark: '#583101', frame: '#2b1800', coord: '#d4a276',
      grain: 'rgba(30,10,0,0.09)', lastMove: 'rgba(251,191,36,0.45)', select: 'rgba(56,189,248,0.55)', pattern: 'wood'
    },
    steel_grid: {
      id: 'steel_grid', name: 'Стальной полигон', rarity: 'common', defaultUnlocked: false,
      light: '#e2e8f0', dark: '#4b5563', frame: '#1f2937', coord: '#9ca3af',
      grain: 'rgba(0,0,0,0.06)', lastMove: 'rgba(250,204,21,0.45)', select: 'rgba(56,189,248,0.55)', pattern: 'carbon'
    },
    birch_grove: {
      id: 'birch_grove', name: 'Карельская берёза', rarity: 'common', defaultUnlocked: false,
      light: '#fff8eb', dark: '#a47551', frame: '#523a28', coord: '#e4d4c8',
      grain: 'rgba(70,35,0,0.08)', lastMove: 'rgba(245,158,11,0.45)', select: 'rgba(56,189,248,0.55)', pattern: 'wood'
    },
    school_chalk: {
      id: 'school_chalk', name: 'Ученическая доска', rarity: 'common', defaultUnlocked: false,
      light: '#d8f3dc', dark: '#2d6a4f', frame: '#1b4332', coord: '#b7e4c7',
      grain: 'rgba(255,255,255,0.05)', lastMove: 'rgba(250,204,21,0.45)', select: 'rgba(56,189,248,0.55)', pattern: 'classic'
    },

    // --- 10 UNCOMMON (НЕОБЫЧНЫЕ) CHEST SKINS ---
    mahogany: {
      id: 'mahogany', name: 'Императорский махагон', rarity: 'uncommon', defaultUnlocked: false,
      light: '#f3dec3', dark: '#6e1e26', frame: '#3b0d11', coord: '#f3c68f',
      grain: 'rgba(40,0,0,0.1)', lastMove: 'rgba(251,191,36,0.45)', select: 'rgba(56,189,248,0.55)', pattern: 'wood'
    },
    arctic_frost: {
      id: 'arctic_frost', name: 'Арктический лёд', rarity: 'uncommon', defaultUnlocked: false,
      light: '#f0f9ff', dark: '#0284c7', frame: '#082f49', coord: '#7dd3fc',
      grain: 'rgba(255,255,255,0.12)', lastMove: 'rgba(56,189,248,0.48)', select: 'rgba(168,85,247,0.55)', pattern: 'frost', gridGlow: 'rgba(125,211,252,0.22)'
    },
    sakura_bloom: {
      id: 'sakura_bloom', name: 'Цветение сакуры', rarity: 'uncommon', defaultUnlocked: false,
      light: '#ffe5ec', dark: '#9d4edd', frame: '#4a154b', coord: '#ffb3c6',
      grain: 'rgba(255,182,193,0.1)', lastMove: 'rgba(244,114,182,0.48)', select: 'rgba(56,189,248,0.55)', pattern: 'sakura'
    },
    jade_dynasty: {
      id: 'jade_dynasty', name: 'Нефритовая династия', rarity: 'uncommon', defaultUnlocked: false,
      light: '#d1fae5', dark: '#047857', frame: '#022c22', coord: '#6ee7b7',
      grain: 'rgba(255,255,255,0.08)', lastMove: 'rgba(250,204,21,0.48)', select: 'rgba(56,189,248,0.55)', pattern: 'marble'
    },
    crimson_velvet: {
      id: 'crimson_velvet', name: 'Алый бархат', rarity: 'uncommon', defaultUnlocked: false,
      light: '#fde2e4', dark: '#800f2f', frame: '#480ca8', coord: '#ffccd5',
      grain: 'rgba(0,0,0,0.08)', lastMove: 'rgba(250,204,21,0.48)', select: 'rgba(56,189,248,0.55)', pattern: 'velvet'
    },
    carbon_stealth: {
      id: 'carbon_stealth', name: 'Карбон Стелс', rarity: 'uncommon', defaultUnlocked: false,
      light: '#374151', dark: '#111827', frame: '#030712', coord: '#9ca3af',
      grain: 'rgba(255,255,255,0.04)', lastMove: 'rgba(245,158,11,0.45)', select: 'rgba(56,189,248,0.55)', pattern: 'carbon', gridGlow: 'rgba(156,163,175,0.15)'
    },
    amber_palace: {
      id: 'amber_palace', name: 'Янтарная палата', rarity: 'uncommon', defaultUnlocked: false,
      light: '#fef3c7', dark: '#b45309', frame: '#451a03', coord: '#fcd34d',
      grain: 'rgba(255,215,0,0.09)', lastMove: 'rgba(239,68,68,0.45)', select: 'rgba(56,189,248,0.55)', pattern: 'gold'
    },
    amethyst_cove: {
      id: 'amethyst_cove', name: 'Аметистовый грот', rarity: 'uncommon', defaultUnlocked: false,
      light: '#f3e8ff', dark: '#6b21a8', frame: '#2e1065', coord: '#d8b4fe',
      grain: 'rgba(255,255,255,0.08)', lastMove: 'rgba(236,72,153,0.48)', select: 'rgba(56,189,248,0.55)', pattern: 'marble'
    },
    copper_forge: {
      id: 'copper_forge', name: 'Медная кузница', rarity: 'uncommon', defaultUnlocked: false,
      light: '#ffedd5', dark: '#9a3412', frame: '#431407', coord: '#fdba74',
      grain: 'rgba(0,0,0,0.09)', lastMove: 'rgba(250,204,21,0.48)', select: 'rgba(56,189,248,0.55)', pattern: 'carbon'
    },
    midnight_lagoon: {
      id: 'midnight_lagoon', name: 'Полуночная лагуна', rarity: 'uncommon', defaultUnlocked: false,
      light: '#ccfbf1', dark: '#0f766e', frame: '#042f2e', coord: '#5eead4',
      grain: 'rgba(255,255,255,0.07)', lastMove: 'rgba(250,204,21,0.48)', select: 'rgba(56,189,248,0.55)', pattern: 'ocean'
    },

    // --- 7 RARE (РЕДКИЕ) CHEST SKINS ---
    neon: {
      id: 'neon', name: 'Неон Обсидиан', rarity: 'rare', defaultUnlocked: false,
      light: '#1e2436', dark: '#0b0f19', frame: '#050810', coord: '#38bdf8',
      grain: 'rgba(56,189,248,0.08)', lastMove: 'rgba(232,121,249,0.42)', select: 'rgba(34,211,238,0.58)', gridGlow: 'rgba(56,189,248,0.28)', pattern: 'cyber'
    },
    cyber_matrix: {
      id: 'cyber_matrix', name: 'Код Матрицы', rarity: 'rare', defaultUnlocked: false,
      light: '#0f291e', dark: '#040d08', frame: '#020804', coord: '#22c55e',
      grain: 'rgba(34,197,94,0.12)', lastMove: 'rgba(34,197,94,0.45)', select: 'rgba(16,185,129,0.6)', gridGlow: 'rgba(34,197,94,0.3)', pattern: 'matrix'
    },
    volcanic_magma: {
      id: 'volcanic_magma', name: 'Вулканическая магма', rarity: 'rare', defaultUnlocked: false,
      light: '#3b1d14', dark: '#170704', frame: '#0d0302', coord: '#f97316',
      grain: 'rgba(249,115,22,0.14)', lastMove: 'rgba(239,68,68,0.5)', select: 'rgba(251,191,36,0.6)', gridGlow: 'rgba(249,115,22,0.32)', pattern: 'lava'
    },
    royal_lazuli: {
      id: 'royal_lazuli', name: 'Царский лазурит', rarity: 'rare', defaultUnlocked: false,
      light: '#dbeafe', dark: '#1e3a8a', frame: '#0f172a', coord: '#fbbf24',
      grain: 'rgba(251,191,36,0.12)', lastMove: 'rgba(251,191,36,0.52)', select: 'rgba(56,189,248,0.6)', gridGlow: 'rgba(251,191,36,0.28)', pattern: 'gold'
    },
    synthwave_84: {
      id: 'synthwave_84', name: 'Синтвейв 1984', rarity: 'rare', defaultUnlocked: false,
      light: '#2e1065', dark: '#0f0524', frame: '#070212', coord: '#f472b6',
      grain: 'rgba(244,114,182,0.12)', lastMove: 'rgba(236,72,153,0.48)', select: 'rgba(34,211,238,0.6)', gridGlow: 'rgba(244,114,182,0.35)', pattern: 'cyber'
    },
    blood_moon: {
      id: 'blood_moon', name: 'Кровавое затмение', rarity: 'rare', defaultUnlocked: false,
      light: '#3f1118', dark: '#140407', frame: '#0a0103', coord: '#f43f5e',
      grain: 'rgba(244,63,94,0.12)', lastMove: 'rgba(244,63,94,0.48)', select: 'rgba(251,191,36,0.6)', gridGlow: 'rgba(244,63,94,0.3)', pattern: 'lava'
    },
    Atlantis_prism: {
      id: 'Atlantis_prism', name: 'Кристалл Атлантиды', rarity: 'rare', defaultUnlocked: false,
      light: '#cffafe', dark: '#155e75', frame: '#083344', coord: '#22d3ee',
      grain: 'rgba(34,211,238,0.14)', lastMove: 'rgba(56,189,248,0.5)', select: 'rgba(168,85,247,0.6)', gridGlow: 'rgba(34,211,238,0.3)', pattern: 'prism'
    },

    // --- 5 LEGENDARY (ЛЕГЕНДАРНЫЕ) CHEST SKINS ---
    dragon_scales: {
      id: 'dragon_scales', name: 'Чешуя Древнего Дракона', rarity: 'legendary', defaultUnlocked: false,
      light: '#3d2314', dark: '#160a05', frame: '#0c0502', coord: '#fbbf24',
      grain: 'rgba(251,191,36,0.16)', lastMove: 'rgba(245,158,11,0.55)', select: 'rgba(239,68,68,0.65)', gridGlow: 'rgba(251,191,36,0.45)', pattern: 'scales'
    },
    cosmic_nebula: {
      id: 'cosmic_nebula', name: 'Галактическая Туманность', rarity: 'legendary', defaultUnlocked: false,
      light: '#1e1b4b', dark: '#09071a', frame: '#04030c', coord: '#c084fc',
      grain: 'rgba(192,132,252,0.14)', lastMove: 'rgba(168,85,247,0.55)', select: 'rgba(34,211,238,0.65)', gridGlow: 'rgba(168,85,247,0.42)', pattern: 'stars'
    },
    imperial_gold: {
      id: 'imperial_gold', name: 'Сокровище Императора', rarity: 'legendary', defaultUnlocked: false,
      light: '#fef08a', dark: '#713f12', frame: '#3b1d06', coord: '#fde047',
      grain: 'rgba(255,215,0,0.18)', lastMove: 'rgba(245,158,11,0.58)', select: 'rgba(239,68,68,0.65)', gridGlow: 'rgba(250,204,21,0.5)', pattern: 'gold'
    },
    runic_valhalla: {
      id: 'runic_valhalla', name: 'Руны Вальхаллы', rarity: 'legendary', defaultUnlocked: false,
      light: '#1e293b', dark: '#090d16', frame: '#020617', coord: '#38bdf8',
      grain: 'rgba(56,189,248,0.15)', lastMove: 'rgba(14,165,233,0.55)', select: 'rgba(250,204,21,0.65)', gridGlow: 'rgba(56,189,248,0.45)', pattern: 'runes'
    },
    hologram_omega: {
      id: 'hologram_omega', name: 'Квантовая Призма Омега', rarity: 'legendary', defaultUnlocked: false,
      light: '#1f1235', dark: '#0a0612', frame: '#05020a', coord: '#22d3ee',
      grain: 'rgba(34,211,238,0.14)', lastMove: 'rgba(236,72,153,0.55)', select: 'rgba(34,211,238,0.65)', gridGlow: 'rgba(236,72,153,0.45)', pattern: 'prism'
    }
  };

  /* ======================== 36 PIECE STYLES (4 DEFAULT + 32 CHEST EXCLUSIVES) ======================== */
  const PIECE_STYLES = {
    // --- 4 STANDARD UNLOCKED BY DEFAULT ---
    classic: {
      id: 'classic', name: 'Классика', desc: 'Точёный рельеф', rarity: 'common', defaultUnlocked: true,
      wTop: '#fffdf7', wMid: '#e8dcc8', wEdge: '#b8a58a', wRing: '#cbb99e',
      bTop: '#3b3f4a', bMid: '#1f232c', bEdge: '#0b0d12', bRing: '#4f5565',
      crownW: '#d97706', crownB: '#fbbf24', effect: 'classic'
    },
    minimal: {
      id: 'minimal', name: 'Минимал', desc: 'Высокий контраст', rarity: 'common', defaultUnlocked: true,
      wTop: '#ffffff', wMid: '#f1f5f9', wEdge: '#cbd5e1', wRing: '#e2e8f0',
      bTop: '#18181b', bMid: '#09090b', bEdge: '#000000', bRing: '#3f3f46',
      crownW: '#f59e0b', crownB: '#f59e0b', effect: 'minimal'
    },
    wood_piece: {
      id: 'wood_piece', name: 'Точёный дуб', desc: 'Натуральное дерево', rarity: 'common', defaultUnlocked: true,
      wTop: '#faedcd', wMid: '#d4a373', wEdge: '#9c6644', wRing: '#fefae0',
      bTop: '#7f5539', bMid: '#432818', bEdge: '#25140b', bRing: '#b08968',
      crownW: '#99582a', crownB: '#ffe6a7', effect: 'classic'
    },
    slate_piece: {
      id: 'slate_piece', name: 'Каменный сланец', desc: 'Матовый гранит', rarity: 'common', defaultUnlocked: true,
      wTop: '#f8fafc', wMid: '#cbd5e1', wEdge: '#64748b', wRing: '#94a3b8',
      bTop: '#475569', bMid: '#1e293b', bEdge: '#0f172a', bRing: '#64748b',
      crownW: '#0284c7', crownB: '#38bdf8', effect: 'classic'
    },

    // --- 10 COMMON (ОБЫЧНЫЕ) PIECE SKINS ---
    ivory_carved: {
      id: 'ivory_carved', name: 'Слоновая кость', desc: 'Античный стиль', rarity: 'common', defaultUnlocked: false,
      wTop: '#fffcf2', wMid: '#eee2df', wEdge: '#ccc5b9', wRing: '#d5bdaf',
      bTop: '#403d39', bMid: '#252422', bEdge: '#0f0e0d', bRing: '#6c6863',
      crownW: '#b5838d', crownB: '#ffb4a2', effect: 'classic'
    },
    forest_moss: {
      id: 'forest_moss', name: 'Лесной изумруд', desc: 'Хвойный оттенок', rarity: 'common', defaultUnlocked: false,
      wTop: '#ecfdf5', wMid: '#a7f3d0', wEdge: '#059669', wRing: '#6ee7b7',
      bTop: '#065f46', bMid: '#064e3b', bEdge: '#022c22', bRing: '#10b981',
      crownW: '#047857', crownB: '#34d399', effect: 'classic'
    },
    ocean_pearl: {
      id: 'ocean_pearl', name: 'Морской жемчуг', desc: 'Перламутровый отлив', rarity: 'common', defaultUnlocked: false,
      wTop: '#f0f9ff', wMid: '#bae6fd', wEdge: '#0284c7', wRing: '#7dd3fc',
      bTop: '#0369a1', bMid: '#0c4a6e', bEdge: '#082f49', bRing: '#38bdf8',
      crownW: '#0369a1', crownB: '#7dd3fc', effect: 'crystal'
    },
    terracotta: {
      id: 'terracotta', name: 'Терракота', desc: 'Обожжённая глина', rarity: 'common', defaultUnlocked: false,
      wTop: '#ffedd5', wMid: '#fdba74', wEdge: '#c2410c', wRing: '#fed7aa',
      bTop: '#9a3412', bMid: '#431407', bEdge: '#270902', bRing: '#ea580c',
      crownW: '#9a3412', crownB: '#fb923c', effect: 'classic'
    },
    bronze_club: {
      id: 'bronze_club', name: 'Клубная бронза', desc: 'Литой металл', rarity: 'common', defaultUnlocked: false,
      wTop: '#fef3c7', wMid: '#d97706', wEdge: '#78350f', wRing: '#fbbf24',
      bTop: '#78350f', bMid: '#451a03', bEdge: '#1c0a00', bRing: '#b45309',
      crownW: '#451a03', crownB: '#fcd34d', effect: 'metal'
    },
    crimson_guard: {
      id: 'crimson_guard', name: 'Алая гвардия', desc: 'Рубиновый борт', rarity: 'common', defaultUnlocked: false,
      wTop: '#fff1f2', wMid: '#fecdd3', wEdge: '#e11d48', wRing: '#fda4af',
      bTop: '#be123c', bMid: '#881337', bEdge: '#4c0519', bRing: '#f43f5e',
      crownW: '#be123c', crownB: '#fda4af', effect: 'classic'
    },
    nordic_steel: {
      id: 'nordic_steel', name: 'Северная сталь', desc: 'Холодный сплав', rarity: 'common', defaultUnlocked: false,
      wTop: '#ffffff', wMid: '#cbd5e1', wEdge: '#475569', wRing: '#f1f5f9',
      bTop: '#334155', bMid: '#0f172a', bEdge: '#020617', bRing: '#94a3b8',
      crownW: '#1e293b', crownB: '#e2e8f0', effect: 'metal'
    },
    sand_pharaoh: {
      id: 'sand_pharaoh', name: 'Пески Луксора', desc: 'Пустынный камень', rarity: 'common', defaultUnlocked: false,
      wTop: '#fef9c3', wMid: '#fde047', wEdge: '#ca8a04', wRing: '#fef08a',
      bTop: '#854d0e', bMid: '#422006', bEdge: '#1f0e02', bRing: '#eab308',
      crownW: '#713f12', crownB: '#fde047', effect: 'classic'
    },
    violet_dusk: {
      id: 'violet_dusk', name: 'Сумеречный аметист', desc: 'Фиолетовый бархат', rarity: 'common', defaultUnlocked: false,
      wTop: '#faf5ff', wMid: '#e9d5ff', wEdge: '#9333ea', wRing: '#d8b4fe',
      bTop: '#6b21a8', bMid: '#3b0764', bEdge: '#1e0338', bRing: '#a855f7',
      crownW: '#6b21a8', crownB: '#e9d5ff', effect: 'classic'
    },
    ceramic_gloss: {
      id: 'ceramic_gloss', name: 'Белый фарфор', desc: 'Керамический блеск', rarity: 'common', defaultUnlocked: false,
      wTop: '#ffffff', wMid: '#e0e7ff', wEdge: '#6366f1', wRing: '#c7d2fe',
      bTop: '#312e81', bMid: '#1e1b4b', bEdge: '#0f0d26', bRing: '#818cf8',
      crownW: '#4338ca', crownB: '#c7d2fe', effect: 'crystal'
    },

    // --- 10 UNCOMMON (НЕОБЫЧНЫЕ) PIECE SKINS ---
    crystal: {
      id: 'crystal', name: 'Хрусталь', desc: 'Стеклянный глянец', rarity: 'uncommon', defaultUnlocked: false,
      wTop: '#ffffff', wMid: '#bae6fd', wEdge: '#38bdf8', wRing: '#e0f2fe',
      bTop: '#818cf8', bMid: '#312e81', bEdge: '#1e1b4b', bRing: '#a5b4fc',
      crownW: '#0284c7', crownB: '#fde047', effect: 'crystal'
    },
    metal: {
      id: 'metal', name: 'Золото и Сталь', desc: 'Кованый блеск', rarity: 'uncommon', defaultUnlocked: false,
      wTop: '#fef08a', wMid: '#eab308', wEdge: '#854d0e', wRing: '#fde047',
      bTop: '#64748b', bMid: '#1e293b', bEdge: '#090d16', bRing: '#94a3b8',
      crownW: '#713f12', crownB: '#f8fafc', effect: 'metal'
    },
    jade_lotus: {
      id: 'jade_lotus', name: 'Нефритовый лотос', desc: 'Императорский камень', rarity: 'uncommon', defaultUnlocked: false,
      wTop: '#d1fae5', wMid: '#34d399', wEdge: '#065f46', wRing: '#a7f3d0',
      bTop: '#047857', bMid: '#022c22', bEdge: '#011712', bRing: '#10b981',
      crownW: '#064e3b', crownB: '#fde047', effect: 'royal'
    },
    ruby_monarch: {
      id: 'ruby_monarch', name: 'Рубиновый монарх', desc: 'Гранёный рубин', rarity: 'uncommon', defaultUnlocked: false,
      wTop: '#ffe4e6', wMid: '#fb7185', wEdge: '#9f1239', wRing: '#fda4af',
      bTop: '#e11d48', bMid: '#4c0519', bEdge: '#26020c', bRing: '#fb7185',
      crownW: '#881337', crownB: '#fef08a', effect: 'diamond'
    },
    sapphire_crown: {
      id: 'sapphire_crown', name: 'Сапфировая корона', desc: 'Королевский синий', rarity: 'uncommon', defaultUnlocked: false,
      wTop: '#dbeafe', wMid: '#60a5fa', wEdge: '#1e3a8a', wRing: '#93c5fd',
      bTop: '#2563eb', bMid: '#172554', bEdge: '#091026', bRing: '#60a5fa',
      crownW: '#1e3a8a', crownB: '#fde047', effect: 'royal'
    },
    amber_honey: {
      id: 'amber_honey', name: 'Балтийский янтарь', desc: 'Прозрачная смола', rarity: 'uncommon', defaultUnlocked: false,
      wTop: '#fef3c7', wMid: '#f59e0b', wEdge: '#78350f', wRing: '#fde68a',
      bTop: '#b45309', bMid: '#451a03', bEdge: '#1c0a00', bRing: '#f59e0b',
      crownW: '#78350f', crownB: '#fef08a', effect: 'crystal'
    },
    obsidian_edge: {
      id: 'obsidian_edge', name: 'Вулканический обсидиан', desc: 'Острое стекло', rarity: 'uncommon', defaultUnlocked: false,
      wTop: '#e2e8f0', wMid: '#94a3b8', wEdge: '#334155', wRing: '#f8fafc',
      bTop: '#1e1b4b', bMid: '#090717', bEdge: '#000000', bRing: '#ec4899',
      crownW: '#0f172a', crownB: '#f472b6', effect: 'obsidian'
    },
    sakura_petal: {
      id: 'sakura_petal', name: 'Лепесток Киото', desc: 'Японский стиль', rarity: 'uncommon', defaultUnlocked: false,
      wTop: '#fff0f3', wMid: '#ffccd5', wEdge: '#c9184a', wRing: '#ffb3c1',
      bTop: '#7209b7', bMid: '#3c096c', bEdge: '#10002b', bRing: '#f72585',
      crownW: '#a4133c', crownB: '#ffccd5', effect: 'star'
    },
    frost_shard: {
      id: 'frost_shard', name: 'Ледяной осколок', desc: 'Морозный узор', rarity: 'uncommon', defaultUnlocked: false,
      wTop: '#ffffff', wMid: '#cffafe', wEdge: '#0891b2', wRing: '#67e8f9',
      bTop: '#0e7490', bMid: '#164e63', bEdge: '#083344', bRing: '#22d3ee',
      crownW: '#155e75', crownB: '#a5f3fc', effect: 'frost'
    },
    copper_gear: {
      id: 'copper_gear', name: 'Стимпанк Шестерня', desc: 'Механика и латунь', rarity: 'uncommon', defaultUnlocked: false,
      wTop: '#ffedd5', wMid: '#ea580c', wEdge: '#7c2d12', wRing: '#fdba74',
      bTop: '#57534e', bMid: '#1c1917', bEdge: '#0c0a09', bRing: '#f97316',
      crownW: '#431407', crownB: '#fb923c', effect: 'cyber'
    },

    // --- 7 RARE (РЕДКИЕ) PIECE SKINS ---
    cyber_pulse: {
      id: 'cyber_pulse', name: 'Кибер-Импульс', desc: 'Неоновые кольца', rarity: 'rare', defaultUnlocked: false,
      wTop: '#ecfeff', wMid: '#06b6d4', wEdge: '#083344', wRing: '#22d3ee',
      bTop: '#1e1b4b', bMid: '#090717', bEdge: '#020108', bRing: '#f43f5e',
      crownW: '#083344', crownB: '#22d3ee', effect: 'neon'
    },
    matrix_code: {
      id: 'matrix_code', name: 'Нейросеть Зеро', desc: 'Цифровое ядро', rarity: 'rare', defaultUnlocked: false,
      wTop: '#dcfce7', wMid: '#22c55e', wEdge: '#052e16', wRing: '#4ade80',
      bTop: '#052e16', bMid: '#021208', bEdge: '#000000', bRing: '#22c55e',
      crownW: '#052e16', crownB: '#4ade80', effect: 'cyber'
    },
    magma_core: {
      id: 'magma_core', name: 'Сердце Вулкана', desc: 'Раскалённая лава', rarity: 'rare', defaultUnlocked: false,
      wTop: '#fef08a', wMid: '#f97316', wEdge: '#7c2d12', wRing: '#fde047',
      bTop: '#450a0a', bMid: '#180202', bEdge: '#000000', bRing: '#ef4444',
      crownW: '#7c2d12', crownB: '#facc15', effect: 'magma'
    },
    royal_diamond: {
      id: 'royal_diamond', name: 'Бриллиант Короны', desc: 'Чистая огранка', rarity: 'rare', defaultUnlocked: false,
      wTop: '#ffffff', wMid: '#e0f2fe', wEdge: '#0284c7', wRing: '#38bdf8',
      bTop: '#312e81', bMid: '#0f0c2e', bEdge: '#040312', bRing: '#38bdf8',
      crownW: '#0369a1', crownB: '#fde047', effect: 'diamond'
    },
    plasma_vortex: {
      id: 'plasma_vortex', name: 'Плазменный вихрь', desc: 'Энергетический щит', rarity: 'rare', defaultUnlocked: false,
      wTop: '#f5d0fe', wMid: '#c026d3', wEdge: '#4a044e', wRing: '#e879f9',
      bTop: '#2e1065', bMid: '#0f0424', bEdge: '#04010a', bRing: '#e879f9',
      crownW: '#4a044e', crownB: '#f0abfc', effect: 'plasma'
    },
    blood_vampire: {
      id: 'blood_vampire', name: 'Кровавый Граф', desc: 'Готический орден', rarity: 'rare', defaultUnlocked: false,
      wTop: '#ffe4e6', wMid: '#e11d48', wEdge: '#4c0519', wRing: '#fb7185',
      bTop: '#27030a', bMid: '#0d0103', bEdge: '#000000', bRing: '#e11d48',
      crownW: '#4c0519', crownB: '#f43f5e', effect: 'royal'
    },
    runic_stone: {
      id: 'runic_stone', name: 'Рунный Монолит', desc: 'Печать древних', rarity: 'rare', defaultUnlocked: false,
      wTop: '#e0f2fe', wMid: '#38bdf8', wEdge: '#0c4a6e', wRing: '#7dd3fc',
      bTop: '#1e293b', bMid: '#090d16', bEdge: '#020617', bRing: '#38bdf8',
      crownW: '#0c4a6e', crownB: '#38bdf8', effect: 'rune'
    },

    // --- 5 LEGENDARY (ЛЕГЕНДАРНЫЕ) PIECE SKINS ---
    dragon_emperor: {
      id: 'dragon_emperor', name: 'Печать Дракона', desc: 'Огненное золото', rarity: 'legendary', defaultUnlocked: false,
      wTop: '#fef08a', wMid: '#f59e0b', wEdge: '#78350f', wRing: '#fde047',
      bTop: '#7f1d1d', bMid: '#280505', bEdge: '#0a0101', bRing: '#fbbf24',
      crownW: '#78350f', crownB: '#fde047', effect: 'dragon'
    },
    galactic_void: {
      id: 'galactic_void', name: 'Звёздная Бездна', desc: 'Космическое сияние', rarity: 'legendary', defaultUnlocked: false,
      wTop: '#f3e8ff', wMid: '#a855f7', wEdge: '#3b0764', wRing: '#e9d5ff',
      bTop: '#1e1b4b', bMid: '#060414', bEdge: '#010005', bRing: '#22d3ee',
      crownW: '#3b0764', crownB: '#22d3ee', effect: 'star'
    },
    sovereign_coin: {
      id: 'sovereign_coin', name: 'Червонное Золото', desc: 'Чеканный дукат', rarity: 'legendary', defaultUnlocked: false,
      wTop: '#ffffff', wMid: '#fde047', wEdge: '#a16207', wRing: '#fef08a',
      bTop: '#ca8a04', bMid: '#422006', bEdge: '#1c0d02', bRing: '#fde047',
      crownW: '#713f12', crownB: '#ffffff', effect: 'goldcoin'
    },
    immortal_titan: {
      id: 'immortal_titan', name: 'Бессмертный Титан', desc: 'Квантовый ореол', rarity: 'legendary', defaultUnlocked: false,
      wTop: '#ecfeff', wMid: '#22d3ee', wEdge: '#155e75', wRing: '#a5f3fc',
      bTop: '#0f172a', bMid: '#020617', bEdge: '#000000', bRing: '#22d3ee',
      crownW: '#083344', crownB: '#fde047', effect: 'plasma'
    },
    celestial_phoenix: {
      id: 'celestial_phoenix', name: 'Небесный Феникс', desc: 'Крылья пламени', rarity: 'legendary', defaultUnlocked: false,
      wTop: '#fef9c3', wMid: '#fb923c', wEdge: '#9a3412', wRing: '#fde047',
      bTop: '#be123c', bMid: '#4c0519', bEdge: '#190108', bRing: '#fbbf24',
      crownW: '#7c2d12', crownB: '#fde047', effect: 'dragon'
    }
  };

  /* ======================== AVATAR FRAMES (РАМКИ АВАТАРА) ======================== */
  const AVATAR_FRAMES = {
    default:          { id: 'default',          name: 'Без рамки',           rarity: 'common',    css: 'border: 2px solid rgba(255,255,255,0.14);' },
    bronze_ring:      { id: 'bronze_ring',      name: 'Бронзовый обод',      rarity: 'common',    css: 'border: 2.5px solid #d97706; box-shadow: 0 0 8px rgba(217,119,6,0.4);' },
    emerald_guard:    { id: 'emerald_guard',    name: 'Изумрудный щит',      rarity: 'common',    css: 'border: 2.5px solid #10b981; box-shadow: 0 0 10px rgba(16,185,129,0.5);' },
    steel_crest:      { id: 'steel_crest',      name: 'Стальной герб',       rarity: 'common',    css: 'border: 2.5px solid #94a3b8; box-shadow: 0 0 8px rgba(148,163,184,0.4);' },
    sapphire_glow:    { id: 'sapphire_glow',    name: 'Сапфировый контур',   rarity: 'uncommon',  css: 'border: 2.5px solid #3b82f6; box-shadow: 0 0 12px rgba(59,130,246,0.65);' },
    amethyst_aura:    { id: 'amethyst_aura',    name: 'Аметистовая аура',    rarity: 'uncommon',  css: 'border: 2.5px solid #a855f7; box-shadow: 0 0 14px rgba(168,85,247,0.7);' },
    frost_crown:      { id: 'frost_crown',      name: 'Ледяная грань',       rarity: 'uncommon',  css: 'border: 2.5px solid #22d3ee; box-shadow: 0 0 14px rgba(34,211,238,0.7);' },
    crimson_blaze:    { id: 'crimson_blaze',    name: 'Багровое пламя',      rarity: 'uncommon',  css: 'border: 2.5px solid #f43f5e; box-shadow: 0 0 14px rgba(244,63,94,0.7);' },
    cyber_neon:       { id: 'cyber_neon',       name: 'Кибер-Неон CS2',      rarity: 'rare',      css: 'border: 3px solid #ec4899; box-shadow: 0 0 16px rgba(236,72,153,0.85), inset 0 0 8px rgba(34,211,238,0.6);' },
    matrix_pulse:     { id: 'matrix_pulse',     name: 'Матричный контур',    rarity: 'rare',      css: 'border: 3px solid #22c55e; box-shadow: 0 0 16px rgba(34,197,94,0.85), inset 0 0 6px rgba(34,197,94,0.5);' },
    royal_gold:       { id: 'royal_gold',       name: 'Золотой венец',       rarity: 'rare',      css: 'border: 3px solid #facc15; box-shadow: 0 0 18px rgba(250,204,21,0.85);' },
    magma_lord:       { id: 'magma_lord',       name: 'Властелин Лавы',      rarity: 'rare',      css: 'border: 3px solid #f97316; box-shadow: 0 0 18px rgba(249,115,22,0.9), inset 0 0 8px rgba(239,68,68,0.7);' },
    dragon_fire:      { id: 'dragon_fire',      name: 'Дыхание Дракона',     rarity: 'legendary', css: 'border: 3px solid #fbbf24; box-shadow: 0 0 22px rgba(245,158,11,0.95), 0 0 8px rgba(239,68,68,0.9);' },
    cosmic_immortal:  { id: 'cosmic_immortal',  name: 'Космический Титан',   rarity: 'legendary', css: 'border: 3px solid #22d3ee; box-shadow: 0 0 22px rgba(34,211,238,0.95), 0 0 12px rgba(168,85,247,0.9);' },
    grandmaster_halo: { id: 'grandmaster_halo', name: 'Ореол Гроссмейстера', rarity: 'legendary', css: 'border: 3px solid #fde047; box-shadow: 0 0 24px rgba(253,224,71,1), inset 0 0 10px rgba(245,158,11,0.8);' },
    omega_prism:      { id: 'omega_prism',      name: 'Квантовая Омега',     rarity: 'legendary', css: 'border: 3px solid #f472b6; box-shadow: 0 0 22px rgba(244,114,182,0.95), 0 0 12px rgba(56,189,248,0.95);' }
  };

  /* ======================== PLAYER TITLES (ТИТУЛЫ) ======================== */
  const PLAYER_TITLES = [
    { id: 'Новичок шашек',          rarity: 'common' },
    { id: 'Любитель комбинаций',    rarity: 'common' },
    { id: 'Клубный тактик',         rarity: 'common' },
    { id: 'Защитник диагонали',     rarity: 'common' },
    { id: 'Охотник за дамками',     rarity: 'uncommon' },
    { id: 'Мастер размена',         rarity: 'uncommon' },
    { id: 'Повелитель центра',      rarity: 'uncommon' },
    { id: 'Чемпион Блиц-Арены',     rarity: 'uncommon' },
    { id: 'Гроза турниров',         rarity: 'rare' },
    { id: 'Гений Поддавков',        rarity: 'rare' },
    { id: 'Гроссмейстер FMJD',      rarity: 'rare' },
    { id: 'Мастер Рио',             rarity: 'rare' },
    { id: 'Победитель Кубка',       rarity: 'rare' },
    { id: 'Властелин Дамок',        rarity: 'rare' },
    { id: 'Непобедимый Стратег',    rarity: 'legendary' },
    { id: 'Легенда Шашек Pro',      rarity: 'legendary' },
    { id: 'Император Доски',        rarity: 'legendary' },
    { id: 'Дракон Диагоналей',      rarity: 'legendary' },
    { id: 'Бессмертный Гроссмейстер', rarity: 'legendary' },
    { id: 'Архитектор Побед',       rarity: 'legendary' }
  ];

  /* ======================== LEVEL UP REWARDS CALCULATOR ======================== */
  const MILESTONE_COSMETICS = {
    10:  { type: 'frame', id: 'sapphire_glow',    label: 'Рамка «Сапфировый контур»' },
    20:  { type: 'board', id: 'jade_dynasty',     label: 'Доска «Нефритовая династия»' },
    30:  { type: 'piece', id: 'ruby_monarch',     label: 'Шашки «Рубиновый монарх»' },
    40:  { type: 'frame', id: 'cyber_neon',       label: 'Рамка «Кибер-Неон CS2»' },
    50:  { type: 'board', id: 'neon',             label: 'Доска «Неон Обсидиан»' },
    60:  { type: 'piece', id: 'royal_diamond',    label: 'Шашки «Бриллиант Короны»' },
    70:  { type: 'title', id: 'Властелин Дамок',  label: 'Титул «Властелин Дамок»' },
    80:  { type: 'board', id: 'dragon_scales',    label: 'Доска «Чешуя Древнего Дракона»' },
    90:  { type: 'piece', id: 'dragon_emperor',   label: 'Шашки «Печать Дракона»' },
    100: { type: 'frame', id: 'grandmaster_halo', label: 'Рамка «Ореол Гроссмейстера»' }
  };

  function getLevelRewardSpec(level) {
    const lv = Math.max(1, Math.floor(level || 1));
    const tierObj = getChestTierByLevel(lv);
    const isMilestone10 = lv % 10 === 0;
    const isAnniversary5 = !isMilestone10 && (lv % 5 === 0);

    if (isMilestone10) {
      const coins = Math.round(tierObj.baseCoins * 3.2 + lv * 20);
      const crystals = 15 + Math.floor(lv / 10) * 5;
      const exclusive = MILESTONE_COSMETICS[lv] || {
        type: 'title',
        id: 'Бессмертный Гроссмейстер',
        label: `Эксклюзивный трофей ${lv} ур.`
      };
      return {
        level: lv,
        kind: 'milestone',
        kindLabel: 'Этапный уровень (Новый тир!)',
        coins,
        crystals,
        chest: {
          type: 'rare',
          tier: tierObj.tier,
          tierName: tierObj.name,
          grade: 1,
          roman: 'I',
          label: `Редкий сундук • ${tierObj.name} I разряд`
        },
        exclusive,
        stakeUnlocked: tierObj.stakeLabel
      };
    }

    if (isAnniversary5) {
      const coins = Math.round(tierObj.baseCoins * 2.0 + lv * 12);
      const crystals = 6 + Math.floor(lv / 10) * 2;
      return {
        level: lv,
        kind: 'anniversary',
        kindLabel: 'Юбилейный уровень',
        coins,
        crystals,
        chest: {
          type: 'rare',
          tier: tierObj.tier,
          tierName: tierObj.name,
          grade: 1,
          roman: 'I',
          label: `Сундук I разряда • ${tierObj.name}`
        },
        exclusive: null,
        stakeUnlocked: null
      };
    }

    const grade = (lv % 2 === 0) ? 2 : 3;
    const roman = grade === 2 ? 'II' : 'III';
    const coins = Math.round(tierObj.baseCoins + lv * 8);
    return {
      level: lv,
      kind: 'normal',
      kindLabel: 'Обычный уровень',
      coins,
      crystals: 0,
      chest: {
        type: 'common',
        tier: tierObj.tier,
        tierName: tierObj.name,
        grade,
        roman,
        label: `Обычный сундук • ${tierObj.name} ${roman} разряд`
      },
      exclusive: null,
      stakeUnlocked: null
    };
  }

  /* ======================== DAILY QUESTS (+150..500 EXP) ======================== */
  const DAILY_QUEST_TEMPLATES = [
    { id: 'dq_win_1',      icon: '🏆', title: 'Первая победа дня',      desc: 'Выиграйте 1 партию в любом режиме',            target: 1,  metric: 'wins',     xp: 150, coins: 120, crystals: 2 },
    { id: 'dq_captures_8', icon: '⚔️', title: 'Охотник за шашками',     desc: 'Возьмите 8 шашек соперника в матчах',          target: 8,  metric: 'captures', xp: 220, coins: 180, crystals: 3 },
    { id: 'dq_kings_2',    icon: '👑', title: 'Прорыв в дамки',         desc: 'Превратите 2 простые шашки в дамки',           target: 2,  metric: 'kings',    xp: 280, coins: 220, crystals: 4 },
    { id: 'dq_streak_2',   icon: '🔥', title: 'Победная серия',         desc: 'Одержите 2 победы подряд без поражений',       target: 2,  metric: 'streak',   xp: 350, coins: 300, crystals: 5 },
    { id: 'dq_win_3',      icon: '🌟', title: 'Доминация на арене',     desc: 'Одержите 3 победы за день',                    target: 3,  metric: 'wins',     xp: 500, coins: 450, crystals: 8 }
  ];

  /* ======================== 24 OVERHAULED ACHIEVEMENTS ======================== */
  const ACHIEVEMENTS_CATALOG = [
    // Победы
    { id: 'win_1',       cat: 'Победы',      icon: '🏆', title: 'Первая кровь',          desc: 'Одержите 1 победу',                      target: 1,   val: a => a.wins || 0,            xp: 100, coins: 100, crystals: 2 },
    { id: 'win_10',      cat: 'Победы',      icon: '🥇', title: 'Боец клуба',            desc: 'Одержите 10 побед',                     target: 10,  val: a => a.wins || 0,            xp: 250, coins: 250, crystals: 5 },
    { id: 'win_25',      cat: 'Победы',      icon: '🎖️', title: 'Опытный ветеран',       desc: 'Одержите 25 побед',                     target: 25,  val: a => a.wins || 0,            xp: 500, coins: 500, crystals: 10 },
    { id: 'win_50',      cat: 'Победы',      icon: '👑', title: 'Покоритель Арены',      desc: 'Одержите 50 побед',                     target: 50,  val: a => a.wins || 0,            xp: 1000, coins: 1000, crystals: 20 },
    // Серия побед
    { id: 'streak_3',    cat: 'Серии',       icon: '🔥', title: 'Горячая рука',          desc: 'Серия из 3 побед подряд',               target: 3,   val: a => a.bestStreak || 0,      xp: 150, coins: 150, crystals: 3 },
    { id: 'streak_5',    cat: 'Серии',       icon: '⚡', title: 'Неудержимый шторм',     desc: 'Серия из 5 побед подряд',               target: 5,   val: a => a.bestStreak || 0,      xp: 350, coins: 350, crystals: 7 },
    { id: 'streak_10',   cat: 'Серии',       icon: '🐉', title: 'Непобедимая Легенда',   desc: 'Серия из 10 побед подряд',              target: 10,  val: a => a.bestStreak || 0,      xp: 800, coins: 900, crystals: 18 },
    // Взятия и Дамки
    { id: 'cap_20',      cat: 'Тактика',     icon: '⚔️', title: 'Мастер удара',          desc: 'Возьмите 20 шашек соперников',          target: 20,  val: a => a.capturesTotal || 0,   xp: 150, coins: 150, crystals: 2 },
    { id: 'cap_100',     cat: 'Тактика',     icon: '💥', title: 'Разрушитель редутов',   desc: 'Возьмите 100 шашек соперников',         target: 100, val: a => a.capturesTotal || 0,   xp: 450, coins: 450, crystals: 8 },
    { id: 'king_5',      cat: 'Тактика',     icon: '♛', title: 'Владыка дамок',          desc: 'Превратите 5 шашек в дамки',            target: 5,   val: a => a.kingsPromoted || 0,   xp: 150, coins: 150, crystals: 3 },
    { id: 'king_25',     cat: 'Тактика',     icon: '🔱', title: 'Королевский марш',      desc: 'Превратите 25 шашек в дамки',           target: 25,  val: a => a.kingsPromoted || 0,   xp: 450, coins: 500, crystals: 10 },
    // Турниры
    { id: 'tourney_1',   cat: 'Турниры',     icon: '🏟️', title: 'Триумфатор Кубка',      desc: 'Займите призовое место в турнире',      target: 1,   val: a => a.tournamentsWon || 0,  xp: 300, coins: 350, crystals: 6 },
    { id: 'tourney_5',   cat: 'Турниры',     icon: '🏛️', title: 'Династия Чемпионов',    desc: 'Выиграйте 5 турниров',                  target: 5,   val: a => a.tournamentsWon || 0,  xp: 750, coins: 850, crystals: 15 },
    // Сундуки и Коллекция
    { id: 'chest_1',     cat: 'Коллекция',   icon: '📦', title: 'Охотник за сокровищами',desc: 'Откройте свой первый сундук',           target: 1,   val: a => a.chestsOpened || 0,    xp: 100, coins: 120, crystals: 2 },
    { id: 'chest_10',    cat: 'Коллекция',   icon: '💎', title: 'Азарт Контр-Страйк',    desc: 'Откройте 10 сундуков',                  target: 10,  val: a => a.chestsOpened || 0,    xp: 350, coins: 400, crystals: 8 },
    { id: 'chest_25',    cat: 'Коллекция',   icon: '👑', title: 'Магнат Кейсов',         desc: 'Откройте 25 сундуков',                  target: 25,  val: a => a.chestsOpened || 0,    xp: 700, coins: 800, crystals: 16 },
    { id: 'boards_8',    cat: 'Коллекция',   icon: '🎨', title: 'Ценитель досок',        desc: 'Соберите 8 стилей игровой доски',       target: 8,   val: a => (a.unlockedBoards || []).length, xp: 300, coins: 300, crystals: 6 },
    { id: 'boards_20',   cat: 'Коллекция',   icon: '🖼️', title: 'Галерея Гроссмейстера', desc: 'Соберите 20 стилей игровой доски',      target: 20,  val: a => (a.unlockedBoards || []).length, xp: 750, coins: 800, crystals: 15 },
    { id: 'pieces_8',    cat: 'Коллекция',   icon: '♟️', title: 'Ювелир фигур',          desc: 'Соберите 8 стилей шашек',               target: 8,   val: a => (a.unlockedPieces || []).length, xp: 300, coins: 300, crystals: 6 },
    { id: 'pieces_20',   cat: 'Коллекция',   icon: '🌟', title: 'Музей Шашек Pro',       desc: 'Соберите 20 стилей шашек',              target: 20,  val: a => (a.unlockedPieces || []).length, xp: 750, coins: 800, crystals: 15 },
    // Правила и Рейтинг
    { id: 'rules_3',     cat: 'Мастерство',  icon: '🌍', title: 'Знаток правил',         desc: 'Сыграйте в 3 мировых вида шашек',       target: 3,   val: a => (a.rulesPlayed || []).length, xp: 150, coins: 150, crystals: 3 },
    { id: 'rules_7',     cat: 'Мастерство',  icon: '🧭', title: 'Чемпион Планеты',       desc: 'Сыграйте во все 7 мировых правил',      target: 7,   val: a => (a.rulesPlayed || []).length, xp: 500, coins: 600, crystals: 12 },
    { id: 'elo_1400',    cat: 'Мастерство',  icon: '📈', title: 'Мастер рейтинга',       desc: 'Достигните 1400 ELO',                   target: 1400,val: a => a.peakElo || a.elo || 1200, xp: 350, coins: 400, crystals: 8 },
    { id: 'elo_1700',    cat: 'Мастерство',  icon: '🚀', title: 'Элита Мирового Топа',   desc: 'Достигните 1700 ELO',                   target: 1700,val: a => a.peakElo || a.elo || 1200, xp: 900, coins: 1000, crystals: 20 }
  ];

  return {
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
  };
})();
