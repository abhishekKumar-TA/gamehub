'use client';

import { useCallback, useEffect, useState } from 'react';
import { DataConnection } from 'peerjs';
import { PeerMessage } from '@/types';

interface Props {
  connection: DataConnection;
  isHost: boolean;
}

type Phase = 'batting' | 'picking' | 'result' | 'innings-break' | 'gameover';

export default function FingerCricket({ connection, isHost }: Props) {
  const [phase, setPhase] = useState<Phase>('batting');
  const [myPick, setMyPick] = useState<number | null>(null);
  const [opponentPick, setOpponentPick] = useState<number | null>(null);
  const [innings, setInnings] = useState(1);
  const [isBatting, setIsBatting] = useState(isHost);
  const [myScore, setMyScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [target, setTarget] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<string>('');
  const [gameStarted, setGameStarted] = useState(false);

  const send = useCallback(
    (type: string, payload: unknown = {}) => {
      const msg: PeerMessage = { type, payload };
      connection.send(msg);
    },
    [connection],
  );

  const pickNumber = (n: number) => {
    if (myPick !== null) return;
    setMyPick(n);
    send('pick', { number: n });
  };

  // Evaluate picks when both have chosen
  useEffect(() => {
    if (myPick === null || opponentPick === null) return;

    const isOut = myPick === opponentPick;

    if (isOut) {
      setLastResult('OUT! 🎉');
      if (innings === 1) {
        // First innings over
        const scoredBy = isBatting ? myScore : opponentScore;
        setTarget(scoredBy);
        setTimeout(() => {
          setInnings(2);
          setIsBatting(!isBatting);
          setMyPick(null);
          setOpponentPick(null);
          setPhase('innings-break');
        }, 1500);
      } else {
        // Second innings over - game done
        setTimeout(() => setPhase('gameover'), 1500);
      }
    } else {
      // Batter scores
      const runs = isBatting ? myPick : opponentPick;
      if (isBatting) {
        setMyScore((prev) => prev + runs);
        setLastResult(`+${runs} runs!`);
      } else {
        setOpponentScore((prev) => prev + runs);
        setLastResult(`Opponent scores +${runs}`);
      }

      // Check if target chased in innings 2
      if (innings === 2 && target !== null) {
        const newScore = isBatting ? myScore + runs : opponentScore + runs;
        if (newScore > target) {
          setTimeout(() => setPhase('gameover'), 1500);
          setMyPick(null);
          setOpponentPick(null);
          return;
        }
      }

      setTimeout(() => {
        setMyPick(null);
        setOpponentPick(null);
        setLastResult('');
      }, 1200);
    }
  }, [myPick, opponentPick, isBatting, innings, myScore, opponentScore, target]);

  useEffect(() => {
    const handler = (data: unknown) => {
      const msg = data as PeerMessage;
      if (msg.type === 'pick') {
        const p = msg.payload as { number: number };
        setOpponentPick(p.number);
      }
      if (msg.type === 'start') {
        setGameStarted(true);
        setPhase('batting');
      }
      if (msg.type === 'continue') {
        setPhase('batting');
      }
      if (msg.type === 'play-again') {
        resetGame();
      }
    };
    connection.on('data', handler);
    return () => {
      connection.off('data', handler);
    };
  }, [connection]);

  const resetGame = () => {
    setPhase('batting');
    setMyPick(null);
    setOpponentPick(null);
    setInnings(1);
    setIsBatting(isHost);
    setMyScore(0);
    setOpponentScore(0);
    setTarget(null);
    setLastResult('');
    setGameStarted(true);
  };

  const handleStart = () => {
    setGameStarted(true);
    send('start', {});
  };

  const handleContinue = () => {
    setPhase('batting');
    send('continue', {});
  };

  const winner = myScore > opponentScore ? 'You Win! 🏆' : myScore < opponentScore ? 'You Lose!' : 'Tie! 🤝';

  if (!gameStarted) {
    return (
      <div className="flex flex-col items-center gap-6">
        <div className="text-center space-y-4">
          <p className="text-5xl">🏏</p>
          <h2 className="text-2xl font-bold">Finger Cricket</h2>
          <p className="text-gray-400">
            Both pick a number (1-6). If they match, batter is OUT! Otherwise, batter scores their number.
          </p>
          <p className="text-sm text-gray-500">
            {isHost ? 'You bat first' : 'Opponent bats first'}
          </p>
          {isHost ? (
            <button
              onClick={handleStart}
              className="px-8 py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-lg transition-colors"
            >
              Start Match
            </button>
          ) : (
            <p className="text-gray-400 animate-pulse">Waiting for host...</p>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'innings-break') {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-5xl">🔄</p>
        <h2 className="text-2xl font-bold">Innings Break</h2>
        <p className="text-gray-400">
          Target: <span className="text-white font-bold text-xl">{(target ?? 0) + 1} runs</span> to win
        </p>
        <p className="text-sm text-gray-500">
          {isBatting ? 'Your turn to bat!' : 'Opponent bats now'}
        </p>
        {isHost && (
          <button
            onClick={handleContinue}
            className="px-6 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors"
          >
            Continue
          </button>
        )}
      </div>
    );
  }

  if (phase === 'gameover') {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-5xl">{myScore > opponentScore ? '🏆' : myScore < opponentScore ? '😢' : '🤝'}</p>
        <h2 className="text-3xl font-bold">{winner}</h2>
        <div className="flex gap-8">
          <div>
            <p className="text-sm text-gray-400">You</p>
            <p className="text-3xl font-bold text-purple-400">{myScore}</p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Opponent</p>
            <p className="text-3xl font-bold text-blue-400">{opponentScore}</p>
          </div>
        </div>
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
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Status */}
      <div className="flex items-center gap-8 text-center">
        <div>
          <p className="text-sm text-gray-400">You {isBatting ? '🏏' : '⚾'}</p>
          <p className="text-3xl font-bold text-purple-400">{myScore}</p>
        </div>
        <div className="text-gray-600 text-sm">
          <p>Innings {innings}/2</p>
          {target !== null && <p className="text-yellow-400">Target: {target + 1}</p>}
        </div>
        <div>
          <p className="text-sm text-gray-400">Opponent {!isBatting ? '🏏' : '⚾'}</p>
          <p className="text-3xl font-bold text-blue-400">{opponentScore}</p>
        </div>
      </div>

      {/* Last Result */}
      {lastResult && (
        <div className="text-xl font-bold animate-bounce text-yellow-400">{lastResult}</div>
      )}

      {/* Picks display */}
      {myPick !== null && opponentPick !== null && (
        <div className="flex items-center gap-8">
          <div className="text-center">
            <p className="text-sm text-gray-400">You</p>
            <p className="text-4xl font-bold">{myPick}</p>
          </div>
          <p className="text-gray-600">vs</p>
          <div className="text-center">
            <p className="text-sm text-gray-400">Them</p>
            <p className="text-4xl font-bold">{opponentPick}</p>
          </div>
        </div>
      )}

      {/* Number picker */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <button
            key={n}
            onClick={() => pickNumber(n)}
            disabled={myPick !== null}
            className={`aspect-square rounded-2xl text-3xl font-bold transition-all ${
              myPick === n
                ? 'bg-purple-600 text-white scale-95'
                : myPick !== null
                ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                : 'bg-gray-800 hover:bg-gray-700 text-white hover:scale-105'
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      {myPick !== null && opponentPick === null && (
        <p className="text-gray-400 animate-pulse">Waiting for opponent...</p>
      )}
    </div>
  );
}
