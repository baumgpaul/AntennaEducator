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

import { useEffect, useCallback, useRef, useState } from 'react';
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
  Image as ImageIcon,
  Functions as FunctionsIcon,
  Title as TitleIcon,
  Save as SaveIcon,
  Edit as EditIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import ImageExtension from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { debounce } from 'lodash';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  fetchDocumentation,
  saveDocumentation,
  uploadImage,
  setContent,
  closePanel,
} from '@/store/documentationSlice';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extract markdown text from TipTap editor via tiptap-markdown storage. */
function getMarkdownFromEditor(editor: ReturnType<typeof useEditor>): string {
  if (!editor) return '';
  // tiptap-markdown adds a `markdown` key to editor.storage
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storage = editor.storage as any;
  return (storage.markdown?.getMarkdown?.() as string) ?? '';
}

// ── Doc-image URL helpers ────────────────────────────────────────────────────

/** Regex matching doc-image:// stable references: doc-image://img_xxxxxxxxxxxx.ext */
const DOC_IMAGE_REGEX = /doc-image:\/\/(img_[a-f0-9]{12}\.[a-z]+)/g;

/**
 * Regex matching presigned S3 URLs for documentation images.
 * Captures the image key (e.g. img_abc123def456.png) from the URL path.
 * Matches URLs containing /documentation/images/{image_key} with optional query params.
 */
const S3_DOC_IMAGE_REGEX =
  /https?:\/\/[^\s")\]]+\/documentation\/images\/(img_[a-f0-9]{12}\.[a-z]+)(?:\?[^\s")\]]*)?/g;

/**
 * Replace presigned S3 URLs for documentation images with stable doc-image:// references.
 * Used before saving content to the server — ensures stored content never contains
 * expiring presigned URLs.
 *
 * Also handles backward-compatible stabilization of existing content that may
 * already contain expired presigned URLs from before this fix.
 */
function stabilizeDocImageUrls(markdown: string): string {
  return markdown.replace(S3_DOC_IMAGE_REGEX, (_match, imageKey: string) => {
    return `doc-image://${imageKey}`;
  });
}

/**
 * Replace doc-image:// stable references with fresh presigned S3 URLs.
 * Used when loading content from the server into the editor for display.
 */
async function resolveDocImageUrls(markdown: string, projectId: string): Promise<string> {
  // Collect unique image keys
  const matches = [...markdown.matchAll(DOC_IMAGE_REGEX)];
  if (matches.length === 0) return markdown;

  const imageKeys = [...new Set(matches.map((m) => m[1]))];

  // Resolve all keys to presigned URLs in parallel
  const { getImageUrl } = await import('@/api/documentation');
  const urlMap = new Map<string, string>();
  await Promise.all(
    imageKeys.map(async (key) => {
      try {
        const url = await getImageUrl(projectId, key);
        urlMap.set(key, url);
      } catch {
        // If resolution fails, leave the doc-image:// reference (image will be broken)
        console.warn(`[DocumentationPanel] Failed to resolve image: ${key}`);
      }
    }),
  );

  // Replace all doc-image:// references with resolved URLs
  return markdown.replace(DOC_IMAGE_REGEX, (fullMatch, key: string) => {
    return urlMap.get(key) || fullMatch;
  });
}

// ── Constants ────────────────────────────────────────────────────────────────

const AUTO_SAVE_DELAY_MS = 2000;
const DEFAULT_PANEL_WIDTH = 420;
const MIN_PANEL_WIDTH = 280;
const MAX_PANEL_WIDTH = 700;

/** Common KaTeX symbol/snippet templates for quick insertion. */
const FORMULA_TEMPLATES = [
  { label: 'Inline $…$', template: '$ $', description: 'Inline math delimiters' },
  { label: 'Block $$…$$', template: '\n$$\n\n$$\n', description: 'Display math block' },
  { label: 'Greek α β γ δ', template: '$\\alpha\\ \\beta\\ \\gamma\\ \\delta$', description: 'Lower-case Greek' },
  { label: 'Greek Θ Φ Ω Λ', template: '$\\Theta\\ \\Phi\\ \\Omega\\ \\Lambda$', description: 'Upper-case Greek' },
  { label: 'Fraction', template: '$\\frac{a}{b}$', description: '\\frac{…}{…}' },
  { label: 'Square root', template: '$\\sqrt{x}$', description: '\\sqrt{…}' },
  { label: 'Subscript / super', template: '$x_{i}^{n}$', description: 'x_{sub}^{sup}' },
  { label: 'Sum ∑', template: '$\\sum_{i=0}^{N}$', description: '\\sum_{…}^{…}' },
  { label: 'Integral ∫', template: '$\\int_{a}^{b}$', description: '\\int_{…}^{…}' },
  { label: 'Vector arrow', template: '$\\vec{E}$', description: '\\vec{…}' },
  { label: 'Hat / bar', template: '$\\hat{x}\\ \\bar{y}$', description: '\\hat  \\bar' },
  { label: 'Partial ∂', template: '$\\partial$', description: '\\partial' },
  { label: 'Nabla ∇', template: '$\\nabla$', description: '\\nabla' },
  { label: 'Infinity ∞', template: '$\\infty$', description: '\\infty' },
  { label: 'Approx ≈', template: '$\\approx$', description: '\\approx' },
  { label: 'Cross / dot ×·', template: '$\\times\\ \\cdot$', description: '\\times  \\cdot' },
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
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);

  // Track whether initial load has happened for this project
  const loadedProjectRef = useRef<string | null>(null);
  const isResizingRef = useRef(false);
  // Track current content to avoid save loops
  const contentRef = useRef<string>(content);
  // Track when we're programmatically loading content (to ignore onUpdate during load)
  const isLoadingContentRef = useRef(false);
  // Track current mode so onUpdate callback can access it (useEditor captures closure)
  const modeRef = useRef<'edit' | 'view'>(mode);
  // Ref to the editor wrapper for KaTeX rendering
  const editorWrapperRef = useRef<HTMLDivElement>(null);

  // Keep refs in sync with state
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // ── Resize drag handler ────────────────────────────────────────────────

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizingRef.current = true;
      const startX = e.clientX;
      const startWidth = panelWidth;

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!isResizingRef.current) return;
        // Dragging LEFT increases width (panel is on the right)
        const delta = startX - moveEvent.clientX;
        const newWidth = Math.min(
          MAX_PANEL_WIDTH,
          Math.max(MIN_PANEL_WIDTH, startWidth + delta),
        );
        setPanelWidth(newWidth);
      };

      const onMouseUp = () => {
        isResizingRef.current = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [panelWidth],
  );

  // Double-click to reset width
  const handleResizeDoubleClick = useCallback(() => {
    setPanelWidth(DEFAULT_PANEL_WIDTH);
  }, []);

  // ── TipTap editor setup ──────────────────────────────────────────────────

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        codeBlock: false, // We'll use code fences via markdown
        link: {
          openOnClick: false,
          autolink: true,
        },
      }),
      ImageExtension.configure({
        inline: false,
        allowBase64: false,
      }),
      Placeholder.configure({
        placeholder: 'Start writing notes…\n\nUse the toolbar for formatting, or type Markdown directly.',
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
      // Never trigger saves in view mode (use ref to get current mode value)
      if (modeRef.current !== 'edit') return;
      // Ignore programmatic updates (e.g., loading content from server)
      if (isLoadingContentRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const md: string = (ed.storage as any).markdown?.getMarkdown?.() ?? '';
      // Only set dirty / trigger save when content actually changed
      if (md !== contentRef.current) {
        dispatch(setContent(md));
        debouncedSave(md);
      }
    },
  });

  // Keep editable state in sync with mode
  useEffect(() => {
    editor?.setEditable(mode === 'edit');
  }, [mode, editor]);

  // ── KaTeX rendering for view mode ───────────────────────────────────────

  useEffect(() => {
    if (mode !== 'view' || !editorWrapperRef.current) return;
    // Render KaTeX math expressions within the editor content
    const el = editorWrapperRef.current;
    const renderMath = () => {
      // Process block math first ($$...$$), then inline ($...$)
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const textNodes: Text[] = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

      for (const node of textNodes) {
        const text = node.textContent || '';
        // Match $$...$$ (block) or $...$ (inline) but not \$ escaped
        const mathRegex = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
        if (!mathRegex.test(text)) continue;
        mathRegex.lastIndex = 0;

        const span = document.createElement('span');
        let lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = mathRegex.exec(text)) !== null) {
          // Text before the match
          if (match.index > lastIndex) {
            span.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
          }
          const isBlock = !!match[1];
          const latex = (match[1] || match[2]).trim();
          try {
            const rendered = document.createElement(isBlock ? 'div' : 'span');
            katex.render(latex, rendered, {
              throwOnError: false,
              displayMode: isBlock,
            });
            span.appendChild(rendered);
          } catch {
            span.appendChild(document.createTextNode(match[0]));
          }
          lastIndex = match.index + match[0].length;
        }
        if (lastIndex < text.length) {
          span.appendChild(document.createTextNode(text.slice(lastIndex)));
        }
        node.parentNode?.replaceChild(span, node);
      }
    };
    // Small delay to let TipTap render the content first
    const timer = setTimeout(renderMath, 50);
    return () => clearTimeout(timer);
  }, [mode, content]);

  // ── Auto-save ────────────────────────────────────────────────────────────

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSave = useCallback(
    debounce((md: string) => {
      if (projectId) {
        // Convert any presigned S3 URLs back to stable doc-image:// references
        // before persisting, so stored content never contains expiring URLs.
        const stableMd = stabilizeDocImageUrls(md);
        dispatch(saveDocumentation({ projectId, content: stableMd }));
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
        // Mark that we're loading content programmatically to prevent save loop
        isLoadingContentRef.current = true;
        // First, stabilize any legacy presigned S3 URLs that were stored before
        // the doc-image:// scheme was implemented. Then resolve all doc-image://
        // references to fresh presigned URLs for display.
        const stabilized = stabilizeDocImageUrls(content || '');

        const finishLoading = () => {
          // After setContent, update contentRef to the actual normalized markdown
          // to prevent false diffs from markdown normalization differences
          const normalizedMd = getMarkdownFromEditor(editor);
          contentRef.current = normalizedMd;
          isLoadingContentRef.current = false;
        };

        if (stabilized.includes('doc-image://') && projectId) {
          resolveDocImageUrls(stabilized, projectId).then((resolved) => {
            editor.commands.setContent(resolved);
            // Small delay to let TipTap process the content
            setTimeout(finishLoading, 50);
          });
        } else {
          editor.commands.setContent(stabilized || '');
          // Small delay to let TipTap process the content
          setTimeout(finishLoading, 50);
        }
      }
    }
  }, [editor, content, dirty, projectId]);

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

    const handlePaste = (_view: unknown, event: ClipboardEvent) => {
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

  const handleManualSave = useCallback(() => {
    if (projectId && editor) {
      debouncedSave.cancel();
      const md = getMarkdownFromEditor(editor);
      const stableMd = stabilizeDocImageUrls(md);
      dispatch(saveDocumentation({ projectId, content: stableMd }));
    }
  }, [projectId, editor, debouncedSave, dispatch]);

  // ── Keyboard shortcut: Ctrl+S to save ────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleManualSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleManualSave]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (!editor) return null;

  return (
    <Box
      sx={{
        width: panelWidth,
        height: '100%',
        display: 'flex',
        flexDirection: 'row',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Resize drag handle */}
      <Box
        onMouseDown={handleResizeStart}
        onDoubleClick={handleResizeDoubleClick}
        sx={{
          width: 6,
          flexShrink: 0,
          cursor: 'col-resize',
          bgcolor: 'transparent',
          borderLeft: 1,
          borderColor: 'divider',
          transition: 'background-color 0.15s',
          '&:hover': {
            bgcolor: 'primary.main',
            borderColor: 'primary.main',
          },
          '&:active': {
            bgcolor: 'primary.dark',
            borderColor: 'primary.dark',
          },
        }}
      />
      {/* Panel content */}
      <Box
        sx={{
          flex: 1,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.paper',
          overflow: 'hidden',
          minWidth: 0,
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
            Notes
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
          <Tooltip title="Close notes">
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
          <div ref={editorWrapperRef}>
            <EditorContent editor={editor} />
          </div>
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
    </Box>
  );
}
