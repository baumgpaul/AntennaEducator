/**
 * DocumentationPanel — TipTap-based WYSIWYG Markdown editor
 *
 * Features:
 *   - Rich-text editing with toolbar (bold, italic, headings, lists, etc.)
 *   - KaTeX math rendering (inline $ and block $$)
 *   - Image drag-drop/paste upload to S3 via presigned URLs
 *   - Auto-save with debounce
 *   - Collapsible right-side panel (appears on all tabs)
 */

import { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import {
  Box,
  IconButton,
  Tooltip,
  Typography,
  Divider,
  CircularProgress,
  Chip,
  ToggleButtonGroup,
  ToggleButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  Close as CloseIcon,
  FormatBold,
  FormatItalic,
  Code as CodeIcon,
  FormatListBulleted,
  FormatListNumbered,
  FormatQuote,
  HorizontalRule,
  Undo,
  Redo,
  Image as ImageIcon,
  Functions as FunctionsIcon,
  Title as TitleIcon,
  Save as SaveIcon,
  Edit as EditIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import ImageExtension from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { debounce } from 'lodash';

import { useAppDispatch, useAppSelector } from '@/store/hooks';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extract markdown text from TipTap editor via tiptap-markdown storage. */
function getMarkdownFromEditor(editor: ReturnType<typeof useEditor>): string {
  if (!editor) return '';
  // tiptap-markdown adds a `markdown` key to editor.storage
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storage = editor.storage as any;
  return (storage.markdown?.getMarkdown?.() as string) ?? '';
}
import {
  fetchDocumentation,
  saveDocumentation,
  uploadImage,
  setContent,
  closePanel,
} from '@/store/documentationSlice';

// ── Constants ────────────────────────────────────────────────────────────────

const AUTO_SAVE_DELAY_MS = 2000;
const PANEL_WIDTH = 420;

/** Common KaTeX formula templates for quick insertion. */
const FORMULA_TEMPLATES = [
  { label: 'Inline math', template: '$E = mc^2$', description: 'Inline equation' },
  { label: 'Block math', template: '\n$$\n\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}\n$$\n', description: 'Display equation' },
  { label: 'Impedance', template: '$Z = R + jX$', description: 'Complex impedance' },
  { label: 'Wavelength', template: '$\\lambda = \\frac{c}{f}$', description: 'Wavelength formula' },
  { label: 'Directivity', template: '$D = \\frac{4\\pi U_{max}}{P_{rad}}$', description: 'Directivity' },
  { label: 'Friis', template: '$\\frac{P_r}{P_t} = G_t G_r \\left(\\frac{\\lambda}{4\\pi d}\\right)^2$', description: 'Friis equation' },
  { label: 'Array factor', template: '$AF = \\sum_{n=0}^{N-1} a_n e^{jn(kd\\cos\\theta + \\beta)}$', description: 'Array factor' },
];

// ── Component ────────────────────────────────────────────────────────────────

interface DocumentationPanelProps {
  projectId: string;
}

export default function DocumentationPanel({ projectId }: DocumentationPanelProps) {
  const dispatch = useAppDispatch();
  const { content, loading, saving, dirty, error } = useAppSelector((s) => s.documentation);

  const [mode, setMode] = useState<'edit' | 'view'>('edit');
  const [formulaMenuAnchor, setFormulaMenuAnchor] = useState<null | HTMLElement>(null);

  // Track whether initial load has happened for this project
  const loadedProjectRef = useRef<string | null>(null);

  // ── TipTap editor setup ──────────────────────────────────────────────────

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        codeBlock: false, // We'll use code fences via markdown
      }),
      ImageExtension.configure({
        inline: false,
        allowBase64: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
      }),
      Placeholder.configure({
        placeholder: 'Start writing documentation…\n\nUse the toolbar for formatting, or type Markdown directly.',
      }),
      Markdown.configure({
        html: false,
        transformCopiedText: true,
        transformPastedText: true,
      }),
    ],
    editable: mode === 'edit',
    content: '',
    onUpdate: ({ editor: ed }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const md: string = (ed.storage as any).markdown?.getMarkdown?.() ?? '';
      dispatch(setContent(md));
      debouncedSave(md);
    },
  });

  // Keep editable state in sync with mode
  useEffect(() => {
    editor?.setEditable(mode === 'edit');
  }, [mode, editor]);

  // ── Auto-save ────────────────────────────────────────────────────────────

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSave = useCallback(
    debounce((md: string) => {
      if (projectId) {
        dispatch(saveDocumentation({ projectId, content: md }));
      }
    }, AUTO_SAVE_DELAY_MS),
    [dispatch, projectId]
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      debouncedSave.cancel();
    };
  }, [debouncedSave]);

  // ── Load documentation on mount / project change ─────────────────────────

  useEffect(() => {
    if (projectId && projectId !== loadedProjectRef.current) {
      loadedProjectRef.current = projectId;
      dispatch(fetchDocumentation(projectId));
    }
  }, [projectId, dispatch]);

  // Sync editor content when redux content changes (from server load)
  useEffect(() => {
    if (editor && !dirty && content !== undefined) {
      const currentMd = getMarkdownFromEditor(editor);
      if (currentMd !== content) {
        editor.commands.setContent(content || '');
      }
    }
  }, [editor, content, dirty]);

  // ── Image handlers ───────────────────────────────────────────────────────

  const handleImageUpload = useCallback(
    async (file: File) => {
      if (!projectId || !editor) return;

      try {
        const result = await dispatch(uploadImage({ projectId, file })).unwrap();
        // After upload succeeds, we need to get a URL to display the image.
        // For now, insert a placeholder — the image URL will be resolved via
        // the API when the document is rendered.
        const { getImageUrl } = await import('@/api/documentation');
        const url = await getImageUrl(projectId, result.image_key);
        editor.chain().focus().setImage({ src: url, alt: file.name }).run();
      } catch {
        // Error is already in Redux state
      }
    },
    [projectId, editor, dispatch]
  );

  // Paste handler for images
  useEffect(() => {
    if (!editor) return;

    const handlePaste = (view: unknown, event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return false;

      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          event.preventDefault();
          const file = item.getAsFile();
          if (file) handleImageUpload(file);
          return true;
        }
      }
      return false;
    };

    // Register paste handler via TipTap's ProseMirror props
    // We use the DOM event listener instead for broader compatibility
    const editorDom = editor.view.dom;
    const pasteListener = (e: Event) => {
      const clipboardEvent = e as ClipboardEvent;
      handlePaste(editor.view, clipboardEvent);
    };
    editorDom.addEventListener('paste', pasteListener);

    return () => {
      editorDom.removeEventListener('paste', pasteListener);
    };
  }, [editor, handleImageUpload]);

  // Drop handler for images
  useEffect(() => {
    if (!editor) return;

    const editorDom = editor.view.dom;
    const dropListener = (e: DragEvent) => {
      const files = e.dataTransfer?.files;
      if (!files?.length) return;

      for (const file of Array.from(files)) {
        if (file.type.startsWith('image/')) {
          e.preventDefault();
          handleImageUpload(file);
          return;
        }
      }
    };

    const dragOverListener = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
      }
    };

    editorDom.addEventListener('drop', dropListener);
    editorDom.addEventListener('dragover', dragOverListener);

    return () => {
      editorDom.removeEventListener('drop', dropListener);
      editorDom.removeEventListener('dragover', dragOverListener);
    };
  }, [editor, handleImageUpload]);

  // ── Toolbar actions ──────────────────────────────────────────────────────

  const insertFormula = (template: string) => {
    if (!editor) return;
    editor.chain().focus().insertContent(template).run();
    setFormulaMenuAnchor(null);
  };

  const handleFileInput = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/gif,image/svg+xml,image/webp';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) handleImageUpload(file);
    };
    input.click();
  };

  const handleManualSave = () => {
    if (projectId && editor) {
      debouncedSave.cancel();
      const md = getMarkdownFromEditor(editor);
      dispatch(saveDocumentation({ projectId, content: md }));
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (!editor) return null;

  return (
    <Box
      sx={{
        width: PANEL_WIDTH,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1.5,
          py: 1,
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Documentation
          </Typography>
          {saving && (
            <Chip
              label="Saving…"
              size="small"
              color="info"
              variant="outlined"
              sx={{ height: 20, fontSize: '0.7rem' }}
            />
          )}
          {dirty && !saving && (
            <Chip
              label="Unsaved"
              size="small"
              color="warning"
              variant="outlined"
              sx={{ height: 20, fontSize: '0.7rem' }}
            />
          )}
          {!dirty && !saving && content && (
            <Chip
              label="Saved"
              size="small"
              color="success"
              variant="outlined"
              sx={{ height: 20, fontSize: '0.7rem' }}
            />
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <ToggleButtonGroup
            value={mode}
            exclusive
            onChange={(_, v) => v && setMode(v)}
            size="small"
            sx={{ height: 28 }}
          >
            <ToggleButton value="edit" sx={{ px: 1, py: 0.25 }}>
              <Tooltip title="Edit"><EditIcon fontSize="small" /></Tooltip>
            </ToggleButton>
            <ToggleButton value="view" sx={{ px: 1, py: 0.25 }}>
              <Tooltip title="Preview"><ViewIcon fontSize="small" /></Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
          <Tooltip title="Close documentation">
            <IconButton size="small" onClick={() => dispatch(closePanel())}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Toolbar (edit mode only) */}
      {mode === 'edit' && (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 0.25,
            px: 1,
            py: 0.5,
            borderBottom: 1,
            borderColor: 'divider',
            flexShrink: 0,
            alignItems: 'center',
          }}
        >
          {/* History */}
          <Tooltip title="Undo">
            <IconButton size="small" onClick={() => editor.chain().focus().undo().run()}>
              <Undo fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Redo">
            <IconButton size="small" onClick={() => editor.chain().focus().redo().run()}>
              <Redo fontSize="small" />
            </IconButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Headings */}
          <Tooltip title="Heading 1">
            <IconButton
              size="small"
              color={editor.isActive('heading', { level: 1 }) ? 'primary' : 'default'}
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            >
              <TitleIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Heading 2">
            <IconButton
              size="small"
              color={editor.isActive('heading', { level: 2 }) ? 'primary' : 'default'}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              sx={{ fontSize: '0.85rem', fontWeight: 700, width: 28, height: 28 }}
            >
              H2
            </IconButton>
          </Tooltip>
          <Tooltip title="Heading 3">
            <IconButton
              size="small"
              color={editor.isActive('heading', { level: 3 }) ? 'primary' : 'default'}
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              sx={{ fontSize: '0.8rem', fontWeight: 700, width: 28, height: 28 }}
            >
              H3
            </IconButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Formatting */}
          <Tooltip title="Bold">
            <IconButton
              size="small"
              color={editor.isActive('bold') ? 'primary' : 'default'}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <FormatBold fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Italic">
            <IconButton
              size="small"
              color={editor.isActive('italic') ? 'primary' : 'default'}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <FormatItalic fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Inline Code">
            <IconButton
              size="small"
              color={editor.isActive('code') ? 'primary' : 'default'}
              onClick={() => editor.chain().focus().toggleCode().run()}
            >
              <CodeIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Lists */}
          <Tooltip title="Bullet List">
            <IconButton
              size="small"
              color={editor.isActive('bulletList') ? 'primary' : 'default'}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <FormatListBulleted fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Numbered List">
            <IconButton
              size="small"
              color={editor.isActive('orderedList') ? 'primary' : 'default'}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <FormatListNumbered fontSize="small" />
            </IconButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Block elements */}
          <Tooltip title="Blockquote">
            <IconButton
              size="small"
              color={editor.isActive('blockquote') ? 'primary' : 'default'}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
            >
              <FormatQuote fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Horizontal Rule">
            <IconButton
              size="small"
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
            >
              <HorizontalRule fontSize="small" />
            </IconButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Special: Formula & Image */}
          <Tooltip title="Insert Formula">
            <IconButton
              size="small"
              onClick={(e) => setFormulaMenuAnchor(e.currentTarget)}
            >
              <FunctionsIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Insert Image">
            <IconButton size="small" onClick={handleFileInput}>
              <ImageIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Box sx={{ flex: 1 }} />

          {/* Manual save */}
          <Tooltip title="Save now (Ctrl+S)">
            <IconButton size="small" onClick={handleManualSave} disabled={!dirty}>
              <SaveIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )}

      {/* Loading state */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
          <CircularProgress size={32} />
        </Box>
      )}

      {/* Error display */}
      {error && (
        <Box sx={{ px: 1.5, py: 1, bgcolor: 'error.main', color: 'error.contrastText', fontSize: '0.8rem' }}>
          {error}
        </Box>
      )}

      {/* Editor content */}
      {!loading && (
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            px: 1.5,
            py: 1,
            '& .tiptap': {
              outline: 'none',
              minHeight: '100%',
              fontSize: '0.875rem',
              lineHeight: 1.6,
              '& p.is-editor-empty:first-child::before': {
                content: 'attr(data-placeholder)',
                float: 'left',
                color: 'text.disabled',
                pointerEvents: 'none',
                height: 0,
              },
              '& h1': { fontSize: '1.5rem', mb: 0.5, mt: 1.5 },
              '& h2': { fontSize: '1.25rem', mb: 0.5, mt: 1.25 },
              '& h3': { fontSize: '1.1rem', mb: 0.5, mt: 1 },
              '& h4': { fontSize: '1rem', mb: 0.5, mt: 1, fontWeight: 600 },
              '& blockquote': {
                borderLeft: 3,
                borderColor: 'primary.main',
                pl: 1.5,
                ml: 0,
                color: 'text.secondary',
                fontStyle: 'italic',
              },
              '& code': {
                bgcolor: 'action.hover',
                px: 0.5,
                borderRadius: 0.5,
                fontFamily: 'monospace',
                fontSize: '0.85em',
              },
              '& pre': {
                bgcolor: 'grey.900',
                color: 'grey.100',
                p: 1.5,
                borderRadius: 1,
                overflow: 'auto',
                '& code': {
                  bgcolor: 'transparent',
                  px: 0,
                  color: 'inherit',
                },
              },
              '& img': {
                maxWidth: '100%',
                height: 'auto',
                borderRadius: 1,
                my: 1,
              },
              '& hr': {
                border: 'none',
                borderTop: 1,
                borderColor: 'divider',
                my: 2,
              },
              '& ul, & ol': {
                pl: 2.5,
              },
              '& a': {
                color: 'primary.main',
                textDecoration: 'underline',
              },
            },
          }}
        >
          <EditorContent editor={editor} />
        </Box>
      )}

      {/* Formula templates menu */}
      <Menu
        anchorEl={formulaMenuAnchor}
        open={Boolean(formulaMenuAnchor)}
        onClose={() => setFormulaMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        {FORMULA_TEMPLATES.map((tmpl) => (
          <MenuItem key={tmpl.label} onClick={() => insertFormula(tmpl.template)}>
            <ListItemIcon>
              <FunctionsIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary={tmpl.label}
              secondary={tmpl.description}
              primaryTypographyProps={{ variant: 'body2' }}
              secondaryTypographyProps={{ variant: 'caption' }}
            />
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}
