import { useEffect, useRef, useState } from 'react';

const MONACO_LOADER_ID = 'contrix-monaco-loader';
const MONACO_LOADER_URL =
  'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/loader.min.js';

type MonacoEditorInstance = {
  dispose: () => void;
  setValue: (value: string) => void;
  updateOptions: (options: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    require?: ((deps: string[], callback: (...modules: unknown[]) => void) => void) & {
      config?: (config: Record<string, unknown>) => void;
    };
    monaco?: {
      editor: {
        create: (
          element: HTMLElement,
          options: {
            value: string;
            language: string;
            readOnly: boolean;
            minimap: { enabled: boolean };
            automaticLayout: boolean;
            scrollBeyondLastLine: boolean;
            lineNumbers: 'on' | 'off';
            fontSize: number;
            theme: string;
            lineHeight?: number;
            wordWrap?: 'off' | 'on' | 'wordWrapColumn' | 'bounded';
            scrollbar?: {
              vertical?: 'auto' | 'visible' | 'hidden';
              horizontal?: 'auto' | 'visible' | 'hidden';
              handleMouseWheel?: boolean;
              alwaysConsumeMouseWheel?: boolean;
            };
          }
        ) => MonacoEditorInstance;
      };
    };
  }
}

let monacoReadyPromise: Promise<void> | null = null;

function ensureMonacoReady(): Promise<void> {
  if (window.monaco) {
    return Promise.resolve();
  }

  if (monacoReadyPromise) {
    return monacoReadyPromise;
  }

  monacoReadyPromise = new Promise<void>((resolve, reject) => {
    const onLoaderReady = () => {
      if (!window.require?.config || !window.require) {
        reject(new Error('Monaco loader is unavailable.'));
        return;
      }

      window.require.config({
        paths: {
          vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs'
        }
      });

      window.require(['vs/editor/editor.main'], () => resolve());
    };

    const existing = document.getElementById(MONACO_LOADER_ID) as HTMLScriptElement | null;
    if (existing) {
      if (window.require) {
        onLoaderReady();
      } else {
        existing.addEventListener('load', onLoaderReady, { once: true });
        existing.addEventListener('error', () => reject(new Error('Failed to load Monaco loader.')), {
          once: true
        });
      }
      return;
    }

    const script = document.createElement('script');
    script.id = MONACO_LOADER_ID;
    script.src = MONACO_LOADER_URL;
    script.async = true;
    script.onload = onLoaderReady;
    script.onerror = () => reject(new Error('Failed to load Monaco loader.'));
    document.body.appendChild(script);
  });

  return monacoReadyPromise;
}

interface MonacoReadOnlyProps {
  value: string;
  language?: string;
  height?: number;
  disableInnerScroll?: boolean;
}

export function MonacoReadOnly({
  value,
  language = 'markdown',
  height = 360,
  disableInnerScroll = false
}: MonacoReadOnlyProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<MonacoEditorInstance | null>(null);
  const [useFallback, setUseFallback] = useState(false);
  const lineHeight = 20;
  const lineCount = Math.max(value.split(/\r\n|\r|\n/).length, 10);
  const resolvedHeight = disableInnerScroll ? Math.max(height, lineCount * lineHeight + 24) : height;

  useEffect(() => {
    let mounted = true;

    ensureMonacoReady()
      .then(() => {
        if (!mounted || !containerRef.current || !window.monaco) {
          return;
        }

        if (!editorRef.current) {
          editorRef.current = window.monaco.editor.create(containerRef.current, {
            value,
            language,
            readOnly: true,
            minimap: { enabled: false },
            automaticLayout: true,
            scrollBeyondLastLine: false,
            lineNumbers: 'on',
            fontSize: 13,
            theme: 'vs-dark',
            lineHeight,
            wordWrap: disableInnerScroll ? 'on' : 'off',
            scrollbar: disableInnerScroll
              ? {
                  vertical: 'hidden',
                  horizontal: 'hidden',
                  handleMouseWheel: false,
                  alwaysConsumeMouseWheel: false
                }
              : undefined
          });
          return;
        }

        editorRef.current.updateOptions({
          lineHeight,
          wordWrap: disableInnerScroll ? 'on' : 'off',
          scrollbar: disableInnerScroll
            ? {
                vertical: 'hidden',
                horizontal: 'hidden',
                handleMouseWheel: false,
                alwaysConsumeMouseWheel: false
              }
            : undefined
        });
        editorRef.current.setValue(value);
      })
      .catch(() => {
        if (mounted) {
          setUseFallback(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, [disableInnerScroll, language, lineHeight, value]);

  useEffect(() => {
    return () => {
      if (editorRef.current) {
        editorRef.current.dispose();
        editorRef.current = null;
      }
    };
  }, []);

  if (useFallback) {
    return <textarea className="prompt-editor" rows={Math.max(Math.floor(resolvedHeight / 18), 10)} readOnly value={value} />;
  }

  return <div className="monaco-host" ref={containerRef} style={{ height: resolvedHeight }} />;
}
