"use client";

// Bot AI logic for each game.
// The bot listens for messages sent by the host game component,
// and sends back appropriate responses via simulateReceive().
//
// KEY PRINCIPLE: For simultaneous-action games (Finger Cricket, Color Clash,
// Sync or Sink, Trivia, Type Racer, Pattern Pulse, Reaction Showdown),
// the bot acts independently on a timer — it does NOT react to the user's
// identical message type, which would create infinite loops.

import { PeerMessage } from "@/types";

type SendFn = (data: unknown) => void;

// Track active bot timers so we can cancel them on cleanup
const activeTimers: Set<ReturnType<typeof setTimeout>> = new Set();

function botSend(send: SendFn, type: string, payload: unknown, delayMs: number) {
  const timer = setTimeout(() => {
    activeTimers.delete(timer);
    const msg: PeerMessage = { type, payload };
    send(msg);
  }, delayMs);
  activeTimers.add(timer);
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1));
}

// ----- REACTION SHOWDOWN -----
function handleReactionShowdown(msg: PeerMessage, send: SendFn) {
  if (msg.type === "go") {
    const reactionTime = randInt(200, 600);
    botSend(send, "reaction", { time: reactionTime }, reactionTime);
  }
  // Ignore: start-round, next-round, reaction (host controls flow)
}

// ----- FINGER CRICKET -----
// Bot picks independently when a round begins, not in response to user's pick
function handleFingerCricket(msg: PeerMessage, send: SendFn) {
  if (msg.type === "start" || msg.type === "continue") {
    // New innings starting — bot will pick when user picks (via pick handler)
  }
  if (msg.type === "pick") {
    // User picked — bot responds once with its own number
    const pick = randInt(1, 6);
    botSend(send, "pick", { number: pick }, 100);
  }
  // Ignore: play-again (game resets)
}

// ----- DOTS & BOXES -----
const dotsBoxesState = { lines: new Set<string>() };
function handleDotsAndBoxes(msg: PeerMessage, send: SendFn) {
  if (msg.type === "start") {
    dotsBoxesState.lines = new Set();
  }
  if (msg.type === "line") {
    const p = msg.payload as { key: string };
    dotsBoxesState.lines.add(p.key);
    // Bot's turn — pick a random available line
    const SIZE = 4;
    const allLines: string[] = [];
    for (let r = 0; r <= SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        allLines.push(r + "," + c + "-" + r + "," + (c + 1));
      }
    }
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c <= SIZE; c++) {
        allLines.push(r + "," + c + "-" + (r + 1) + "," + c);
      }
    }
    const available = allLines.filter((l) => !dotsBoxesState.lines.has(l));
    if (available.length > 0) {
      const chosen = available[randInt(0, available.length - 1)];
      dotsBoxesState.lines.add(chosen);
      botSend(send, "line", { key: chosen }, randInt(500, 1500));
    }
  }
}

// ----- COLOR CLASH -----
function handleColorClash(msg: PeerMessage, send: SendFn) {
  if (msg.type === "start" || msg.type === "next-round") {
    const p = msg.payload as { color?: string };
    const hslMatch = (p.color || "").match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (hslMatch) {
      const h = Math.max(0, parseInt(hslMatch[1]) + randInt(-15, 15));
      const s = Math.max(0, Math.min(100, parseInt(hslMatch[2]) + randInt(-10, 10)));
      const l = Math.max(0, Math.min(100, parseInt(hslMatch[3]) + randInt(-10, 10)));
      botSend(send, "submit-color", { color: "hsl(" + h + ", " + s + "%, " + l + "%)" }, randInt(2000, 5000));
    } else {
      botSend(send, "submit-color", { color: "hsl(180, 50%, 50%)" }, randInt(2000, 5000));
    }
  }
  // Ignore: submit-color (don't react to own type)
}

// ----- MEMORY FLIP -----
function handleMemoryFlip(msg: PeerMessage, send: SendFn) {
  if (msg.type === "start") {
    const p = msg.payload as { board: string[] };
    const board = p.board || [];
    // Bot will flip 2 random unflipped cards when it's the bot's turn
    // Memory Flip is turn-based; host goes first. Bot responds to its turn.
    memoryFlipState.board = board;
    memoryFlipState.flipped = new Set();
  }
  // Bot flips when game says it's the opponent's turn via the turn system
  // The game internally tracks turns; when it's opponent's turn, the game waits for 'flip' messages
  // Since host goes first, after host's turn fails to match, it becomes bot's turn
  // The game doesn't send a "your-turn" message — it just waits for 'flip' events
  if (msg.type === "flip") {
    // Host flipped a card; track it
    const p = msg.payload as { index: number };
    memoryFlipState.flipped.add(p.index);
  }
}
const memoryFlipState: { board: string[]; flipped: Set<number> } = { board: [], flipped: new Set() };

// ----- TYPE RACER -----
function handleTypeRacer(msg: PeerMessage, send: SendFn) {
  if (msg.type === "start") {
    const p = msg.payload as { passage?: string };
    const passage = p.passage || "";
    const wpm = randInt(35, 65);
    const charsPerMs = (wpm * 5) / 60000;
    const totalTime = passage.length / charsPerMs;
    const steps = 20;
    const stepTime = totalTime / steps;

    for (let i = 1; i <= steps; i++) {
      const progress = Math.min(100, Math.round((i / steps) * 100));
      botSend(send, "progress", { progress }, Math.round(stepTime * i));
    }
    botSend(send, "finish", { wpm }, Math.round(totalTime));
  }
  // Ignore: progress, finish (don't react to same type)
}

// ----- SYNC OR SINK -----
const COMMON_ANSWERS: Record<string, string[]> = {
  fruit: ["apple", "banana", "orange", "mango"],
  color: ["blue", "red", "green", "yellow"],
  animal: ["dog", "cat", "lion", "elephant"],
  country: ["india", "usa", "japan", "france"],
  sport: ["cricket", "football", "basketball", "tennis"],
  movie: ["avatar", "titanic", "inception", "batman"],
  food: ["pizza", "burger", "pasta", "rice"],
  drink: ["water", "coffee", "tea", "juice"],
  city: ["new york", "london", "tokyo", "paris"],
};
function handleSyncOrSink(msg: PeerMessage, send: SendFn) {
  if (msg.type === "start" || msg.type === "next-round") {
    const p = msg.payload as { prompt?: string };
    const prompt = (p.prompt || "").toLowerCase();
    let answer = "thing";
    for (const [key, vals] of Object.entries(COMMON_ANSWERS)) {
      if (prompt.includes(key)) {
        answer = vals[randInt(0, vals.length - 1)];
        break;
      }
    }
    botSend(send, "answer", { answer }, randInt(2000, 5000));
  }
  // Ignore: answer (don't react to same type)
}

// ----- WORD BOMB -----
const WORD_BANK = [
  "the", "that", "this", "with", "have", "from", "they", "will", "than", "then",
  "think", "thing", "thought", "through", "three", "there", "their", "other",
  "about", "above", "after", "again", "against", "along", "another",
  "because", "before", "begin", "being", "below", "between", "both",
  "catch", "change", "child", "children", "country", "contain", "could",
  "father", "find", "first", "follow", "found", "friend", "further",
  "going", "great", "green", "group", "growing", "ground",
  "having", "heart", "heavy", "help", "here", "high", "history", "house",
  "inside", "interest", "into", "island",
  "kind", "king", "kitchen", "know",
  "large", "last", "later", "learn", "letter", "light", "little", "long",
  "making", "money", "morning", "mother", "mountain", "much", "music",
  "never", "night", "nothing", "number",
  "often", "open", "order", "over", "own",
  "painting", "people", "place", "plant", "playing", "point",
  "question", "quite",
  "rather", "reading", "right", "river", "running",
  "school", "second", "should", "since", "small", "something", "south", "still", "story", "string",
  "together", "under", "until", "using",
  "water", "while", "white", "winter", "within", "without", "world", "writing",
];
function handleWordBomb(msg: PeerMessage, send: SendFn) {
  if (msg.type === "start" || msg.type === "next-turn") {
    const p = msg.payload as { combo?: string };
    const combo = (p.combo || "").toLowerCase();
    const match = WORD_BANK.find((w) => w.includes(combo) && w.length >= 3);
    if (match) {
      const newCombos = ["TH", "IN", "AN", "ER", "OU", "RE", "ST", "EN", "AL", "ND"];
      const newCombo = newCombos[randInt(0, newCombos.length - 1)];
      botSend(send, "word", { word: match, newCombo }, randInt(1500, 5000));
    } else {
      botSend(send, "timeout", {}, 8000);
    }
  }
  // Ignore: word, timeout (don't react to same type)
}

// ----- MAZE RACE -----
function handleMazeRace(msg: PeerMessage, send: SendFn) {
  if (msg.type === "start") {
    const p = msg.payload as { size?: number };
    const SIZE = p.size || 17;
    let r = 1, c = 0;
    let moveCount = 0;
    const maxMoves = SIZE * SIZE;
    const sendMove = () => {
      if (moveCount >= maxMoves) return;
      moveCount++;
      const delay = randInt(150, 400);
      const timer = setTimeout(() => {
        activeTimers.delete(timer);
        if (Math.random() > 0.4 && r < SIZE - 2) r++;
        else if (Math.random() > 0.5 && c < SIZE - 1) c++;
        else if (Math.random() > 0.7 && r > 1) r--;
        else if (c > 0) c--;
        const moveMsg: PeerMessage = { type: "move", payload: { r, c } };
        send(moveMsg);
        sendMove();
      }, delay);
      activeTimers.add(timer);
    };
    // Wait for countdown (3 seconds)
    const startTimer = setTimeout(sendMove, 3500);
    activeTimers.add(startTimer);
  }
  // Ignore: move, win (don't react to same type)
}

// ----- PATTERN PULSE -----
function handlePatternPulse(msg: PeerMessage, send: SendFn) {
  if (msg.type === "start" || msg.type === "next-round") {
    const p = msg.payload as { sequence?: number[]; speed?: number };
    const sequence = p.sequence || [];
    const speed = p.speed || 600;
    const shouldFail = sequence.length > 6 && Math.random() > 0.7;
    const delay = (sequence.length + 1) * speed + randInt(300, 800);
    if (shouldFail) {
      botSend(send, "failed", { round: sequence.length }, delay);
    } else {
      botSend(send, "passed", { round: sequence.length }, delay);
    }
  }
  // Ignore: failed, passed (don't react to same type)
}

// ----- EMOJI CHARADES -----
let charadesGuessTimer: ReturnType<typeof setTimeout> | null = null;
function handleEmojiCharades(msg: PeerMessage, send: SendFn) {
  if (msg.type === "start" || msg.type === "next-round") {
    if (charadesGuessTimer) {
      clearTimeout(charadesGuessTimer);
      charadesGuessTimer = null;
    }
    // Bot "guesses" after a delay — sometimes correct, sometimes fails
    const willGetIt = Math.random() > 0.4;
    const triesUsed = willGetIt ? randInt(1, 3) : 3;
    const delay = triesUsed * randInt(2000, 4000);
    charadesGuessTimer = setTimeout(() => {
      charadesGuessTimer = null;
      botSend(send, "round-result", {
        result: willGetIt ? "correct" : "failed",
        triesUsed,
      }, 0);
    }, delay);
  }
  // Ignore: round-result (don't react to same type)
}

// ----- TRIVIA SHOWDOWN -----
function handleTriviaShowdown(msg: PeerMessage, send: SendFn) {
  if (msg.type === "start" || msg.type === "next-round") {
    const p = msg.payload as { correct?: string; options?: string[] };
    const picksCorrect = Math.random() < 0.6;
    const options = p.options || [];
    const wrong = options.filter((o: string) => o !== p.correct);
    const answer = picksCorrect
      ? (p.correct || options[0] || "A")
      : (wrong[randInt(0, Math.max(0, wrong.length - 1))] || p.correct || "A");
    botSend(send, "answer", { answer }, randInt(2000, 6000));
  }
  // Ignore: answer (don't react to same type)
}

// ----- DOODLE DUEL -----
function handleDoodleDuel(msg: PeerMessage, send: SendFn) {
  if (msg.type === "start" || msg.type === "next-round") {
    const p = msg.payload as { hostWord?: string; guestWord?: string };
    // Bot is the guest, draws the guestWord
    const botWord = p.guestWord || p.hostWord || "thing";
    botSend(
      send,
      "drawing",
      {
        image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        word: botWord,
      },
      5000,
    );
  }
  if (msg.type === "guess-result") {
    // Host guessed bot's drawing; bot now guesses host's drawing
    // Bot sends a random guess (it can't actually see the drawing)
    botSend(send, "guess-result", { correct: Math.random() > 0.5, guess: "thing" }, randInt(1000, 3000));
  }
}

// ----- JIGSAW TOGETHER -----
function handleJigsawTogether(msg: PeerMessage, send: SendFn) {
  if (msg.type === "start") {
    const p = msg.payload as { pieces?: Array<{ id: number; correctRow: number; correctCol: number; placed: boolean }>; grid?: number };
    const pieces = p.pieces || [];
    const grid = p.grid || 4;
    const PUZZLE_AREA_SIZE = 320;
    const BOARD_WIDTH = 700;
    const BOARD_HEIGHT = 600;
    const pieceSize = PUZZLE_AREA_SIZE / grid;
    const PUZZLE_OFFSET_X = (BOARD_WIDTH - PUZZLE_AREA_SIZE) / 2;
    const PUZZLE_OFFSET_Y = (BOARD_HEIGHT - PUZZLE_AREA_SIZE) / 2;
    const unplaced = pieces.filter((pc) => !pc.placed);
    // Bot places every other piece to share the work
    unplaced.forEach((piece, i) => {
      if (i % 2 === 1) {
        const correctX = PUZZLE_OFFSET_X + piece.correctCol * pieceSize;
        const correctY = PUZZLE_OFFSET_Y + piece.correctRow * pieceSize;
        botSend(
          send,
          "place",
          { pieceId: piece.id, x: correctX, y: correctY },
          (i + 1) * randInt(1500, 3000),
        );
      }
    });
  }
  // Ignore: place (don't react to same type — bot places autonomously)
}

// ----- MAIN DISPATCHER -----
export function createBotHandler(gameId: string, send: SendFn): (data: unknown) => void {
  return (data: unknown) => {
    const msg = data as PeerMessage;

    switch (gameId) {
      case "reaction-showdown":
        handleReactionShowdown(msg, send);
        break;
      case "finger-cricket":
        handleFingerCricket(msg, send);
        break;
      case "dots-and-boxes":
        handleDotsAndBoxes(msg, send);
        break;
      case "color-clash":
        handleColorClash(msg, send);
        break;
      case "memory-flip":
        handleMemoryFlip(msg, send);
        break;
      case "type-racer":
        handleTypeRacer(msg, send);
        break;
      case "sync-or-sink":
        handleSyncOrSink(msg, send);
        break;
      case "word-bomb":
        handleWordBomb(msg, send);
        break;
      case "maze-race":
        handleMazeRace(msg, send);
        break;
      case "pattern-pulse":
        handlePatternPulse(msg, send);
        break;
      case "emoji-charades":
        handleEmojiCharades(msg, send);
        break;
      case "trivia-showdown":
        handleTriviaShowdown(msg, send);
        break;
      case "doodle-duel":
        handleDoodleDuel(msg, send);
        break;
      case "jigsaw-together":
        handleJigsawTogether(msg, send);
        break;
    }
  };
}

export function cleanupBotTimers() {
  for (const timer of activeTimers) {
    clearTimeout(timer);
  }
  activeTimers.clear();
  if (charadesGuessTimer) {
    clearTimeout(charadesGuessTimer);
    charadesGuessTimer = null;
  }
}
