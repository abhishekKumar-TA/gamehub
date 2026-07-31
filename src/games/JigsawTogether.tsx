"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DataConnection } from "peerjs";
import { PeerMessage } from "@/types";

interface Props {
  connection: DataConnection;
  isHost: boolean;
}

interface PieceState {
  id: number;
  correctRow: number;
  correctCol: number;
  x: number;
  y: number;
  placed: boolean;
}

const PUZZLE_IMAGES = [
  "https://picsum.photos/id/10/600/600",
  "https://picsum.photos/id/15/600/600",
  "https://picsum.photos/id/29/600/600",
  "https://picsum.photos/id/37/600/600",
  "https://picsum.photos/id/42/600/600",
  "https://picsum.photos/id/49/600/600",
  "https://picsum.photos/id/65/600/600",
  "https://picsum.photos/id/84/600/600",
  "https://picsum.photos/id/106/600/600",
  "https://picsum.photos/id/152/600/600",
  "https://picsum.photos/id/167/600/600",
  "https://picsum.photos/id/180/600/600",
  "https://picsum.photos/id/200/600/600",
  "https://picsum.photos/id/237/600/600",
  "https://picsum.photos/id/250/600/600",
  "https://picsum.photos/id/292/600/600",
];

const DIFFICULTY_OPTIONS = [
  { label: "Easy (9 pcs)", grid: 3 },
  { label: "Medium (16 pcs)", grid: 4 },
  { label: "Hard (25 pcs)", grid: 5 },
  { label: "Expert (36 pcs)", grid: 6 },
];

// Generate jigsaw tab path for a piece edge
// dir: 1 = tab sticking out, -1 = blank (indent), 0 = flat (border)
function edgePath(
  x0: number, y0: number, x1: number, y1: number, dir: number
): string {
  if (dir === 0) return `L ${x1} ${y1}`;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  // Normal vector (perpendicular)
  const nx = -dy * 0.15 * dir;
  const ny = dx * 0.15 * dir;
  // Tab dimensions
  const t = 0.35; // tab width fraction
  const p1x = x0 + dx * (0.5 - t / 2);
  const p1y = y0 + dy * (0.5 - t / 2);
  const p2x = x0 + dx * (0.5 + t / 2);
  const p2y = y0 + dy * (0.5 + t / 2);
  return (
    `L ${p1x} ${p1y} ` +
    `C ${p1x + nx * 0.3} ${p1y + ny * 0.3}, ${mx + nx - dx * 0.15} ${my + ny - dy * 0.15}, ${mx + nx} ${my + ny} ` +
    `C ${mx + nx + dx * 0.15} ${my + ny + dy * 0.15}, ${p2x + nx * 0.3} ${p2y + ny * 0.3}, ${p2x} ${p2y} ` +
    `L ${x1} ${y1}`
  );
}

function generateEdgeMap(grid: number): number[][] {
  // For each internal edge, randomly assign tab direction
  // Horizontal edges: grid * (grid-1) edges
  // Vertical edges: (grid-1) * grid edges
  // Store as: horizontal[row][col] and vertical[row][col]
  const horizontal: number[][] = [];
  const vertical: number[][] = [];
  for (let r = 0; r <= grid; r++) {
    horizontal.push([]);
    for (let c = 0; c < grid; c++) {
      if (r === 0 || r === grid) horizontal[r].push(0); // border = flat
      else horizontal[r].push(Math.random() > 0.5 ? 1 : -1);
    }
  }
  for (let r = 0; r < grid; r++) {
    vertical.push([]);
    for (let c = 0; c <= grid; c++) {
      if (c === 0 || c === grid) vertical[r].push(0); // border = flat
      else vertical[r].push(Math.random() > 0.5 ? 1 : -1);
    }
  }
  // Flatten into single array for transmission
  return [horizontal.flat(), vertical.flat()];
}

function getPieceClipPath(
  row: number, col: number, grid: number, pieceSize: number,
  hEdges: number[], vEdges: number[]
): string {
  const x = 0;
  const y = 0;
  const s = pieceSize;
  // Get edge directions
  // For adjacent pieces to interlock, one side gets +dir (tab) and the other gets -dir (indent)
  const top = hEdges[row * grid + col];
  const bottom = hEdges[(row + 1) * grid + col]; // same sign as stored; path uses -bottom for correct opposing direction
  const left = vEdges[row * (grid + 1) + col];   // same sign as stored; path uses -left for correct opposing direction
  const right = vEdges[row * (grid + 1) + (col + 1)];

  let path = `M ${x} ${y} `;
  // Top edge (left to right)
  path += edgePath(x, y, x + s, y, top);
  // Right edge (top to bottom)
  path += edgePath(x + s, y, x + s, y + s, right);
  // Bottom edge (right to left)
  path += edgePath(x + s, y + s, x, y + s, -bottom);
  // Left edge (bottom to top)
  path += edgePath(x, y + s, x, y, -left);
  path += "Z";
  return path;
}

function scatterPieces(grid: number, boardWidth: number, boardHeight: number): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  const total = grid * grid;
  const margin = 20;
  // Scatter around the edges and workspace
  for (let i = 0; i < total; i++) {
    const side = Math.floor(Math.random() * 4);
    let x: number, y: number;
    switch (side) {
      case 0: // top area
        x = margin + Math.random() * (boardWidth - margin * 2);
        y = margin + Math.random() * 60;
        break;
      case 1: // bottom area
        x = margin + Math.random() * (boardWidth - margin * 2);
        y = boardHeight - 60 - margin + Math.random() * 60;
        break;
      case 2: // left area
        x = margin + Math.random() * 80;
        y = margin + Math.random() * (boardHeight - margin * 2);
        break;
      default: // right area
        x = boardWidth - 80 - margin + Math.random() * 80;
        y = margin + Math.random() * (boardHeight - margin * 2);
        break;
    }
    positions.push({ x, y });
  }
  return positions;
}

export default function JigsawTogether({ connection, isHost }: Props) {
  const [pieces, setPieces] = useState<PieceState[]>([]);
  const [imageUrl, setImageUrl] = useState("");
  const [grid, setGrid] = useState(4);
  const [hEdges, setHEdges] = useState<number[]>([]);
  const [vEdges, setVEdges] = useState<number[]>([]);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [startTime, setStartTime] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [showReference, setShowReference] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [selectedDifficulty, setSelectedDifficulty] = useState(1); // default Medium
  const boardRef = useRef<HTMLDivElement>(null);

  const BOARD_WIDTH = 700;
  const BOARD_HEIGHT = 600;
  const PUZZLE_AREA_SIZE = 320;
  const PUZZLE_OFFSET_X = (BOARD_WIDTH - PUZZLE_AREA_SIZE) / 2;
  const PUZZLE_OFFSET_Y = (BOARD_HEIGHT - PUZZLE_AREA_SIZE) / 2;

  const pieceSize = PUZZLE_AREA_SIZE / grid;
  const SNAP_DISTANCE = pieceSize * 0.3;

  const send = useCallback(
    (type: string, payload: unknown = {}) => {
      const msg: PeerMessage = { type, payload };
      connection.send(msg);
    },
    [connection],
  );

  const startGame = useCallback(() => {
    const g = DIFFICULTY_OPTIONS[selectedDifficulty].grid;
    setGrid(g);
    const img = PUZZLE_IMAGES[Math.floor(Math.random() * PUZZLE_IMAGES.length)];
    const [hE, vE] = generateEdgeMap(g);
    const scattered = scatterPieces(g, BOARD_WIDTH, BOARD_HEIGHT);
    const newPieces: PieceState[] = [];
    for (let r = 0; r < g; r++) {
      for (let c = 0; c < g; c++) {
        const id = r * g + c;
        newPieces.push({
          id,
          correctRow: r,
          correctCol: c,
          x: scattered[id].x,
          y: scattered[id].y,
          placed: false,
        });
      }
    }
    // Shuffle order for z-index
    for (let i = newPieces.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newPieces[i], newPieces[j]] = [newPieces[j], newPieces[i]];
    }
    setPieces(newPieces);
    setImageUrl(img);
    setHEdges(hE);
    setVEdges(vE);
    setGameStarted(true);
    setGameOver(false);
    setStartTime(Date.now());
    setImageLoaded(false);
    send("start", { pieces: newPieces, imageUrl: img, grid: g, hEdges: hE, vEdges: vE });
  }, [send, selectedDifficulty]);

  const handleMouseDown = (e: React.MouseEvent, pieceId: number) => {
    if (gameOver) return;
    const piece = pieces.find((p) => p.id === pieceId);
    if (!piece || piece.placed) return;
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    setDragging(pieceId);
    setDragOffset({
      x: e.clientX - rect.left - piece.x,
      y: e.clientY - rect.top - piece.y,
    });
    // Bring to front
    setPieces((prev) => {
      const idx = prev.findIndex((p) => p.id === pieceId);
      if (idx === -1) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.push(item);
      return copy;
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging === null) return;
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const x = e.clientX - rect.left - dragOffset.x;
    const y = e.clientY - rect.top - dragOffset.y;
    setPieces((prev) =>
      prev.map((p) => (p.id === dragging ? { ...p, x, y } : p)),
    );
  };

  const handleMouseUp = () => {
    if (dragging === null) return;
    const piece = pieces.find((p) => p.id === dragging);
    if (piece && !piece.placed) {
      // Check if close to correct position
      const correctX = PUZZLE_OFFSET_X + piece.correctCol * pieceSize;
      const correctY = PUZZLE_OFFSET_Y + piece.correctRow * pieceSize;
      const dist = Math.sqrt((piece.x - correctX) ** 2 + (piece.y - correctY) ** 2);
      if (dist < SNAP_DISTANCE) {
        const newPieces = pieces.map((p) =>
          p.id === dragging ? { ...p, x: correctX, y: correctY, placed: true } : p,
        );
        setPieces(newPieces);
        send("place", { pieceId: dragging, x: correctX, y: correctY });
        // Check win
        if (newPieces.every((p) => p.placed)) {
          setGameOver(true);
          send("complete", { time: Date.now() - startTime });
        }
      }
    }
    setDragging(null);
  };

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent, pieceId: number) => {
    if (gameOver) return;
    const piece = pieces.find((p) => p.id === pieceId);
    if (!piece || piece.placed) return;
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const touch = e.touches[0];
    setDragging(pieceId);
    setDragOffset({
      x: touch.clientX - rect.left - piece.x,
      y: touch.clientY - rect.top - piece.y,
    });
    setPieces((prev) => {
      const idx = prev.findIndex((p) => p.id === pieceId);
      if (idx === -1) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.push(item);
      return copy;
    });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (dragging === null) return;
    e.preventDefault();
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left - dragOffset.x;
    const y = touch.clientY - rect.top - dragOffset.y;
    setPieces((prev) =>
      prev.map((p) => (p.id === dragging ? { ...p, x, y } : p)),
    );
  };

  const handleTouchEnd = () => {
    handleMouseUp();
  };

  // Timer
  useEffect(() => {
    if (!gameStarted || gameOver) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [gameStarted, gameOver, startTime]);

  // Network handler
  useEffect(() => {
    const handler = (data: unknown) => {
      const msg = data as PeerMessage;
      if (msg.type === "start") {
        const p = msg.payload as { pieces: PieceState[]; imageUrl: string; grid: number; hEdges: number[]; vEdges: number[] };
        setPieces(p.pieces);
        setImageUrl(p.imageUrl);
        setGrid(p.grid);
        setHEdges(p.hEdges);
        setVEdges(p.vEdges);
        setGameStarted(true);
        setGameOver(false);
        setStartTime(Date.now());
        setImageLoaded(false);
      }
      if (msg.type === "place") {
        const p = msg.payload as { pieceId: number; x: number; y: number };
        setPieces((prev) =>
          prev.map((piece) =>
            piece.id === p.pieceId ? { ...piece, x: p.x, y: p.y, placed: true } : piece,
          ),
        );
      }
      if (msg.type === "complete") {
        setGameOver(true);
      }
      if (msg.type === "play-again") {
        setGameStarted(false);
        setGameOver(false);
      }
    };
    connection.on("data", handler);
    return () => {
      connection.off("data", handler);
    };
  }, [connection]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  const placedCount = pieces.filter((p) => p.placed).length;
  const totalPieces = grid * grid;

  if (!gameStarted) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-5xl">🧩</p>
        <h2 className="text-2xl font-bold">Jigsaw Together</h2>
        <p className="text-gray-400">Drag pieces into place! Work together to solve the puzzle.</p>
        {isHost ? (
          <>
            <div className="flex flex-col gap-3 items-center">
              <p className="text-sm text-gray-500">Choose difficulty:</p>
              <div className="flex gap-2 flex-wrap justify-center">
                {DIFFICULTY_OPTIONS.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedDifficulty(i)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      selectedDifficulty === i
                        ? "bg-sky-600 text-white"
                        : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={startGame}
              className="px-8 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-lg transition-colors"
            >
              Start Puzzle
            </button>
          </>
        ) : (
          <p className="text-gray-400 animate-pulse">Waiting for host to choose difficulty...</p>
        )}
      </div>
    );
  }

  if (gameOver) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-5xl">🎉</p>
        <h2 className="text-3xl font-bold">Puzzle Complete!</h2>
        <p className="text-xl text-gray-300">Time: <span className="text-sky-400 font-bold">{formatTime(elapsed)}</span></p>
        <p className="text-gray-400">Great teamwork! ({totalPieces} pieces)</p>
        <div className="rounded-xl overflow-hidden border-2 border-sky-500/50 shadow-lg" style={{ width: PUZZLE_AREA_SIZE, height: PUZZLE_AREA_SIZE }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="Completed puzzle" className="w-full h-full object-cover" />
        </div>
        <button
          onClick={() => {
            setGameStarted(false);
            setGameOver(false);
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
    <div className="flex flex-col items-center gap-4 w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="" className="hidden" onLoad={() => setImageLoaded(true)} />

      <div className="flex items-center gap-6 text-center flex-wrap justify-center">
        <div className="text-sm text-gray-400">⏱️ {formatTime(elapsed)}</div>
        <div className="text-sm text-gray-400">🧩 {placedCount}/{totalPieces}</div>
        <button
          onClick={() => setShowReference(!showReference)}
          className={`text-sm px-3 py-1 rounded-lg transition-colors ${
            showReference
              ? "bg-sky-500/20 text-sky-400 border border-sky-500/30"
              : "bg-gray-800 text-gray-400 hover:text-white border border-gray-700"
          }`}
        >
          {showReference ? "🖼️ Hide Reference" : "🖼️ Show Reference"}
        </button>
      </div>

      {showReference && (
        <div className="rounded-xl overflow-hidden border border-gray-700 shadow-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="Reference" style={{ width: 200, height: 200 }} className="object-cover" />
        </div>
      )}

      {!imageLoaded && (
        <div className="flex items-center gap-2 text-gray-400">
          <div className="w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          Loading image...
        </div>
      )}

      {imageLoaded && (
        <div
          ref={boardRef}
          className="relative rounded-2xl bg-gray-900 border border-gray-700 overflow-hidden select-none touch-none"
          style={{ width: BOARD_WIDTH, height: BOARD_HEIGHT, maxWidth: "100%" }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Puzzle target area outline */}
          <div
            className="absolute border-2 border-dashed border-gray-700 rounded-lg"
            style={{
              left: PUZZLE_OFFSET_X,
              top: PUZZLE_OFFSET_Y,
              width: PUZZLE_AREA_SIZE,
              height: PUZZLE_AREA_SIZE,
            }}
          />

          {/* Grid lines in target area */}
          {Array.from({ length: grid - 1 }).map((_, i) => (
            <div key={`h${i}`}>
              <div
                className="absolute bg-gray-800"
                style={{
                  left: PUZZLE_OFFSET_X,
                  top: PUZZLE_OFFSET_Y + (i + 1) * pieceSize,
                  width: PUZZLE_AREA_SIZE,
                  height: 1,
                }}
              />
              <div
                className="absolute bg-gray-800"
                style={{
                  left: PUZZLE_OFFSET_X + (i + 1) * pieceSize,
                  top: PUZZLE_OFFSET_Y,
                  width: 1,
                  height: PUZZLE_AREA_SIZE,
                }}
              />
            </div>
          ))}

          {/* Pieces */}
          {pieces.map((piece, zIndex) => {
            const clipPath = getPieceClipPath(piece.correctRow, piece.correctCol, grid, pieceSize, hEdges, vEdges);
            const bgX = -piece.correctCol * pieceSize;
            const bgY = -piece.correctRow * pieceSize;
            const extraPad = pieceSize * 0.2; // extra space for tabs

            return (
              <div
                key={piece.id}
                className={`absolute ${piece.placed ? "" : "cursor-grab active:cursor-grabbing"} ${
                  piece.placed ? "opacity-100" : "opacity-90 hover:opacity-100"
                } ${dragging === piece.id ? "scale-105" : ""}`}
                style={{
                  left: piece.x - extraPad,
                  top: piece.y - extraPad,
                  width: pieceSize + extraPad * 2,
                  height: pieceSize + extraPad * 2,
                  zIndex: piece.placed ? 1 : zIndex + 10,
                  transition: piece.placed ? "all 0.2s ease" : dragging === piece.id ? "none" : "transform 0.1s",
                }}
                onMouseDown={(e) => handleMouseDown(e, piece.id)}
                onTouchStart={(e) => handleTouchStart(e, piece.id)}
              >
                <svg
                  width={pieceSize + extraPad * 2}
                  height={pieceSize + extraPad * 2}
                  viewBox={`${-extraPad} ${-extraPad} ${pieceSize + extraPad * 2} ${pieceSize + extraPad * 2}`}
                  className="drop-shadow-lg"
                >
                  <defs>
                    <clipPath id={`piece-${piece.id}`}>
                      <path d={clipPath} />
                    </clipPath>
                  </defs>
                  <g clipPath={`url(#piece-${piece.id})`}>
                    <image
                      href={imageUrl}
                      x={bgX}
                      y={bgY}
                      width={PUZZLE_AREA_SIZE}
                      height={PUZZLE_AREA_SIZE}
                      preserveAspectRatio="xMidYMid slice"
                    />
                  </g>
                  {!piece.placed && (
                    <path
                      d={clipPath}
                      fill="none"
                      stroke="rgba(255,255,255,0.4)"
                      strokeWidth="1.5"
                    />
                  )}
                </svg>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-gray-500">Drag pieces onto the board. They snap when close to the correct position.</p>
    </div>
  );
}
