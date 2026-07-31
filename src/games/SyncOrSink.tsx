'use client';

import { useCallback, useEffect, useState } from 'react';
import { DataConnection } from 'peerjs';
import { PeerMessage } from '@/types';

interface Props {
  connection: DataConnection;
  isHost: boolean;
}

const PROMPTS = [
  'Name a fruit',
  'Name a color',
  'Name a country',
  'Name an animal',
  'Name a sport',
  'Name a movie genre',
  'Name a season',
  'Name a day of the week',
  'Name a planet',
  'Name a body part',
  'Name a musical instrument',
  'Name a type of weather',
  'Name something cold',
  'Name something you find at a beach',
  'Name a breakfast food',
  'Name a superhero',
];

const TOTAL_ROUNDS = 8;

export default function SyncOrSink({ connection, isHost }: Props) {
  const [round, setRound] = useState(1);
  const [prompt, setPrompt] = useState('');
  const [myAnswer, setMyAnswer] = useState('');
  const [opponentAnswer, setOpponentAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [opponentSubmitted, setOpponentSubmitted] = useState(false);
  const [scores, setScores] = useState({ me: 0, them: 0 });
  const [synced, setSynced] = useState<boolean | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [usedPrompts, setUsedPrompts] = useState<Set<number>>(new Set());

  const send = useCallback(
    (type: string, payload: unknown = {}) => {
      const msg: PeerMessage = { type, payload };
      connection.send(msg);
    },
    [connection],
  );

  const getRandomPrompt = useCallback(() => {
    const available = PROMPTS.map((_, i) => i).filter((i) => !usedPrompts.has(i));
    if (available.length === 0) return PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
    const idx = available[Math.floor(Math.random() * available.length)];
    setUsedPrompts((prev) => new Set([...prev, idx]));
    return PROMPTS[idx];
  }, [usedPrompts]);

  const startGame = useCallback(() => {
    const p = getRandomPrompt();
    setPrompt(p);
    setRound(1);
    setScores({ me: 0, them: 0 });
    setGameStarted(true);
    setGameOver(false);
    resetRound();
    send('start', { prompt: p });
  }, [send, getRandomPrompt]);

  const resetRound = () => {
    setMyAnswer('');
    setOpponentAnswer('');
    setSubmitted(false);
    setOpponentSubmitted(false);
    setSynced(null);
  };

  const submitAnswer = () => {
    if (!myAnswer.trim() || submitted) return;
    setSubmitted(true);
    send('answer', { answer: myAnswer.trim().toLowerCase() });
  };

  useEffect(() => {
    if (!submitted || !opponentSubmitted) return;

    const match = myAnswer.trim().toLowerCase() === opponentAnswer.trim().toLowerCase();
    setSynced(match);
    if (match) {
      setScores((prev) => ({ me: prev.me + 1, them: prev.them + 1 }));
    }
  }, [submitted, opponentSubmitted, myAnswer, opponentAnswer]);

  const nextRound = useCallback(() => {
    if (round >= TOTAL_ROUNDS) {
      setGameOver(true);
      return;
    }
    const p = getRandomPrompt();
    setPrompt(p);
    setRound((r) => r + 1);
    resetRound();
    send('next-round', { prompt: p, round: round + 1 });
  }, [round, send, getRandomPrompt]);

  useEffect(() => {
    const handler = (data: unknown) => {
      const msg = data as PeerMessage;
      if (msg.type === 'start') {
        const p = msg.payload as { prompt: string };
        setPrompt(p.prompt);
        setRound(1);
        setScores({ me: 0, them: 0 });
        setGameStarted(true);
        setGameOver(false);
        resetRound();
      }
      if (msg.type === 'answer') {
        const p = msg.payload as { answer: string };
        setOpponentAnswer(p.answer);
        setOpponentSubmitted(true);
      }
      if (msg.type === 'next-round') {
        const p = msg.payload as { prompt: string; round: number };
        setPrompt(p.prompt);
        setRound(p.round);
        resetRound();
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

  if (!gameStarted) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-5xl">🧠</p>
        <h2 className="text-2xl font-bold">Sync or Sink</h2>
        <p className="text-gray-400">Both answer the same question. If you match, you both score! Think alike to win.</p>
        {isHost ? (
          <button
            onClick={startGame}
            className="px-8 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-lg transition-colors"
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
        <p className="text-5xl">🧠</p>
        <h2 className="text-3xl font-bold">Game Over!</h2>
        <p className="text-xl text-gray-300">
          You synced <span className="text-amber-400 font-bold">{scores.me}</span> out of {TOTAL_ROUNDS} rounds!
        </p>
        <p className="text-gray-400">
          {scores.me >= 6 ? 'Mind readers! 🔮' : scores.me >= 4 ? 'Pretty in sync! ✨' : scores.me >= 2 ? 'Getting there! 💭' : 'Total strangers! 😂'}
        </p>
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

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-md mx-auto">
      <div className="text-center">
        <p className="text-sm text-gray-500">Round {round}/{TOTAL_ROUNDS}</p>
        <p className="text-amber-400 font-bold">Syncs: {scores.me}/{round - (synced === null ? 1 : 0)}</p>
      </div>

      <div className="text-center p-8 rounded-2xl bg-gray-900 border border-gray-800 w-full">
        <p className="text-2xl font-bold text-white">{prompt}</p>
      </div>

      {synced === null ? (
        <div className="w-full space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={myAnswer}
              onChange={(e) => setMyAnswer(e.target.value)}
              placeholder="Type your answer..."
              disabled={submitted}
              className="flex-1 px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-amber-500 disabled:opacity-50"
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitAnswer();
              }}
              autoFocus
            />
            <button
              onClick={submitAnswer}
              disabled={!myAnswer.trim() || submitted}
              className="px-6 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium transition-colors"
            >
              {submitted ? '✓' : 'Lock'}
            </button>
          </div>
          {submitted && !opponentSubmitted && (
            <p className="text-center text-gray-400 animate-pulse">Waiting for opponent...</p>
          )}
        </div>
      ) : (
        <div className="w-full text-center space-y-4">
          <div className={`p-6 rounded-2xl ${synced ? 'bg-green-900/30 border border-green-500/30' : 'bg-red-900/30 border border-red-500/30'}`}>
            <p className="text-4xl mb-2">{synced ? '🎉' : '❌'}</p>
            <p className="text-xl font-bold">{synced ? 'SYNCED!' : 'NOT SYNCED'}</p>
            <div className="flex justify-center gap-8 mt-4">
              <div>
                <p className="text-xs text-gray-500">You said</p>
                <p className="text-lg font-medium text-purple-400">{myAnswer}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">They said</p>
                <p className="text-lg font-medium text-blue-400">{opponentAnswer}</p>
              </div>
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
