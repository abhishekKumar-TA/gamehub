"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DataConnection } from "peerjs";
import { PeerMessage } from "@/types";

interface Props {
  connection: DataConnection;
  isHost: boolean;
}

type Cell = 0 | 1;
type Position = { r: number; c: number };

const DIFFICULTIES = [
  { label: "Easy", size: 11, emoji: "🟢" },
  { label: "Medium", size: 17, emoji: "🟡" },
  { label: "Hard", size: 23, emoji: "🟠" },
  { label: "Extreme", size: 31, emoji: "🔴" },
];

function generateMaze(seed: number, size: number): Cell[][] {
  const rng = (function (s: number) {
    let state = s;
    return () => {
      state = (state * 1664525 + 1013904223) & 0xffffffff;
      return (state >>> 0) / 0xffffffff;
    };
  })(seed);

  const maze: Cell[][] = Array.from({ length: size }, () =>
    Array(size).fill(1) as Cell[],
  );

  // Recursive backtracking with stack (avoids stack overflow for large mazes)
  const stack: [number, number][] = [];
  const start: [number, number] = [1, 1];
  maze[1][1] = 0;
  stack.push(start);

  while (stack.length > 0) {
    const [r, c] = stack[stack.length - 1];
    const dirs = [
      [0, 2],
      [0, -2],
      [2, 0],
      [-2, 0],
    ].filter(([dr, dc]) => {
      const nr = r + dr;
      const nc = c + dc;
      return nr > 0 && nr < size - 1 && nc > 0 && nc < size - 1 && maze[nr][nc] === 1;
    });

    if (dirs.length === 0) {
      stack.pop();
      continue;
    }

    // Shuffle and pick one
    const idx = Math.floor(rng() * dirs.length);
    const [dr, dc] = dirs[idx];
    const nr = r + dr;
    const nc = c + dc;
    maze[r + dr / 2][c + dc / 2] = 0;
    maze[nr][nc] = 0;
    stack.push([nr, nc]);
  }

  // Add some extra paths for larger mazes (make multiple solutions)
  if (size >= 17) {
    const extraPaths = Math.floor(size * size * 0.02);
    for (let i = 0; i < extraPaths; i++) {
      const r = 2 + Math.floor(rng() * (size - 4));
      const c = 2 + Math.floor(rng() * (size - 4));
      if (maze[r][c] === 1) {
        // Check if removing this wall connects two paths
        const neighbors = [
          [r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1],
        ].filter(([nr, nc]) => nr >= 0 && nr < size && nc >= 0 && nc < size && maze[nr][nc] === 0);
        if (neighbors.length >= 2) {
          maze[r][c] = 0;
        }
      }
    }
  }

  maze[1][0] = 0; // Entrance
  maze[size - 2][size - 1] = 0; // Exit
  return maze;
}

export default function MazeRace({ connection, isHost }: Props) {
  const [maze, setMaze] = useState<Cell[][]>([]);
  const [mazeSize, setMazeSize] = useState(17);
  const [myPos, setMyPos] = useState<Position>({ r: 1, c: 0 });
  const [opponentPos, setOpponentPos] = useState<Position>({ r: 1, c: 0 });
  const [gameStarted, setGameStarted] = useState(false);
  const [winner, setWinner] = useState<"me" | "them" | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [selectedDifficulty, setSelectedDifficulty] = useState(1);
  const [elapsed, setElapsed] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [myTrail, setMyTrail] = useState<Set<string>>(new Set());
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const send = useCallback(
    (type: string, payload: unknown = {}) => {
      const msg: PeerMessage = { type, payload };
      connection.send(msg);
    },
    [connection],
  );

  const startGame = useCallback(() => {
    const diff = DIFFICULTIES[selectedDifficulty];
    const size = diff.size;
    const seed = Math.floor(Math.random() * 100000);
    const m = generateMaze(seed, size);
    setMaze(m);
    setMazeSize(size);
    setMyPos({ r: 1, c: 0 });
    setOpponentPos({ r: 1, c: 0 });
    setWinner(null);
    setMyTrail(new Set(["1,0"]));
    send("start", { seed, size });

    let c = 3;
    setCountdown(c);
    const interval = setInterval(() => {
      c--;
      setCountdown(c);
      if (c <= 0) {
        clearInterval(interval);
        setGameStarted(true);
        setStartTime(Date.now());
      }
    }, 1000);
  }, [send, selectedDifficulty]);

  const move = useCallback(
    (dr: number, dc: number) => {
      if (!gameStarted || winner) return;

      setMyPos((prev) => {
        const nr = prev.r + dr;
        const nc = prev.c + dc;
        if (nr < 0 || nr >= mazeSize || nc < 0 || nc >= mazeSize) {
          if (nr === mazeSize - 2 && nc === mazeSize) {
            setWinner("me");
            send("win", {});
            return prev;
          }
          return prev;
        }
        if (maze[nr][nc] === 1) return prev;

        const newPos = { r: nr, c: nc };
        send("move", newPos);
        setMyTrail((prev) => new Set([...prev, `${nr},${nc}`]));

        if (nr === mazeSize - 2 && nc === mazeSize - 1) {
          setWinner("me");
          send("win", {});
        }

        return newPos;
      });
    },
    [gameStarted, winner, maze, mazeSize, send],
  );

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowUp": case "w": case "W": e.preventDefault(); move(-1, 0); break;
        case "ArrowDown": case "s": case "S": e.preventDefault(); move(1, 0); break;
        case "ArrowLeft": case "a": case "A": e.preventDefault(); move(0, -1); break;
        case "ArrowRight": case "d": case "D": e.preventDefault(); move(0, 1); break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [move]);

  // Swipe controls
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    const minSwipe = 20;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (Math.abs(dx) > minSwipe) move(0, dx > 0 ? 1 : -1);
    } else {
      if (Math.abs(dy) > minSwipe) move(dy > 0 ? 1 : -1, 0);
    }
    touchStartRef.current = null;
  };

  // Timer
  useEffect(() => {
    if (!gameStarted || winner) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [gameStarted, winner, startTime]);

  useEffect(() => {
    const handler = (data: unknown) => {
      const msg = data as PeerMessage;
      if (msg.type === "start") {
        const p = msg.payload as { seed: number; size: number };
        const size = p.size || 17;
        setMaze(generateMaze(p.seed, size));
        setMazeSize(size);
        setMyPos({ r: 1, c: 0 });
        setOpponentPos({ r: 1, c: 0 });
        setWinner(null);
        setMyTrail(new Set(["1,0"]));

        let c = 3;
        setCountdown(c);
        const interval = setInterval(() => {
          c--;
          setCountdown(c);
          if (c <= 0) {
            clearInterval(interval);
            setGameStarted(true);
            setStartTime(Date.now());
          }
        }, 1000);
      }
      if (msg.type === "move") {
        setOpponentPos(msg.payload as Position);
      }
      if (msg.type === "win") {
        setWinner("them");
      }
      if (msg.type === "play-again") {
        setGameStarted(false);
        setWinner(null);
        setCountdown(0);
      }
    };
    connection.on("data", handler);
    return () => {
      connection.off("data", handler);
    };
  }, [connection]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  if (!gameStarted && countdown <= 0) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-5xl">🏁</p>
        <h2 className="text-2xl font-bold">Maze Race</h2>
        <p className="text-gray-400">Navigate the maze to the exit. First to reach 🏁 wins!</p>
        {isHost ? (
          <>
            <div className="flex flex-col gap-3 items-center">
              <p className="text-sm text-gray-500">Choose difficulty:</p>
              <div className="flex gap-2 flex-wrap justify-center">
                {DIFFICULTIES.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedDifficulty(i)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                      selectedDifficulty === i
                        ? "bg-teal-600 text-white shadow-lg shadow-teal-500/20"
                        : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                    }`}
                  >
                    <span>{d.emoji}</span>
                    <span>{d.label}</span>
                    <span className="text-xs opacity-60">({d.size}×{d.size})</span>
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={startGame}
              className="px-8 py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-lg transition-colors shadow-lg shadow-teal-500/20"
            >
              Generate Maze
            </button>
          </>
        ) : (
          <p className="text-gray-400 animate-pulse">Waiting for host to choose difficulty...</p>
        )}
        <div className="text-xs text-gray-600 space-y-1">
          <p>⌨️ Arrow keys or WASD to move</p>
          <p>📱 Swipe on maze to move on mobile</p>
        </div>
      </div>
    );
  }

  if (countdown > 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4">
        <p className="text-8xl font-bold text-teal-400 animate-bounce">{countdown}</p>
        <p className="text-gray-400">Get ready to race!</p>
      </div>
    );
  }

  const cellSize = Math.min(20, Math.floor(550 / mazeSize));

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Header stats */}
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-purple-500 shadow-md shadow-purple-500/50" />
          <span className="text-gray-400">You</span>
        </div>
        <div className="text-gray-600">⏱️ {formatTime(elapsed)}</div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-blue-500 shadow-md shadow-blue-500/50" />
          <span className="text-gray-400">Opponent</span>
        </div>
      </div>

      {winner && (
        <div className="text-center space-y-3 p-4 rounded-xl bg-gray-900/80 border border-gray-700">
          <p className="text-4xl">{winner === "me" ? "🏆" : "😢"}</p>
          <p className="text-xl font-bold">{winner === "me" ? "You Win!" : "They Won!"}</p>
          <p className="text-sm text-gray-400">Time: {formatTime(elapsed)}</p>
          {isHost && (
            <button
              onClick={() => {
                setGameStarted(false);
                setWinner(null);
                setCountdown(0);
                send("play-again", {});
              }}
              className="px-6 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-medium transition-colors"
            >
              Race Again
            </button>
          )}
        </div>
      )}

      {/* Maze Grid */}
      <div
        className="rounded-xl overflow-hidden shadow-2xl shadow-teal-500/10 border border-gray-700"
        style={{ display: "grid", gridTemplateColumns: `repeat(${mazeSize}, ${cellSize}px)` }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {maze.map((row, r) =>
          row.map((cell, c) => {
            const isMe = myPos.r === r && myPos.c === c;
            const isOpponent = opponentPos.r === r && opponentPos.c === c;
            const isExit = r === mazeSize - 2 && c === mazeSize - 1;
            const isEntrance = r === 1 && c === 0;
            const isOnTrail = myTrail.has(`${r},${c}`);

            let bgClass = "";
            if (cell === 1) {
              bgClass = "bg-gray-800";
            } else if (isExit) {
              bgClass = "bg-green-900/60";
            } else if (isEntrance) {
              bgClass = "bg-teal-900/40";
            } else if (isOnTrail) {
              bgClass = "bg-purple-900/20";
            } else {
              bgClass = "bg-gray-950";
            }

            return (
              <div
                key={`${r}-${c}`}
                style={{ width: cellSize, height: cellSize }}
                className={`flex items-center justify-center ${bgClass} ${
                  cell === 1 ? "border-b border-r border-gray-700/30" : ""
                }`}
              >
                {isMe && isOpponent ? (
                  <span style={{ fontSize: cellSize * 0.6 }}>👥</span>
                ) : isMe ? (
                  <span
                    className="rounded-full bg-purple-500 shadow-lg shadow-purple-500/60 animate-pulse"
                    style={{ width: cellSize * 0.6, height: cellSize * 0.6 }}
                  />
                ) : isOpponent ? (
                  <span
                    className="rounded-full bg-blue-500 shadow-lg shadow-blue-500/60"
                    style={{ width: cellSize * 0.5, height: cellSize * 0.5 }}
                  />
                ) : isExit ? (
                  <span style={{ fontSize: cellSize * 0.7 }}>🏁</span>
                ) : isEntrance ? (
                  <span style={{ fontSize: cellSize * 0.6 }}>🚪</span>
                ) : null}
              </div>
            );
          }),
        )}
      </div>

      {/* Mobile D-pad controls */}
      <div className="flex flex-col items-center gap-1 sm:hidden">
        <button onClick={() => move(-1, 0)} className="w-14 h-14 rounded-xl bg-gray-800 border border-gray-700 text-xl active:bg-teal-900 active:border-teal-600 transition-colors font-bold">↑</button>
        <div className="flex gap-1">
          <button onClick={() => move(0, -1)} className="w-14 h-14 rounded-xl bg-gray-800 border border-gray-700 text-xl active:bg-teal-900 active:border-teal-600 transition-colors font-bold">←</button>
          <button onClick={() => move(1, 0)} className="w-14 h-14 rounded-xl bg-gray-800 border border-gray-700 text-xl active:bg-teal-900 active:border-teal-600 transition-colors font-bold">↓</button>
          <button onClick={() => move(0, 1)} className="w-14 h-14 rounded-xl bg-gray-800 border border-gray-700 text-xl active:bg-teal-900 active:border-teal-600 transition-colors font-bold">→</button>
        </div>
      </div>

      <p className="text-xs text-gray-600 hidden sm:block">Arrow keys / WASD to move</p>
    </div>
  );
}
