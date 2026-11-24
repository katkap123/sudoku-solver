
"use strict";

const crypto = require("node:crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.database();

const REGION = "us-central1";
const MAX_PLAYERS = 4;
const CODE_LENGTH = 6;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function requireUser(request) {
  const uid = request.auth?.uid;

  if (!uid) {
    throw new HttpsError(
      "unauthenticated",
      "Please sign in before using multiplayer."
    );
  }

  return uid;
}

function validateName(value) {
  if (typeof value !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "Player name is required."
    );
  }

  const name = value.trim();

  if (name.length < 1 || name.length > 24) {
    throw new HttpsError(
      "invalid-argument",
      "Player name must contain 1 to 24 characters."
    );
  }

  return name;
}

function validateCode(value) {
  if (typeof value !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "Room code is required."
    );
  }

  const code = value.trim().toUpperCase();

  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) {
    throw new HttpsError(
      "invalid-argument",
      "Invalid room code."
    );
  }

  return code;
}

function generateCode() {
  let code = "";

  for (let i = 0; i < CODE_LENGTH; i++) {
    const index = crypto.randomInt(CODE_CHARS.length);
    code += CODE_CHARS[index];
  }

  return code;
}

function shufflePlayers(ids) {
  const result = [...ids];

  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function playerIds(room) {
  return Object.keys(room?.players || {});
}

function normalizeError(error) {
  if (error instanceof HttpsError) {
    throw error;
  }

  console.error("Card room operation failed:", error);

  throw new HttpsError(
    "internal",
    "Unable to complete the card room operation."
  );
}

// --------------------------------------------------
// CREATE CARD ROOM
// --------------------------------------------------

exports.createCardRoom = onCall(
  { region: REGION },
  async (request) => {
    try {
      const uid = requireUser(request);
      const playerName = validateName(
        request.data?.playerName
      );

      for (let attempt = 0; attempt < 10; attempt++) {
        const code = generateCode();
        const ref = db.ref(`cardRooms/${code}`);
        const now = Date.now();

        const room = {
          code,
          hostId: uid,
          status: "waiting",
          createdAt: now,
          updatedAt: now,
          roundNumber: 0,
          playerOrder: [],
          players: {
            [uid]: {
              uid,
              name: playerName,
              joinedAt: now,
              totalScore: 0
            }
          }
        };

        const result = await ref.transaction(
          (current) => {
            if (current !== null) {
              return;
            }

            return room;
          },
          undefined,
          false
        );

        if (result.committed) {
          return {
            code,
            roomCode: code,
            hostId: uid,
            status: "waiting"
          };
        }
      }

      throw new HttpsError(
        "resource-exhausted",
        "Unable to generate a unique room code."
      );
    } catch (error) {
      normalizeError(error);
    }
  }
);

// --------------------------------------------------
// JOIN CARD ROOM
// --------------------------------------------------


exports.joinCardRoom = onCall(
  { region: REGION },
  async (request) => {
    try {
      const uid = requireUser(request);
      const code = validateCode(request.data?.code);
      const playerName = validateName(
        request.data?.playerName
      );

      
const roomRef = db.ref(`cardRooms/${code}`);
const now = Date.now();

// Read the existing room before starting the transaction.
// This also lets us return a clear error for missing rooms.
const initialSnapshot = await roomRef.get();
const initialRoom = initialSnapshot.val();

if (!initialRoom) {
  throw new HttpsError(
    "not-found",
    "Room not found."
  );
}

if (initialRoom.players?.[uid]) {
  return {
    code,
    roomCode: code,
    status: initialRoom.status,
    hostId: initialRoom.hostId,
    playerCount: Object.keys(initialRoom.players).length
  };
}

if (initialRoom.status !== "waiting") {
  throw new HttpsError(
    "failed-precondition",
    "This game has already started."
  );
}

if (Object.keys(initialRoom.players || {}).length >= MAX_PLAYERS) {
  throw new HttpsError(
    "resource-exhausted",
    "Room already has four players."
  );
}


const result = await roomRef.transaction(
  (room) => {
    // Firebase may initially provide null before
    // loading the existing server value.
    //
    // Do not return undefined here because that
    // immediately cancels the transaction.
    if (room === null) {
      return room;
    }

    if (room.players?.[uid]) {
      return room;
    }

    if (room.status !== "waiting") {
      return;
    }

    const players = room.players || {};

    if (Object.keys(players).length >= MAX_PLAYERS) {
      return;
    }

    return {
      ...room,
      updatedAt: now,
      players: {
        ...players,
        [uid]: {
          uid,
          name: playerName,
          joinedAt: now,
          totalScore: 0
        }
      }
    };
  },
  undefined,
  false
);


      if (!result.committed) {
        const snapshot = await roomRef.get();
        const room = snapshot.val();

        if (!room) {
          throw new HttpsError(
            "not-found",
            "Room not found."
          );
        }

        if (room.players?.[uid]) {
          return {
            code,
            roomCode: code,
            status: room.status,
            hostId: room.hostId,
            playerCount: Object.keys(room.players).length
          };
        }

        if (room.status !== "waiting") {
          throw new HttpsError(
            "failed-precondition",
            "This game has already started."
          );
        }

        if (
          Object.keys(room.players || {}).length >=
          MAX_PLAYERS
        ) {
          throw new HttpsError(
            "resource-exhausted",
            "Room already has four players."
          );
        }

        throw new HttpsError(
          "aborted",
          "Room changed during joining. Please retry."
        );
      }

      const room = result.snapshot.val();

      return {
        code,
        roomCode: code,
        status: room.status,
        hostId: room.hostId,
        playerCount: Object.keys(room.players || {}).length
      };

    } catch (error) {
      normalizeError(error);
    }
  }
);

// --------------------------------------------------
// START CARD GAME
// --------------------------------------------------


exports.startCardGame = onCall(
  { region: REGION },
  async (request) => {
    try {
      const uid = requireUser(request);
      const code = validateCode(request.data?.code);

      const roomRef = db.ref(`cardRooms/${code}`);

      // Read current room state.
      const snapshot = await roomRef.get();
      const initialRoom = snapshot.val();

      if (!initialRoom) {
        throw new HttpsError(
          "not-found",
          "Room not found."
        );
      }

      if (initialRoom.hostId !== uid) {
        throw new HttpsError(
          "permission-denied",
          "Only the host can start the game."
        );
      }

      if (initialRoom.status !== "waiting") {
        throw new HttpsError(
          "failed-precondition",
          "The game has already started."
        );
      }

      const ids = Object.keys(initialRoom.players || {});

      if (ids.length !== MAX_PLAYERS) {
        throw new HttpsError(
          "failed-precondition",
          "Exactly four players are required."
        );
      }

      const order = shufflePlayers(ids);
      const now = Date.now();

      // Firebase Admin SDK transaction callback can
      // initially receive null. Retry with a known
      // initial room value while preserving checks.
      
    const result = await roomRef.transaction(
      (room) => {
        // If the transaction starts with a local null value,
        // use the previously fetched room as a candidate.
        // Firebase will check the server's current version
        // before committing and retry on a conflict.
        if (room === null) {
          room = initialRoom;
        }

        if (
          !room ||
          room.hostId !== uid ||
          room.status !== "waiting"
        ) {
          return;
        }

        const currentIds = Object.keys(room.players || {});

        if (
          currentIds.length !== MAX_PLAYERS ||
          currentIds.some(id => !ids.includes(id))
        ) {
          return;
        }

        console.log("START TRANSACTION CALLBACK", {
          status: room.status,
          playerCount: currentIds.length
        });

        return {
          ...room,
          status: "ready",
          playerOrder: order,
          roundNumber: 0,
          updatedAt: now
        };
      },
      undefined,
      false
    );

      if (!result.committed) {
        console.error("START GAME TRANSACTION ABORTED", {
          code,
          initialStatus: initialRoom.status,
          initialPlayerCount: ids.length
        });

        throw new HttpsError(
          "aborted",
          "Room changed before starting."
        );
      }

      return {
        code,
        roomCode: code,
        status: "ready",
        playerOrder: order
      };

    } catch (error) {
      normalizeError(error);
    }
  }
);


// --------------------------------------------------
// LEAVE CARD ROOM
// --------------------------------------------------

exports.leaveCardRoom = onCall(
  { region: REGION },
  async (request) => {
    try {
      const uid = requireUser(request);
      const code = validateCode(request.data?.code);

      const ref = db.ref(`cardRooms/${code}`);
      const now = Date.now();

      const result = await ref.transaction(
        (room) => {
          if (!room || !room.players?.[uid]) {
            return;
          }

          // Milestone 2 supports leaving the lobby,
          // not abandoning an active card game.
          if (room.status !== "waiting") {
            return;
          }

          delete room.players[uid];

          const remaining = playerIds(room);

          if (remaining.length === 0) {
            return null;
          }

          if (room.hostId === uid) {
            // Transfer ownership to the earliest
            // remaining player.
            remaining.sort(
              (a, b) =>
                (room.players[a].joinedAt || 0) -
                (room.players[b].joinedAt || 0) ||
                a.localeCompare(b)
            );

            room.hostId = remaining[0];
          }

          room.updatedAt = now;

          return room;
        },
        undefined,
        false
      );

      if (!result.committed) {
        throw new HttpsError(
          "failed-precondition",
          "Cannot leave this room. It may already be active."
        );
      }

      return {
        code,
        roomCode: code,
        left: true
      };
    } catch (error) {
      normalizeError(error);
    }
  }
);


/**
 * MILESTONE 3
 * Private dealing and sequential predictions.
 */

const CARD_SUITS = ["H", "S", "D", "C"];
const CARD_RANKS = [
  "2", "3", "4", "5", "6", "7",
  "8", "9", "10", "J", "Q", "K", "A"
];

function createDeck() {
  const deck = [];

  for (const suit of CARD_SUITS) {
    for (const rank of CARD_RANKS) {
      deck.push({ suit, rank });
    }
  }

  return deck;
}

function shuffleDeck() {
  const deck = createDeck();

  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}


function isValidCard(card) {
  return (
    card !== null &&
    typeof card === "object" &&
    !Array.isArray(card) &&
    CARD_SUITS.includes(card.suit) &&
    CARD_RANKS.includes(card.rank)
  );
}

function cardId(card) {
  return `${card.suit}:${card.rank}`;
}

function cardRankValue(card) {
  return CARD_RANKS.indexOf(card.rank) + 2;
}

function determineTrickWinner(plays) {
  const leadSuit = plays[0].card.suit;

  function strength(card) {
    const rank = cardRankValue(card);

    if (card.suit === "H") {
      return 200 + rank;
    }

    if (card.suit === leadSuit) {
      return 100 + rank;
    }

    return rank;
  }

  return plays.reduce((best, play) =>
    strength(play.card) > strength(best.card)
      ? play
      : best
  ).uid;
}


function validatePrediction(value, roundNumber) {
  if (
    !Number.isInteger(value) ||
    value < 0 ||
    value > roundNumber
  ) {
    throw new HttpsError(
      "invalid-argument",
      `Prediction must be between 0 and ${roundNumber}.`
    );
  }

  return value;
}

async function getAuthoritativeGameState(code) {
  const snapshot = await db
    .ref(`cardGameState/${code}`)
    .get();

  const state = snapshot.val();

  if (!state) {
    throw new HttpsError(
      "failed-precondition",
      "Game state is unavailable. Start a new game."
    );
  }

  return state;
}


exports.checkCardGameState = onCall(
  { region: REGION },
  async (request) => {
    try {
      const uid = requireUser(request);
      const code = validateCode(request.data?.code);

      const roomSnapshot = await db
        .ref(`cardRooms/${code}`)
        .get();

      const room = roomSnapshot.val();

      if (!room) {
        throw new HttpsError(
          "not-found",
          "Room not found."
        );
      }

      if (!room.players?.[uid]) {
        throw new HttpsError(
          "permission-denied",
          "You are not a member of this room."
        );
      }

      const state =
        await getAuthoritativeGameState(code);

      const order = state.playerOrder || [];

      const handCounts = {};

      for (const playerUid of order) {
        handCounts[playerUid] =
          (state.hands?.[playerUid] || []).length;
      }

      return {
        code,
        roomStatus: room.status,
        roomPhase: room.phase,
        roomRoundNumber: room.roundNumber,
        statePhase: state.phase,
        stateRoundNumber: state.roundNumber,
        playerCount: order.length,
        handCounts,
        revision: state.revision || 0,
        consistent:
          room.roundNumber === state.roundNumber &&
          room.phase === state.phase
      };

    } catch (error) {
      normalizeError(error);
    }
  }
);

// --------------------------------------------------
// DEAL CARD ROUND
// --------------------------------------------------

exports.dealCardRound = onCall(
  { region: REGION },
  async (request) => {
    try {
      const uid = requireUser(request);
      const code = validateCode(request.data?.code);
      const roomRef = db.ref(`cardRooms/${code}`);

      const initialSnapshot = await roomRef.get();
      const initialRoom = initialSnapshot.val();

      if (!initialRoom) {
        throw new HttpsError(
          "not-found",
          "Room not found."
        );
      }

      if (initialRoom.hostId !== uid) {
        throw new HttpsError(
          "permission-denied",
          "Only the host can deal cards."
        );
      }

      // Milestone 3 starts Round 1 only.
      // Later rounds will be unlocked after scoring.
      if (
        initialRoom.status !== "ready" ||
        initialRoom.roundNumber !== 0
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Round 1 cannot be dealt in the current state."
        );
      }

      const order = initialRoom.playerOrder;

      if (
        !Array.isArray(order) ||
        order.length !== MAX_PLAYERS ||
        new Set(order).size !== MAX_PLAYERS ||
        order.some(id => !initialRoom.players?.[id])
      ) {
        throw new HttpsError(
          "failed-precondition",
          "A valid four-player order is required."
        );
      }

      const dealToken = crypto.randomUUID();
      const now = Date.now();

      // Lock the room before dealing.
      const lockResult = await roomRef.transaction(
        room => {
          // Use the previously fetched room only when Firebase
          // initially invokes the transaction with null.
          if (room === null) {
            room = initialRoom;
          }

          if (!room) {
            return;
          }
          if (
            !room ||
            room.hostId !== uid ||
            room.status !== "ready" ||
            room.roundNumber !== 0
          ) {
            return;
          }

          if (
            JSON.stringify(room.playerOrder) !==
            JSON.stringify(order)
          ) {
            return;
          }

          room.status = "dealing";
          room.dealToken = dealToken;
          room.dealStartedAt = now;
          room.updatedAt = now;

          return room;
        },
        undefined,
        false
      );

      if (!lockResult.committed) {
        throw new HttpsError(
          "aborted",
          "Room changed before dealing. Please retry."
        );
      }

      try {
        const deck = shuffleDeck();
        const updates = {};

        const hands = {};

        for (let i = 0; i < MAX_PLAYERS; i++) {
          const playerUid = order[i];
          hands[playerUid] = [deck[i]];
        }

        updates[`cardGameState/${code}`] = {
          roundNumber: 1,
          phase: "predicting",
          playerOrder: order,
          startingPlayerId: order[0],
          currentPlayerId: order[0],
          hands,
          predictions: {},
          currentTrick: {
            plays: []
          },
          completedTricks: [],
          tricksWon: {},
          roundScores: {},
          revision: 0,
          updatedAt: Date.now()
        };

        // Round 1: one card per player.
        // Each hand is stored at a private path.
        for (let i = 0; i < MAX_PLAYERS; i++) {
          const playerUid = order[i];

          updates[
            `cardPrivateHands/${code}/${playerUid}`
          ] = {
            roundNumber: 1,
            cards: [deck[i]]
          };
        }

        // Public room metadata contains no card values.
        updates[`cardRooms/${code}/status`] =
          "playing";

        updates[`cardRooms/${code}/phase`] =
          "predicting";

        updates[`cardRooms/${code}/roundNumber`] = 1;

        updates[`cardRooms/${code}/startingPlayerId`] =
          order[0];

        updates[`cardRooms/${code}/currentPlayerId`] =
          order[0];

        updates[`cardRooms/${code}/predictions`] = null;
        updates[`cardRooms/${code}/tricksWon`] = null;
        updates[`cardRooms/${code}/dealToken`] = null;
        updates[`cardRooms/${code}/dealStartedAt`] = null;
        updates[`cardRooms/${code}/updatedAt`] =
          Date.now();

        // One atomic database update publishes
        // all four hands and the public phase.
        await db.ref().update(updates);

        return {
          code,
          roundNumber: 1,
          phase: "predicting",
          currentPlayerId: order[0]
        };

      } catch (dealError) {
        // Restore the ready state if the write fails.
        // A process crash may still leave "dealing";
        // see the recovery note below.
        await roomRef.transaction(
          room => {
            if (
              room?.status === "dealing" &&
              room.dealToken === dealToken
            ) {
              room.status = "ready";
              delete room.dealToken;
              delete room.dealStartedAt;
              room.updatedAt = Date.now();
              return room;
            }
            return;
          },
          undefined,
          false
        ).catch(err => {
          console.error("Deal rollback failed:", err);
        });

        throw dealError;
      }
    } catch (error) {
      normalizeError(error);
    }
  }
);

// --------------------------------------------------
// SUBMIT CARD PREDICTION
// --------------------------------------------------

exports.submitCardPrediction = onCall(
  { region: REGION },
  async (request) => {
    try {
      const uid = requireUser(request);
      const code = validateCode(request.data?.code);
      const prediction = request.data?.prediction;

      const roomRef = db.ref(`cardRooms/${code}`);

      const initialSnapshot = await roomRef.get();
      const initialRoom = initialSnapshot.val();

      if (!initialRoom) {
        throw new HttpsError(
          "not-found",
          "Room not found."
        );
      }

      if (!initialRoom.players?.[uid]) {
        throw new HttpsError(
          "permission-denied",
          "You are not a player in this room."
        );
      }

      validatePrediction(
        prediction,
        initialRoom.roundNumber
      );

      const result = await roomRef.transaction(
        room => {

    // Firebase may initially provide null to the
    // transaction callback even when the room exists.
    // Use the previously fetched room as the candidate.
    if (room === null) {
        room = initialRoom;
      }

      if (!room) {
        return;
      }

      console.log("PREDICTION DEBUG", {
        roomExists: room !== null,
        status: room?.status,
        phase: room?.phase,
        roundNumber: room?.roundNumber,
        currentPlayerId: room?.currentPlayerId,
        requestingPlayerId: uid,
        prediction: prediction,
        playerOrder: room?.playerOrder,
        existingPredictions: room?.predictions
      });

          if (
            !room ||
            room.status !== "playing" ||
            room.phase !== "predicting"
          ) {
            return;
          }

          const order = room.playerOrder || [];
          const roundNumber = room.roundNumber;

          if (
            !Array.isArray(order) ||
            order.length !== MAX_PLAYERS ||
            !Number.isInteger(roundNumber) ||
            roundNumber < 1 ||
            roundNumber > 13 ||
            !Number.isInteger(prediction) ||
            prediction < 0 ||
            prediction > roundNumber
          ) {
            return;
          }

          if (!room.players?.[uid]) {
            return;
          }

          if (room.currentPlayerId !== uid) {
            return;
          }

          room.predictions = room.predictions || {};

          if (
            Object.prototype.hasOwnProperty.call(
              room.predictions,
              uid
            )
          ) {
            return;
          }

          const index = order.indexOf(uid);

          if (index < 0) {
            return;
          }

          // Fourth player's bid must not make
          // the sum equal the round number.
          if (index === MAX_PLAYERS - 1) {
            let previousTotal = 0;

            for (let i = 0; i < index; i++) {
              const previous =
                room.predictions[order[i]];

              if (!Number.isInteger(previous)) {
                return;
              }

              previousTotal += previous;
            }

            if (
              previousTotal + prediction ===
              roundNumber
            ) {
              return;
            }
          }

          room.predictions[uid] = prediction;

          if (index < MAX_PLAYERS - 1) {
            room.currentPlayerId = order[index + 1];
          } else {
            // All four predictions are complete.
            // Milestone 4 will enable card plays.
            room.phase = "playing";
            room.currentPlayerId = order[0];
          }

          room.updatedAt = Date.now();

          return room;
        },
        undefined,
        false
      );

      if (!result.committed) {
        throw new HttpsError(
          "failed-precondition",
          "Prediction rejected. Check your turn, " +
          "prediction range, or the fourth-player rule."
        );
      }

      const room = result.snapshot.val();

      return {
        code,
        roundNumber: room.roundNumber,
        prediction,
        phase: room.phase,
        currentPlayerId: room.currentPlayerId
      };
    } catch (error) {
      normalizeError(error);
    }
  }
);



exports.playCard = onCall(
  { region: REGION },
  async (request) => {
    try {
      const uid = requireUser(request);
      const code = validateCode(request.data?.code);
      const card = request.data?.card;

      if (!isValidCard(card)) {
        throw new HttpsError(
          "invalid-argument",
          "Invalid card."
        );
      }

      const roomRef = db.ref(`cardRooms/${code}`);
      const handRef = db.ref(
        `cardPrivateHands/${code}/${uid}`
      );

      const [roomSnapshot, handSnapshot] =
        await Promise.all([
          roomRef.get(),
          handRef.get()
        ]);

      const initialRoom = roomSnapshot.val();
      const hand = handSnapshot.val();

      if (!initialRoom) {
        throw new HttpsError(
          "not-found",
          "Room not found."
        );
      }

      if (!initialRoom.players?.[uid]) {
        throw new HttpsError(
          "permission-denied",
          "You are not in this room."
        );
      }

      if (
        hand?.roundNumber !== initialRoom.roundNumber ||
        !Array.isArray(hand.cards)
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Your hand is unavailable."
        );
      }

      const selectedCardId = cardId(card);

      if (
        !hand.cards.some(
          c => isValidCard(c) && cardId(c) === selectedCardId
        )
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Card is not in your hand."
        );
      }

      const result = await roomRef.transaction(
        (room) => {
          if (room === null) {
            room = initialRoom;
          }

          if (
            !room ||
            room.status !== "playing" ||
            room.phase !== "playing" ||
            room.currentPlayerId !== uid ||
            room.roundNumber !== 1
          ) {
            return;
          }

          const order = room.playerOrder || [];

          if (
            !Array.isArray(order) ||
            order.length !== MAX_PLAYERS ||
            !order.includes(uid)
          ) {
            return;
          }

          const plays = room.currentTrick?.plays || [];

          if (
            !Array.isArray(plays) ||
            plays.length >= MAX_PLAYERS ||
            plays.some(p => p.uid === uid)
          ) {
            return;
          }

          // Prevent the same card from being played twice.
          const previouslyPlayed = [
            ...plays,
            ...(room.lastTrick?.plays || [])
          ];

          if (
            previouslyPlayed.some(
              p => cardId(p.card) === selectedCardId
            )
          ) {
            return;
          }

          // Follow suit when possible.
          if (plays.length > 0) {
            const leadSuit = plays[0].card.suit;

            const hasLeadSuit = hand.cards.some(
              c => c.suit === leadSuit
            );

            if (
              hasLeadSuit &&
              card.suit !== leadSuit
            ) {
              return;
            }
          }

          const updatedPlays = [
            ...plays,
            { uid, card }
          ];

          room.currentTrick = {
            plays: updatedPlays
          };

          if (updatedPlays.length < MAX_PLAYERS) {
            const currentIndex = order.indexOf(uid);

            room.currentPlayerId =
              order[(currentIndex + 1) % MAX_PLAYERS];
          } else {
            const winnerUid =
              determineTrickWinner(updatedPlays);

            room.tricksWon = room.tricksWon || {};
            room.tricksWon[winnerUid] =
              (room.tricksWon[winnerUid] || 0) + 1;

            room.lastTrick = {
              plays: updatedPlays,
              winnerUid
            };

            room.currentTrick = {
              plays: []
            };

            // Round 1 contains exactly one trick.
            room.phase = "round-complete";
            room.currentPlayerId = null;

            room.roundScores = {};
            for (const playerUid of order) {
              const bid = room.predictions?.[playerUid];
              const won = room.tricksWon?.[playerUid] || 0;

              const score =
                Number.isInteger(bid) && bid === won
                  ? 11 * bid + 10
                  : 0;

              room.roundScores[playerUid] = score;
              room.players[playerUid].totalScore =
                (room.players[playerUid].totalScore || 0) +
                score;
            }
          }

          room.updatedAt = Date.now();

          return room;
        },
        undefined,
        false
      );

      if (!result.committed) {
        throw new HttpsError(
          "failed-precondition",
          "Card play rejected. Check your turn and card."
        );
      }

      // Remove the played card from the player's private
      // hand. This is a separate write and is therefore
      // not atomic with the room transaction.
      await handRef.transaction(
        (currentHand) => {
          if (!currentHand) {
            return;
          }

          if (
            currentHand.roundNumber !==
            initialRoom.roundNumber
          ) {
            return;
          }

          currentHand.cards = (
            currentHand.cards || []
          ).filter(
            c => cardId(c) !== selectedCardId
          );

          return currentHand;
        },
        undefined,
        false
      );

      const updatedRoom = result.snapshot.val();

      return {
        code,
        card,
        phase: updatedRoom.phase,
        currentPlayerId: updatedRoom.currentPlayerId,
        currentTrick: updatedRoom.currentTrick || null,
        lastTrick: updatedRoom.lastTrick || null,
        tricksWon: updatedRoom.tricksWon || {},
        roundScores: updatedRoom.roundScores || {}
      };
    } catch (error) {
      normalizeError(error);
    }
  }
);



function getCardSuit(card) {
  // Assumes cards have a suit property.
  return card?.suit;
}

function getCardRank(card) {
  const rank = card?.rank;

  if (typeof rank === "number") {
    return rank;
  }

  const values = {
    A: 14,
    K: 13,
    Q: 12,
    J: 11
  };

  return values[String(rank).toUpperCase()] ??
    Number(rank);
}

function getTrickWinner(plays) {
  const leadSuit = getCardSuit(plays[0].card);

  function strength(card) {
    const suit = getCardSuit(card);
    const rank = getCardRank(card);

    if (String(suit).toUpperCase() === "H" ||
        String(suit).toLowerCase() === "hearts") {
      return 200 + rank;
    }

    if (suit === leadSuit) {
      return 100 + rank;
    }

    return 0;
  }

  return plays.reduce((best, play) =>
    strength(play.card) > strength(best.card)
      ? play
      : best
  ).uid;
}


