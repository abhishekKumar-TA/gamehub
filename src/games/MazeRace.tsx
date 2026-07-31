'use client';

import { useCallback, useEffect, useState } from 'react';
import { DataConnection } from 'peerjs';
import { PeerMessage } from '@/types';

interface Props {
  connection: DataConnection;
  isHost: boolean;
}

type Cell = 0 | 1; // 0 = path, 1 = wall
type Position = { r: number; c: number };

const SIZE = 15;

function generateMaze(seed: number): Cell[][] {
  const rng = (function(s: number) {
    let state = s;
    return () => {
      state = (state * 1664525 + 1013904223) & 0xffffffff;
      return (state >>> 0) / 0xffffffff;
    };
  })(seed);

  const maze: Cell[][] = Array.from({ length: SIZE }, () => Array(SIZE).fill(1) as Cell[]);

  function carve(r: number, c: number) {
    maze[r][c] = 0;
    const dirs = [
      [0, 2], [0, -2], [2, 0], [-2, 0],
    ].sort(() => rng() - 0.5);

    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && maze[nr][nc] === 1) {
        maze[r + dr / 2][c + dc / 2] = 0;
        carve(nr, nc);
      }
    }
  }

  carve(1, 1);
  maze[1][0] = 0; // Entrance
  maze[SIZE - 2][SIZE - 1] = 0; // Exit
  return maze;
}

export default function MazeRace({ connection, isHost }: Props) {
  const [maze, setMaze] = useState<Cell[][]>([]);
  const [myPos, setMyPos] = useState<Position>({ r: 1, c: 0 });
  const [opponentPos, setOpponentPos] = useState<Position>({ r: 1, c: 0 });
  const [gameStarted, setGameStarted] = useState(false);
  const [winner, setWinner] = useState<'me' | 'them' | null>(null);
  const [countdown, setCountdown] = useState(0);

  const send = useCallback(
    (type: string, payload: unknown = {}) => {
      const msg: PeerMessage = { type, payload };
      connection.send(msg);
    },
    [connection],
  );

  const startGame = useCallback(() => {
    const seed = Math.floor(Math.random() * 100000);
    const m = generateMaze(seed);
    setMaze(m);
    setMyPos({ r: 1, c: 0 });
    setOpponentPos({ r: 1, c: 0 });
    setWinner(null);
    send('start', { seed });

    let c = 3;
    setCountdown(c);
    const interval = setInterval(() => {
      c--;
      setCountdown(c);
      if (c <= 0) {
        clearInterval(interval);
        setGameStarted(true);
      }
    }, 1000);
  }, [send]);

  const move = useCallback(
    (dr: number, dc: number) => {
      if (!gameStarted || winner) return;

      setMyPos((prev) => {
        const nr = prev.r + dr;
        const nc = prev.c + dc;
        if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) {
          // Check if at exit
          if (nr === SIZE - 2 && nc === SIZE) {
            setWinner('me');
            send('win', {});
            return prev;
          }
          return prev;
        }
        if (maze[nr][nc] === 1) return prev;

        const newPos = { r: nr, c: nc };
        send('move', newPos);

        // Check exit
        if (nr === SIZE - 2 && nc === SIZE - 1) {
          setWinner('me');
          send('win', {});
        }

        return newPos;
      });
    },
    [gameStarted, winner, maze, send],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp': case 'w': move(-1, 0); break;
        case 'ArrowDown': case 's': move(1, 0); break;
        case 'ArrowLeft': case 'a': move(0, -1); break;
        case 'ArrowRight': case 'd': move(0, 1); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [move]);

  useEffect(() => {
    const handler = (data: unknown) => {
      const msg = data as PeerMessage;
      if (msg.type === 'start') {
        const p = msg.payload as { seed: number };
        setMaze(generateMaze(p.seed));
        setMyPos({ r: 1, c: 0 });
        setOpponentPos({ r: 1, c: 0 });
        setWinner(null);

        let c = 3;
        setCountdown(c);
        const interval = setInterval(() => {
          c--;
          setCountdown(c);
          if (c <= 0) {
            clearInterval(interval);
            setGameStarted(true);
          }
        }, 1000);
      }
      if (msg.type === 'move') {
        setOpponentPos(msg.payload as Position);
      }
      if (msg.type === 'win') {
        setWinner('them');
      }
      if (msg.type === 'play-again') {
        setGameStarted(false);
        setWinner(null);
        setCountdown(0);
      }
    };
    connection.on('data', handler);
    return () => {
      connection.off('data', handler);
    };
  }, [connection]);

  if (!gameStarted && countdown <= 0) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-5xl">🏁</p>
        <h2 className="text-2xl font-bold">Maze Race</h2>
        <p className="text-gray-400">Navigate the maze with arrow keys or WASD. First to reach the exit wins!</p>
        {isHost ? (
          <button
            onClick={startGame}
            className="px-8 py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-lg transition-colors"
          >
            Generate Maze
          </button>
        ) : (
          <p className="text-gray-400 animate-pulse">Waiting for host...</p>
        )}
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

  const cellSize = Math.min(28, Math.floor(500 / SIZE));

  return (
    <div className="flex flex-col items-center gap-6">
      {winner && (
        <div className="text-center space-y-4">
          <p className="text-5xl">{winner === 'me' ? '🏆' : '😢'}</p>
          <p className="text-2xl font-bold">{winner === 'me' ? 'You Win!' : 'They Won!'}</p>
          {isHost && (
            <button
              onClick={() => {
                setGameStarted(false);
                setWinner(null);
                setCountdown(0);
                send('play-again', {});
              }}
              className="px-6 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors"
            >
              Race Again
            </button>
          )}
        </div>
      )}

      <div className="text-sm text-gray-500">Use arrow keys or WASD to move</div>

      {/* Mobile controls */}
      <div className="flex flex-col items-center gap-1 sm:hidden">
        <button onClick={() => move(-1, 0)} className="w-12 h-12 rounded-lg bg-gray-800 text-xl active:bg-gray-700">↑</button>
        <div className="flex gap-1">
          <button onClick={() => move(0, -1)} className="w-12 h-12 rounded-lg bg-gray-800 text-xl active:bg-gray-700">←</button>
          <button onClick={() => move(1, 0)} className="w-12 h-12 rounded-lg bg-gray-800 text-xl active:bg-gray-700">↓</button>
          <button onClick={() => move(0, 1)} className="w-12 h-12 rounded-lg bg-gray-800 text-xl active:bg-gray-700">→</button>
        </div>
      </div>

      {/* Maze Grid */}
      <div
        className="border border-gray-700 rounded-lg overflow-hidden"
        style={{ display: 'grid', gridTemplateColumns: `repeat(${SIZE}, ${cellSize}px)` }}
      >
        {maze.map((row, r) =>
          row.map((cell, c) => {
            const isMe = myPos.r === r && myPos.c === c;
            const isOpponent = opponentPos.r === r && opponentPos.c === c;
            const isExit = r === SIZE - 2 && c === SIZE - 1;
            const isEntrance = r === 1 && c === 0;

            return (
              <div
                key={`${r}-${c}`}
                style={{ width: cellSize, height: cellSize }}
                className={`flex items-center justify-center text-xs ${
                  cell === 1
                    ? 'bg-gray-800'
                    : isExit
                    ? 'bg-green-900/50'
                    : isEntrance
                    ? 'bg-blue-900/50'
                    : 'bg-gray-950'
                }`}
              >
                {isMe && isOpponent ? (
                  <span className="text-xs">👥</span>
                ) : isMe ? (
                  <span className="w-3 h-3 rounded-full bg-purple-500" />
                ) : isOpponent ? (
                  <span className="w-3 h-3 rounded-full bg-blue-500" />
                ) : isExit ? (
                  <span className="text-xs">🏁</span>
                ) : isEntrance ? (
                  <span className="text-xs">🚪</span>
                ) : null}
              </div>
            );
          }),
        )}
      </div>

      <div className="flex gap-4 text-sm">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-purple-500 inline-block" /> You
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Opponent
        </span>
      </div>
    </div>
  );
}
