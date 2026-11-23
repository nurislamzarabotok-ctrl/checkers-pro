'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');

/* ======================== SECURITY & AUTH CORE ======================== */
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  const derived = crypto.scryptSync(String(password), salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

function signToken(payloadObj, secret = SESSION_SECRET) {
  const body = Buffer.from(JSON.stringify({ ...payloadObj, exp: Date.now() + TOKEN_TTL_MS })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token, secret = SESSION_SECRET) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!data.exp || Date.now() > data.exp) return null;
    return data;
  } catch (_) {
    return null;
  }
}

function validateUsername(name) {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  return /^[a-zA-Zа-яА-ЯёЁ0-9_ -]{3,20}$/.test(trimmed);
}

function validatePassword(pw) {
  return typeof pw === 'string' && pw.length >= 6 && pw.length <= 128;
}

function validateEmail(email) {
  if (!email) return true;
  return typeof email === 'string' && email.length <= 80 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function sanitizeText(str, maxLen = 160) {
  return String(str || '').replace(/[\u0000-\u001F\u007F<>]/g, '').trim().slice(0, maxLen);
}

function sanitizeAvatarPhoto(photo) {
  if (!photo || typeof photo !== 'string') return null;
  if (!photo.startsWith('data:image/') || photo.length > 80000) return null;
  return photo;
}

function computeEloDelta(playerElo, oppElo, score) {
  const expected = 1 / (1 + Math.pow(10, (oppElo - playerElo) / 400));
  return Math.round(28 * (score - expected));
}

function createRateLimiter(maxHits, windowMs) {
  const hits = new Map();
  return function checkLimit(key) {
    const now = Date.now();
    const rec = hits.get(key);
    if (!rec || now > rec.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (rec.count >= maxHits) return false;
    rec.count += 1;
    return true;
  };
}

/* ======================== ATOMIC JSON STORAGE ======================== */
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function loadDB() {
  try {
    if (!fs.existsSync(DB_FILE)) return { users: {} };
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (_) {
    return { users: {} };
  }
}

function saveDB(db) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

/* ======================== CONTEXTUAL GRANDMASTER AI FALLBACK ======================== */
function generateContextualAIComment(payload) {
  const {
    moveNotation = '',
    turnColor = 'w',
    capturesCount = 0,
    promotes = false,
    moveNumber = 1,
    materialDiff = 0,
    playerMessage = '',
    eventType = 'move',
    ruleName = 'Русские шашки'
  } = payload || {};

  if (eventType === 'chat' && playerMessage) {
    const q = String(playerMessage).toLowerCase();
    if (q.includes('привет') || q.includes('здрав') || q.includes('салам')) {
      return 'Приветствую за доской! Желаю красивой и комбинационной партии. Посмотрим, чей расчёт окажется точнее!';
    }
    if (q.includes('кто ты') || q.includes('гемини') || q.includes('gemini')) {
      return 'Я — ИИ-комментатор и спарринг-партнёр на базе Gemini. Анализирую каждый ход, ищу тактические ловушки и комментирую партию!';
    }
    if (q.includes('совет') || q.includes('подскаж') || q.includes('как ход')) {
      return 'Главный секрет в шашках — контролируйте центральные поля, не спешите двигать отсталые шашки («золотую шашку») и ищите связки!';
    }
    if (q.includes('сдавайся') || q.includes('проигра')) {
      return 'В шашках борьба идёт до последней диагонали! Даже одна дамка способна перевернуть исход эндшпиля.';
    }
    const chatReplies = [
      `Интересная мысль! Кстати, в позиции после ${moveNotation || 'последнего хода'} важно следить за диагоналями.`,
      'Посмотрим, как это отразится на доске! Ваш следующий ход многое решит.',
      'В этой партии каждый темп на счету — не забывайте про защиту флангов.',
      'Хороший настрой! Продолжаем борьбу за центр.'
    ];
    return chatReplies[Math.floor(Math.random() * chatReplies.length)];
  }

  if (promotes && capturesCount > 0) {
    return `Блестящий прорыв ${moveNotation}! Взятие с одновременным превращением в дамку — теперь диагонали под вашим полным контролем! 👑`;
  }
  if (promotes) {
    return `Проход в дамки (${moveNotation})! Появление новой дамки кардинально меняет баланс сил на доске. 👑`;
  }
  if (capturesCount >= 3) {
    return `Фантастическая комбинация ${moveNotation}! Серия из ${capturesCount} взятий буквально сметает оборону на своём пути! 🔥`;
  }
  if (capturesCount === 2) {
    return `Мощный двойной удар (${moveNotation})! Минус две шашки за один ход — отличное тактическое зрение.`;
  }
  if (capturesCount === 1) {
    const capComments = [
      `Размен на ${moveNotation}. Позиция вскрывается, теперь важна точность расчёта.`,
      `Взятие ${moveNotation}! Центр становится свободнее для манёвров.`,
      `Чёткий удар ${moveNotation} — ни одна подставленная шашка не остаётся без внимания.`
    ];
    return capComments[(moveNumber + capturesCount) % capComments.length];
  }
  if (moveNumber <= 4) {
    const openComments = [
      `Классический дебютный ход ${moveNotation} в дисциплине «${ruleName}». Борьба за центральные клетки началась!`,
      `Ход ${moveNotation} — надёжное развитие фланга с прицелом на центр.`,
      `Дебют развивается динамично (${moveNotation}). Важно сохранить целостность заднего ряда.`
    ];
    return openComments[moveNumber % openComments.length];
  }
  if (Math.abs(materialDiff) >= 3) {
    return materialDiff > 0
      ? `После хода ${moveNotation} позиционный и материальный перевес (+${materialDiff}) ощущается всё сильнее.`
      : `Ход ${moveNotation}: несмотря на дефицит материала, ищем шанс на контригру и прорыв в дамки!`;
  }
  const midComments = [
    `Тонкий позиционный манёвр ${moveNotation}. Подготовка к захвату ключевых полей.`,
    `Ход ${moveNotation} создаёт скрытое напряжение на диагонали — нужно играть предельно внимательно.`,
    `Крепкое продолжение (${moveNotation}). Укрепление связок перед решающей фазой миттельшпиля.`,
    `Интересный план с ходом ${moveNotation}! Посмотрим, удастся ли заманить соперника в комбинационную ловушку.`
  ];
  return midComments[moveNumber % midComments.length];
}

/* ======================== HTTP + SOCKET.IO SERVER ======================== */
function startServer() {
  const express = require('express');
  const helmet = require('helmet');
  const { Server } = require('socket.io');

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: process.env.ALLOWED_ORIGIN || '*' }
  });

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '350kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  const db = loadDB();
  const authLimiter = createRateLimiter(25, 15 * 60 * 1000);
  const chatLimiter = createRateLimiter(15, 10 * 1000);
  const aiLimiter = createRateLimiter(30, 60 * 1000);

  function extractAuthUser(req) {
    const hdr = req.headers.authorization || '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : '';
    const payload = verifyToken(token);
    if (!payload || !db.users[payload.key]) return null;
    return { key: payload.key, user: db.users[payload.key] };
  }

  // Register (with optional Guest Profile Migration from IndexedDB!)
  app.post('/api/auth/register', (req, res) => {
    const ip = req.ip || 'unknown';
    if (!authLimiter(ip)) return res.status(429).json({ error: 'Слишком много попыток. Подождите 15 минут.' });

    const { username, password, email, flag, avatarIdx, settings, boardTheme, pieceStyle, guestData } = req.body || {};
    if (!validateUsername(username)) return res.status(400).json({ error: 'Имя пользователя: 3–20 символов (буквы, цифры, _).' });
    if (!email || !validateEmail(email)) return res.status(400).json({ error: 'Введите корректный адрес электронной почты.' });
    if (!validatePassword(password)) return res.status(400).json({ error: 'Пароль должен быть от 6 до 128 символов.' });

    const key = username.trim().toLowerCase();
    if (db.users[key]) return res.status(409).json({ error: 'Такое имя пользователя уже занято.' });

    const emailClean = sanitizeText(email, 80).toLowerCase();
    const emailTaken = Object.values(db.users).some(u => u.email && u.email.toLowerCase() === emailClean);
    if (emailTaken) return res.status(409).json({ error: 'Эта электронная почта уже зарегистрирована.' });

    const g = (guestData && typeof guestData === 'object') ? guestData : null;

    const user = {
      id: 'u_' + crypto.randomBytes(8).toString('hex'),
      username: username.trim(),
      email: sanitizeText(email, 80),
      passwordHash: hashPassword(password),
      flag: sanitizeText((g?.flag || flag || '🇰🇿'), 8) || '🌍',
      avatarIdx: Math.max(0, Math.min(20, Number(g?.avatarIdx ?? avatarIdx) || 0)),
      avatarPhoto: sanitizeAvatarPhoto(g?.avatarPhoto) || null,
      avatarFrame: sanitizeText(g?.avatarFrame || 'default', 30),
      playerTitle: sanitizeText(g?.playerTitle || 'Новичок шашек', 50),
      elo: (typeof g?.elo === 'number' && g.elo >= 400) ? Math.floor(g.elo) : 1200,
      peakElo: (typeof g?.peakElo === 'number' && g.peakElo >= 400) ? Math.floor(g.peakElo) : 1200,
      xp: (typeof g?.xp === 'number' && g.xp >= 0) ? Math.floor(g.xp) : 0,
      coins: (typeof g?.coins === 'number' && g.coins >= 0) ? Math.floor(g.coins) : 500,
      crystals: (typeof g?.crystals === 'number' && g.crystals >= 0) ? Math.floor(g.crystals) : 25,
      wins: (typeof g?.wins === 'number' && g.wins >= 0) ? Math.floor(g.wins) : 0,
      losses: (typeof g?.losses === 'number' && g.losses >= 0) ? Math.floor(g.losses) : 0,
      draws: (typeof g?.draws === 'number' && g.draws >= 0) ? Math.floor(g.draws) : 0,
      streak: (typeof g?.streak === 'number' && g.streak >= 0) ? Math.floor(g.streak) : 0,
      bestStreak: (typeof g?.bestStreak === 'number' && g.bestStreak >= 0) ? Math.floor(g.bestStreak) : 0,
      kingsPromoted: (typeof g?.kingsPromoted === 'number' && g.kingsPromoted >= 0) ? Math.floor(g.kingsPromoted) : 0,
      capturesTotal: (typeof g?.capturesTotal === 'number' && g.capturesTotal >= 0) ? Math.floor(g.capturesTotal) : 0,
      tournamentsWon: (typeof g?.tournamentsWon === 'number' && g.tournamentsWon >= 0) ? Math.floor(g.tournamentsWon) : 0,
      chestsOpened: (typeof g?.chestsOpened === 'number' && g.chestsOpened >= 0) ? Math.floor(g.chestsOpened) : 0,
      rulesPlayed: Array.isArray(g?.rulesPlayed) ? g.rulesPlayed.slice(0, 10) : ['russian'],
      boosters: (g?.boosters && typeof g.boosters === 'object') ? g.boosters : { undo: 3, hint: 3, shield: 1, ticket: 2 },
      unlockedBoards: Array.isArray(g?.unlockedBoards) ? g.unlockedBoards.slice(0, 60) : ['emerald', 'wood', 'marble', 'nordic'],
      unlockedPieces: Array.isArray(g?.unlockedPieces) ? g.unlockedPieces.slice(0, 60) : ['classic', 'minimal', 'wood_piece', 'slate_piece'],
      unlockedFrames: Array.isArray(g?.unlockedFrames) ? g.unlockedFrames.slice(0, 40) : ['default', 'bronze_ring'],
      unlockedTitles: Array.isArray(g?.unlockedTitles) ? g.unlockedTitles.slice(0, 40) : ['Новичок шашек'],
      unlockedEmojis: ['👋', '👏', '🔥', '😂', '😮', '🤔', '😎'],
      fragments: (g?.fragments && typeof g.fragments === 'object') ? g.fragments : {},
      chestsInventory: Array.isArray(g?.chestsInventory) ? g.chestsInventory.slice(0, 100) : [],
      claimedLevels: Array.isArray(g?.claimedLevels) ? g.claimedLevels.slice(0, 1000) : [],
      claimedAchievements: Array.isArray(g?.claimedAchievements) ? g.claimedAchievements.slice(0, 100) : [],
      dailyQuests: (g?.dailyQuests && typeof g.dailyQuests === 'object') ? g.dailyQuests : null,
      settings: (g?.settings && typeof g.settings === 'object') ? g.settings : ((settings && typeof settings === 'object') ? settings : null),
      boardTheme: sanitizeText(g?.boardTheme || boardTheme || 'emerald', 30),
      pieceStyle: sanitizeText(g?.pieceStyle || pieceStyle || 'classic', 30),
      history: Array.isArray(g?.history) ? g.history.slice(0, 100) : [],
      activeGameState: (g?.activeGameState && typeof g.activeGameState === 'object') ? g.activeGameState : null,
      migratedFromGuest: g?.name || null,
      createdAt: new Date().toISOString()
    };
    db.users[key] = user;
    saveDB(db);

    const token = signToken({ uid: user.id, key });
    const { passwordHash, ...safeUser } = user;
    return res.json({ token, user: safeUser });
  });

  // Login by Email OR Username
  app.post('/api/auth/login', (req, res) => {
    const ip = req.ip || 'unknown';
    if (!authLimiter(ip)) return res.status(429).json({ error: 'Слишком много попыток. Подождите 15 минут.' });

    const { identifier, username, password } = req.body || {};
    const rawId = String(identifier || username || '').trim().toLowerCase();
    if (!rawId || !password) {
      return res.status(400).json({ error: 'Введите Email (или имя пользователя) и пароль.' });
    }

    let key = rawId;
    let user = db.users[key];
    if (!user) {
      const foundEntry = Object.entries(db.users).find(([, u]) => u.email && u.email.toLowerCase() === rawId);
      if (foundEntry) {
        key = foundEntry[0];
        user = foundEntry[1];
      }
    }

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Неверный Email/имя пользователя или пароль.' });
    }

    const token = signToken({ uid: user.id, key });
    const { passwordHash, ...safeUser } = user;
    return res.json({ token, user: safeUser });
  });

  // Forgot Password / Password Reset
  app.post('/api/auth/reset-password', (req, res) => {
    const ip = req.ip || 'unknown';
    if (!authLimiter(ip)) return res.status(429).json({ error: 'Слишком много попыток. Подождите 15 минут.' });

    const { identifier, newPassword } = req.body || {};
    const rawId = String(identifier || '').trim().toLowerCase();
    if (!rawId) return res.status(400).json({ error: 'Укажите ваш Email или имя пользователя.' });
    if (!validatePassword(newPassword)) return res.status(400).json({ error: 'Новый пароль должен содержать минимум 6 символов.' });

    let user = db.users[rawId];
    if (!user) {
      user = Object.values(db.users).find(u => u.email && u.email.toLowerCase() === rawId);
    }
    if (!user) {
      return res.status(404).json({ error: 'Аккаунт с таким Email или именем пользователя не найден.' });
    }

    user.passwordHash = hashPassword(newPassword);
    saveDB(db);
    return res.json({ ok: true, message: 'Пароль успешно обновлён! Теперь вы можете войти.' });
  });

  // Fetch current authenticated user
  app.get('/api/auth/me', (req, res) => {
    const auth = extractAuthUser(req);
    if (!auth) return res.status(401).json({ error: 'Требуется авторизация.' });
    const { passwordHash, ...safeUser } = auth.user;
    return res.json({ user: safeUser });
  });

  // Sync user preferences, cosmetics, chests, progression, and history
  app.put('/api/profile/sync', (req, res) => {
    const auth = extractAuthUser(req);
    if (!auth) return res.status(401).json({ error: 'Требуется авторизация.' });
    const body = req.body || {};
    const u = auth.user;

    if (typeof body.flag === 'string') u.flag = sanitizeText(body.flag, 8) || u.flag;
    if (body.avatarIdx !== undefined) u.avatarIdx = Math.max(0, Math.min(25, Number(body.avatarIdx) || 0));
    if (body.avatarPhoto !== undefined) u.avatarPhoto = sanitizeAvatarPhoto(body.avatarPhoto);
    if (typeof body.avatarFrame === 'string') u.avatarFrame = sanitizeText(body.avatarFrame, 30);
    if (typeof body.playerTitle === 'string') u.playerTitle = sanitizeText(body.playerTitle, 50);
    if (body.settings && typeof body.settings === 'object') u.settings = body.settings;
    if (typeof body.boardTheme === 'string') u.boardTheme = sanitizeText(body.boardTheme, 30);
    if (typeof body.pieceStyle === 'string') u.pieceStyle = sanitizeText(body.pieceStyle, 30);
    if (Array.isArray(body.history)) u.history = body.history.slice(0, 100);

    // Sync progression & economy fields safely
    if (typeof body.xp === 'number' && body.xp >= 0) u.xp = Math.floor(body.xp);
    if (typeof body.coins === 'number' && body.coins >= 0) u.coins = Math.floor(body.coins);
    if (typeof body.crystals === 'number' && body.crystals >= 0) u.crystals = Math.floor(body.crystals);
    if (typeof body.wins === 'number' && body.wins >= 0) u.wins = Math.floor(body.wins);
    if (typeof body.losses === 'number' && body.losses >= 0) u.losses = Math.floor(body.losses);
    if (typeof body.draws === 'number' && body.draws >= 0) u.draws = Math.floor(body.draws);
    if (typeof body.streak === 'number' && body.streak >= 0) u.streak = Math.floor(body.streak);
    if (typeof body.bestStreak === 'number' && body.bestStreak >= 0) u.bestStreak = Math.floor(body.bestStreak);
    if (typeof body.kingsPromoted === 'number' && body.kingsPromoted >= 0) u.kingsPromoted = Math.floor(body.kingsPromoted);
    if (typeof body.capturesTotal === 'number' && body.capturesTotal >= 0) u.capturesTotal = Math.floor(body.capturesTotal);
    if (typeof body.tournamentsWon === 'number' && body.tournamentsWon >= 0) u.tournamentsWon = Math.floor(body.tournamentsWon);
    if (typeof body.chestsOpened === 'number' && body.chestsOpened >= 0) u.chestsOpened = Math.floor(body.chestsOpened);
    if (typeof body.peakElo === 'number' && body.peakElo >= 400) u.peakElo = Math.floor(body.peakElo);
    if (body.boosters && typeof body.boosters === 'object') u.boosters = body.boosters;
    if (Array.isArray(body.unlockedBoards)) u.unlockedBoards = body.unlockedBoards.slice(0, 60);
    if (Array.isArray(body.unlockedPieces)) u.unlockedPieces = body.unlockedPieces.slice(0, 60);
    if (Array.isArray(body.unlockedFrames)) u.unlockedFrames = body.unlockedFrames.slice(0, 40);
    if (Array.isArray(body.unlockedTitles)) u.unlockedTitles = body.unlockedTitles.slice(0, 40);
    if (Array.isArray(body.unlockedEmojis)) u.unlockedEmojis = body.unlockedEmojis.slice(0, 40);
    if (body.fragments && typeof body.fragments === 'object') u.fragments = body.fragments;
    if (Array.isArray(body.chestsInventory)) u.chestsInventory = body.chestsInventory.slice(0, 100);
    if (Array.isArray(body.claimedLevels)) u.claimedLevels = body.claimedLevels.slice(0, 1000);
    if (Array.isArray(body.claimedAchievements)) u.claimedAchievements = body.claimedAchievements.slice(0, 100);
    if (body.dailyQuests && typeof body.dailyQuests === 'object') u.dailyQuests = body.dailyQuests;
    if (body.activeGameState !== undefined) u.activeGameState = body.activeGameState;

    saveDB(db);
    const { passwordHash, ...safeUser } = u;
    return res.json({ ok: true, user: safeUser });
  });

  // Leaderboard
  app.get('/api/leaderboard', (_req, res) => {
    const top = Object.values(db.users)
      .map(({ passwordHash, history, settings, ...u }) => u)
      .sort((a, b) => b.elo - a.elo)
      .slice(0, 50);
    res.json({ leaderboard: top });
  });

  // Gemini AI Move & Chat Commentary Endpoint
  app.post('/api/ai/comment', async (req, res) => {
    const ip = req.ip || 'unknown';
    if (!aiLimiter(ip)) {
      return res.json({ comment: generateContextualAIComment(req.body), source: 'engine' });
    }
    const body = req.body || {};
    const apiKey = sanitizeText(body.apiKey || process.env.GEMINI_API_KEY || '', 120);

    if (apiKey && apiKey.length >= 20 && typeof fetch === 'function') {
      try {
        const prompt = body.eventType === 'chat'
          ? `Ты — харизматичный гроссмейстер по шашкам в игре «Шашки Pro». Игрок написал тебе в чате: "${sanitizeText(body.playerMessage, 140)}". Дисциплина: ${sanitizeText(body.ruleName, 40)}, ход №${Number(body.moveNumber) || 1}. Ответь живо, дружелюбно и по-шашечному на русском языке (1-2 коротких предложения, без маркдауна).`
          : `Ты — гроссмейстер-комментатор в игре «Шашки Pro» (${sanitizeText(body.ruleName, 40)}). Только что сделан ход №${Number(body.moveNumber) || 1}: ${sanitizeText(body.moveNotation, 30)} (${body.turnColor === 'w' ? 'Белые' : 'Чёрные'}). Взято шашек за ход: ${Number(body.capturesCount) || 0}. Превращение в дамку: ${body.promotes ? 'Да' : 'Нет'}. Перевес по материалу: ${Number(body.materialDiff) || 0}. Дай живой, умный, короткий комментарий к этому ходу на русском языке (1 короткое предложение до 130 символов, без кавычек и без звездочек).`;

        const prefModel = sanitizeText(body.model || 'gemini-2.5-flash', 40);
        const models = Array.from(new Set([prefModel, 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash']));
        for (const model of models) {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
          const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 90, temperature: 0.75 }
            })
          });
          if (resp.ok) {
            const data = await resp.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (text) {
              return res.json({ comment: sanitizeText(text, 220), source: 'gemini' });
            }
          }
        }
      } catch (_) {
        // Fallback to contextual Grandmaster engine
      }
    }

    return res.json({
      comment: generateContextualAIComment(body),
      source: 'grandmaster_ai'
    });
  });

  /* ======================== REAL-TIME AUTOMATED LIVE TOURNAMENTS ======================== */
  const SYSTEM_TOURNAMENT_TEMPLATES = [
    {
      title: '⚡ Блиц-Кубок Арены',
      ruleId: 'russian',
      ruleName: 'Русские шашки 8×8',
      timeControl: '180+2',
      format: 'knockout',
      formatName: 'Олимпийский плей-офф',
      maxPlayers: 8,
      minLevel: 1,
      entryCoins: 0,
      prizes: [
        { place: 1, xp: 500, coins: 600, crystals: 15, chestType: 'rare', chestGrade: 1, title: 'Чемпион Блиц-Арены' },
        { place: 2, xp: 300, coins: 350, crystals: 8, chestType: 'rare', chestGrade: 2 },
        { place: 3, xp: 150, coins: 180, crystals: 4, chestType: 'common', chestGrade: 1 }
      ]
    },
    {
      title: '🌍 Гран-При FMJD 10×10',
      ruleId: 'international',
      ruleName: 'Международные 10×10',
      timeControl: '300+3',
      format: 'arena',
      formatName: 'Арена на очки',
      maxPlayers: 8,
      minLevel: 1,
      entryCoins: 100,
      prizes: [
        { place: 1, xp: 650, coins: 850, crystals: 20, chestType: 'rare', chestGrade: 1, title: 'Гроссмейстер FMJD' },
        { place: 2, xp: 400, coins: 450, crystals: 10, chestType: 'rare', chestGrade: 2 },
        { place: 3, xp: 200, coins: 220, crystals: 5, chestType: 'common', chestGrade: 1 }
      ]
    },
    {
      title: '🔥 Кубок Мастеров Бразилии',
      ruleId: 'brazilian',
      ruleName: 'Бразильские 8×8',
      timeControl: '180+2',
      format: 'roundrobin',
      formatName: 'Круговая лига',
      maxPlayers: 6,
      minLevel: 5,
      entryCoins: 150,
      prizes: [
        { place: 1, xp: 750, coins: 1000, crystals: 25, chestType: 'rare', chestGrade: 1, title: 'Мастер Рио' },
        { place: 2, xp: 450, coins: 550, crystals: 12, chestType: 'rare', chestGrade: 2 },
        { place: 3, xp: 250, coins: 280, crystals: 6, chestType: 'common', chestGrade: 1 }
      ]
    },
    {
      title: '🎲 Турнир Королей Поддавков',
      ruleId: 'giveaway',
      ruleName: 'Поддавки 8×8',
      timeControl: '180+2',
      format: 'knockout',
      formatName: 'Плей-офф на выбывание',
      maxPlayers: 8,
      minLevel: 1,
      entryCoins: 50,
      prizes: [
        { place: 1, xp: 550, coins: 700, crystals: 15, chestType: 'rare', chestGrade: 1, title: 'Гений Поддавков' },
        { place: 2, xp: 320, coins: 400, crystals: 8, chestType: 'common', chestGrade: 1 },
        { place: 3, xp: 160, coins: 200, crystals: 4, chestType: 'common', chestGrade: 2 }
      ]
    }
  ];

  const liveTournaments = new Map();

  function ensureSystemTournaments() {
    const now = Date.now();
    // Clean expired finished tournaments older than 2 minutes
    for (const [id, t] of liveTournaments.entries()) {
      if (t.isSystem && now > t.endsAt + 60 * 1000) {
        liveTournaments.delete(id);
      }
    }

    SYSTEM_TOURNAMENT_TEMPLATES.forEach((tpl, idx) => {
      const existing = Array.from(liveTournaments.values()).find(t => t.isSystem && t.tplIndex === idx && now < t.endsAt);
      if (!existing) {
        // Stagger start times so at any moment some are open for registration and some are active in-progress
        const regOffsetMs = idx === 0 ? 95 * 1000 : (idx === 1 ? 180 * 1000 : (idx === 2 ? -30 * 1000 : 260 * 1000));
        const regEndsAt = now + regOffsetMs;
        const durationMs = 180 * 1000; // 3 min active tournament window
        const id = 'LIVE-' + (100 + idx) + '-' + String(Math.floor(now / 1000) % 10000);
        liveTournaments.set(id, {
          id,
          isSystem: true,
          tplIndex: idx,
          title: tpl.title,
          ruleId: tpl.ruleId,
          ruleName: tpl.ruleName,
          timeControl: tpl.timeControl,
          format: tpl.format,
          formatName: tpl.formatName,
          maxPlayers: tpl.maxPlayers,
          minLevel: tpl.minLevel,
          entryCoins: tpl.entryCoins,
          prizes: tpl.prizes,
          registrationEndsAt: regEndsAt,
          endsAt: regEndsAt + durationMs,
          participants: [],
          spectatorsCount: 0
        });
      }
    });
  }

  function serializeTournaments() {
    ensureSystemTournaments();
    const now = Date.now();
    return Array.from(liveTournaments.values()).map(t => {
      const status = now < t.registrationEndsAt ? 'registration' : (now < t.endsAt ? 'active' : 'finished');
      return {
        ...t,
        status,
        serverNow: now
      };
    });
  }

  app.get('/api/tournaments', (_req, res) => {
    res.json({ tournaments: serializeTournaments() });
  });

  /* ======================== REAL-TIME MATCHMAKING, ROOMS & SPECTATORS ======================== */
  const queues = new Map();
  const rooms = new Map();

  function generateRoomCode() {
    let code;
    do { code = String(Math.floor(1000 + Math.random() * 9000)); } while (rooms.has(code));
    return code;
  }

  function serializePublicRooms() {
    const list = [];
    for (const [roomId, r] of rooms.entries()) {
      if (r.finished) continue;
      list.push({
        roomId,
        ruleId: r.ruleId,
        timeControl: r.timeControl || '300+3',
        mode: r.mode || 'online',
        hostName: r.profiles.w?.name || 'Игрок 1',
        hostFlag: r.profiles.w?.flag || '🌍',
        hostElo: r.profiles.w?.elo || 1200,
        guestName: r.profiles.b?.name || null,
        guestFlag: r.profiles.b?.flag || null,
        guestElo: r.profiles.b?.elo || null,
        waitingForOpponent: !r.players.b,
        spectatorsCount: r.spectators.size,
        movesCount: r.boardState?.moveHistory?.length || 0
      });
    }
    return list;
  }

  function broadcastRoomsList() {
    io.emit('rooms_list', { rooms: serializePublicRooms() });
  }

  io.on('connection', (socket) => {
    socket.data.userKey = null;
    socket.data.profile = { name: 'Гость', elo: 1200, flag: '🌍', avatarIdx: 0, frame: 'default', title: 'Игрок' };

    socket.emit('rooms_list', { rooms: serializePublicRooms() });
    socket.emit('tournaments_list', { tournaments: serializeTournaments() });

    socket.on('auth_token', ({ token }) => {
      const payload = verifyToken(token);
      if (payload && db.users[payload.key]) {
        socket.data.userKey = payload.key;
        const u = db.users[payload.key];
        socket.data.profile = {
          name: u.username,
          elo: u.elo,
          flag: u.flag,
          avatarIdx: u.avatarIdx,
          frame: u.avatarFrame || 'default',
          title: u.playerTitle || 'Игрок'
        };
      }
    });

    function updateSocketProfile(info) {
      if (!socket.data.userKey && info) {
        socket.data.profile = {
          name: sanitizeText(info.name || 'Игрок', 20) || 'Игрок',
          elo: Number(info.elo) || 1200,
          flag: sanitizeText(info.flag || '🌍', 6),
          avatarIdx: Number(info.avatarIdx) || 0,
          frame: sanitizeText(info.frame || 'default', 30),
          title: sanitizeText(info.title || 'Игрок', 40)
        };
      }
    }

    socket.on('list_rooms', () => {
      socket.emit('rooms_list', { rooms: serializePublicRooms() });
    });

    socket.on('list_tournaments', () => {
      socket.emit('tournaments_list', { tournaments: serializeTournaments() });
    });

    socket.on('join_live_tournament', (info) => {
      ensureSystemTournaments();
      const t = liveTournaments.get(info?.tournamentId);
      if (!t) {
        socket.emit('tournament_error', { message: 'Турнир не найден.' });
        return;
      }
      const now = Date.now();
      if (now >= t.registrationEndsAt && !t.isCustom) {
        socket.emit('tournament_error', { message: 'Регистрация закрыта — турнир уже идёт! Подождите следующий раунд или войдите как зритель.' });
        return;
      }
      updateSocketProfile(info);
      if (!t.participants.some(p => p.name === socket.data.profile.name)) {
        if (t.participants.length >= t.maxPlayers) {
          socket.emit('tournament_error', { message: 'Все места в турнире уже заняты.' });
          return;
        }
        t.participants.push({ ...socket.data.profile, socketId: socket.id, score: 0 });
      }
      io.emit('tournaments_list', { tournaments: serializeTournaments() });
      socket.emit('tournament_joined', { tournament: t });
    });

    socket.on('create_custom_tournament', (info) => {
      updateSocketProfile(info);
      const code = 'TRN-' + Math.floor(1000 + Math.random() * 9000);
      const now = Date.now();
      const customT = {
        id: code,
        isSystem: false,
        isCustom: true,
        hostName: socket.data.profile.name,
        title: sanitizeText(info?.title || `Кубок ${socket.data.profile.name}`, 40),
        ruleId: sanitizeText(info?.ruleId || 'russian', 20),
        ruleName: sanitizeText(info?.ruleName || 'Русские шашки', 40),
        timeControl: sanitizeText(info?.timeControl || '180+2', 15),
        format: sanitizeText(info?.format || 'knockout', 20),
        formatName: sanitizeText(info?.formatName || 'Плей-офф', 30),
        opponentType: sanitizeText(info?.opponentType || 'mixed', 20),
        maxPlayers: Math.max(4, Math.min(16, Number(info?.maxPlayers) || 8)),
        minLevel: 1,
        entryCoins: 0,
        prizes: [
          { place: 1, xp: 450, coins: 500, crystals: 10, chestType: 'rare', chestGrade: 1, title: 'Победитель Кубка' },
          { place: 2, xp: 260, coins: 300, crystals: 5, chestType: 'common', chestGrade: 1 },
          { place: 3, xp: 130, coins: 150, crystals: 2, chestType: 'common', chestGrade: 2 }
        ],
        registrationEndsAt: now + 15 * 60 * 1000,
        endsAt: now + 45 * 60 * 1000,
        participants: [{ ...socket.data.profile, socketId: socket.id, score: 0 }],
        spectatorsCount: 0
      };
      liveTournaments.set(code, customT);
      io.emit('tournaments_list', { tournaments: serializeTournaments() });
      socket.emit('custom_tournament_created', { tournament: customT });
    });

    // Matchmaking queue (waits for real player, NEVER assigns a bot)
    socket.on('find_match', (info) => {
      const ruleId = sanitizeText(info?.ruleId || 'russian', 20);
      const timeControl = sanitizeText(info?.timeControl || '300+3', 15);
      updateSocketProfile(info);

      if (!queues.has(ruleId)) queues.set(ruleId, []);
      const q = queues.get(ruleId).filter(s => s.connected && s.id !== socket.id);

      if (q.length > 0) {
        const opp = q.shift();
        queues.set(ruleId, q);
        const roomId = generateRoomCode();
        const roomObj = {
          roomId,
          ruleId,
          timeControl,
          mode: 'online',
          players: { w: opp, b: socket },
          profiles: { w: opp.data.profile, b: socket.data.profile },
          spectators: new Set(),
          boardState: { moveHistory: [], turn: 'w' },
          finished: false
        };
        rooms.set(roomId, roomObj);
        opp.join(roomId);
        socket.join(roomId);
        opp.emit('match_found', { roomId, ruleId, timeControl, color: 'w', opponent: socket.data.profile, spectatorsCount: 0 });
        socket.emit('match_found', { roomId, ruleId, timeControl, color: 'b', opponent: opp.data.profile, spectatorsCount: 0 });
        broadcastRoomsList();
      } else {
        q.push(socket);
        queues.set(ruleId, q);
        socket.emit('matchmaking_waiting', { ruleId, timeControl });
      }
    });

    socket.on('cancel_find_match', () => {
      for (const [rId, q] of queues.entries()) {
        queues.set(rId, q.filter(s => s.id !== socket.id));
      }
      socket.emit('matchmaking_cancelled');
    });

    // Create Room by Code (waits for friend or spectator)
    socket.on('create_room', (info) => {
      const ruleId = sanitizeText(info?.ruleId || 'russian', 20);
      const timeControl = sanitizeText(info?.timeControl || '300+3', 15);
      const mode = sanitizeText(info?.mode || 'online', 16);
      updateSocketProfile(info);

      // Remove any old waiting room hosted by this socket
      for (const [oldId, r] of rooms.entries()) {
        if (r.players.w?.id === socket.id && !r.players.b) {
          rooms.delete(oldId);
        }
      }

      const roomId = generateRoomCode();
      rooms.set(roomId, {
        roomId,
        ruleId,
        timeControl,
        mode,
        players: { w: socket, b: null },
        profiles: { w: socket.data.profile, b: null },
        spectators: new Set(),
        boardState: { moveHistory: [], turn: 'w' },
        finished: false
      });
      socket.join(roomId);
      socket.emit('room_created', { roomId, ruleId, timeControl, mode });
      broadcastRoomsList();
    });

    // Join Room (as second Player OR as Spectator)
    socket.on('join_room', (info) => {
      const roomId = sanitizeText(info?.roomId, 10).toUpperCase();
      const asSpectator = Boolean(info?.asSpectator);
      const room = rooms.get(roomId);

      if (!room || !room.players.w?.connected) {
        socket.emit('room_error', { message: 'Комната с таким кодом не найдена или закрыта.' });
        return;
      }

      updateSocketProfile(info);

      // Join as Spectator
      if (asSpectator) {
        room.spectators.add(socket);
        socket.join(roomId);
        socket.emit('spectator_joined', {
          roomId,
          ruleId: room.ruleId,
          timeControl: room.timeControl,
          mode: room.mode,
          profiles: room.profiles,
          boardState: room.boardState,
          waitingForOpponent: !room.players.b,
          spectatorsCount: room.spectators.size
        });
        io.to(roomId).emit('spectators_update', {
          roomId,
          spectatorsCount: room.spectators.size,
          spectatorName: socket.data.profile.name
        });
        broadcastRoomsList();
        return;
      }

      // Join as Player 2
      if (room.players.w.id === socket.id) {
        socket.emit('room_error', { message: 'Вы уже являетесь создателем этой комнаты. Ждём второго игрока!' });
        return;
      }

      if (room.players.b) {
        socket.emit('room_error', {
          message: 'В комнате уже играют 2 игрока. Вы можете присоединиться как зритель!',
          canSpectate: true,
          roomId
        });
        return;
      }

      room.players.b = socket;
      room.profiles.b = socket.data.profile;
      socket.join(roomId);

      room.players.w.emit('match_found', {
        roomId,
        ruleId: room.ruleId,
        timeControl: room.timeControl,
        mode: room.mode,
        color: 'w',
        opponent: room.profiles.b,
        spectatorsCount: room.spectators.size
      });
      socket.emit('match_found', {
        roomId,
        ruleId: room.ruleId,
        timeControl: room.timeControl,
        mode: room.mode,
        color: 'b',
        opponent: room.profiles.w,
        spectatorsCount: room.spectators.size
      });

      // Notify any spectators already waiting in the room
      for (const spec of room.spectators) {
        spec.emit('spectator_match_started', {
          roomId,
          ruleId: room.ruleId,
          timeControl: room.timeControl,
          profiles: room.profiles,
          spectatorsCount: room.spectators.size
        });
      }
      broadcastRoomsList();
    });

    socket.on('leave_room', ({ roomId }) => {
      const room = rooms.get(roomId);
      if (!room) return;
      socket.leave(roomId);
      if (room.spectators.has(socket)) {
        room.spectators.delete(socket);
        io.to(roomId).emit('spectators_update', { roomId, spectatorsCount: room.spectators.size });
        broadcastRoomsList();
        return;
      }
      if (room.players.w?.id === socket.id || room.players.b?.id === socket.id) {
        socket.to(roomId).emit('opponent_left');
        rooms.delete(roomId);
        broadcastRoomsList();
      }
    });

    socket.on('net_msg', ({ roomId, payload }) => {
      const room = rooms.get(roomId);
      if (!room || !payload || typeof payload !== 'object') return;
      const isPlayerW = room.players.w?.id === socket.id;
      const isPlayerB = room.players.b?.id === socket.id;
      const isSpectator = room.spectators.has(socket);

      if (!isPlayerW && !isPlayerB && !isSpectator) return;

      // Only active players can send moves, resign, or draw offers
      if ((payload.type === 'move' || payload.type === 'resign' || payload.type?.startsWith('draw_')) && !isPlayerW && !isPlayerB) {
        return;
      }

      if (payload.type === 'move') {
        if (!room.boardState) room.boardState = { moveHistory: [], turn: 'w' };
        if (payload.boardAfter) room.boardState.board = payload.boardAfter;
        if (payload.nextTurn) room.boardState.turn = payload.nextTurn;
        if (payload.notation) {
          room.boardState.moveHistory.push({
            notation: sanitizeText(payload.notation, 30),
            color: isPlayerW ? 'w' : 'b',
            boardAfter: payload.boardAfter || null,
            promotes: Boolean(payload.promotes),
            capturesCount: Number(payload.capturesCount) || 0
          });
        }
        if (payload.clocks) room.boardState.clocks = payload.clocks;
      }

      if (payload.type === 'chat' || payload.type === 'emote') {
        if (!chatLimiter(socket.id)) return;
        payload.senderName = socket.data.profile?.name || 'Игрок';
        payload.isSpectator = isSpectator;
        if (payload.type === 'chat') payload.text = sanitizeText(payload.text, 160);
        if (payload.type === 'emote') payload.emote = sanitizeText(payload.emote, 8);
      }

      socket.to(roomId).emit('net_msg', payload);
    });

    socket.on('report_result', ({ roomId, winnerColor }) => {
      const room = rooms.get(roomId);
      if (!room || room.finished) return;
      if (room.players.w?.id !== socket.id && room.players.b?.id !== socket.id) return;
      room.finished = true;

      const wKey = room.players.w?.data?.userKey;
      const bKey = room.players.b?.data?.userKey;
      if (wKey && db.users[wKey] && bKey && db.users[bKey]) {
        const wUser = db.users[wKey];
        const bUser = db.users[bKey];
        const wScore = winnerColor === 'draw' ? 0.5 : (winnerColor === 'w' ? 1 : 0);
        const dW = computeEloDelta(wUser.elo, bUser.elo, wScore);
        wUser.elo = Math.max(400, wUser.elo + dW);
        bUser.elo = Math.max(400, bUser.elo - dW);
        wUser.peakElo = Math.max(wUser.peakElo || 1200, wUser.elo);
        bUser.peakElo = Math.max(bUser.peakElo || 1200, bUser.elo);
        // EXP logic: Win +100 (+streak bonus), Draw +50, Loss +0
        if (wScore === 1) {
          wUser.wins++;
          wUser.streak = (wUser.streak || 0) + 1;
          wUser.bestStreak = Math.max(wUser.bestStreak || 0, wUser.streak);
          wUser.xp += 100 + Math.min(100, wUser.streak * 20);
          bUser.losses++;
          bUser.streak = 0;
        } else if (wScore === 0) {
          bUser.wins++;
          bUser.streak = (bUser.streak || 0) + 1;
          bUser.bestStreak = Math.max(bUser.bestStreak || 0, bUser.streak);
          bUser.xp += 100 + Math.min(100, bUser.streak * 20);
          wUser.losses++;
          wUser.streak = 0;
        } else {
          wUser.draws++;
          bUser.draws++;
          wUser.xp += 50;
          bUser.xp += 50;
        }
        saveDB(db);
      }
      broadcastRoomsList();
    });

    socket.on('disconnect', () => {
      for (const [rId, q] of queues.entries()) queues.set(rId, q.filter(s => s.id !== socket.id));
      let changed = false;
      for (const [roomId, room] of rooms.entries()) {
        if (room.spectators.has(socket)) {
          room.spectators.delete(socket);
          io.to(roomId).emit('spectators_update', { roomId, spectatorsCount: room.spectators.size });
          changed = true;
        }
        if (room.players.w?.id === socket.id || room.players.b?.id === socket.id) {
          socket.to(roomId).emit('opponent_left');
          rooms.delete(roomId);
          changed = true;
        }
      }
      if (changed) broadcastRoomsList();
    });
  });

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Шашки Pro Server running on http://localhost:${PORT}`);
    try {
      const os = require('os');
      const nets = os.networkInterfaces();
      for (const name of Object.keys(nets)) {
        for (const netInfo of nets[name]) {
          if (netInfo.family === 'IPv4' && !netInfo.internal) {
            console.log(`📱 Для игры с телефона (по Wi-Fi) откройте в браузере телефона: http://${netInfo.address}:${PORT}`);
          }
        }
      }
    } catch (_) {}
  });
}

if (require.main === module) startServer();

module.exports = {
  startServer,
  hashPassword, verifyPassword, signToken, verifyToken,
  validateUsername, validatePassword, validateEmail,
  sanitizeText, sanitizeAvatarPhoto, computeEloDelta, createRateLimiter
};
