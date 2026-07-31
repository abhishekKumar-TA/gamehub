'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DataConnection } from 'peerjs';
import { PeerMessage } from '@/types';

interface Props {
  connection: DataConnection;
  isHost: boolean;
}

type Phase = 'waiting' | 'ready' | 'go' | 'early' | 'result' | 'gameover';

export default function ReactionShowdown({ connection, isHost }: Props) {
  const [phase, setPhase] = useState<Phase>('waiting');
  const [round, setRound] = useState(1);
  const [scores, setScores] = useState({ me: 0, them: 0 });
  const [reactionTime, setReactionTime] = useState<number | null>(null);
  const [opponentTime, setOpponentTime] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(3);
  const goTimeRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const totalRounds = 5;

  const send = useCallback(
    (type: string, payload: unknown = {}) => {
      const msg: PeerMessage = { type, payload };
      connection.send(msg);
    },
    [connection],
  );

  const startRound = useCallback(() => {
    setPhase('ready');
    setReactionTime(null);
    setOpponentTime(null);
    setCountdown(3);

    let c = 3;
    const cdInterval = setInterval(() => {
      c--;
      setCountdown(c);
      if (c <= 0) {
        clearInterval(cdInterval);
        // Random delay 1-4 seconds before "GO"
        const delay = 1000 + Math.random() * 3000;
        timerRef.current = setTimeout(() => {
          setPhase('go');
          const goTime = Date.now();
          goTimeRef.current = goTime;
          send('go', { goTime });
        }, delay);
      }
    }, 1000);

    return () => {
      clearInterval(cdInterval);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [send]);

  const handleTap = useCallback(() => {
    if (phase === 'ready') {
      setPhase('early');
      send('reaction', { time: -1 });
      return;
    }
    if (phase !== 'go') return;

    const time = Date.now() - goTimeRef.current;
    setReactionTime(time);
    setPhase('result');
    send('reaction', { time });
  }, [phase, send]);

  useEffect(() => {
    const handler = (data: unknown) => {
      const msg = data as PeerMessage;
      if (msg.type === 'go') {
        const p = msg.payload as { goTime: number };
        goTimeRef.current = p.goTime;
        setPhase('go');
      }
      if (msg.type === 'reaction') {
        const p = msg.payload as { time: number };
        setOpponentTime(p.time);
      }
      if (msg.type === 'start-round') {
        const p = msg.payload as { round: number };
        setRound(p.round);
        startRound();
      }
      if (msg.type === 'next-round') {
        setPhase('waiting');
      }
    };
    connection.on('data', handler);
    return () => {
      connection.off('data', handler);
    };
  }, [connection, startRound]);

  // Evaluate round result
  useEffect(() => {
    if (reactionTime === null || opponentTime === null) return;

    const myValid = reactionTime > 0;
    const theirValid = opponentTime > 0;

    setScores((prev) => {
      if (myValid && (!theirValid || reactionTime < opponentTime)) {
        return { ...prev, me: prev.me + 1 };
      }
      if (theirValid && (!myValid || opponentTime < reactionTime)) {
        return { ...prev, them: prev.them + 1 };
      }
      return prev;
    });

    if (round >= totalRounds) {
      setTimeout(() => setPhase('gameover'), 2000);
    }
  }, [reactionTime, opponentTime, round]);

  const handleStartGame = () => {
    setRound(1);
    setScores({ me: 0, them: 0 });
    send('start-round', { round: 1 });
    startRound();
  };

  const handleNextRound = () => {
    const next = round + 1;
    setRound(next);
    send('start-round', { round: next });
    startRound();
  };

  const handlePlayAgain = () => {
    setPhase('waiting');
    setScores({ me: 0, them: 0 });
    setRound(1);
    setReactionTime(null);
    setOpponentTime(null);
    send('next-round', {});
  };

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Scoreboard */}
      <div className="flex items-center gap-8 text-center">
        <div>
          <p className="text-sm text-gray-400">You</p>
          <p className="text-3xl font-bold text-purple-400">{scores.me}</p>
        </div>
        <div className="text-gray-600 text-sm">
          Round {round}/{totalRounds}
        </div>
        <div>
          <p className="text-sm text-gray-400">Opponent</p>
          <p className="text-3xl font-bold text-blue-400">{scores.them}</p>
        </div>
      </div>

      {/* Game Area */}
      <div
        onClick={phase === 'ready' || phase === 'go' ? handleTap : undefined}
        className={`w-full max-w-md aspect-square rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 select-none ${
          phase === 'ready'
            ? 'bg-red-900/30 border-2 border-red-500/50'
            : phase === 'go'
            ? 'bg-green-900/30 border-2 border-green-500/50 animate-pulse'
            : phase === 'early'
            ? 'bg-orange-900/30 border-2 border-orange-500/50'
            : 'bg-gray-900 border-2 border-gray-800'
        }`}
      >
        {phase === 'waiting' && (
          <div className="text-center space-y-4">
            <p className="text-5xl">⚡</p>
            {isHost ? (
              <button
                onClick={handleStartGame}
                className="px-8 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-lg transition-colors"
              >
                Start Game
              </button>
            ) : (
              <p className="text-gray-400">Waiting for host to start...</p>
            )}
          </div>
        )}

        {phase === 'ready' && (
          <div className="text-center">
            <p className="text-7xl font-bold text-red-400">{countdown > 0 ? countdown : 'WAIT...'}</p>
            <p className="text-gray-400 mt-4">Don&apos;t tap yet!</p>
          </div>
        )}

        {phase === 'go' && (
          <div className="text-center">
            <p className="text-7xl font-bold text-green-400">TAP!</p>
            <p className="text-green-300 mt-4">NOW! NOW! NOW!</p>
          </div>
        )}

        {phase === 'early' && (
          <div className="text-center">
            <p className="text-5xl mb-2">😬</p>
            <p className="text-2xl font-bold text-orange-400">Too Early!</p>
            <p className="text-gray-400 mt-2">You jumped the gun</p>
          </div>
        )}

        {phase === 'result' && (
          <div className="text-center space-y-2">
            <p className="text-4xl font-bold text-green-400">{reactionTime}ms</p>
            {opponentTime !== null ? (
              <p className="text-gray-400">
                Opponent: {opponentTime > 0 ? `${opponentTime}ms` : 'Too early!'}
              </p>
            ) : (
              <p className="text-gray-400">Waiting for opponent...</p>
            )}
          </div>
        )}

        {phase === 'gameover' && (
          <div className="text-center space-y-4">
            <p className="text-5xl">{scores.me > scores.them ? '🏆' : scores.me < scores.them ? '😢' : '🤝'}</p>
            <p className="text-2xl font-bold">
              {scores.me > scores.them ? 'You Win!' : scores.me < scores.them ? 'You Lose!' : 'It\'s a Tie!'}
            </p>
            <p className="text-gray-400">
              {scores.me} - {scores.them}
            </p>
            <button
              onClick={handlePlayAgain}
              className="px-6 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors"
            >
              Play Again
            </button>
          </div>
        )}
      </div>

      {/* Next Round Button */}
      {phase === 'result' && reactionTime !== null && opponentTime !== null && round < totalRounds && isHost && (
        <button
          onClick={handleNextRound}
          className="px-6 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-medium transition-colors"
        >
          Next Round →
        </button>
      )}
    </div>
  );
}
