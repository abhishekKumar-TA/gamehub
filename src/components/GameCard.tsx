'use client';

import Link from 'next/link';
import { GameDefinition } from '@/types';

export default function GameCard({ game }: { game: GameDefinition }) {
  return (
    <Link href={`/play/${game.id}`}>
      <div className="group relative overflow-hidden rounded-2xl bg-gray-900 border border-gray-800 hover:border-gray-600 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-purple-500/10 cursor-pointer">
        <div
          className={`absolute inset-0 bg-gradient-to-br ${game.color} opacity-10 group-hover:opacity-20 transition-opacity`}
        />
        <div className="relative p-6">
          <div className="text-4xl mb-3">{game.emoji}</div>
          <h3 className="text-lg font-bold text-white mb-1">{game.name}</h3>
          <p className="text-sm text-gray-400 leading-relaxed">{game.description}</p>
          <div className="mt-4 flex items-center gap-2">
            <span className="text-xs px-2 py-1 rounded-full bg-gray-800 text-gray-300 capitalize">
              {game.category}
            </span>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-800 text-gray-300">
              {game.minPlayers}P
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
