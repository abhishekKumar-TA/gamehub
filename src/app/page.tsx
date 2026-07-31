import GameCard from '@/components/GameCard';
import { games } from '@/lib/gameRegistry';
import Link from 'next/link';
import LobbyStatus from '@/components/LobbyStatus';

export default function Home() {
  const categories = [...new Set(games.map((g) => g.category))];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-800/50 backdrop-blur-xl bg-gray-950/80 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <span className="text-2xl">🎮</span>
            <span className="text-xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              GameHub
            </span>
          </Link>
          <p className="text-sm text-gray-500 hidden sm:block">
            No login &bull; No ads &bull; Just fun
          </p>
          <LobbyStatus />
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-purple-500/5 to-transparent" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-16 pb-12 text-center relative">
          <h1 className="text-4xl sm:text-6xl font-bold mb-4">
            Play Together,{' '}
            <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
              Instantly
            </span>
          </h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto mb-8">
            Free multiplayer mini-games. No login, no downloads. Create a room, share the code, play with a friend.
          </p>
          <div className="flex items-center justify-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1">🎯 {games.length} Games</span>
            <span>•</span>
            <span className="flex items-center gap-1">👥 2 Players</span>
            <span>•</span>
            <span className="flex items-center gap-1">⚡ Peer-to-Peer</span>
          </div>
        </div>
      </section>

      {/* Games Grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pb-20">
        {categories.map((category) => (
          <section key={category} className="mb-12">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2">
              <span className="w-8 h-px bg-gray-700" />
              {category}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {games
                .filter((g) => g.category === category)
                .map((game) => (
                  <GameCard key={game.id} game={game} />
                ))}
            </div>
          </section>
        ))}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800/50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center text-sm text-gray-600">
          <p>Built with Next.js &bull; Powered by WebRTC &bull; 100% Free</p>
        </div>
      </footer>
    </div>
  );
}
