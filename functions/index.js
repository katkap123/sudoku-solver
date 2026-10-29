
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

admin.initializeApp();

const db = admin.database();
const REGION = 'us-central1';
const GAME_DURATION = 5 * 60 * 1000;

const GRID_SIZES = {
  easy: 8,
  medium: 10,
  hard: 12
};

const WORD_COUNTS = {
  easy: 5,
  medium: 7,
  hard: 9
};

const DIRECTIONS = [
  [0, 1], [0, -1],
  [1, 0], [-1, 0],
  [1, 1], [1, -1],
  [-1, 1], [-1, -1]
];

// Load dictionary once per function instance.
const dictionaryPath = path.join(
  __dirname,
  'dictionaries',
  'words.txt'
);

const dictionaryText = fs.readFileSync(
  dictionaryPath,
  'utf8'
);

const WORDS = new Set(
  dictionaryText
    .split(/\r?\n/)
    .map(word => word.trim().toUpperCase())
    .filter(word => /^[A-Z]{3,12}$/.test(word))
);

const PUZZLE_WORDS = [...WORDS].filter(
  word => word.length >= 4 && word.length <= 7
);

function requireAuth(request) {
  const uid = request.auth?.uid;

  if (!uid) {
    throw new HttpsError(
      'unauthenticated',
      'Please sign in first.'
    );
  }

  return uid;
}

function validateCode(code) {
  const value = String(code || '').trim().toUpperCase();

  if (!/^[A-Z0-9]{6}$/.test(value)) {
    throw new HttpsError(
      'invalid-argument',
      'Invalid room code.'
    );
  }

  return value;
}

function validateName(name) {
  const value = String(name || '').trim();

  if (!value || value.length > 24) {
    throw new HttpsError(
      'invalid-argument',
      'Name must contain 1–24 characters.'
    );
  }

  return value;
}

function randomInt(max) {
  return crypto.randomInt(max);
}

function shuffle(items) {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function placeWord(grid, word) {
  const size = grid.length;

  for (let attempt = 0; attempt < 300; attempt++) {
    const [dr, dc] = DIRECTIONS[randomInt(DIRECTIONS.length)];
    const r = randomInt(size);
    const c = randomInt(size);

    const endRow = r + dr * (word.length - 1);
    const endCol = c + dc * (word.length - 1);

    if (
      endRow < 0 || endRow >= size ||
      endCol < 0 || endCol >= size
    ) {
      continue;
    }

    let fits = true;

    for (let i = 0; i < word.length; i++) {
      const existing = grid[r + dr * i][c + dc * i];

      if (existing && existing !== word[i]) {
        fits = false;
        break;
      }
    }

    if (!fits) continue;

    for (let i = 0; i < word.length; i++) {
      grid[r + dr * i][c + dc * i] = word[i];
    }

    return true;
  }

  return false;
}

function generateGrid(difficulty) {
  const size = GRID_SIZES[difficulty];
  const requiredWords = WORD_COUNTS[difficulty];

  for (let attempt = 0; attempt < 30; attempt++) {
    const grid = Array.from(
      { length: size },
      () => Array(size).fill('')
    );

    const candidates = shuffle(PUZZLE_WORDS);
    let planted = 0;

    for (const word of candidates) {
      if (word.length > size) continue;

      if (placeWord(grid, word)) {
        planted++;
      }

      if (planted >= requiredWords) break;
    }

    if (planted < requiredWords) continue;

    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!grid[r][c]) {
          grid[r][c] = alphabet[randomInt(26)];
        }
      }
    }

    return grid;
  }

  throw new HttpsError(
    'internal',
    'Could not generate the puzzle.'
  );
}

function roomRef(code) {
  return db.ref(`wordRooms/${code}`);
}

// 1. CREATE ROOM
exports.createWordRoom = onCall(
  { region: REGION, cors: true },
  async request => {
    const uid = requireAuth(request);
    const name = validateName(request.data?.name);
    const difficulty = request.data?.difficulty;

    if (!Object.hasOwn(GRID_SIZES, difficulty)) {
      throw new HttpsError(
        'invalid-argument',
        'Invalid difficulty.'
      );
    }

    const grid = generateGrid(difficulty);

    for (let attempt = 0; attempt < 15; attempt++) {
      const code = crypto.randomBytes(3)
        .toString('hex')
        .toUpperCase();

      const room = {
        code,
        hostId: uid,
        difficulty,
        status: 'waiting',
        grid,
        players: {
          [uid]: {
            name,
            score: 0,
            foundWords: {}
          }
        },
        createdAt: Date.now(),
        startedAt: null,
        endsAt: null
      };

      const result = await roomRef(code).transaction(
        current => current === null ? room : undefined,
        undefined,
        false
      );

      if (result.committed) {
        return { code };
      }
    }

    throw new HttpsError(
      'resource-exhausted',
      'Unable to allocate a room code.'
    );
  }
);

// 2. JOIN ROOM
exports.joinWordRoom = onCall(
  { region: REGION, cors: true },
  async request => {
    const uid = requireAuth(request);
    const code = validateCode(request.data?.code);
    const name = validateName(request.data?.name);

    let reason = 'Cannot join room.';

    const result = await roomRef(code).transaction(
      room => {
        if (!room) {
          reason = 'Room not found.';
          return;
        }

        if (room.players?.[uid]) {
          return room;
        }

        if (room.status !== 'waiting') {
          reason = 'Game already started.';
          return;
        }

        if (Object.keys(room.players || {}).length >= 2) {
          reason = 'Room is full.';
          return;
        }

        room.players[uid] = {
          name,
          score: 0,
          foundWords: {}
        };

        return room;
      },
      undefined,
      false
    );

    if (!result.committed) {
      throw new HttpsError(
        'failed-precondition',
        reason
      );
    }

    return { code };
  }
);

// 3. START GAME
exports.startWordGame = onCall(
  { region: REGION, cors: true },
  async request => {
    const uid = requireAuth(request);
    const code = validateCode(request.data?.code);

    let reason = 'Cannot start game.';

    const result = await roomRef(code).transaction(
      room => {
        if (!room) {
          reason = 'Room not found.';
          return;
        }

        if (room.hostId !== uid) {
          reason = 'Only the host can start.';
          return;
        }

        if (room.status !== 'waiting') {
          reason = 'Game already started.';
          return;
        }

        if (Object.keys(room.players || {}).length !== 2) {
          reason = 'Two players are required.';
          return;
        }

        const now = Date.now();

        room.status = 'playing';
        room.startedAt = now;
        room.endsAt = now + GAME_DURATION;

        return room;
      },
      undefined,
      false
    );

    if (!result.committed) {
      throw new HttpsError(
        'failed-precondition',
        reason
      );
    }

    return { started: true };
  }
);

// Convert selected cell positions into a word.
// Only straight horizontal, vertical, and diagonal
// selections are allowed.
function wordFromCells(grid, cells) {
  const size = grid?.length;

  if (!Number.isInteger(size) || size < 3) return null;

  if (
    !Array.isArray(cells) ||
    cells.length < 3 ||
    cells.length > size
  ) {
    return null;
  }

  if (!cells.every(
    n => Number.isInteger(n) && n >= 0 && n < size * size
  )) {
    return null;
  }

  if (new Set(cells).size !== cells.length) {
    return null;
  }

  const coords = cells.map(
    n => [Math.floor(n / size), n % size]
  );

  const dr = coords[1][0] - coords[0][0];
  const dc = coords[1][1] - coords[0][1];

  if (
    Math.abs(dr) > 1 ||
    Math.abs(dc) > 1 ||
    (dr === 0 && dc === 0)
  ) {
    return null;
  }

  for (let i = 1; i < coords.length; i++) {
    if (
      coords[i][0] !== coords[0][0] + dr * i ||
      coords[i][1] !== coords[0][1] + dc * i
    ) {
      return null;
    }
  }

  return coords.map(
    ([r, c]) => grid[r]?.[c]
  ).join('');
}

// 4. SUBMIT WORD AND UPDATE SCORE
exports.submitWord = onCall(
  { region: REGION, cors: true },
  async request => {
    const uid = requireAuth(request);
    const code = validateCode(request.data?.code);
    const cells = request.data?.cells;

    let failure = 'Invalid or already discovered word.';

    const result = await roomRef(code).transaction(
      room => {
        if (!room) {
          failure = 'Room not found.';
          return;
        }

        const player = room.players?.[uid];

        if (!player) {
          failure = 'You are not a room member.';
          return;
        }

        if (
          room.status !== 'playing' ||
          Date.now() >= room.endsAt
        ) {
          failure = 'Game is not active.';
          return;
        }

        const word = wordFromCells(room.grid, cells);

        if (!word || !WORDS.has(word)) {
          return;
        }

        if (player.foundWords?.[word]) {
          return;
        }

        const points = word.length * 10;

        player.score = (player.score || 0) + points;

        if (!player.foundWords) {
          player.foundWords = {};
        }

        player.foundWords[word] = true;

        return room;
      },
      undefined,
      false
    );

    if (!result.committed) {
      return {
        accepted: false,
        word: '',
        points: 0,
        message: failure
      };
    }

    // Read the committed result, not intermediate
    // transaction attempts.
    const committedRoom = result.snapshot.val();
    const committedPlayer = committedRoom?.players?.[uid];
    const word = wordFromCells(committedRoom?.grid, cells);

    if (!word || !committedPlayer?.foundWords?.[word]) {
      return {
        accepted: false,
        word: '',
        points: 0
      };
    }

    return {
      accepted: true,
      word,
      points: word.length * 10
    };
  }
);

// 5. FINISH GAME
exports.finishWordGame = onCall(
  { region: REGION, cors: true },
  async request => {
    const uid = requireAuth(request);
    const code = validateCode(request.data?.code);

    let reason = 'Game cannot be finished yet.';

    const result = await roomRef(code).transaction(
      room => {
        if (!room) {
          reason = 'Room not found.';
          return;
        }

        if (!room.players?.[uid]) {
          reason = 'You are not a room member.';
          return;
        }

        if (room.status === 'finished') {
          return room;
        }

        if (
          room.status !== 'playing' ||
          Date.now() < room.endsAt
        ) {
          return;
        }

        room.status = 'finished';

        return room;
      },
      undefined,
      false
    );

    if (!result.committed) {
      throw new HttpsError(
        'failed-precondition',
        reason
      );
    }

    return { finished: true };
  }
);
