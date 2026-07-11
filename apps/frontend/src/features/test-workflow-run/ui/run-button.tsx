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
        className="button-secondary bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-all font-semibold text-xs px-3 py-1.5 rounded-full cursor-pointer flex items-center gap-1.5"
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
      className={`button-primary font-semibold text-xs px-4 py-1.5 rounded-full transition-all flex items-center gap-1.5 cursor-pointer ${
        hasStaleNodes
          ? "bg-fog border border-chalk text-slate cursor-not-allowed"
          : "bg-signal-orange text-white hover:opacity-90"
      }`}
      title={hasStaleNodes ? "Cannot run with stale nodes in canvas" : "Execute test workflow"}
    >
      Run Test
    </button>
  );
}
