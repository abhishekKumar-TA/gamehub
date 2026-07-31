'use client';

import { useState } from 'react';
import { RoomState } from '@/types';

interface RoomManagerProps {
  roomState: RoomState;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onDisconnect: () => void;
}

export default function RoomManager({ roomState, onCreateRoom, onJoinRoom, onDisconnect }: RoomManagerProps) {
  const [joinCode, setJoinCode] = useState('');

  if (roomState.status === 'connected') {
    return (
      <div className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          Connected
        </div>
        <p className="text-gray-400 text-sm">Room: <span className="font-mono text-white">{roomState.roomCode}</span></p>
      </div>
    );
  }

  if (roomState.status === 'waiting') {
    return (
      <div className="text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
          <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          Waiting for opponent...
        </div>
        <div className="space-y-2">
          <p className="text-gray-400 text-sm">Share this code with your friend:</p>
          <div className="flex items-center justify-center gap-2">
            <code className="text-2xl font-mono font-bold text-white bg-gray-800 px-6 py-3 rounded-xl tracking-wider select-all">
              {roomState.roomCode}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(roomState.roomCode)}
              className="p-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
              title="Copy code"
            >
              📋
            </button>
          </div>
        </div>
        <button
          onClick={onDisconnect}
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (roomState.status === 'creating' || roomState.status === 'joining') {
    return (
      <div className="text-center space-y-4">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-400">
          {roomState.status === 'creating' ? 'Creating room...' : 'Joining room...'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {roomState.status === 'error' && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm text-center">
          {roomState.error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={onCreateRoom}
          className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 p-6 text-left transition-all hover:scale-[1.02] hover:shadow-2xl hover:shadow-purple-500/20"
        >
          <div className="text-3xl mb-2">🎮</div>
          <h3 className="text-lg font-bold text-white">Create Room</h3>
          <p className="text-sm text-purple-200/70">Start a new game and invite a friend</p>
        </button>

        <div className="rounded-2xl bg-gray-900 border border-gray-800 p-6 space-y-4">
          <div>
            <div className="text-3xl mb-2">🔗</div>
            <h3 className="text-lg font-bold text-white">Join Room</h3>
            <p className="text-sm text-gray-400">Enter the code your friend shared</p>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="SWIFT-PANDA-42"
              className="flex-1 px-4 py-2 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 font-mono text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && joinCode.trim()) {
                  onJoinRoom(joinCode.trim());
                }
              }}
            />
            <button
              onClick={() => joinCode.trim() && onJoinRoom(joinCode.trim())}
              disabled={!joinCode.trim()}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:hover:bg-purple-600 text-white font-medium transition-colors text-sm"
            >
              Join
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
