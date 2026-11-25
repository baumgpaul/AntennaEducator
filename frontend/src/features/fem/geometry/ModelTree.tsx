/**
 * The tree of the geometry: the objects that make up the model at the top,
 * each with the steps it was built from underneath (inputs of booleans,
 * transforms applied to them). Click selects, ctrl/shift-click adds.
 */
import { useState } from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import { ChevronRight, ErrorOutlined, ExpandMore } from '@mui/icons-material';
import { STEPS, describeStep } from './steps';
import type { Role, TreeNode } from './sequence';

const ROLE_LABEL: Record<Role, string> = {
  domain: 'domain',
  hole: 'hole',
  curve: 'line',
  point: 'point',
  input: '',
  transform: '',
};

export function ModelTree({
  tree,
  selected,
  onSelect,
}: {
  tree: TreeNode[];
  selected: string[];
  onSelect: (name: string, additive: boolean) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (name: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(name)) n.delete(name);
      else n.add(name);
      return n;
    });

  const row = (node: TreeNode, depth: number): React.ReactNode => {
    const { step } = node;
    const info = STEPS[step.kind];
    const Icon = info.icon;
    const isOpen = open.has(step.name);
    const isSelected = selected.includes(step.name);
    return (
      <Box key={`${node.index}-${step.name}`}>
        <Box
          role="treeitem"
          aria-selected={isSelected}
          aria-expanded={node.children.length ? isOpen : undefined}
          aria-label={step.name}
          onClick={(e) => onSelect(step.name, e.shiftKey || e.ctrlKey || e.metaKey)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            pl: depth * 2,
            pr: 0.5,
            minHeight: 30,
            cursor: 'pointer',
            borderRadius: 1,
            bgcolor: isSelected ? 'action.selected' : undefined,
            '&:hover': { bgcolor: isSelected ? 'action.selected' : 'action.hover' },
            color: node.role === 'input' || node.role === 'transform' ? 'text.secondary' : undefined,
          }}
        >
          {node.children.length ? (
            <IconButton
              size="small"
              aria-label={isOpen ? `Collapse ${step.name}` : `Expand ${step.name}`}
              onClick={(e) => {
                e.stopPropagation();
                toggle(step.name);
              }}
              sx={{ p: 0.25 }}
            >
              {isOpen ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}
            </IconButton>
          ) : (
            <Box sx={{ width: 24, flexShrink: 0 }} />
          )}
          <Tooltip title={`${info.label}: ${describeStep(step)}`} placement="right" enterDelay={600}>
            <Icon fontSize="small" sx={{ color: node.role === 'hole' ? 'text.disabled' : 'primary.main', flexShrink: 0 }} />
          </Tooltip>
          <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0, fontStyle: node.role === 'transform' ? 'italic' : undefined }}>
            {node.role === 'transform' ? `${info.label} ${step.name}` : step.name}
          </Typography>
          {ROLE_LABEL[node.role] && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {ROLE_LABEL[node.role]}
            </Typography>
          )}
          {node.error && (
            <Tooltip title={node.error}>
              <ErrorOutlined fontSize="small" color="error" aria-label={`Error in ${step.name}`} />
            </Tooltip>
          )}
        </Box>
        {isOpen && node.children.map((c) => row(c, depth + 1))}
      </Box>
    );
  };

  if (tree.length === 0) {
    return (
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        Empty: add a shape or a line from the ribbon, or start from a template.
      </Typography>
    );
  }
  return <Box role="tree" aria-label="Geometry tree">{tree.map((n) => row(n, 0))}</Box>;
}
