'use client';

import { useCallback, useEffect, useState } from 'react';
import { DataConnection } from 'peerjs';
import { PeerMessage } from '@/types';

interface Props {
  connection: DataConnection;
  isHost: boolean;
}

const EMOJIS = ['🍎', '🌟', '🎈', '🐱', '🌈', '🎸', '🚀', '💎'];

function generateBoard(): string[] {
  const pairs = [...EMOJIS, ...EMOJIS];
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  return pairs;
}

export default function MemoryFlip({ connection, isHost }: Props) {
  const [board, setBoard] = useState<string[]>([]);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [flipped, setFlipped] = useState<number[]>([]);
  const [myTurn, setMyTurn] = useState(isHost);
  const [scores, setScores] = useState({ me: 0, them: 0 });
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [checking, setChecking] = useState(false);

  const send = useCallback(
    (type: string, payload: unknown = {}) => {
      const msg: PeerMessage = { type, payload };
      connection.send(msg);
    },
    [connection],
  );

  const startGame = useCallback(() => {
    const newBoard = generateBoard();
    setBoard(newBoard);
    setRevealed(new Set());
    setFlipped([]);
    setMyTurn(isHost);
    setScores({ me: 0, them: 0 });
    setGameStarted(true);
    setGameOver(false);
    send('start', { board: newBoard });
  }, [isHost, send]);

  const flipCard = useCallback(
    (index: number) => {
      if (!myTurn || checking || revealed.has(index) || flipped.includes(index) || flipped.length >= 2) return;

      const newFlipped = [...flipped, index];
      setFlipped(newFlipped);
      send('flip', { index });

      if (newFlipped.length === 2) {
        setChecking(true);
        setTimeout(() => {
          const [a, b] = newFlipped;
          if (board[a] === board[b]) {
            setRevealed((prev) => new Set([...prev, a, b]));
            setScores((prev) => ({ ...prev, me: prev.me + 1 }));
            // Extra turn on match
          } else {
            setMyTurn(false);
          }
          setFlipped([]);
          setChecking(false);
        }, 1000);
      }
    },
    [myTurn, checking, revealed, flipped, board, send],
  );

  useEffect(() => {
    if (revealed.size === board.length && board.length > 0) {
      setGameOver(true);
    }
  }, [revealed, board]);

  useEffect(() => {
    const handler = (data: unknown) => {
      const msg = data as PeerMessage;
      if (msg.type === 'start') {
        const p = msg.payload as { board: string[] };
        setBoard(p.board);
        setRevealed(new Set());
        setFlipped([]);
        setMyTurn(!isHost);
        setScores({ me: 0, them: 0 });
        setGameStarted(true);
        setGameOver(false);
      }
      if (msg.type === 'flip') {
        const p = msg.payload as { index: number };
        setFlipped((prev) => {
          const newFlipped = [...prev, p.index];
          if (newFlipped.length === 2) {
            setTimeout(() => {
              const [a, b] = newFlipped;
              if (board[a] === board[b]) {
                setRevealed((prev) => new Set([...prev, a, b]));
                setScores((prev) => ({ ...prev, them: prev.them + 1 }));
                // Their extra turn
              } else {
                setMyTurn(true);
              }
              setFlipped([]);
            }, 1000);
          }
          return newFlipped;
        });
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
  }, [connection, isHost, board]);

  if (!gameStarted) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-5xl">🃏</p>
        <h2 className="text-2xl font-bold">Memory Flip Race</h2>
        <p className="text-gray-400">Take turns flipping 2 cards. Find a pair to score and get an extra turn!</p>
        {isHost ? (
          <button
            onClick={startGame}
            className="px-8 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-lg transition-colors"
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
    <div className="flex flex-col items-center gap-6">
      <div className="flex items-center gap-8 text-center">
        <div>
          <p className="text-sm text-gray-400">You</p>
          <p className="text-3xl font-bold text-purple-400">{scores.me}</p>
        </div>
        <div className={`px-4 py-1 rounded-full text-sm font-medium ${myTurn ? 'bg-purple-500/20 text-purple-400' : 'bg-gray-800 text-gray-400'}`}>
          {myTurn ? 'Your Turn' : "Opponent's Turn"}
        </div>
        <div>
          <p className="text-sm text-gray-400">Opponent</p>
          <p className="text-3xl font-bold text-blue-400">{scores.them}</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 w-full max-w-sm">
        {board.map((emoji, i) => {
          const isRevealed = revealed.has(i);
          const isFlipped = flipped.includes(i);
          const showFace = isRevealed || isFlipped;

          return (
            <button
              key={i}
              onClick={() => flipCard(i)}
              disabled={!myTurn || isRevealed || isFlipped || checking}
              className={`aspect-square rounded-xl text-3xl flex items-center justify-center transition-all duration-300 ${
                isRevealed
                  ? 'bg-gray-800/50 opacity-50'
                  : showFace
                  ? 'bg-gray-800 scale-95'
                  : myTurn
                  ? 'bg-gray-800 hover:bg-gray-700 hover:scale-105 cursor-pointer'
                  : 'bg-gray-800 cursor-not-allowed'
              }`}
            >
              {showFace ? emoji : '❓'}
            </button>
          );
        })}
      </div>
    </div>
  );
}
