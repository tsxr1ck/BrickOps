import { type CSSProperties, useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from 'lucide-react';

export interface FileTreeItem {
  path: string;
  size: number;
  isDir: boolean;
}

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
}

interface FileTreeProps {
  files: FileTreeItem[];
  selectedFile?: string | null;
  onFileSelect?: (path: string) => void;
  maxHeight?: string;
}

const treeStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
  overflow: 'auto',
  flex: 1,
};

const nodeRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '2px 4px',
  borderRadius: 'var(--bo-radius-sm)',
  cursor: 'pointer',
  fontSize: 'var(--bo-text-xs)',
  fontFamily: 'var(--bo-font-mono)',
  color: 'var(--bo-text)',
  transition: 'background var(--bo-transition-fast)',
  whiteSpace: 'nowrap',
  minHeight: '22px',
};

function buildTree(files: FileTreeItem[]): TreeNode[] {
  const root: TreeNode[] = [];
  const map = new Map<string, TreeNode>();

  for (const f of files) {
    const parts = f.path.split('/');
    let current = root;
    let acc = '';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      acc = acc ? `${acc}/${part}` : part;
      const isLast = i === parts.length - 1;
      let node = map.get(acc);
      if (!node) {
        node = { name: part, path: acc, isDir: !isLast || f.isDir, children: [] };
        map.set(acc, node);
        current.push(node);
      }
      if (!isLast || f.isDir) current = node.children;
    }
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) sortNodes(n.children);
  };
  sortNodes(root);
  return root;
}

function FileTreeNode({
  node,
  depth,
  selectedFile,
  onFileSelect,
  defaultExpanded,
}: {
  node: TreeNode;
  depth: number;
  selectedFile?: string | null;
  onFileSelect?: (path: string) => void;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded || depth < 2);

  if (!node.isDir) {
    return (
      <div
        style={{
          ...nodeRow,
          paddingLeft: `${depth * 16 + 4}px`,
          background: selectedFile === node.path ? 'var(--bo-accent-bg)' : 'transparent',
          color: selectedFile === node.path ? 'var(--bo-accent)' : 'var(--bo-text)',
        }}
        onClick={() => onFileSelect?.(node.path)}
        title={node.path}
      >
        <File size={12} style={{ flexShrink: 0, color: selectedFile === node.path ? 'var(--bo-accent)' : 'var(--bo-text-tertiary)' }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</span>
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          ...nodeRow,
          paddingLeft: `${depth * 16 + 4}px`,
          color: 'var(--bo-text-secondary)',
        }}
        onClick={() => setExpanded(!expanded)}
        title={node.path}
      >
        {expanded ? <ChevronDown size={11} style={{ flexShrink: 0 }} /> : <ChevronRight size={11} style={{ flexShrink: 0 }} />}
        {expanded ? <FolderOpen size={13} style={{ flexShrink: 0, color: 'var(--bo-accent)' }} /> : <Folder size={13} style={{ flexShrink: 0, color: 'var(--bo-accent-dim)' }} />}
        <span style={{ fontWeight: 500 }}>{node.name}</span>
      </div>
      {expanded && node.children.map((child) => (
        <FileTreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          selectedFile={selectedFile}
          onFileSelect={onFileSelect}
          defaultExpanded={defaultExpanded}
        />
      ))}
    </>
  );
}

export function FileTree({ files, selectedFile, onFileSelect }: FileTreeProps) {
  const tree = useMemo(() => buildTree(files), [files]);

  return (
    <div style={treeStyle}>
      {tree.map((node: TreeNode) => (
        <FileTreeNode
          key={node.path}
          node={node}
          depth={0}
          selectedFile={selectedFile}
          onFileSelect={onFileSelect}
          defaultExpanded={false}
        />
      ))}
    </div>
  );
}
