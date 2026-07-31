"use client";

import { useLobby } from "@/contexts/LobbyContext";

export default function LobbyStatus() {
  const { roomState, connection, isBotMode, disconnect } = useLobby();

  if (!connection) return null;

  return (
    <div className="flex items-center gap-2">
      {isBotMode ? (
        <span className="text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
          🤖 Bot Mode
        </span>
      ) : (
        <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
          🔗 {roomState.roomCode}
        </span>
      )}
      <button
        onClick={disconnect}
        className="text-xs px-2 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors"
      >
        Leave
      </button>
    </div>
  );
}
