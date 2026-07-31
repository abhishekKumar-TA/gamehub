'use client';

import { useCallback, useEffect, useState } from 'react';
import { DataConnection } from 'peerjs';
import { PeerMessage } from '@/types';

interface Props {
  connection: DataConnection;
  isHost: boolean;
}

interface Piece {
  id: number;
  correctR: number;
  correctC: number;
  currentR: number;
  currentC: number;
  placed: boolean;
}

const GRID = 4;
const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
  '#f43f5e', '#06b6d4', '#84cc16', '#a855f7',
  '#6366f1', '#10b981', '#f59e0b', '#e11d48',
];

function generatePuzzle(): { pieces: Piece[]; colors: string[] } {
  const pieces: Piece[] = [];
  const colors: string[] = [];

  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const id = r * GRID + c;
      pieces.push({ id, correctR: r, correctC: c, currentR: -1, currentC: -1, placed: false });
      // Generate a gradient-ish color based on position
      const h = ((r * GRID + c) / (GRID * GRID)) * 360;
      const s = 60 + Math.random() * 30;
      const l = 40 + Math.random() * 20;
      colors.push(`hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`);
    }
  }

  // Shuffle pieces for the tray
  for (let i = pieces.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }

  return { pieces, colors };
}

export default function JigsawTogether({ connection, isHost }: Props) {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [startTime, setStartTime] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [piecesPlaced, setPiecesPlaced] = useState(0);

  const send = useCallback(
    (type: string, payload: unknown = {}) => {
      const msg: PeerMessage = { type, payload };
      connection.send(msg);
    },
    [connection],
  );

  const startGame = useCallback(() => {
    const { pieces: p, colors: c } = generatePuzzle();
    setPieces(p);
    setColors(c);
    setGameStarted(true);
    setGameOver(false);
    setStartTime(Date.now());
    setPiecesPlaced(0);
    send('start', { pieces: p, colors: c });
  }, [send]);

  const handleCellClick = useCallback(
    (r: number, c: number) => {
      if (gameOver) return;

      // Check if a piece is already placed here
      const existingPiece = pieces.find((p) => p.placed && p.currentR === r && p.currentC === c);
      if (existingPiece) return;

      if (selected !== null) {
        const piece = pieces.find((p) => p.id === selected);
        if (!piece) return;

        // Check if correct position
        if (piece.correctR === r && piece.correctC === c) {
          const newPieces = pieces.map((p) =>
            p.id === selected ? { ...p, currentR: r, currentC: c, placed: true } : p,
          );
          setPieces(newPieces);
          setSelected(null);
          setPiecesPlaced((prev) => prev + 1);
          send('place', { pieceId: selected, r, c });

          // Check win
          if (newPieces.every((p) => p.placed)) {
            setGameOver(true);
            send('complete', { time: Date.now() - startTime });
          }
        } else {
          // Wrong position - shake feedback
          setSelected(null);
        }
      }
    },
    [selected, pieces, gameOver, startTime, send],
  );

  const handlePieceSelect = (id: number) => {
    if (gameOver) return;
    const piece = pieces.find((p) => p.id === id);
    if (piece?.placed) return;
    setSelected(selected === id ? null : id);
  };

  // Timer
  useEffect(() => {
    if (!gameStarted || gameOver) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [gameStarted, gameOver, startTime]);

  useEffect(() => {
    const handler = (data: unknown) => {
      const msg = data as PeerMessage;
      if (msg.type === 'start') {
        const p = msg.payload as { pieces: Piece[]; colors: string[] };
        setPieces(p.pieces);
        setColors(p.colors);
        setGameStarted(true);
        setGameOver(false);
        setStartTime(Date.now());
        setPiecesPlaced(0);
      }
      if (msg.type === 'place') {
        const p = msg.payload as { pieceId: number; r: number; c: number };
        setPieces((prev) =>
          prev.map((piece) =>
            piece.id === p.pieceId ? { ...piece, currentR: p.r, currentC: p.c, placed: true } : piece,
          ),
        );
        setPiecesPlaced((prev) => prev + 1);
      }
      if (msg.type === 'complete') {
        setGameOver(true);
      }
      if (msg.type === 'play-again') {
        setGameStarted(false);
        setGameOver(false);
      }
    };
    connection.on('data', handler);
    return () => {
      connection.off('data', handler);
    };
  }, [connection]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  if (!gameStarted) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-5xl">🧩</p>
        <h2 className="text-2xl font-bold">Jigsaw Together</h2>
        <p className="text-gray-400">Work together to place all pieces in the correct position! Select a piece from the tray, then click the correct cell on the board.</p>
        {isHost ? (
          <button
            onClick={startGame}
            className="px-8 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-lg transition-colors"
          >
            Start Puzzle
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
        <p className="text-5xl">🎉</p>
        <h2 className="text-3xl font-bold">Puzzle Complete!</h2>
        <p className="text-xl text-gray-300">Time: <span className="text-sky-400 font-bold">{formatTime(elapsed)}</span></p>
        <p className="text-gray-400">Great teamwork!</p>

        {/* Show completed puzzle */}
        <div
          className="grid gap-1 rounded-xl overflow-hidden"
          style={{ gridTemplateColumns: `repeat(${GRID}, 60px)` }}
        >
          {Array.from({ length: GRID * GRID }).map((_, i) => {
            const r = Math.floor(i / GRID);
            const c = i % GRID;
            const pieceId = r * GRID + c;
            return (
              <div
                key={i}
                className="w-[60px] h-[60px] rounded-md"
                style={{ backgroundColor: colors[pieceId] }}
              />
            );
          })}
        </div>

        <button
          onClick={() => {
            setGameStarted(false);
            setGameOver(false);
            send('play-again', {});
          }}
          className="px-6 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors"
        >
          Play Again
        </button>
      </div>
    );
  }

  const unplacedPieces = pieces.filter((p) => !p.placed);
  const totalPieces = GRID * GRID;

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      <div className="flex items-center gap-6 text-center">
        <div className="text-sm text-gray-400">
          ⏱️ {formatTime(elapsed)}
        </div>
        <div className="text-sm text-gray-400">
          🧩 {piecesPlaced}/{totalPieces}
        </div>
      </div>

      <p className="text-xs text-gray-500">Select a piece below, then click the matching cell on the board</p>

      {/* Board */}
      <div
        className="grid gap-1 p-2 rounded-2xl bg-gray-900 border border-gray-800"
        style={{ gridTemplateColumns: `repeat(${GRID}, 60px)` }}
      >
        {Array.from({ length: GRID * GRID }).map((_, i) => {
          const r = Math.floor(i / GRID);
          const c = i % GRID;
          const placedPiece = pieces.find((p) => p.placed && p.currentR === r && p.currentC === c);

          return (
            <div
              key={i}
              onClick={() => handleCellClick(r, c)}
              className={`w-[60px] h-[60px] rounded-md border-2 flex items-center justify-center cursor-pointer transition-all ${
                placedPiece
                  ? 'border-transparent'
                  : selected !== null
                  ? 'border-dashed border-sky-500/50 hover:border-sky-400'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
              style={placedPiece ? { backgroundColor: colors[placedPiece.id] } : { backgroundColor: '#1f2937' }}
            >
              {!placedPiece && (
                <span className="text-xs text-gray-600">{r},{c}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Piece Tray */}
      <div className="w-full">
        <p className="text-xs text-gray-500 mb-2">Pieces ({unplacedPieces.length} remaining):</p>
        <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-gray-900 border border-gray-800 min-h-[80px]">
          {unplacedPieces.map((piece) => (
            <button
              key={piece.id}
              onClick={() => handlePieceSelect(piece.id)}
              className={`w-[50px] h-[50px] rounded-lg transition-all ${
                selected === piece.id
                  ? 'ring-2 ring-sky-400 scale-110'
                  : 'hover:scale-105'
              }`}
              style={{ backgroundColor: colors[piece.id] }}
              title={`Piece for position (${piece.correctR},${piece.correctC})`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
