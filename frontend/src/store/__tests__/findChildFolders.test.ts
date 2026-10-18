import { describe, it, expect } from 'vitest';
import { findChildFolders, type FolderTreeNode } from '../foldersSlice';

const node = (id: string, children: FolderTreeNode[] = []) =>
  ({ id, name: id, children }) as unknown as FolderTreeNode;

// a ─ b ─ c ─ d      e
const tree = [node('a', [node('b', [node('c', [node('d')])])]), node('e')];

describe('findChildFolders (B5)', () => {
  it('returns the roots for the top level', () => {
    expect(findChildFolders(tree, null).map((n) => n.id)).toEqual(['a', 'e']);
  });

  it('finds children at every depth', () => {
    expect(findChildFolders(tree, 'a').map((n) => n.id)).toEqual(['b']);
    expect(findChildFolders(tree, 'b').map((n) => n.id)).toEqual(['c']);
    expect(findChildFolders(tree, 'c').map((n) => n.id)).toEqual(['d']);
  });

  it('returns nothing for a leaf or an unknown folder', () => {
    expect(findChildFolders(tree, 'd')).toEqual([]);
    expect(findChildFolders(tree, 'missing')).toEqual([]);
  });
});
