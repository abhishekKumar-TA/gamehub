"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DataConnection } from "peerjs";
import { PeerMessage } from "@/types";

interface Props {
  connection: DataConnection;
  isHost: boolean;
}

interface EmojiPuzzle {
  emojis: string;
  answer: string;
  category: string;
  hints?: string[];
}

// Fallback puzzles in case fetch fails
const FALLBACK_PUZZLES: EmojiPuzzle[] = [
  { emojis: "🦁👑", answer: "the lion king", category: "Movie" },
  { emojis: "⭐⚔️", answer: "star wars", category: "Movie" },
  { emojis: "🕷️🧑", answer: "spider man", category: "Movie" },
  { emojis: "❄️👸", answer: "frozen", category: "Movie" },
  { emojis: "🌧️🐱🐶", answer: "raining cats and dogs", category: "Phrase" },
  { emojis: "🌙🚶", answer: "moonwalk", category: "Phrase" },
  { emojis: "🎤👸💃", answer: "dancing queen", category: "Song" },
  { emojis: "🎂🎁🎉", answer: "birthday party", category: "Thing" },
  { emojis: "🎃👻🕸️", answer: "halloween", category: "Thing" },
  { emojis: "🐠🔍", answer: "finding nemo", category: "Movie" },
];

const TOTAL_ROUNDS = 8;
const MAX_TRIES = 3;

export default function EmojiCharades({ connection, isHost }: Props) {
  const [puzzles, setPuzzles] = useState<EmojiPuzzle[]>(FALLBACK_PUZZLES);
  const [puzzlesLoaded, setPuzzlesLoaded] = useState(false);
  const puzzlesRef = useRef<EmojiPuzzle[]>(FALLBACK_PUZZLES);
  const [round, setRound] = useState(1);
  const [currentPuzzle, setCurrentPuzzle] = useState<EmojiPuzzle | null>(null);
  const [guess, setGuess] = useState("");
  const [triesLeft, setTriesLeft] = useState(MAX_TRIES);
  const [guessResult, setGuessResult] = useState<"correct" | "wrong" | "failed" | null>(null);
  const [scores, setScores] = useState({ me: 0, them: 0 });
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [usedIndices, setUsedIndices] = useState<number[]>([]);
  const [roundEnded, setRoundEnded] = useState(false);
  const [opponentResult, setOpponentResult] = useState<"correct" | "failed" | null>(null);
  const [wrongGuesses, setWrongGuesses] = useState<string[]>([]);
  const [opponentTriesUsed, setOpponentTriesUsed] = useState(0);
  const autoAdvanceRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch puzzles from JSON file
  useEffect(() => {
    fetch("/emoji-puzzles.json")
      .then((res) => res.json())
      .then((data: EmojiPuzzle[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setPuzzles(data);
          puzzlesRef.current = data;
        }
        setPuzzlesLoaded(true);
      })
      .catch(() => {
        setPuzzlesLoaded(true); // Use fallback
      });
  }, []);

  const send = useCallback(
    (type: string, payload: unknown = {}) => {
      const msg: PeerMessage = { type, payload };
      connection.send(msg);
    },
    [connection],
  );

  const getRandomPuzzle = useCallback((exclude: number[]): { puzzle: EmojiPuzzle; index: number } => {
    const available = puzzles.map((p, i) => ({ p, i })).filter(({ i }) => !exclude.includes(i));
    const pool = available.length > 0 ? available : puzzles.map((p, i) => ({ p, i }));
    const choice = pool[Math.floor(Math.random() * pool.length)];
    return { puzzle: choice.p, index: choice.i };
  }, [puzzles]);

  const startGame = useCallback(() => {
    const { puzzle, index } = getRandomPuzzle([]);
    setCurrentPuzzle(puzzle);
    setUsedIndices([index]);
    setRound(1);
    setScores({ me: 0, them: 0 });
    setTriesLeft(MAX_TRIES);
    setGuess("");
    setGuessResult(null);
    setOpponentResult(null);
    setWrongGuesses([]);
    setOpponentTriesUsed(0);
    setRoundEnded(false);
    setGameStarted(true);
    setGameOver(false);
    send("start", { puzzleIndex: index });
  }, [send, getRandomPuzzle]);

  const checkGuess = (text: string, answer: string): boolean => {
    const normalize = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ");
    const g = normalize(text);
    const a = normalize(answer);
    if (g === a) return true;
    // Also check without "the", "a", "an"
    const stripArticles = (s: string) => s.replace(/^(the|a|an) /, "");
    if (stripArticles(g) === stripArticles(a)) return true;
    if (g === stripArticles(a)) return true;
    return false;
  };

  const submitGuess = () => {
    if (!guess.trim() || !currentPuzzle || roundEnded) return;

    const isCorrect = checkGuess(guess, currentPuzzle.answer);

    if (isCorrect) {
      setGuessResult("correct");
      setRoundEnded(true);
      const points = triesLeft; // More tries left = more points
      setScores((prev) => ({ ...prev, me: prev.me + points }));
      send("round-result", { result: "correct", triesUsed: MAX_TRIES - triesLeft + 1 });
    } else {
      const newTries = triesLeft - 1;
      setTriesLeft(newTries);
      setWrongGuesses((prev) => [...prev, guess.trim()]);
      setGuess("");

      if (newTries <= 0) {
        setGuessResult("failed");
        setRoundEnded(true);
        send("round-result", { result: "failed", triesUsed: MAX_TRIES });
      } else {
        // Brief wrong feedback
        setGuessResult("wrong");
        setTimeout(() => setGuessResult(null), 1000);
      }
    }
  };

  const nextRound = useCallback(() => {
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    if (round >= TOTAL_ROUNDS) {
      setGameOver(true);
      send("game-over", {});
      return;
    }
    const { puzzle, index } = getRandomPuzzle(usedIndices);
    const newUsed = [...usedIndices, index];
    setUsedIndices(newUsed);
    setCurrentPuzzle(puzzle);
    setRound((r) => r + 1);
    setTriesLeft(MAX_TRIES);
    setGuess("");
    setGuessResult(null);
    setOpponentResult(null);
    setWrongGuesses([]);
    setOpponentTriesUsed(0);
    setRoundEnded(false);
    send("next-round", { puzzleIndex: index, round: round + 1, usedIndices: newUsed });
  }, [round, send, getRandomPuzzle, usedIndices]);

  // Auto-advance after both players finish
  useEffect(() => {
    if (!roundEnded || !opponentResult || !isHost) return;
    autoAdvanceRef.current = setTimeout(() => {
      nextRound();
    }, 4000);
    return () => {
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
    };
  }, [roundEnded, opponentResult, isHost, nextRound]);

  useEffect(() => {
    const handler = (data: unknown) => {
      const msg = data as PeerMessage;
      if (msg.type === "start") {
        const p = msg.payload as { puzzleIndex: number };
        setCurrentPuzzle(puzzlesRef.current[p.puzzleIndex] || FALLBACK_PUZZLES[0]);
        setUsedIndices([p.puzzleIndex]);
        setRound(1);
        setScores({ me: 0, them: 0 });
        setTriesLeft(MAX_TRIES);
        setGuess("");
        setGuessResult(null);
        setOpponentResult(null);
        setWrongGuesses([]);
        setOpponentTriesUsed(0);
        setRoundEnded(false);
        setGameStarted(true);
        setGameOver(false);
      }
      if (msg.type === "round-result") {
        const p = msg.payload as { result: "correct" | "failed"; triesUsed: number };
        setOpponentResult(p.result);
        setOpponentTriesUsed(p.triesUsed);
        if (p.result === "correct") {
          const points = MAX_TRIES - p.triesUsed + 1;
          setScores((prev) => ({ ...prev, them: prev.them + points }));
        }
      }
      if (msg.type === "next-round") {
        const p = msg.payload as { puzzleIndex: number; round: number; usedIndices: number[] };
        setCurrentPuzzle(puzzlesRef.current[p.puzzleIndex] || FALLBACK_PUZZLES[0]);
        setUsedIndices(p.usedIndices || []);
        setRound(p.round);
        setTriesLeft(MAX_TRIES);
        setGuess("");
        setGuessResult(null);
        setOpponentResult(null);
        setWrongGuesses([]);
        setOpponentTriesUsed(0);
        setRoundEnded(false);
      }
      if (msg.type === "game-over") {
        setGameOver(true);
      }
      if (msg.type === "play-again") {
        setGameStarted(false);
        setGameOver(false);
      }
    };
    connection.on("data", handler);
    return () => {
      connection.off("data", handler);
    };
  }, [connection]);

  if (!gameStarted) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-5xl">🧩😄</p>
        <h2 className="text-2xl font-bold">Emoji Charades</h2>
        <p className="text-gray-400">Guess what the emoji sequence represents! Both players see the same puzzle and race to guess correctly.</p>
        <div className="text-sm text-gray-500 space-y-1">
          <p>🎯 {MAX_TRIES} tries per round</p>
          <p>⚡ Fewer tries used = more points</p>
          <p>📦 {puzzles.length} puzzles loaded</p>
          <p>🏆 {TOTAL_ROUNDS} rounds total</p>
        </div>
        {isHost ? (
          <button
            onClick={startGame}
            className="px-8 py-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-lg transition-colors"
          >
            Start Game
          </button>
        ) : (
          <p className="text-gray-400 animate-pulse">Waiting for host...</p>
        )}
      </div>
    );
  }

  if (gameOver) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-5xl">{scores.me > scores.them ? "🏆" : scores.me < scores.them ? "😢" : "🤝"}</p>
        <h2 className="text-3xl font-bold">
          {scores.me > scores.them ? "You Win!" : scores.me < scores.them ? "You Lose!" : "It's a Tie!"}
        </h2>
        <div className="flex gap-8">
          <div>
            <p className="text-sm text-gray-400">You</p>
            <p className="text-3xl font-bold text-purple-400">{scores.me}</p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Opponent</p>
            <p className="text-3xl font-bold text-blue-400">{scores.them}</p>
          </div>
        </div>
        <button
          onClick={() => {
            setGameStarted(false);
            setGameOver(false);
            send("play-again", {});
          }}
          className="px-6 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors"
        >
          Play Again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5 w-full max-w-lg mx-auto">
      {/* Score header */}
      <div className="flex items-center gap-8 text-center">
        <div>
          <p className="text-sm text-gray-400">You</p>
          <p className="text-2xl font-bold text-purple-400">{scores.me}</p>
        </div>
        <div className="text-center">
          <p className="text-sm text-gray-500">Round {round}/{TOTAL_ROUNDS}</p>
        </div>
        <div>
          <p className="text-sm text-gray-400">Opponent</p>
          <p className="text-2xl font-bold text-blue-400">{scores.them}</p>
        </div>
      </div>

      {/* Category badge */}
      {currentPuzzle && (
        <div className="px-3 py-1 rounded-full bg-orange-500/20 text-orange-400 text-sm font-medium border border-orange-500/30">
          {currentPuzzle.category}
        </div>
      )}

      {/* Emoji puzzle display */}
      {currentPuzzle && (
        <div className="w-full p-8 rounded-2xl bg-gray-900 border border-gray-800 text-center">
          <p className="text-5xl sm:text-6xl tracking-wider leading-relaxed">{currentPuzzle.emojis}</p>
        </div>
      )}

      {/* Tries indicator */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">Tries left:</span>
        <div className="flex gap-1">
          {Array.from({ length: MAX_TRIES }).map((_, i) => (
            <span
              key={i}
              className={`w-3 h-3 rounded-full ${
                i < triesLeft ? "bg-orange-400" : "bg-gray-700"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Wrong guesses */}
      {wrongGuesses.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center">
          {wrongGuesses.map((g, i) => (
            <span key={i} className="text-xs px-2 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 line-through">
              {g}
            </span>
          ))}
        </div>
      )}

      {/* Guess input */}
      {!roundEnded && (
        <div className="flex gap-2 w-full">
          <input
            type="text"
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            placeholder="Type your guess..."
            className="flex-1 px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-orange-500"
            onKeyDown={(e) => {
              if (e.key === "Enter") submitGuess();
            }}
            autoFocus
          />
          <button
            onClick={submitGuess}
            disabled={!guess.trim()}
            className="px-6 py-3 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold transition-colors"
          >
            Guess
          </button>
        </div>
      )}

      {/* Feedback */}
      {guessResult === "wrong" && !roundEnded && (
        <p className="text-red-400 font-medium animate-pulse">✗ Not quite! Try again...</p>
      )}

      {/* Round ended display */}
      {roundEnded && currentPuzzle && (
        <div className="w-full text-center space-y-3 p-5 rounded-xl bg-gray-900 border border-gray-800">
          <p className={`text-2xl font-bold ${guessResult === "correct" ? "text-green-400" : "text-red-400"}`}>
            {guessResult === "correct" ? "🎉 Correct!" : "😢 Out of tries!"}
          </p>
          <p className="text-gray-300">
            Answer: <span className="font-bold text-white capitalize">{currentPuzzle.answer}</span>
          </p>
          {guessResult === "correct" && (
            <p className="text-sm text-green-400/70">+{triesLeft} points (tries remaining as bonus)</p>
          )}

          {/* Opponent status */}
          {opponentResult && (
            <div className="pt-2 border-t border-gray-800 mt-2">
              <p className="text-sm text-gray-400">
                Opponent: {opponentResult === "correct"
                  ? `✓ Got it in ${opponentTriesUsed} ${opponentTriesUsed === 1 ? "try" : "tries"}`
                  : "✗ Didn't get it"}
              </p>
            </div>
          )}

          {/* Next round controls */}
          <div className="pt-2">
            {isHost ? (
              <button
                onClick={nextRound}
                className="px-6 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-medium text-sm"
              >
                {round >= TOTAL_ROUNDS ? "See Results" : "Next Round →"}
              </button>
            ) : (
              <p className="text-xs text-gray-500 animate-pulse">Next round starting soon...</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
