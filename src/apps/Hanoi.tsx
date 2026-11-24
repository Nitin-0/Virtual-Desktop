import React, { useState } from "react";
import { useOS } from "../context/OSContext";
import type { AppWindow } from "../os/types";

export function HanoiApp({ win }: { win: AppWindow }) {
  const { closeWindow } = useOS();

  const [discCount, setDiscCount] = useState(4);
  const [towers, setTowers] = useState<number[][]>([[4, 3, 2, 1], [], []]);

  const [selectedSource, setSelectedSource] = useState<number | null>(null);

  const [dragging, setDragging] = useState<{
    from: number;
    disc: number;
  } | null>(null);

  const [dragOver, setDragOver] = useState<number | null>(null);

  const [moves, setMoves] = useState(0);
  const [message, setMessage] = useState("Select or drag a disc to begin");

  const colors = [
    "from-cyan-400 to-blue-500",
    "from-violet-400 to-purple-600",
    "from-pink-400 to-rose-500",
    "from-amber-300 to-orange-500",
    "from-emerald-400 to-green-600",
    "from-sky-300 to-cyan-500",
    "from-red-400 to-rose-600",
    "from-fuchsia-400 to-purple-600",
  ];

  const minMoves = Math.pow(2, discCount) - 1;
  const won = towers[2].length === discCount;

  const shownMessage = won ? "🎉 Puzzle completed! Amazing work!" : message;

  // Reset game
  const resetGame = (count = discCount) => {
    setDiscCount(count);

    setTowers([Array.from({ length: count }, (_, i) => count - i), [], []]);

    setSelectedSource(null);
    setDragging(null);
    setDragOver(null);
    setMoves(0);
    setMessage("Select or drag a disc to begin");
  };

  // Common move validation and execution
  const performMove = (from: number, to: number) => {
    if (from === to || won) return false;

    const source = [...towers[from]];
    const destination = [...towers[to]];

    const disc = source[source.length - 1];
    const destinationTop = destination[destination.length - 1];

    if (disc === undefined) return false;

    if (destinationTop !== undefined && disc > destinationTop) {
      setMessage("⚠️ Invalid move! Larger discs cannot go on smaller discs.");
      return false;
    }

    source.pop();
    destination.push(disc);

    const updated = [...towers];
    updated[from] = source;
    updated[to] = destination;

    setTowers(updated);
    setMoves((m) => m + 1);
    setMessage("Nice move! Keep going.");

    return true;
  };

  // Click-to-move support
  const handleClick = (idx: number) => {
    if (won || dragging) return;

    if (selectedSource === null) {
      if (towers[idx].length > 0) {
        setSelectedSource(idx);
        setMessage(`Tower ${idx + 1} selected. Choose destination.`);
      }
      return;
    }

    if (selectedSource === idx) {
      setSelectedSource(null);
      setMessage("Selection cancelled");
      return;
    }

    performMove(selectedSource, idx);
    setSelectedSource(null);
  };

  // Drag start
  const handleDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    towerIdx: number,
    disc: number,
    isTop: boolean,
  ) => {
    if (!isTop || won) {
      e.preventDefault();
      return;
    }

    setDragging({
      from: towerIdx,
      disc,
    });

    setSelectedSource(towerIdx);

    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(disc));
  };

  // Drag over tower
  const handleDragOver = (
    e: React.DragEvent<HTMLButtonElement>,
    towerIdx: number,
  ) => {
    e.preventDefault();

    if (!dragging || won) return;

    e.dataTransfer.dropEffect = "move";
    setDragOver(towerIdx);
  };

  // Drop disc
  const handleDrop = (
    e: React.DragEvent<HTMLButtonElement>,
    towerIdx: number,
  ) => {
    e.preventDefault();

    if (!dragging || won) return;

    const { from, disc } = dragging;

    const actualTop = towers[from][towers[from].length - 1];

    if (actualTop !== disc) {
      setMessage("⚠️ Disc is no longer available.");
    } else if (from !== towerIdx) {
      performMove(from, towerIdx);
    }

    setDragging(null);
    setDragOver(null);
    setSelectedSource(null);
  };

  // Drag cleanup
  const handleDragEnd = () => {
    setDragging(null);
    setDragOver(null);
    setSelectedSource(null);
  };

  return (
    <div className="h-full min-h-[480px] flex flex-col text-white bg-[#0b1020] overflow-hidden">
      {/* HEADER */}
      <header className="flex items-center justify-between px-6 py-5 border-b border-white/10">
        <div>
          <div className="text-xs tracking-[0.25em] text-cyan-400 uppercase font-semibold">
            Mind Games
          </div>

          <h2 className="text-2xl font-bold mt-1">Tower of Hanoi</h2>

          <p className="text-xs text-slate-400 mt-1">
            Think smart. Move precisely.
          </p>
        </div>

        <button
          onClick={() => { void closeWindow(win.id); }}
          className="w-9 h-9 rounded-xl bg-white/5 hover:bg-red-500/20 text-slate-300 hover:text-red-400 transition"
        >
          ✕
        </button>
      </header>

      {/* STATS */}
      <div className="grid grid-cols-3 gap-3 px-5 py-5">
        {[
          { label: "MOVES", value: moves },
          { label: "BEST POSSIBLE", value: minMoves },
          { label: "REMAINING", value: Math.max(0, minMoves - moves) },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl bg-white/[0.05] border border-white/10 p-3 text-center"
          >
            <div className="text-[10px] tracking-wider text-slate-400 font-semibold">
              {stat.label}
            </div>

            <div className="text-2xl font-bold mt-1 text-white">
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* GAME AREA */}
      <main className="flex-1 px-4 pb-4 flex flex-col">

<div className="flex justify-between items-center mb-4">
  <div>
    <h3 className="font-semibold text-sm">
      Game Board
    </h3>
    <p className="text-xs text-slate-500">
      Move all discs to the third tower
    </p>
  </div>

  {/* Disc counter */}
  <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl p-1">
    <button
      onClick={() => resetGame(Math.max(3, discCount - 1))}
      disabled={discCount <= 3}
      className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white font-bold"
    >
      −
    </button>

    <div className="min-w-[65px] text-center">
      <div className="text-sm font-bold text-cyan-300">
        {discCount}
      </div>
      <div className="text-[9px] text-slate-400">
        DISCS
      </div>
    </div>

    <button
      onClick={() => resetGame(Math.min(12, discCount + 1))}
      disabled={discCount >= 12}
      className="w-8 h-8 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-30 text-white font-bold"
    >
      +
    </button>
  </div>
</div>


        {/* TOWERS */}
        <div className="flex-1 min-h-[230px] rounded-3xl border border-white/10 bg-gradient-to-b from-[#17223b] to-[#10182a] px-2 pt-6 pb-5 flex items-end justify-around relative">
          {towers.map((tower, idx) => (
            <button
              key={idx}
              onClick={() => handleClick(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragLeave={() => {
                if (dragOver === idx) setDragOver(null);
              }}
              onDrop={(e) => handleDrop(e, idx)}
              className={`relative flex-1 h-full flex flex-col justify-end items-center rounded-xl transition-all duration-200 ${
                dragOver === idx
                  ? "bg-cyan-400/20 ring-2 ring-cyan-400 scale-[1.02]"
                  : selectedSource === idx
                    ? "bg-cyan-400/10 ring-1 ring-cyan-400/50"
                    : "hover:bg-white/[0.03]"
              }`}
            >
              {/* TOWER POLE */}
              <div className="absolute bottom-7 w-2 h-[75%] rounded-full bg-gradient-to-r from-slate-500 to-slate-300 shadow-lg pointer-events-none" />

              {/* DISCS */}
              {/* <div className="relative z-10 w-full flex flex-col items-center justify-end mb-7 gap-[3px] pointer-events-none"> */}
              <div className="relative z-10 w-full flex flex-col-reverse items-center justify-start mb-7 gap-[3px] pointer-events-none">
                {tower.map((size, i) => {
                  const isTop = i === tower.length - 1;

                  const isDragging =
                    dragging?.from === idx && dragging?.disc === size;

                  return (
                    <div
                      key={size}
                      draggable={isTop && !won}
                      onDragStart={(e) => {
                        e.stopPropagation();
                        handleDragStart(e, idx, size, isTop);
                      }}
                      onDragEnd={handleDragEnd}
                      className={`h-4 rounded-lg bg-gradient-to-r ${
                        colors[(size - 1) % colors.length]
                      } shadow-md flex items-center justify-center text-[10px] font-bold text-white transition-all duration-200 pointer-events-auto ${
                        isTop
                          ? "cursor-grab active:cursor-grabbing hover:brightness-125"
                          : "cursor-default"
                      } ${isDragging ? "opacity-40 scale-90" : ""}`}
                      style={{
                        width: `${Math.min(90, 28 + size * 10)}%`,
                        maxWidth: "130px",
                      }}
                    >
                      {size}
                    </div>
                  );
                })}
              </div>

              {/* BASE */}
              <div className="absolute bottom-4 w-[85%] h-3 rounded-full bg-gradient-to-b from-slate-300 to-slate-500 shadow-lg pointer-events-none" />

              {/* TOWER LABEL */}
              <span
                className={`absolute bottom-0 text-[10px] font-bold tracking-widest pointer-events-none ${
                  selectedSource === idx ? "text-cyan-300" : "text-slate-500"
                }`}
              >
                TOWER {idx + 1}
              </span>
            </button>
          ))}
        </div>

        {/* STATUS */}
        <div
          className={`mt-4 p-3 rounded-xl text-center text-sm border ${
            won
              ? "bg-emerald-400/10 border-emerald-400/30 text-emerald-300"
              : "bg-white/[0.04] border-white/10 text-slate-300"
          }`}
        >
          {shownMessage}
        </div>

        {/* PROGRESS */}
        <div className="mt-4">
          <div className="flex justify-between text-xs text-slate-400 mb-2">
            <span>Game progress</span>

            <span>{Math.round((towers[2].length / discCount) * 100)}%</span>
          </div>

          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 to-violet-500 rounded-full transition-all duration-500"
              style={{
                width: `${(towers[2].length / discCount) * 100}%`,
              }}
            />
          </div>
        </div>
      </main>

      {/* FOOTER CONTROLS */}
      <footer className="px-5 py-4 border-t border-white/10 bg-[#0d1425]">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="block text-[10px] text-slate-400 font-bold tracking-wider mb-1">
              DIFFICULTY
            </label>

            <select
              value={discCount}
              onChange={(e) => resetGame(Number(e.target.value))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none"
            >
              {[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                <option key={n} value={n} className="bg-slate-900">
                  {n} Discs
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => resetGame()}
            className="mt-5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 active:scale-95 transition font-semibold text-sm shadow-lg shadow-blue-500/20"
          >
            ↻ Restart
          </button>
        </div>

        <p className="text-center text-[10px] text-slate-500 mt-3">
          Drag the top disc to another tower or click to move.
        </p>
      </footer>
    </div>
  );
}