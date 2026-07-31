'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DataConnection } from 'peerjs';
import { PeerMessage } from '@/types';

interface Props {
  connection: DataConnection;
  isHost: boolean;
}

const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308'];
const COLOR_NAMES = ['Red', 'Blue', 'Green', 'Yellow'];

export default function PatternPulse({ connection, isHost }: Props) {
  const [sequence, setSequence] = useState<number[]>([]);
  const [playerInput, setPlayerInput] = useState<number[]>([]);
  const [phase, setPhase] = useState<'idle' | 'showing' | 'input' | 'waiting' | 'gameover'>('idle');
  const [activeColor, setActiveColor] = useState<number | null>(null);
  const [myAlive, setMyAlive] = useState(true);
  const [opponentAlive, setOpponentAlive] = useState(true);
  const [round, setRound] = useState(0);
  const [speed, setSpeed] = useState(600);
  const showingRef = useRef(false);

  const send = useCallback(
    (type: string, payload: unknown = {}) => {
      const msg: PeerMessage = { type, payload };
      connection.send(msg);
    },
    [connection],
  );

  const showSequence = useCallback(async (seq: number[], spd: number) => {
    showingRef.current = true;
    setPhase('showing');

    for (let i = 0; i < seq.length; i++) {
      await new Promise((r) => setTimeout(r, spd));
      setActiveColor(seq[i]);
      await new Promise((r) => setTimeout(r, spd * 0.6));
      setActiveColor(null);
    }

    showingRef.current = false;
    setPhase('input');
    setPlayerInput([]);
  }, []);

  const startGame = useCallback(() => {
    const first = Math.floor(Math.random() * 4);
    const seq = [first];
    setSequence(seq);
    setRound(1);
    setMyAlive(true);
    setOpponentAlive(true);
    setSpeed(600);
    send('start', { sequence: seq });
    showSequence(seq, 600);
  }, [send, showSequence]);

  const nextRound = useCallback(() => {
    const next = Math.floor(Math.random() * 4);
    const newSeq = [...sequence, next];
    const newSpeed = Math.max(200, speed - 30);
    setSequence(newSeq);
    setRound((r) => r + 1);
    setSpeed(newSpeed);
    send('next-round', { sequence: newSeq, speed: newSpeed });
    showSequence(newSeq, newSpeed);
  }, [sequence, speed, send, showSequence]);

  const handleColorPress = useCallback(
    (colorIdx: number) => {
      if (phase !== 'input' || !myAlive) return;

      const newInput = [...playerInput, colorIdx];
      setPlayerInput(newInput);

      // Flash the color
      setActiveColor(colorIdx);
      setTimeout(() => setActiveColor(null), 150);

      // Check if correct
      if (sequence[newInput.length - 1] !== colorIdx) {
        // Wrong!
        setMyAlive(false);
        send('failed', { round });
        if (!opponentAlive) {
          setPhase('gameover');
        } else {
          setPhase('waiting');
        }
        return;
      }

      // Completed sequence
      if (newInput.length === sequence.length) {
        send('passed', { round });
        setPhase('waiting');
      }
    },
    [phase, myAlive, playerInput, sequence, round, opponentAlive, send],
  );

  useEffect(() => {
    const handler = (data: unknown) => {
      const msg = data as PeerMessage;
      if (msg.type === 'start') {
        const p = msg.payload as { sequence: number[] };
        setSequence(p.sequence);
        setRound(1);
        setMyAlive(true);
        setOpponentAlive(true);
        setSpeed(600);
        showSequence(p.sequence, 600);
      }
      if (msg.type === 'next-round') {
        const p = msg.payload as { sequence: number[]; speed: number };
        setSequence(p.sequence);
        setSpeed(p.speed);
        setRound((r) => r + 1);
        showSequence(p.sequence, p.speed);
      }
      if (msg.type === 'failed') {
        setOpponentAlive(false);
        if (!myAlive) {
          setPhase('gameover');
        }
      }
      if (msg.type === 'passed') {
        // Opponent passed, if we also passed (or failed), host advances
        if (phase === 'waiting' && myAlive && isHost) {
          setTimeout(() => nextRound(), 1000);
        }
      }
      if (msg.type === 'play-again') {
        setPhase('idle');
      }
    };
    connection.on('data', handler);
    return () => {
      connection.off('data', handler);
    };
  }, [connection, myAlive, phase, isHost, nextRound, showSequence]);

  // When both have responded and I'm host
  useEffect(() => {
    if (phase === 'waiting' && myAlive && opponentAlive && isHost) {
      setTimeout(() => nextRound(), 1000);
    }
  }, [phase, myAlive, opponentAlive, isHost, nextRound]);

  if (phase === 'idle') {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-5xl">🔴</p>
        <h2 className="text-2xl font-bold">Pattern Pulse</h2>
        <p className="text-gray-400">Watch the color sequence, then repeat it. Speed increases each round! Survive longer to win.</p>
        {isHost ? (
          <button
            onClick={startGame}
            className="px-8 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-lg transition-colors"
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
    const iWon = myAlive && !opponentAlive;
    const tie = !myAlive && !opponentAlive;

    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-5xl">{iWon ? '🏆' : tie ? '🤝' : '😢'}</p>
        <h2 className="text-3xl font-bold">
          {iWon ? 'You Win!' : tie ? "It's a Tie!" : 'You Lose!'}
        </h2>
        <p className="text-gray-400">Survived {round} rounds</p>
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
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <p className="text-sm text-gray-400">Round {round}</p>
        <p className="text-xs text-gray-600">
          {!myAlive ? '💀 You failed' : !opponentAlive ? '✅ Opponent failed' : 'Both alive'}
        </p>
      </div>

      <div className={`px-4 py-1 rounded-full text-sm font-medium ${
        phase === 'showing' ? 'bg-yellow-500/20 text-yellow-400' :
        phase === 'input' ? 'bg-green-500/20 text-green-400' :
        'bg-gray-800 text-gray-400'
      }`}>
        {phase === 'showing' ? 'Watch carefully...' :
         phase === 'input' ? `Your turn! (${playerInput.length}/${sequence.length})` :
         'Waiting for opponent...'}
      </div>

      <div className="grid grid-cols-2 gap-4 w-full max-w-xs">
        {COLORS.map((color, i) => (
          <button
            key={i}
            onClick={() => handleColorPress(i)}
            disabled={phase !== 'input' || !myAlive}
            className={`aspect-square rounded-2xl transition-all duration-150 ${
              phase !== 'input' || !myAlive ? 'cursor-not-allowed' : 'cursor-pointer hover:scale-105 active:scale-95'
            }`}
            style={{
              backgroundColor: color,
              opacity: activeColor === i ? 1 : 0.4,
              transform: activeColor === i ? 'scale(1.05)' : 'scale(1)',
              boxShadow: activeColor === i ? `0 0 30px ${color}` : 'none',
            }}
          >
            <span className="text-white/50 text-sm font-medium">{COLOR_NAMES[i]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
