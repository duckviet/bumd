"use client";

type RunButtonProps = {
  readonly running: boolean;
  readonly hasStaleNodes: boolean;
  readonly onRun: () => void;
  readonly onCancel: () => void;
};

export function RunButton({ running, hasStaleNodes, onRun, onCancel }: RunButtonProps) {
  if (running) {
    return (
      <button
        type="button"
        onClick={onCancel}
        className="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100"
      >
        <span className="w-1.5 h-1.5 bg-red-600 rounded-full animate-ping" />
        Cancel Run
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onRun}
      disabled={hasStaleNodes}
      className={`flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-semibold transition-[background-color,opacity] ${
        hasStaleNodes
          ? "cursor-not-allowed border-chalk bg-fog text-slate"
          : "border-carbon bg-carbon text-paper hover:bg-graphite"
      }`}
      title={hasStaleNodes ? "Cannot run with stale nodes in canvas" : "Execute test workflow"}
    >
      Run Test
    </button>
  );
}
