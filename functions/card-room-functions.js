
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

      const ref = db.ref(`cardRooms/${code}`);
      const now = Date.now();

      const result = await ref.transaction(
        (room) => {
          if (!room) {
            return;
          }

          if (room.players?.[uid]) {
            return room;
          }

          if (room.status !== "waiting") {
            return;
          }

          if (playerIds(room).length >= MAX_PLAYERS) {
            return;
          }

          room.players = room.players || {};

          room.players[uid] = {
            uid,
            name: playerName,
            joinedAt: now,
            totalScore: 0
          };

          room.updatedAt = now;

          return room;
        },
        undefined,
        false
      );

      if (!result.committed) {
        const snapshot = await ref.get();
        const room = snapshot.val();

        if (!room) {
          throw new HttpsError(
            "not-found",
            "Room not found."
          );
        }

        if (room.status !== "waiting") {
          throw new HttpsError(
            "failed-precondition",
            "This game has already started."
          );
        }

        if (playerIds(room).length >= MAX_PLAYERS) {
          throw new HttpsError(
            "resource-exhausted",
            "Room already has four players."
          );
        }

        throw new HttpsError(
          "aborted",
          "Unable to join the room. Please retry."
        );
      }

      const room = result.snapshot.val();

      return {
        code,
        roomCode: code,
        status: room.status,
        hostId: room.hostId,
        playerCount: playerIds(room).length
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

      const ref = db.ref(`cardRooms/${code}`);
      const now = Date.now();

      // The transaction can be retried, so generate
      // the order once before entering its callback.
      const snapshot = await ref.get();
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
          "The room is not waiting."
        );
      }

      if (playerIds(initialRoom).length !== MAX_PLAYERS) {
        throw new HttpsError(
          "failed-precondition",
          "Exactly four players are required."
        );
      }

      const initialIds = playerIds(initialRoom);
      const order = shufflePlayers(initialIds);

      const result = await ref.transaction(
        (room) => {
          if (!room) {
            return;
          }

          if (room.hostId !== uid) {
            return;
          }

          if (room.status !== "waiting") {
            return;
          }

          const currentIds = playerIds(room);

          if (currentIds.length !== MAX_PLAYERS) {
            return;
          }

          // Reject changes in membership between
          // reading the room and committing the start.
          if (
            currentIds.some(
              (id) => !initialIds.includes(id)
            )
          ) {
            return;
          }

          room.status = "ready";
          room.playerOrder = order;
          room.roundNumber = 0;
          room.updatedAt = now;

          return room;
        },
        undefined,
        false
      );

      if (!result.committed) {
        throw new HttpsError(
          "aborted",
          "Room changed before starting. Please retry."
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

