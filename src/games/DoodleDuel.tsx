'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DataConnection } from 'peerjs';
import { PeerMessage } from '@/types';

interface Props {
  connection: DataConnection;
  isHost: boolean;
}

const WORDS = [
  'Sun', 'House', 'Cat', 'Tree', 'Car', 'Fish', 'Star', 'Moon',
  'Flower', 'Bird', 'Cloud', 'Heart', 'Rainbow', 'Pizza', 'Guitar',
  'Rocket', 'Crown', 'Cake', 'Key', 'Boat', 'Mountain', 'Fire',
];

const TOTAL_ROUNDS = 4;

export default function DoodleDuel({ connection, isHost }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [word, setWord] = useState('');
  const [round, setRound] = useState(1);
  const [phase, setPhase] = useState<'idle' | 'drawing' | 'guessing' | 'result' | 'gameover'>('idle');
  const [guess, setGuess] = useState('');
  const [opponentDrawing, setOpponentDrawing] = useState<string>('');
  const [myDrawingDone, setMyDrawingDone] = useState(false);
  const [opponentDrawingDone, setOpponentDrawingDone] = useState(false);
  const [guessResult, setGuessResult] = useState<string>('');
  const [scores, setScores] = useState({ me: 0, them: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#ffffff');
  const [brushSize, setBrushSize] = useState(3);
  const [timeLeft, setTimeLeft] = useState(30);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [usedWords, setUsedWords] = useState<Set<string>>(new Set());

  const send = useCallback(
    (type: string, payload: unknown = {}) => {
      const msg: PeerMessage = { type, payload };
      connection.send(msg);
    },
    [connection],
  );

  const getRandomWord = useCallback(() => {
    const available = WORDS.filter((w) => !usedWords.has(w));
    const w = available.length > 0 ? available[Math.floor(Math.random() * available.length)] : WORDS[Math.floor(Math.random() * WORDS.length)];
    setUsedWords((prev) => new Set([...prev, w]));
    return w;
  }, [usedWords]);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const startGame = useCallback(() => {
    const w = getRandomWord();
    setWord(w);
    setRound(1);
    setPhase('drawing');
    setScores({ me: 0, them: 0 });
    setMyDrawingDone(false);
    setOpponentDrawingDone(false);
    setOpponentDrawing('');
    setGuess('');
    setGuessResult('');
    setTimeLeft(30);
    send('start', { word: w });
    setTimeout(clearCanvas, 100);
  }, [send, getRandomWord]);

  const getCanvasPoint = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const drawLine = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (phase !== 'drawing' || myDrawingDone) return;
    e.preventDefault();
    setIsDrawing(true);
    lastPoint.current = getCanvasPoint(e);
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || phase !== 'drawing' || myDrawingDone) return;
    e.preventDefault();
    const point = getCanvasPoint(e);
    if (point && lastPoint.current) {
      drawLine(lastPoint.current, point);
      lastPoint.current = point;
    }
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
    lastPoint.current = null;
  };

  const submitDrawing = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png', 0.5);
    setMyDrawingDone(true);
    send('drawing', { image: dataUrl, word });
  };

  const submitGuess = () => {
    if (!guess.trim()) return;
    const correct = guess.trim().toLowerCase() === word.toLowerCase();
    setGuessResult(correct ? 'correct' : 'wrong');
    send('guess-result', { correct });
    if (correct) {
      setScores((prev) => ({ ...prev, me: prev.me + 1 }));
    }
  };

  // Timer for drawing phase
  useEffect(() => {
    if (phase !== 'drawing' || myDrawingDone) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          submitDrawing();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, myDrawingDone]);

  // When both drawings are done, move to guessing
  useEffect(() => {
    if (myDrawingDone && opponentDrawingDone && phase === 'drawing') {
      setPhase('guessing');
    }
  }, [myDrawingDone, opponentDrawingDone, phase]);

  const nextRound = useCallback(() => {
    if (round >= TOTAL_ROUNDS) {
      setPhase('gameover');
      return;
    }
    const w = getRandomWord();
    setWord(w);
    setRound((r) => r + 1);
    setPhase('drawing');
    setMyDrawingDone(false);
    setOpponentDrawingDone(false);
    setOpponentDrawing('');
    setGuess('');
    setGuessResult('');
    setTimeLeft(30);
    send('next-round', { word: w, round: round + 1 });
    setTimeout(clearCanvas, 100);
  }, [round, send, getRandomWord]);

  useEffect(() => {
    const handler = (data: unknown) => {
      const msg = data as PeerMessage;
      if (msg.type === 'start') {
        const p = msg.payload as { word: string };
        setWord(p.word);
        setRound(1);
        setPhase('drawing');
        setScores({ me: 0, them: 0 });
        setMyDrawingDone(false);
        setOpponentDrawingDone(false);
        setOpponentDrawing('');
        setGuess('');
        setGuessResult('');
        setTimeLeft(30);
        setTimeout(clearCanvas, 100);
      }
      if (msg.type === 'drawing') {
        const p = msg.payload as { image: string; word: string };
        setOpponentDrawing(p.image);
        setOpponentDrawingDone(true);
        setWord(p.word); // Now we know what they drew
      }
      if (msg.type === 'guess-result') {
        const p = msg.payload as { correct: boolean };
        if (p.correct) {
          setScores((prev) => ({ ...prev, them: prev.them + 1 }));
        }
        setPhase('result');
      }
      if (msg.type === 'next-round') {
        const p = msg.payload as { word: string; round: number };
        setWord(p.word);
        setRound(p.round);
        setPhase('drawing');
        setMyDrawingDone(false);
        setOpponentDrawingDone(false);
        setOpponentDrawing('');
        setGuess('');
        setGuessResult('');
        setTimeLeft(30);
        setTimeout(clearCanvas, 100);
      }
      if (msg.type === 'play-again') {
        setPhase('idle');
      }
    };
    connection.on('data', handler);
    return () => {
      connection.off('data', handler);
    };
  }, [connection]);

  if (phase === 'idle') {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-5xl">✏️</p>
        <h2 className="text-2xl font-bold">Doodle Duel</h2>
        <p className="text-gray-400">Both draw the same word, then guess each other&apos;s drawings!</p>
        {isHost ? (
          <button
            onClick={startGame}
            className="px-8 py-3 rounded-xl bg-lime-600 hover:bg-lime-500 text-white font-bold text-lg transition-colors"
          >
            Start Game
          </button>
        ) : (
          <p className="text-gray-400 animate-pulse">Waiting for host...</p>
        )}
      </div>
    );
  }

  if (phase === 'gameover') {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-5xl">{scores.me > scores.them ? '🏆' : scores.me < scores.them ? '😢' : '🤝'}</p>
        <h2 className="text-3xl font-bold">
          {scores.me > scores.them ? 'You Win!' : scores.me < scores.them ? 'You Lose!' : "It's a Tie!"}
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
            setPhase('idle');
            send('play-again', {});
          }}
          className="px-6 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors"
        >
          Play Again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-lg mx-auto">
      <div className="flex items-center gap-8 text-center">
        <div>
          <p className="text-sm text-gray-400">You</p>
          <p className="text-2xl font-bold text-purple-400">{scores.me}</p>
        </div>
        <div className="text-sm text-gray-600">Round {round}/{TOTAL_ROUNDS}</div>
        <div>
          <p className="text-sm text-gray-400">Opponent</p>
          <p className="text-2xl font-bold text-blue-400">{scores.them}</p>
        </div>
      </div>

      {phase === 'drawing' && (
        <>
          <div className="text-center">
            <p className="text-sm text-gray-400">Draw:</p>
            <p className="text-xl font-bold text-white">{word}</p>
            <p className={`text-sm ${timeLeft <= 5 ? 'text-red-400' : 'text-gray-500'}`}>{timeLeft}s</p>
          </div>

          <div className="flex gap-2 items-center">
            {['#ffffff', '#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7'].map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full border-2 ${color === c ? 'border-white' : 'border-gray-600'}`}
                style={{ backgroundColor: c }}
              />
            ))}
            <input
              type="range"
              min="1"
              max="10"
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-20"
            />
          </div>

          <canvas
            ref={canvasRef}
            width={400}
            height={400}
            className="rounded-xl border border-gray-700 cursor-crosshair bg-gray-900 w-full max-w-[400px] aspect-square touch-none"
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
          />

          <div className="flex gap-2">
            <button onClick={clearCanvas} className="px-4 py-2 rounded-lg bg-gray-800 text-sm">Clear</button>
            {!myDrawingDone && (
              <button
                onClick={submitDrawing}
                className="px-6 py-2 rounded-lg bg-lime-600 hover:bg-lime-500 text-white font-medium"
              >
                Done ✓
              </button>
            )}
          </div>

          {myDrawingDone && !opponentDrawingDone && (
            <p className="text-gray-400 animate-pulse">Waiting for opponent to finish drawing...</p>
          )}
        </>
      )}

      {phase === 'guessing' && (
        <div className="w-full space-y-4">
          <p className="text-center text-gray-400">Guess what they drew:</p>
          {opponentDrawing && (
            <img src={opponentDrawing} alt="Opponent drawing" className="w-full max-w-[400px] mx-auto rounded-xl border border-gray-700" />
          )}
          {!guessResult && (
            <div className="flex gap-2">
              <input
                type="text"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                placeholder="What is it?"
                className="flex-1 px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-lime-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitGuess();
                }}
                autoFocus
              />
              <button
                onClick={submitGuess}
                className="px-6 py-3 rounded-xl bg-lime-600 hover:bg-lime-500 text-white font-bold"
              >
                Guess
              </button>
            </div>
          )}
          {guessResult && (
            <p className={`text-center text-xl font-bold ${guessResult === 'correct' ? 'text-green-400' : 'text-red-400'}`}>
              {guessResult === 'correct' ? '🎉 Correct!' : `❌ Wrong! It was "${word}"`}
            </p>
          )}
        </div>
      )}

      {phase === 'result' && isHost && (
        <button
          onClick={nextRound}
          className="px-6 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-medium"
        >
          {round >= TOTAL_ROUNDS ? 'See Results' : 'Next Round →'}
        </button>
      )}
    </div>
  );
}
