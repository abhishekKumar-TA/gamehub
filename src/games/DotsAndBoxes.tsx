'use client';

import { useCallback, useEffect, useState } from 'react';
import { DataConnection } from 'peerjs';
import { PeerMessage } from '@/types';

interface Props {
  connection: DataConnection;
  isHost: boolean;
}

const GRID_SIZE = 5;

function getBoxes(lines: Set<string>, r: number, c: number): boolean {
  const top = `${r},${c}-${r},${c + 1}`;
  const bottom = `${r + 1},${c}-${r + 1},${c + 1}`;
  const left = `${r},${c}-${r + 1},${c}`;
  const right = `${r},${c + 1}-${r + 1},${c + 1}`;
  return lines.has(top) && lines.has(bottom) && lines.has(left) && lines.has(right);
}

export default function DotsAndBoxes({ connection, isHost }: Props) {
  const [lines, setLines] = useState<Set<string>>(new Set());
  const [boxOwners, setBoxOwners] = useState<Map<string, 'me' | 'them'>>(new Map());
  const [myTurn, setMyTurn] = useState(isHost);
  const [scores, setScores] = useState({ me: 0, them: 0 });
  const [hoveredLine, setHoveredLine] = useState<string | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);

  const totalBoxes = (GRID_SIZE - 1) * (GRID_SIZE - 1);

  const send = useCallback(
    (type: string, payload: unknown = {}) => {
      const msg: PeerMessage = { type, payload };
      connection.send(msg);
    },
    [connection],
  );

  const checkBoxes = useCallback(
    (newLines: Set<string>, player: 'me' | 'them') => {
      let completed = 0;
      const newOwners = new Map(boxOwners);

      for (let r = 0; r < GRID_SIZE - 1; r++) {
        for (let c = 0; c < GRID_SIZE - 1; c++) {
          const key = `${r},${c}`;
          if (!newOwners.has(key) && getBoxes(newLines, r, c)) {
            newOwners.set(key, player);
            completed++;
          }
        }
      }

      if (completed > 0) {
        setBoxOwners(newOwners);
        setScores((prev) => ({
          ...prev,
          [player]: prev[player] + completed,
        }));
        return true; // Extra turn
      }
      return false;
    },
    [boxOwners],
  );

  const placeLine = useCallback(
    (key: string) => {
      if (!myTurn || lines.has(key) || gameOver) return;

      const newLines = new Set(lines);
      newLines.add(key);
      setLines(newLines);
      send('line', { key });

      const extraTurn = checkBoxes(newLines, 'me');
      if (!extraTurn) {
        setMyTurn(false);
      }

      // Check game over
      if (scores.me + scores.them + (extraTurn ? 1 : 0) >= totalBoxes) {
        setGameOver(true);
      }
    },
    [myTurn, lines, gameOver, send, checkBoxes, scores, totalBoxes],
  );

  useEffect(() => {
    const handler = (data: unknown) => {
      const msg = data as PeerMessage;
      if (msg.type === 'line') {
        const p = msg.payload as { key: string };
        setLines((prev) => {
          const newLines = new Set(prev);
          newLines.add(p.key);

          // Check if they completed a box
          setTimeout(() => {
            const extraTurn = checkBoxes(newLines, 'them');
            if (!extraTurn) {
              setMyTurn(true);
            }
          }, 0);

          return newLines;
        });
      }
      if (msg.type === 'start') {
        setGameStarted(true);
      }
      if (msg.type === 'play-again') {
        resetGame();
      }
    };
    connection.on('data', handler);
    return () => {
      connection.off('data', handler);
    };
  }, [connection, checkBoxes]);

  useEffect(() => {
    if (scores.me + scores.them >= totalBoxes) {
      setGameOver(true);
    }
  }, [scores, totalBoxes]);

  const resetGame = () => {
    setLines(new Set());
    setBoxOwners(new Map());
    setMyTurn(isHost);
    setScores({ me: 0, them: 0 });
    setGameOver(false);
    setGameStarted(true);
  };

  if (!gameStarted) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-5xl">📦</p>
        <h2 className="text-2xl font-bold">Dots & Boxes</h2>
        <p className="text-gray-400">Take turns drawing lines. Complete a box to score and get an extra turn!</p>
        {isHost ? (
          <button
            onClick={() => {
              setGameStarted(true);
              send('start', {});
            }}
            className="px-8 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-lg transition-colors"
          >
            Start Game
          </button>
        ) : (
          <p className="text-gray-400 animate-pulse">Waiting for host...</p>
        )}
      </div>
    );
  }

  const cellSize = 60;
  const dotSize = 8;
  const svgSize = GRID_SIZE * cellSize;

  const renderLines = () => {
    const elements: React.ReactElement[] = [];

    // Horizontal lines
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE - 1; c++) {
        const key = `${r},${c}-${r},${c + 1}`;
        const placed = lines.has(key);
        const isHovered = hoveredLine === key;
        elements.push(
          <line
            key={key}
            x1={c * cellSize + cellSize / 2}
            y1={r * cellSize + cellSize / 2}
            x2={(c + 1) * cellSize + cellSize / 2}
            y2={r * cellSize + cellSize / 2}
            stroke={placed ? '#a855f7' : isHovered && myTurn ? '#6b21a8' : '#374151'}
            strokeWidth={placed ? 4 : isHovered && myTurn ? 4 : 2}
            strokeLinecap="round"
            className={!placed && myTurn ? 'cursor-pointer' : ''}
            onMouseEnter={() => !placed && setHoveredLine(key)}
            onMouseLeave={() => setHoveredLine(null)}
            onClick={() => placeLine(key)}
          />,
        );
      }
    }

    // Vertical lines
    for (let r = 0; r < GRID_SIZE - 1; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const key = `${r},${c}-${r + 1},${c}`;
        const placed = lines.has(key);
        const isHovered = hoveredLine === key;
        elements.push(
          <line
            key={key}
            x1={c * cellSize + cellSize / 2}
            y1={r * cellSize + cellSize / 2}
            x2={c * cellSize + cellSize / 2}
            y2={(r + 1) * cellSize + cellSize / 2}
            stroke={placed ? '#a855f7' : isHovered && myTurn ? '#6b21a8' : '#374151'}
            strokeWidth={placed ? 4 : isHovered && myTurn ? 4 : 2}
            strokeLinecap="round"
            className={!placed && myTurn ? 'cursor-pointer' : ''}
            onMouseEnter={() => !placed && setHoveredLine(key)}
            onMouseLeave={() => setHoveredLine(null)}
            onClick={() => placeLine(key)}
          />,
        );
      }
    }

    return elements;
  };

  const renderBoxes = () => {
    const elements: React.ReactElement[] = [];
    boxOwners.forEach((owner, key) => {
      const [r, c] = key.split(',').map(Number);
      elements.push(
        <rect
          key={`box-${key}`}
          x={c * cellSize + cellSize / 2 + 2}
          y={r * cellSize + cellSize / 2 + 2}
          width={cellSize - 4}
          height={cellSize - 4}
          fill={owner === 'me' ? 'rgba(168,85,247,0.2)' : 'rgba(59,130,246,0.2)'}
          rx={4}
        />,
      );
    });
    return elements;
  };

  const renderDots = () => {
    const dots: React.ReactElement[] = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        dots.push(
          <circle
            key={`dot-${r}-${c}`}
            cx={c * cellSize + cellSize / 2}
            cy={r * cellSize + cellSize / 2}
            r={dotSize / 2}
            fill="#e5e7eb"
          />,
        );
      }
    }
    return dots;
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex items-center gap-8 text-center">
        <div>
          <p className="text-sm text-gray-400">You</p>
          <p className="text-3xl font-bold text-purple-400">{scores.me}</p>
        </div>
        <div className={`px-4 py-1 rounded-full text-sm font-medium ${myTurn ? 'bg-purple-500/20 text-purple-400' : 'bg-gray-800 text-gray-400'}`}>
          {gameOver ? 'Game Over' : myTurn ? 'Your Turn' : "Opponent's Turn"}
        </div>
        <div>
          <p className="text-sm text-gray-400">Opponent</p>
          <p className="text-3xl font-bold text-blue-400">{scores.them}</p>
        </div>
      </div>

      <svg width={svgSize} height={svgSize} className="select-none">
        {renderBoxes()}
        {renderLines()}
        {renderDots()}
      </svg>

      {gameOver && (
        <div className="text-center space-y-4">
          <p className="text-2xl font-bold">
            {scores.me > scores.them ? '🏆 You Win!' : scores.me < scores.them ? 'You Lose!' : '🤝 Tie!'}
          </p>
          <button
            onClick={() => {
              resetGame();
              send('play-again', {});
            }}
            className="px-6 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors"
          >
            Play Again
          </button>
        </div>
      )}
    </div>
  );
}
