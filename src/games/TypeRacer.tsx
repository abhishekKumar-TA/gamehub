'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DataConnection } from 'peerjs';
import { PeerMessage } from '@/types';

interface Props {
  connection: DataConnection;
  isHost: boolean;
}

const PASSAGES = [
  "The quick brown fox jumps over the lazy dog near the riverbank while the sun sets behind the distant mountains.",
  "In a world of technology and innovation, the human spirit remains the greatest force for positive change and growth.",
  "Stars twinkled like diamonds scattered across a velvet sky as the ocean waves crashed softly against the sandy shore.",
  "Every great journey begins with a single step forward, and the courage to keep walking even when the path is unclear.",
  "The ancient library held secrets untold, its dusty shelves whispering stories of forgotten kingdoms and brave heroes.",
  "Music fills the air with invisible colors, painting emotions that words alone could never hope to express or capture.",
];

export default function TypeRacer({ connection, isHost }: Props) {
  const [passage, setPassage] = useState('');
  const [myInput, setMyInput] = useState('');
  const [myProgress, setMyProgress] = useState(0);
  const [opponentProgress, setOpponentProgress] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [myWpm, setMyWpm] = useState(0);
  const [opponentWpm, setOpponentWpm] = useState(0);
  const [finished, setFinished] = useState(false);
  const [opponentFinished, setOpponentFinished] = useState(false);
  const [winner, setWinner] = useState<'me' | 'them' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const send = useCallback(
    (type: string, payload: unknown = {}) => {
      const msg: PeerMessage = { type, payload };
      connection.send(msg);
    },
    [connection],
  );

  const startGame = useCallback(() => {
    const p = PASSAGES[Math.floor(Math.random() * PASSAGES.length)];
    setPassage(p);
    setMyInput('');
    setMyProgress(0);
    setOpponentProgress(0);
    setFinished(false);
    setOpponentFinished(false);
    setWinner(null);
    setMyWpm(0);
    setOpponentWpm(0);

    send('start', { passage: p });

    let c = 3;
    setCountdown(c);
    const interval = setInterval(() => {
      c--;
      setCountdown(c);
      if (c <= 0) {
        clearInterval(interval);
        setGameStarted(true);
        setStartTime(Date.now());
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    }, 1000);
  }, [send]);

  const handleInput = (value: string) => {
    if (finished) return;
    setMyInput(value);

    // Calculate progress
    let correct = 0;
    for (let i = 0; i < value.length && i < passage.length; i++) {
      if (value[i] === passage[i]) correct++;
      else break;
    }
    const progress = (correct / passage.length) * 100;
    setMyProgress(progress);
    send('progress', { progress });

    // Calculate WPM
    const elapsed = (Date.now() - startTime) / 60000;
    const words = correct / 5;
    if (elapsed > 0) setMyWpm(Math.round(words / elapsed));

    // Check if finished
    if (correct >= passage.length) {
      setFinished(true);
      const finalWpm = Math.round(words / elapsed);
      setMyWpm(finalWpm);
      send('finish', { wpm: finalWpm });
      if (!opponentFinished) setWinner('me');
    }
  };

  useEffect(() => {
    const handler = (data: unknown) => {
      const msg = data as PeerMessage;
      if (msg.type === 'start') {
        const p = msg.payload as { passage: string };
        setPassage(p.passage);
        setMyInput('');
        setMyProgress(0);
        setOpponentProgress(0);
        setFinished(false);
        setOpponentFinished(false);
        setWinner(null);
        setMyWpm(0);
        setOpponentWpm(0);

        let c = 3;
        setCountdown(c);
        const interval = setInterval(() => {
          c--;
          setCountdown(c);
          if (c <= 0) {
            clearInterval(interval);
            setGameStarted(true);
            setStartTime(Date.now());
            setTimeout(() => inputRef.current?.focus(), 100);
          }
        }, 1000);
      }
      if (msg.type === 'progress') {
        const p = msg.payload as { progress: number };
        setOpponentProgress(p.progress);
      }
      if (msg.type === 'finish') {
        const p = msg.payload as { wpm: number };
        setOpponentFinished(true);
        setOpponentWpm(p.wpm);
        if (!finished) setWinner('them');
      }
      if (msg.type === 'play-again') {
        setGameStarted(false);
        setCountdown(0);
      }
    };
    connection.on('data', handler);
    return () => {
      connection.off('data', handler);
    };
  }, [connection, finished]);

  if (!gameStarted && countdown <= 0) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-5xl">⌨️</p>
        <h2 className="text-2xl font-bold">Type Racer Duel</h2>
        <p className="text-gray-400">Race to type the passage! See each other&apos;s progress in real-time.</p>
        {isHost ? (
          <button
            onClick={startGame}
            className="px-8 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-lg transition-colors"
          >
            Start Race
          </button>
        ) : (
          <p className="text-gray-400 animate-pulse">Waiting for host...</p>
        )}
      </div>
    );
  }

  if (countdown > 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4">
        <p className="text-8xl font-bold text-cyan-400 animate-bounce">{countdown}</p>
        <p className="text-gray-400">Get ready...</p>
      </div>
    );
  }

  const isGameDone = finished && opponentFinished;

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Progress bars */}
      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-purple-400">You {myWpm > 0 ? `(${myWpm} WPM)` : ''}</span>
            <span className="text-gray-500">{Math.round(myProgress)}%</span>
          </div>
          <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 rounded-full transition-all duration-200"
              style={{ width: `${myProgress}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-blue-400">Opponent {opponentWpm > 0 ? `(${opponentWpm} WPM)` : ''}</span>
            <span className="text-gray-500">{Math.round(opponentProgress)}%</span>
          </div>
          <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-200"
              style={{ width: `${opponentProgress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Passage display */}
      <div className="p-6 rounded-2xl bg-gray-900 border border-gray-800 font-mono text-lg leading-relaxed">
        {passage.split('').map((char, i) => {
          let color = 'text-gray-500';
          if (i < myInput.length) {
            color = myInput[i] === char ? 'text-green-400' : 'text-red-400 bg-red-400/20';
          } else if (i === myInput.length) {
            color = 'text-white bg-gray-700';
          }
          return (
            <span key={i} className={color}>
              {char}
            </span>
          );
        })}
      </div>

      {/* Input */}
      <input
        ref={inputRef}
        type="text"
        value={myInput}
        onChange={(e) => handleInput(e.target.value)}
        disabled={finished}
        className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white font-mono focus:outline-none focus:border-cyan-500 disabled:opacity-50"
        placeholder={finished ? 'Finished!' : 'Start typing...'}
        autoComplete="off"
        spellCheck={false}
      />

      {/* Results */}
      {isGameDone && (
        <div className="text-center space-y-4 p-6 rounded-2xl bg-gray-900 border border-gray-800">
          <p className="text-5xl">{winner === 'me' ? '🏆' : '😢'}</p>
          <p className="text-2xl font-bold">
            {winner === 'me' ? 'You Win!' : 'You Lose!'}
          </p>
          <div className="flex gap-8 justify-center">
            <div>
              <p className="text-sm text-gray-400">Your WPM</p>
              <p className="text-2xl font-bold text-purple-400">{myWpm}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Opponent WPM</p>
              <p className="text-2xl font-bold text-blue-400">{opponentWpm}</p>
            </div>
          </div>
          {isHost && (
            <button
              onClick={() => {
                setGameStarted(false);
                setCountdown(0);
                send('play-again', {});
              }}
              className="px-6 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors"
            >
              Race Again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
