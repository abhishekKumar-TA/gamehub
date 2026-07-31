"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DataConnection } from "peerjs";
import { PeerMessage } from "@/types";

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
  const [targetColor, setTargetColor] = useState("");
  const [myHue, setMyHue] = useState(180);
  const [mySat, setMySat] = useState(50);
  const [myLight, setMyLight] = useState(50);
  const [submitted, setSubmitted] = useState(false);
  const [opponentSubmitted, setOpponentSubmitted] = useState(false);
  const [opponentColor, setOpponentColor] = useState("");
  const [scores, setScores] = useState({ me: 0, them: 0 });
  const [roundScore, setRoundScore] = useState<{ me: number; them: number } | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const slPickerRef = useRef<HTMLDivElement>(null);
  const hueBarRef = useRef<HTMLDivElement>(null);

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
    send("start", { color });
  }, [send]);

  const submitColor = () => {
    if (submitted) return;
    setSubmitted(true);
    send("submit-color", { color: myColor });
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
    setOpponentColor("");
    setRoundScore(null);
    setMyHue(180);
    setMySat(50);
    setMyLight(50);
    send("next-round", { color, round: round + 1 });
  }, [round, send]);

  // Hue bar click/drag
  const handleHueInteraction = (e: React.MouseEvent | React.TouchEvent) => {
    if (submitted) return;
    const bar = hueBarRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setMyHue(Math.round(x * 360));
  };

  // Saturation-Lightness picker click/drag
  const handleSLInteraction = (e: React.MouseEvent | React.TouchEvent) => {
    if (submitted) return;
    const picker = slPickerRef.current;
    if (!picker) return;
    const rect = picker.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    setMySat(Math.round(x * 100));
    setMyLight(Math.round((1 - y) * 100));
  };

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
      if (msg.type === "start") {
        const p = msg.payload as { color: string };
        setTargetColor(p.color);
        setGameStarted(true);
        setRound(1);
        setScores({ me: 0, them: 0 });
      }
      if (msg.type === "submit-color") {
        const p = msg.payload as { color: string };
        setOpponentColor(p.color);
        setOpponentSubmitted(true);
      }
      if (msg.type === "next-round") {
        const p = msg.payload as { color: string; round: number };
        setTargetColor(p.color);
        setRound(p.round);
        setSubmitted(false);
        setOpponentSubmitted(false);
        setOpponentColor("");
        setRoundScore(null);
        setMyHue(180);
        setMySat(50);
        setMyLight(50);
      }
      if (msg.type === "play-again") {
        setGameOver(false);
        setGameStarted(false);
      }
    };
    connection.on("data", handler);
    return () => {
      connection.off("data", handler);
    };
  }, [connection]);

  if (!gameStarted) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-5xl">🎨</p>
        <h2 className="text-2xl font-bold">Color Clash</h2>
        <p className="text-gray-400">Match the target color as closely as possible! Tap the palette or use the sliders.</p>
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
        <p className="text-5xl">{scores.me > scores.them ? "🏆" : scores.me < scores.them ? "😢" : "🤝"}</p>
        <h2 className="text-3xl font-bold">
          {scores.me > scores.them ? "You Win!" : scores.me < scores.them ? "You Lose!" : "It's a Tie!"}
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
            send("play-again", {});
          }}
          className="px-6 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors"
        >
          Play Again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5 w-full max-w-md mx-auto">
      {/* Score bar */}
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

      {/* Target and Your Color side by side */}
      <div className="flex items-center gap-4 w-full">
        <div className="flex-1 text-center">
          <p className="text-xs text-gray-500 mb-1">Target</p>
          <div
            className="w-full h-24 rounded-xl border-2 border-white/20 shadow-lg"
            style={{ backgroundColor: targetColor }}
          />
        </div>
        <div className="text-2xl text-gray-600">→</div>
        <div className="flex-1 text-center">
          <p className="text-xs text-gray-500 mb-1">Your pick</p>
          <div
            className="w-full h-24 rounded-xl border-2 border-purple-500/30 shadow-lg"
            style={{ backgroundColor: myColor }}
          />
        </div>
      </div>

      {!submitted && !roundScore && (
        <>
          {/* Saturation-Lightness Picker */}
          <div className="w-full space-y-1">
            <p className="text-xs text-gray-500">Tap to pick shade & brightness:</p>
            <div
              ref={slPickerRef}
              className="w-full h-40 rounded-xl cursor-crosshair relative overflow-hidden border border-gray-700"
              style={{
                background: `linear-gradient(to bottom, white, transparent, black),
                             linear-gradient(to right, hsl(${myHue}, 0%, 50%), hsl(${myHue}, 100%, 50%))`,
              }}
              onClick={handleSLInteraction}
              onMouseDown={(e) => { handleSLInteraction(e); }}
              onMouseMove={(e) => { if (e.buttons === 1) handleSLInteraction(e); }}
              onTouchStart={handleSLInteraction}
              onTouchMove={handleSLInteraction}
            >
              {/* Cursor indicator */}
              <div
                className="absolute w-5 h-5 rounded-full border-2 border-white shadow-md pointer-events-none -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `${mySat}%`,
                  top: `${100 - myLight}%`,
                  backgroundColor: myColor,
                }}
              />
            </div>
          </div>

          {/* Hue Bar */}
          <div className="w-full space-y-1">
            <p className="text-xs text-gray-500">Hue:</p>
            <div
              ref={hueBarRef}
              className="w-full h-8 rounded-lg cursor-pointer relative border border-gray-700"
              style={{
                background: "linear-gradient(to right, hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))",
              }}
              onClick={handleHueInteraction}
              onMouseDown={handleHueInteraction}
              onMouseMove={(e) => { if (e.buttons === 1) handleHueInteraction(e); }}
              onTouchStart={handleHueInteraction}
              onTouchMove={handleHueInteraction}
            >
              <div
                className="absolute top-0 bottom-0 w-3 rounded-md border-2 border-white shadow-lg pointer-events-none -translate-x-1/2"
                style={{ left: `${(myHue / 360) * 100}%`, backgroundColor: `hsl(${myHue}, 100%, 50%)` }}
              />
            </div>
          </div>

          {/* Color Palette Grid - quick pick common colors */}
          <div className="w-full space-y-1">
            <p className="text-xs text-gray-500">Quick pick:</p>
            <div className="grid grid-cols-12 gap-1">
              {Array.from({ length: 12 }).map((_, hi) => {
                const hue = hi * 30;
                return Array.from({ length: 3 }).map((_, li) => {
                  const light = 30 + li * 20;
                  const sat = 70;
                  return (
                    <button
                      key={`${hi}-${li}`}
                      className="w-full aspect-square rounded-md border border-gray-700 hover:scale-110 transition-transform"
                      style={{ backgroundColor: `hsl(${hue}, ${sat}%, ${light}%)` }}
                      onClick={() => {
                        setMyHue(hue);
                        setMySat(sat);
                        setMyLight(light);
                      }}
                    />
                  );
                });
              })}
            </div>
          </div>

          {/* Fine-tune sliders */}
          <details className="w-full">
            <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300">Fine-tune with sliders</summary>
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-8">H</span>
                <input type="range" min="0" max="360" value={myHue} onChange={(e) => setMyHue(Number(e.target.value))} className="flex-1" />
                <span className="text-xs text-gray-400 w-8">{myHue}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-8">S</span>
                <input type="range" min="0" max="100" value={mySat} onChange={(e) => setMySat(Number(e.target.value))} className="flex-1" />
                <span className="text-xs text-gray-400 w-8">{mySat}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-8">L</span>
                <input type="range" min="0" max="100" value={myLight} onChange={(e) => setMyLight(Number(e.target.value))} className="flex-1" />
                <span className="text-xs text-gray-400 w-8">{myLight}</span>
              </div>
            </div>
          </details>

          <button
            onClick={submitColor}
            className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold transition-colors text-lg"
          >
            🎯 Lock In Color
          </button>
        </>
      )}

      {submitted && !roundScore && (
        <p className="text-center text-gray-400 animate-pulse">Waiting for opponent...</p>
      )}

      {/* Round results */}
      {roundScore && (
        <div className="text-center space-y-4 p-6 rounded-2xl bg-gray-900 border border-gray-800 w-full">
          <div className="flex items-center justify-center gap-6">
            <div className="text-center">
              <p className="text-xs text-gray-500">You</p>
              <div className="w-14 h-14 rounded-lg mx-auto mb-1 border border-white/10" style={{ backgroundColor: myColor }} />
              <p className="text-xl font-bold text-purple-400">+{roundScore.me}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">Target</p>
              <div className="w-14 h-14 rounded-lg mx-auto mb-1 border border-white/10" style={{ backgroundColor: targetColor }} />
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">Opponent</p>
              <div className="w-14 h-14 rounded-lg mx-auto mb-1 border border-white/10" style={{ backgroundColor: opponentColor }} />
              <p className="text-xl font-bold text-blue-400">+{roundScore.them}</p>
            </div>
          </div>
          {isHost && (
            <button
              onClick={nextRound}
              className="px-6 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-medium transition-colors"
            >
              {round >= TOTAL_ROUNDS ? "See Results" : "Next Round →"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
