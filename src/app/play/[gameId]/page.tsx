'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { usePeer } from '@/hooks/usePeer';
import { getGame } from '@/lib/gameRegistry';
import RoomManager from '@/components/RoomManager';
import dynamic from 'next/dynamic';

const gameComponents: Record<string, React.ComponentType<{ connection: import('peerjs').DataConnection; isHost: boolean }>> = {
  'reaction-showdown': dynamic(() => import('@/games/ReactionShowdown')),
  'finger-cricket': dynamic(() => import('@/games/FingerCricket')),
  'dots-and-boxes': dynamic(() => import('@/games/DotsAndBoxes')),
  'color-clash': dynamic(() => import('@/games/ColorClash')),
  'memory-flip': dynamic(() => import('@/games/MemoryFlip')),
  'type-racer': dynamic(() => import('@/games/TypeRacer')),
  'sync-or-sink': dynamic(() => import('@/games/SyncOrSink')),
  'word-bomb': dynamic(() => import('@/games/WordBomb')),
  'maze-race': dynamic(() => import('@/games/MazeRace')),
  'pattern-pulse': dynamic(() => import('@/games/PatternPulse')),
  'emoji-charades': dynamic(() => import('@/games/EmojiCharades')),
  'trivia-showdown': dynamic(() => import('@/games/TriviaShowdown')),
  'doodle-duel': dynamic(() => import('@/games/DoodleDuel')),
  'jigsaw-together': dynamic(() => import('@/games/JigsawTogether')),
};

export default function PlayPage() {
  const params = useParams();
  const gameId = params.gameId as string;
  const game = getGame(gameId);
  const { roomState, connection, isHost, createRoom, joinRoom, disconnect } = usePeer(gameId);

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
          {connection && (
            <button
              onClick={disconnect}
              className="text-sm px-3 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors"
            >
              Leave
            </button>
          )}
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
            <RoomManager
              roomState={roomState}
              onCreateRoom={createRoom}
              onJoinRoom={joinRoom}
              onDisconnect={disconnect}
            />
          </div>
        ) : GameComponent ? (
          <div className="w-full max-w-4xl">
            <GameComponent connection={connection} isHost={isHost} />
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
