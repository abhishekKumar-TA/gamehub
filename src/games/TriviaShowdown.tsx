'use client';

import { useCallback, useEffect, useState } from 'react';
import { DataConnection } from 'peerjs';
import { PeerMessage } from '@/types';

interface Props {
  connection: DataConnection;
  isHost: boolean;
}

interface TriviaQuestion {
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
  category: string;
  difficulty: string;
}

const TOTAL_ROUNDS = 10;

function decodeHTML(html: string): string {
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export default function TriviaShowdown({ connection, isHost }: Props) {
  const [round, setRound] = useState(1);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [myAnswer, setMyAnswer] = useState('');
  const [opponentAnswer, setOpponentAnswer] = useState('');
  const [scores, setScores] = useState({ me: 0, them: 0 });
  const [showResult, setShowResult] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState('');
  const [questionsCache, setQuestionsCache] = useState<TriviaQuestion[]>([]);

  const send = useCallback(
    (type: string, payload: unknown = {}) => {
      const msg: PeerMessage = { type, payload };
      connection.send(msg);
    },
    [connection],
  );

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('https://opentdb.com/api.php?amount=15&type=multiple');
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        setQuestionsCache(data.results);
        return data.results;
      }
    } catch {
      console.error('Failed to fetch trivia');
    }
    setLoading(false);
    return [];
  }, []);

  const loadQuestion = useCallback((q: TriviaQuestion) => {
    const decoded = {
      question: decodeHTML(q.question),
      correct: decodeHTML(q.correct_answer),
      incorrect: q.incorrect_answers.map(decodeHTML),
      category: decodeHTML(q.category),
    };
    const allOptions = shuffleArray([decoded.correct, ...decoded.incorrect]);

    setQuestion(decoded.question);
    setCorrectAnswer(decoded.correct);
    setOptions(allOptions);
    setCategory(decoded.category);
    setMyAnswer('');
    setOpponentAnswer('');
    setShowResult(false);
    setLoading(false);

    return { question: decoded.question, correct: decoded.correct, options: allOptions, category: decoded.category };
  }, []);

  const startGame = useCallback(async () => {
    const questions = await fetchQuestions();
    if (questions.length === 0) return;

    setRound(1);
    setScores({ me: 0, them: 0 });
    setGameStarted(true);
    setGameOver(false);

    const qData = loadQuestion(questions[0]);
    send('start', { ...qData, totalQuestions: questions.length });
  }, [fetchQuestions, loadQuestion, send]);

  const selectAnswer = (answer: string) => {
    if (myAnswer) return;
    setMyAnswer(answer);
    send('answer', { answer });
  };

  useEffect(() => {
    if (!myAnswer || !opponentAnswer) return;

    setShowResult(true);
    const myCorrect = myAnswer === correctAnswer;
    const theirCorrect = opponentAnswer === correctAnswer;

    setScores((prev) => ({
      me: prev.me + (myCorrect ? 1 : 0),
      them: prev.them + (theirCorrect ? 1 : 0),
    }));
  }, [myAnswer, opponentAnswer, correctAnswer]);

  const nextRound = useCallback(() => {
    if (round >= TOTAL_ROUNDS || round >= questionsCache.length) {
      setGameOver(true);
      return;
    }

    const qData = loadQuestion(questionsCache[round]);
    setRound((r) => r + 1);
    send('next-round', { ...qData, round: round + 1 });
  }, [round, questionsCache, loadQuestion, send]);

  useEffect(() => {
    const handler = (data: unknown) => {
      const msg = data as PeerMessage;
      if (msg.type === 'start') {
        const p = msg.payload as { question: string; correct: string; options: string[]; category: string };
        setQuestion(p.question);
        setCorrectAnswer(p.correct);
        setOptions(p.options);
        setCategory(p.category);
        setRound(1);
        setScores({ me: 0, them: 0 });
        setMyAnswer('');
        setOpponentAnswer('');
        setShowResult(false);
        setGameStarted(true);
        setGameOver(false);
        setLoading(false);
      }
      if (msg.type === 'answer') {
        const p = msg.payload as { answer: string };
        setOpponentAnswer(p.answer);
      }
      if (msg.type === 'next-round') {
        const p = msg.payload as { question: string; correct: string; options: string[]; category: string; round: number };
        setQuestion(p.question);
        setCorrectAnswer(p.correct);
        setOptions(p.options);
        setCategory(p.category);
        setRound(p.round);
        setMyAnswer('');
        setOpponentAnswer('');
        setShowResult(false);
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
        <p className="text-5xl">❓</p>
        <h2 className="text-2xl font-bold">Trivia Showdown</h2>
        <p className="text-gray-400">Answer trivia questions! Both answer the same question. Get it right to score.</p>
        <p className="text-xs text-gray-600">Powered by Open Trivia Database</p>
        {isHost ? (
          <button
            onClick={startGame}
            disabled={loading}
            className="px-8 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-lg transition-colors"
          >
            {loading ? 'Loading...' : 'Start Game'}
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
            <p className="text-3xl font-bold text-purple-400">{scores.me}/{round}</p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Opponent</p>
            <p className="text-3xl font-bold text-blue-400">{scores.them}/{round}</p>
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
        <div className="text-gray-600 text-sm">Q{round}/{TOTAL_ROUNDS}</div>
        <div>
          <p className="text-sm text-gray-400">Opponent</p>
          <p className="text-2xl font-bold text-blue-400">{scores.them}</p>
        </div>
      </div>

      <div className="text-xs text-gray-500 px-3 py-1 rounded-full bg-gray-800">{category}</div>

      <div className="w-full p-6 rounded-2xl bg-gray-900 border border-gray-800">
        <p className="text-lg font-medium text-white">{question}</p>
      </div>

      <div className="w-full grid grid-cols-1 gap-3">
        {options.map((option, i) => {
          let style = 'bg-gray-800 hover:bg-gray-700 text-white border-gray-700';
          if (showResult) {
            if (option === correctAnswer) {
              style = 'bg-green-900/50 text-green-300 border-green-500/50';
            } else if (option === myAnswer && option !== correctAnswer) {
              style = 'bg-red-900/50 text-red-300 border-red-500/50';
            } else {
              style = 'bg-gray-800/50 text-gray-500 border-gray-700';
            }
          } else if (option === myAnswer) {
            style = 'bg-indigo-900/50 text-indigo-300 border-indigo-500/50';
          }

          return (
            <button
              key={i}
              onClick={() => selectAnswer(option)}
              disabled={!!myAnswer}
              className={`p-4 rounded-xl border text-left transition-all ${style} ${!myAnswer ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <span className="text-xs text-gray-500 mr-2">{String.fromCharCode(65 + i)}.</span>
              {option}
            </button>
          );
        })}
      </div>

      {myAnswer && !opponentAnswer && (
        <p className="text-gray-400 animate-pulse">Waiting for opponent...</p>
      )}

      {showResult && isHost && (
        <button
          onClick={nextRound}
          className="px-6 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-medium transition-colors"
        >
          {round >= TOTAL_ROUNDS ? 'See Results' : 'Next Question →'}
        </button>
      )}
    </div>
  );
}
