/**
 * Context manifest types for code navigation.
 * These types define what the agent runtime receives as focused context
 * before making any code generation or editing call.
 */

export interface TargetFile {
  path: string;
  reason: string;
  fromLine?: number;
  toLine?: number;
  symbols?: string[];
  content?: string;
}

export interface RelatedFile {
  path: string;
  reason: string;
}

export interface ContextManifest {
  summary: string;
  targetFiles: TargetFile[];
  relatedFiles: RelatedFile[];
  warnings: string[];
  tokenEstimate?: number;
}

export interface FileEntry {
  path: string;
  relativePath: string;
  language: string;
  sizeBytes: number;
  hash: string;
}

export interface SymbolEntry {
  name: string;
  kind: 'function' | 'class' | 'variable' | 'type' | 'interface' | 'enum' | 'export' | 'import' | 'route';
  filePath: string;
  line: number;
  exported: boolean;
}

export interface SearchResult {
  filePath: string;
  line: number;
  column: number;
  matchText: string;
  contextBefore: string;
  contextAfter: string;
}
