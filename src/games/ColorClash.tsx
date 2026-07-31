'use client';

import { useCallback, useEffect, useState } from 'react';
import { DataConnection } from 'peerjs';
import { PeerMessage } from '@/types';

interface Props {
  connection: DataConnection;
  isHost: boolean;
}

function randomColor(): string {
  const h = Math.floor(Math.random() * 360);
  const s = 40 + Math.floor(Math.random() * 60);
  const l = 30 + Math.floor(Math.random() * 40);
  return `hsl(${h}, ${s}%, ${l}%)`;
}

function hslToValues(hsl: string): [number, number, number] {
  const m = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (!m) return [0, 0, 0];
  return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
}

function colorDistance(a: string, b: string): number {
  const [h1, s1, l1] = hslToValues(a);
  const [h2, s2, l2] = hslToValues(b);
  const dh = Math.min(Math.abs(h1 - h2), 360 - Math.abs(h1 - h2)) / 180;
  const ds = Math.abs(s1 - s2) / 100;
  const dl = Math.abs(l1 - l2) / 100;
  return Math.sqrt(dh * dh + ds * ds + dl * dl);
}

function scoreFromDistance(dist: number): number {
  return Math.max(0, Math.round((1 - dist) * 100));
}

const TOTAL_ROUNDS = 8;

export default function ColorClash({ connection, isHost }: Props) {
  const [round, setRound] = useState(1);
  const [targetColor, setTargetColor] = useState('');
  const [myHue, setMyHue] = useState(180);
  const [mySat, setMySat] = useState(50);
  const [myLight, setMyLight] = useState(50);
  const [submitted, setSubmitted] = useState(false);
  const [opponentSubmitted, setOpponentSubmitted] = useState(false);
  const [opponentColor, setOpponentColor] = useState('');
  const [scores, setScores] = useState({ me: 0, them: 0 });
  const [roundScore, setRoundScore] = useState<{ me: number; them: number } | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);

  const myColor = `hsl(${myHue}, ${mySat}%, ${myLight}%)`;

  const send = useCallback(
    (type: string, payload: unknown = {}) => {
      const msg: PeerMessage = { type, payload };
      connection.send(msg);
    },
    [connection],
  );

  const startGame = useCallback(() => {
    const color = randomColor();
    setTargetColor(color);
    setGameStarted(true);
    setRound(1);
    setScores({ me: 0, them: 0 });
    send('start', { color });
  }, [send]);

  const submitColor = () => {
    if (submitted) return;
    setSubmitted(true);
    send('submit-color', { color: myColor });
  };

  const nextRound = useCallback(() => {
    if (round >= TOTAL_ROUNDS) {
      setGameOver(true);
      return;
    }
    const color = randomColor();
    setTargetColor(color);
    setRound((r) => r + 1);
    setSubmitted(false);
    setOpponentSubmitted(false);
    setOpponentColor('');
    setRoundScore(null);
    setMyHue(180);
    setMySat(50);
    setMyLight(50);
    send('next-round', { color, round: round + 1 });
  }, [round, send]);

  useEffect(() => {
    if (!submitted || !opponentSubmitted) return;

    const myDist = colorDistance(targetColor, myColor);
    const theirDist = colorDistance(targetColor, opponentColor);
    const myS = scoreFromDistance(myDist);
    const theirS = scoreFromDistance(theirDist);

    setRoundScore({ me: myS, them: theirS });
    setScores((prev) => ({
      me: prev.me + myS,
      them: prev.them + theirS,
    }));
  }, [submitted, opponentSubmitted, targetColor, myColor, opponentColor]);

  useEffect(() => {
    const handler = (data: unknown) => {
      const msg = data as PeerMessage;
      if (msg.type === 'start') {
        const p = msg.payload as { color: string };
        setTargetColor(p.color);
        setGameStarted(true);
        setRound(1);
        setScores({ me: 0, them: 0 });
      }
      if (msg.type === 'submit-color') {
        const p = msg.payload as { color: string };
        setOpponentColor(p.color);
        setOpponentSubmitted(true);
      }
      if (msg.type === 'next-round') {
        const p = msg.payload as { color: string; round: number };
        setTargetColor(p.color);
        setRound(p.round);
        setSubmitted(false);
        setOpponentSubmitted(false);
        setOpponentColor('');
        setRoundScore(null);
        setMyHue(180);
        setMySat(50);
        setMyLight(50);
      }
      if (msg.type === 'play-again') {
        setGameOver(false);
        setGameStarted(false);
      }
    };
    connection.on('data', handler);
    return () => {
      connection.off('data', handler);
    };
  }, [connection]);

  if (!gameStarted) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-5xl">🎨</p>
        <h2 className="text-2xl font-bold">Color Clash</h2>
        <p className="text-gray-400">Match the target color as closely as possible using sliders. Scored 0-100 per round!</p>
        {isHost ? (
          <button
            onClick={startGame}
            className="px-8 py-3 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-bold text-lg transition-colors"
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
            setGameOver(false);
            setGameStarted(false);
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
    <div className="flex flex-col items-center gap-6">
      <div className="flex items-center gap-8 text-center">
        <div>
          <p className="text-sm text-gray-400">You</p>
          <p className="text-2xl font-bold text-purple-400">{scores.me}</p>
        </div>
        <div className="text-gray-600 text-sm">Round {round}/{TOTAL_ROUNDS}</div>
        <div>
          <p className="text-sm text-gray-400">Opponent</p>
          <p className="text-2xl font-bold text-blue-400">{scores.them}</p>
        </div>
      </div>

      {/* Target color */}
      <div className="text-center space-y-2">
        <p className="text-sm text-gray-400">Match this color:</p>
        <div
          className="w-32 h-32 rounded-2xl mx-auto border-4 border-white/10"
          style={{ backgroundColor: targetColor }}
        />
      </div>

      {/* Your color + sliders */}
      <div className="w-full max-w-sm space-y-4">
        <div className="flex items-center gap-4">
          <div
            className="w-20 h-20 rounded-xl border-2 border-white/10 shrink-0"
            style={{ backgroundColor: myColor }}
          />
          <div className="flex-1 space-y-2">
            <div>
              <label className="text-xs text-gray-500">Hue</label>
              <input
                type="range"
                min="0"
                max="360"
                value={myHue}
                onChange={(e) => setMyHue(Number(e.target.value))}
                disabled={submitted}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Saturation</label>
              <input
                type="range"
                min="0"
                max="100"
                value={mySat}
                onChange={(e) => setMySat(Number(e.target.value))}
                disabled={submitted}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Lightness</label>
              <input
                type="range"
                min="0"
                max="100"
                value={myLight}
                onChange={(e) => setMyLight(Number(e.target.value))}
                disabled={submitted}
                className="w-full"
              />
            </div>
          </div>
        </div>

        {!submitted ? (
          <button
            onClick={submitColor}
            className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold transition-colors"
          >
            Lock In Color
          </button>
        ) : !opponentSubmitted ? (
          <p className="text-center text-gray-400 animate-pulse">Waiting for opponent...</p>
        ) : null}
      </div>

      {/* Round results */}
      {roundScore && (
        <div className="text-center space-y-4 p-6 rounded-2xl bg-gray-900 border border-gray-800 w-full max-w-sm">
          <div className="flex items-center justify-center gap-6">
            <div className="text-center">
              <p className="text-xs text-gray-500">You</p>
              <div className="w-12 h-12 rounded-lg mx-auto mb-1" style={{ backgroundColor: myColor }} />
              <p className="text-xl font-bold text-purple-400">+{roundScore.me}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">Target</p>
              <div className="w-12 h-12 rounded-lg mx-auto mb-1" style={{ backgroundColor: targetColor }} />
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">Opponent</p>
              <div className="w-12 h-12 rounded-lg mx-auto mb-1" style={{ backgroundColor: opponentColor }} />
              <p className="text-xl font-bold text-blue-400">+{roundScore.them}</p>
            </div>
          </div>
          {isHost && (
            <button
              onClick={nextRound}
              className="px-6 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-medium transition-colors"
            >
              {round >= TOTAL_ROUNDS ? 'See Results' : 'Next Round →'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
