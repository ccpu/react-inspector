export interface DebugSource {
  columnNumber?: number;
  fileName?: string;
  lineNumber?: number;
}

export interface Fiber {
  _debugOwner?: Fiber | null;
  _debugSource?: DebugSource;
  _debugStack?: { stack?: string } | null;
  return?: Fiber | null;
}

export interface GeneratedFrame {
  column: number;
  line: number;
  url: string;
}

export interface StorybookIndexEntry {
  importPath?: string;
}

export interface StorybookIndex {
  entries?: Record<string, StorybookIndexEntry>;
}
