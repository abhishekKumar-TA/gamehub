'use client';

import { useCallback, useEffect, useState } from 'react';
import { DataConnection } from 'peerjs';
import { PeerMessage } from '@/types';

interface Props {
  connection: DataConnection;
  isHost: boolean;
}

const WORDS = [
  'Pizza', 'Beach', 'Rain', 'Birthday', 'Movie', 'Dance', 'Sleep', 'Music',
  'Love', 'Fire', 'Snow', 'Cat', 'Dog', 'Book', 'Star', 'Moon',
  'Coffee', 'Sunset', 'Swimming', 'Cooking', 'Running', 'Flying',
  'Crying', 'Laughing', 'Shopping', 'Fishing', 'Camping', 'Wedding',
];

const EMOJI_PALETTE = [
  '😀', '😂', '😍', '😢', '😡', '🤔', '😴', '🤩',
  '👋', '👍', '👎', '✌️', '🤝', '💪', '🙏', '👀',
  '❤️', '💔', '🔥', '⭐', '🌙', '☀️', '🌧️', '❄️',
  '🎵', '🎬', '📚', '🎂', '🎉', '🏖️', '🍕', '☕',
  '🐱', '🐶', '🐟', '🦅', '🌺', '🌲', '🍎', '🍌',
  '🏠', '🚗', '✈️', '🚢', '💰', '💎', '🎸', '🏃',
];

const TOTAL_ROUNDS = 6;

export default function EmojiCharades({ connection, isHost }: Props) {
  const [round, setRound] = useState(1);
  const [word, setWord] = useState('');
  const [isDescriber, setIsDescriber] = useState(isHost);
  const [emojiSequence, setEmojiSequence] = useState<string[]>([]);
  const [guess, setGuess] = useState('');
  const [guessResult, setGuessResult] = useState<'correct' | 'wrong' | null>(null);
  const [scores, setScores] = useState({ me: 0, them: 0 });
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [usedWords, setUsedWords] = useState<Set<string>>(new Set());
  const [timeLeft, setTimeLeft] = useState(30);
  const [timerActive, setTimerActive] = useState(false);

  const send = useCallback(
    (type: string, payload: unknown = {}) => {
      const msg: PeerMessage = { type, payload };
      connection.send(msg);
    },
    [connection],
  );

  const getRandomWord = useCallback(() => {
    const available = WORDS.filter((w) => !usedWords.has(w));
    if (available.length === 0) return WORDS[Math.floor(Math.random() * WORDS.length)];
    const word = available[Math.floor(Math.random() * available.length)];
    setUsedWords((prev) => new Set([...prev, word]));
    return word;
  }, [usedWords]);

  const startGame = useCallback(() => {
    const w = getRandomWord();
    setWord(w);
    setRound(1);
    setScores({ me: 0, them: 0 });
    setIsDescriber(isHost);
    setEmojiSequence([]);
    setGuess('');
    setGuessResult(null);
    setGameStarted(true);
    setGameOver(false);
    setTimeLeft(30);
    setTimerActive(true);
    send('start', { word: isHost ? w : '???', isDescriberHost: true });
  }, [isHost, send, getRandomWord]);

  const addEmoji = (emoji: string) => {
    if (!isDescriber || emojiSequence.length >= 5) return;
    const newSeq = [...emojiSequence, emoji];
    setEmojiSequence(newSeq);
    send('emoji', { sequence: newSeq });
  };

  const removeLastEmoji = () => {
    if (!isDescriber || emojiSequence.length === 0) return;
    const newSeq = emojiSequence.slice(0, -1);
    setEmojiSequence(newSeq);
    send('emoji', { sequence: newSeq });
  };

  const submitGuess = () => {
    if (isDescriber || !guess.trim()) return;
    const isCorrect = guess.trim().toLowerCase() === word.toLowerCase();
    setGuessResult(isCorrect ? 'correct' : 'wrong');
    send('guess', { guess: guess.trim(), correct: isCorrect });

    if (isCorrect) {
      setTimerActive(false);
      setScores((prev) => ({
        me: !isDescriber ? prev.me + 1 : prev.me,
        them: isDescriber ? prev.them + 1 : prev.them,
      }));
    } else {
      setGuess('');
      setTimeout(() => setGuessResult(null), 1000);
    }
  };

  const nextRound = useCallback(() => {
    if (round >= TOTAL_ROUNDS) {
      setGameOver(true);
      return;
    }
    const w = getRandomWord();
    const newIsDescriber = !isDescriber;
    setWord(w);
    setRound((r) => r + 1);
    setIsDescriber(newIsDescriber);
    setEmojiSequence([]);
    setGuess('');
    setGuessResult(null);
    setTimeLeft(30);
    setTimerActive(true);
    send('next-round', {
      word: newIsDescriber ? w : '???',
      round: round + 1,
      isDescriberHost: newIsDescriber === isHost,
    });
  }, [round, isDescriber, isHost, send, getRandomWord]);

  // Timer
  useEffect(() => {
    if (!timerActive || !gameStarted) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setTimerActive(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timerActive, gameStarted]);

  useEffect(() => {
    const handler = (data: unknown) => {
      const msg = data as PeerMessage;
      if (msg.type === 'start') {
        const p = msg.payload as { word: string; isDescriberHost: boolean };
        setWord(p.isDescriberHost ? '???' : p.word);
        setIsDescriber(!p.isDescriberHost ? true : false);
        setRound(1);
        setScores({ me: 0, them: 0 });
        setEmojiSequence([]);
        setGuess('');
        setGuessResult(null);
        setGameStarted(true);
        setGameOver(false);
        setTimeLeft(30);
        setTimerActive(true);
      }
      if (msg.type === 'emoji') {
        const p = msg.payload as { sequence: string[] };
        setEmojiSequence(p.sequence);
      }
      if (msg.type === 'guess') {
        const p = msg.payload as { guess: string; correct: boolean };
        if (p.correct) {
          setGuessResult('correct');
          setTimerActive(false);
          setScores((prev) => ({
            me: isDescriber ? prev.me + 1 : prev.me,
            them: !isDescriber ? prev.them + 1 : prev.them,
          }));
        }
      }
      if (msg.type === 'next-round') {
        const p = msg.payload as { word: string; round: number; isDescriberHost: boolean };
        const iAmDescriber = p.isDescriberHost ? isHost : !isHost;
        setWord(iAmDescriber ? p.word : '???');
        setIsDescriber(iAmDescriber);
        setRound(p.round);
        setEmojiSequence([]);
        setGuess('');
        setGuessResult(null);
        setTimeLeft(30);
        setTimerActive(true);
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
  }, [connection, isHost, isDescriber]);

  if (!gameStarted) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-5xl">😄</p>
        <h2 className="text-2xl font-bold">Emoji Charades</h2>
        <p className="text-gray-400">One player describes a word using only emojis. The other guesses! Take turns each round.</p>
        {isHost ? (
          <button
            onClick={startGame}
            className="px-8 py-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-lg transition-colors"
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
    <div className="flex flex-col items-center gap-6 w-full max-w-lg mx-auto">
      <div className="flex items-center gap-8 text-center">
        <div>
          <p className="text-sm text-gray-400">You</p>
          <p className="text-2xl font-bold text-purple-400">{scores.me}</p>
        </div>
        <div className="text-center">
          <p className="text-sm text-gray-500">Round {round}/{TOTAL_ROUNDS}</p>
          <p className={`text-xl font-bold ${timeLeft <= 5 ? 'text-red-400' : 'text-gray-300'}`}>{timeLeft}s</p>
        </div>
        <div>
          <p className="text-sm text-gray-400">Opponent</p>
          <p className="text-2xl font-bold text-blue-400">{scores.them}</p>
        </div>
      </div>

      <div className={`px-4 py-1 rounded-full text-sm font-medium ${isDescriber ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}`}>
        {isDescriber ? '🎭 You describe with emojis' : '🤔 Guess the word!'}
      </div>

      {/* Word (visible to describer only) */}
      {isDescriber && (
        <div className="text-center p-4 rounded-xl bg-gray-900 border border-gray-800">
          <p className="text-xs text-gray-500">Your word:</p>
          <p className="text-2xl font-bold text-white">{word}</p>
        </div>
      )}

      {/* Emoji display area */}
      <div className="w-full p-6 rounded-2xl bg-gray-900 border border-gray-800 min-h-[80px] flex items-center justify-center gap-2">
        {emojiSequence.length > 0 ? (
          emojiSequence.map((e, i) => (
            <span key={i} className="text-4xl">{e}</span>
          ))
        ) : (
          <p className="text-gray-600">
            {isDescriber ? 'Tap emojis below to describe the word' : 'Waiting for emojis...'}
          </p>
        )}
      </div>

      {/* Describer: emoji palette */}
      {isDescriber && (
        <div className="w-full space-y-2">
          <div className="flex justify-between">
            <p className="text-xs text-gray-500">{emojiSequence.length}/5 emojis</p>
            <button
              onClick={removeLastEmoji}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              ← Remove last
            </button>
          </div>
          <div className="grid grid-cols-8 gap-1.5">
            {EMOJI_PALETTE.map((emoji, i) => (
              <button
                key={i}
                onClick={() => addEmoji(emoji)}
                disabled={emojiSequence.length >= 5}
                className="text-2xl p-1 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-30"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Guesser: input */}
      {!isDescriber && guessResult !== 'correct' && timeLeft > 0 && (
        <div className="flex gap-2 w-full">
          <input
            type="text"
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            placeholder="Type your guess..."
            className="flex-1 px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-orange-500"
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitGuess();
            }}
            autoFocus
          />
          <button
            onClick={submitGuess}
            disabled={!guess.trim()}
            className="px-6 py-3 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold transition-colors"
          >
            Guess
          </button>
        </div>
      )}

      {guessResult === 'wrong' && (
        <p className="text-red-400 font-medium animate-shake">Wrong! Try again</p>
      )}

      {(guessResult === 'correct' || timeLeft === 0) && (
        <div className="text-center space-y-4">
          <p className="text-4xl">{guessResult === 'correct' ? '🎉' : '⏰'}</p>
          <p className="text-xl font-bold">
            {guessResult === 'correct' ? 'Correct!' : `Time's up! The word was "${word}"`}
          </p>
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
