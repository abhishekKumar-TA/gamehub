"use client";

import { useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useLobby } from "@/contexts/LobbyContext";
import { getGame } from "@/lib/gameRegistry";
import { createBotHandler, cleanupBotTimers } from "@/lib/botAI";
import RoomManager from "@/components/RoomManager";
import dynamic from "next/dynamic";

const gameComponents: Record<string, React.ComponentType<{ connection: import("peerjs").DataConnection; isHost: boolean }>> = {
  "reaction-showdown": dynamic(() => import("@/games/ReactionShowdown")),
  "finger-cricket": dynamic(() => import("@/games/FingerCricket")),
  "dots-and-boxes": dynamic(() => import("@/games/DotsAndBoxes")),
  "color-clash": dynamic(() => import("@/games/ColorClash")),
  "memory-flip": dynamic(() => import("@/games/MemoryFlip")),
  "type-racer": dynamic(() => import("@/games/TypeRacer")),
  "sync-or-sink": dynamic(() => import("@/games/SyncOrSink")),
  "word-bomb": dynamic(() => import("@/games/WordBomb")),
  "maze-race": dynamic(() => import("@/games/MazeRace")),
  "pattern-pulse": dynamic(() => import("@/games/PatternPulse")),
  "emoji-charades": dynamic(() => import("@/games/EmojiCharades")),
  "trivia-showdown": dynamic(() => import("@/games/TriviaShowdown")),
  "doodle-duel": dynamic(() => import("@/games/DoodleDuel")),
  "jigsaw-together": dynamic(() => import("@/games/JigsawTogether")),
};

export default function PlayPage() {
  const params = useParams();
  const gameId = params.gameId as string;
  const game = getGame(gameId);
  const { roomState, connection, isHost, isBotMode, createRoom, joinRoom, playWithBot, disconnect } = useLobby();

  // Wire up bot AI when in bot mode
  const botHandlerRef = useRef<((data: unknown) => void) | null>(null);
  useEffect(() => {
    if (!connection || !isBotMode) return;

    // Create a send function that pushes data back into the connection as if from a remote peer
    const sendAsBot = (data: unknown) => {
      // The BotConnection has simulateReceive which emits 'data'
      const conn = connection as unknown as { simulateReceive: (d: unknown) => void };
      if (conn.simulateReceive) {
        conn.simulateReceive(data);
      }
    };

    const handler = createBotHandler(gameId, sendAsBot);
    botHandlerRef.current = handler;

    // Listen for messages sent by the game component (via BotConnection.send -> 'bot-receive')
    connection.on("bot-receive" as never, handler);

    return () => {
      connection.off("bot-receive" as never, handler);
      botHandlerRef.current = null;
      cleanupBotTimers();
    };
  }, [connection, isBotMode, gameId]);

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-6xl">🤷</p>
          <h1 className="text-2xl font-bold">Game not found</h1>
          <Link href="/" className="text-purple-400 hover:text-purple-300">
            ← Back to games
          </Link>
        </div>
      </div>
    );
  }

  const GameComponent = gameComponents[gameId];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800/50 backdrop-blur-xl bg-gray-950/80 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-gray-400 hover:text-white transition-colors text-sm"
            >
              ← Games
            </Link>
            <div className="flex items-center gap-2">
              <span className="text-xl">{game.emoji}</span>
              <span className="font-bold text-white">{game.name}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {connection && (
              <>
                {isBotMode && (
                  <span className="text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    🤖 Bot Mode
                  </span>
                )}
                {!isBotMode && (
                  <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                    🔗 {roomState.roomCode}
                  </span>
                )}
                <button
                  onClick={disconnect}
                  className="text-sm px-3 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors"
                >
                  Leave
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8">
        {!connection ? (
          <div className="w-full max-w-lg">
            <div className="text-center mb-8">
              <span className="text-5xl mb-4 block">{game.emoji}</span>
              <h1 className="text-2xl font-bold mb-2">{game.name}</h1>
              <p className="text-gray-400">{game.description}</p>
            </div>
            <div className="space-y-4">
              <RoomManager
                roomState={roomState}
                onCreateRoom={createRoom}
                onJoinRoom={joinRoom}
                onDisconnect={disconnect}
              />
              {roomState.status === "idle" && (
                <div className="text-center pt-4 border-t border-gray-800">
                  <p className="text-xs text-gray-500 mb-3">Or test the game solo</p>
                  <button
                    onClick={playWithBot}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold transition-all hover:scale-[1.02]"
                  >
                    🤖 Play with Bot
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : GameComponent ? (
          <div className="w-full max-w-4xl">
            <GameComponent connection={connection} isHost={isHost} />
            {connection && (
              <div className="mt-6 text-center">
                <p className="text-xs text-gray-600 mb-2">Connected — switch to another game without reconnecting:</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {Object.keys(gameComponents).filter(id => id !== gameId).slice(0, 5).map(id => {
                    const g = getGame(id);
                    return g ? (
                      <Link
                        key={id}
                        href={`/play/${id}`}
                        className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors border border-gray-700"
                      >
                        {g.emoji} {g.name}
                      </Link>
                    ) : null;
                  })}
                  <Link
                    href="/"
                    className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors border border-gray-700"
                  >
                    See all →
                  </Link>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center space-y-4">
            <p className="text-4xl">🚧</p>
            <h2 className="text-xl font-bold">Coming Soon</h2>
            <p className="text-gray-400">This game is still being built!</p>
          </div>
        )}
      </main>
    </div>
  );
}
