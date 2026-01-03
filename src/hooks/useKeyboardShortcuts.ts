import { useEffect, useCallback } from "react";

interface KeyboardShortcutsConfig {
  onInclude: () => void;
  onExclude: () => void;
  onMoveToSlotA: () => void;
  onMoveToSlotB: () => void;
  onMoveToSlotC: () => void;
  onMoveToSlotD: () => void;
  onClearSelection: () => void;
  onSelectAll: () => void;
  enabled: boolean;
}

export function useKeyboardShortcuts({
  onInclude,
  onExclude,
  onMoveToSlotA,
  onMoveToSlotB,
  onMoveToSlotC,
  onMoveToSlotD,
  onClearSelection,
  onSelectAll,
  enabled,
}: KeyboardShortcutsConfig) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      // Ignore if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case "i":
          e.preventDefault();
          onInclude();
          break;
        case "x":
          e.preventDefault();
          onExclude();
          break;
        case "1":
          e.preventDefault();
          onMoveToSlotA();
          break;
        case "2":
          e.preventDefault();
          onMoveToSlotB();
          break;
        case "3":
          e.preventDefault();
          onMoveToSlotC();
          break;
        case "4":
          e.preventDefault();
          onMoveToSlotD();
          break;
        case "escape":
          e.preventDefault();
          onClearSelection();
          break;
        case "a":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            onSelectAll();
          }
          break;
      }
    },
    [
      enabled,
      onInclude,
      onExclude,
      onMoveToSlotA,
      onMoveToSlotB,
      onMoveToSlotC,
      onMoveToSlotD,
      onClearSelection,
      onSelectAll,
    ]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);
}
