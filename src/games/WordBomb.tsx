'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DataConnection } from 'peerjs';
import { PeerMessage } from '@/types';

interface Props {
  connection: DataConnection;
  isHost: boolean;
}

const LETTER_COMBOS = [
  'TH', 'IN', 'ER', 'AN', 'RE', 'ON', 'AT', 'EN', 'ND', 'TI',
  'ES', 'OR', 'TE', 'OF', 'ED', 'IS', 'IT', 'AL', 'AR', 'ST',
  'OU', 'EL', 'PH', 'OW', 'IG', 'UM', 'AP', 'OO', 'EP', 'EW',
];

const VALID_WORD_MIN_LENGTH = 3;

export default function WordBomb({ connection, isHost }: Props) {
  const [combo, setCombo] = useState('');
  const [myTurn, setMyTurn] = useState(isHost);
  const [input, setInput] = useState('');
  const [timeLeft, setTimeLeft] = useState(10);
  const [maxTime, setMaxTime] = useState(10);
  const [lives, setLives] = useState({ me: 3, them: 3 });
  const [message, setMessage] = useState('');
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [usedWords, setUsedWords] = useState<Set<string>>(new Set());
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const send = useCallback(
    (type: string, payload: unknown = {}) => {
      const msg: PeerMessage = { type, payload };
      connection.send(msg);
    },
    [connection],
  );

  const getRandomCombo = () => LETTER_COMBOS[Math.floor(Math.random() * LETTER_COMBOS.length)];

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(maxTime);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [maxTime]);

  const startGame = useCallback(() => {
    const c = getRandomCombo();
    setCombo(c);
    setMyTurn(isHost);
    setLives({ me: 3, them: 3 });
    setGameStarted(true);
    setGameOver(false);
    setUsedWords(new Set());
    setMaxTime(10);
    setMessage('');
    send('start', { combo: c });
    if (isHost) startTimer();
  }, [isHost, send, startTimer]);

  const submitWord = () => {
    const word = input.trim().toLowerCase();
    if (word.length < VALID_WORD_MIN_LENGTH) {
      setMessage('Too short!');
      return;
    }
    if (!word.toUpperCase().includes(combo)) {
      setMessage(`Must contain "${combo}"!`);
      return;
    }
    if (usedWords.has(word)) {
      setMessage('Already used!');
      return;
    }

    // Valid word
    if (timerRef.current) clearInterval(timerRef.current);
    setUsedWords((prev) => new Set([...prev, word]));
    setInput('');
    setMessage('');
    const newCombo = getRandomCombo();
    setCombo(newCombo);
    setMyTurn(false);
    send('word', { word, newCombo });
  };

  // Handle time running out
  useEffect(() => {
    if (timeLeft === 0 && myTurn && gameStarted && !gameOver) {
      // Lose a life
      const newLives = lives.me - 1;
      setLives((prev) => ({ ...prev, me: newLives }));
      send('timeout', {});

      if (newLives <= 0) {
        setGameOver(true);
        send('gameover', {});
      } else {
        const newCombo = getRandomCombo();
        setCombo(newCombo);
        setMyTurn(false);
        setInput('');
        setMessage('💥 BOOM! You lost a life!');
        send('next-turn', { combo: newCombo });
      }
    }
  }, [timeLeft, myTurn, gameStarted, gameOver, lives, send]);

  useEffect(() => {
    if (myTurn && gameStarted && !gameOver) {
      startTimer();
      setTimeout(() => inputRef.current?.focus(), 100);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [myTurn, gameStarted, gameOver, startTimer]);

  useEffect(() => {
    const handler = (data: unknown) => {
      const msg = data as PeerMessage;
      if (msg.type === 'start') {
        const p = msg.payload as { combo: string };
        setCombo(p.combo);
        setMyTurn(!isHost);
        setLives({ me: 3, them: 3 });
        setGameStarted(true);
        setGameOver(false);
        setUsedWords(new Set());
        setMaxTime(10);
        setMessage('');
      }
      if (msg.type === 'word') {
        const p = msg.payload as { word: string; newCombo: string };
        setUsedWords((prev) => new Set([...prev, p.word]));
        setCombo(p.newCombo);
        setMyTurn(true);
        setInput('');
        setMessage('');
      }
      if (msg.type === 'timeout') {
        setLives((prev) => ({ ...prev, them: prev.them - 1 }));
        setMessage('Opponent ran out of time! 💥');
      }
      if (msg.type === 'next-turn') {
        const p = msg.payload as { combo: string };
        setCombo(p.combo);
        setMyTurn(true);
        setInput('');
      }
      if (msg.type === 'gameover') {
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
  }, [connection, isHost]);

  if (!gameStarted) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-5xl">💣</p>
        <h2 className="text-2xl font-bold">Word Bomb</h2>
        <p className="text-gray-400">Type a word containing the shown letters before your fuse runs out! 3 lives each.</p>
        {isHost ? (
          <button
            onClick={startGame}
            className="px-8 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-lg transition-colors"
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
    const iWon = lives.me > 0;
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-5xl">{iWon ? '🏆' : '💥'}</p>
        <h2 className="text-3xl font-bold">{iWon ? 'You Win!' : 'You Lose!'}</h2>
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
      {/* Lives */}
      <div className="flex items-center gap-8">
        <div className="text-center">
          <p className="text-sm text-gray-400">You</p>
          <p className="text-xl">{'❤️'.repeat(lives.me)}{'🖤'.repeat(3 - lives.me)}</p>
        </div>
        <div className="text-center">
          <p className="text-sm text-gray-400">Opponent</p>
          <p className="text-xl">{'❤️'.repeat(lives.them)}{'🖤'.repeat(3 - lives.them)}</p>
        </div>
      </div>

      {/* Bomb + Combo */}
      <div className="text-center space-y-2">
        <p className={`text-6xl ${myTurn && timeLeft <= 3 ? 'animate-bounce' : ''}`}>💣</p>
        <div className="text-4xl font-mono font-bold text-white bg-gray-800 px-8 py-4 rounded-2xl tracking-widest">
          {combo}
        </div>
        {myTurn && (
          <div className={`text-2xl font-bold ${timeLeft <= 3 ? 'text-red-400' : 'text-yellow-400'}`}>
            {timeLeft}s
          </div>
        )}
      </div>

      {/* Turn indicator */}
      <div className={`px-4 py-1 rounded-full text-sm font-medium ${myTurn ? 'bg-red-500/20 text-red-400' : 'bg-gray-800 text-gray-400'}`}>
        {myTurn ? 'YOUR TURN — type fast!' : "Opponent's turn..."}
      </div>

      {/* Input */}
      {myTurn && (
        <div className="flex gap-2 w-full">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Word with "${combo}"...`}
            className="flex-1 px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white font-mono focus:outline-none focus:border-red-500"
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitWord();
            }}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            onClick={submitWord}
            className="px-6 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold transition-colors"
          >
            Go!
          </button>
        </div>
      )}

      {/* Message */}
      {message && (
        <p className="text-yellow-400 font-medium animate-bounce">{message}</p>
      )}
    </div>
  );
}
