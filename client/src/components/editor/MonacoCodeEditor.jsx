import React, { useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Play, Send, Code, Settings2, RotateCcw } from 'lucide-react';

const getDefaultTemplate = () => '';

export const MonacoCodeEditor = ({
  code,
  onChange,
  language = 'javascript',
  onLanguageChange,
  onRunCode,
  onSubmitCode,
  isRunning = false,
  isSubmitting = false,
  readOnly = false,
  isDark = false,
}) => {
  const editorRef = useRef(null);

  const handleEditorDidMount = (editor) => {
    editorRef.current = editor;
  };

  const handleLanguageChange = (nextLanguage) => {
    if (readOnly) return;

    if (typeof onLanguageChange === 'function') {
      onLanguageChange(nextLanguage);
    }

    if (typeof onChange === 'function') {
      onChange('');
    }
  };

  const handleReset = () => {
    if (readOnly) return;

    if (typeof onChange === 'function') {
      onChange('');
    }
  };

  const handleRun = () => {
    if (readOnly) return;

    if (typeof onRunCode === 'function') {
      onRunCode();
    }
  };

  const handleSubmit = () => {
    if (readOnly) return;

    if (typeof onSubmitCode === 'function') {
      onSubmitCode();
    }
  };

  const handleReadOnlyInteraction = (event) => {
    if (!readOnly) return;

    event.preventDefault();
    event.stopPropagation();
    return false;
  };

  return (
    <div className={`flex flex-col h-full border rounded-xl overflow-hidden shadow-2xl ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
      {/* Editor Header Toolbar */}
      <div className={`flex items-center justify-between px-4 py-2 border-b ${isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block"></span>
          </div>

          <div className={`h-4 w-px ${isDark ? 'bg-slate-800' : 'bg-slate-300'}`}></div>

          {/* Language Selector */}
          <div className="flex items-center gap-2">
            <Code className="w-3.5 h-3.5 text-indigo-400" />
            <select
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value)}
              disabled={readOnly}
              className={`${isDark ? 'bg-slate-950 border-slate-800 text-indigo-300' : 'bg-white border-slate-200 text-slate-700'} text-xs font-mono rounded-md px-2.5 py-1 focus:outline-none focus:border-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              <option value="javascript">JavaScript (Node.js)</option>
              <option value="python">Python 3.10</option>
              <option value="cpp">C++ 20 (GCC)</option>
              <option value="java">Java 17 (OpenJDK)</option>
            </select>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            disabled={readOnly}
            title={readOnly ? 'Candidate view is read-only' : 'Reset code template'}
            className={`p-1.5 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isDark ? 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200' : 'bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900'}`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleRun}
            disabled={readOnly || isRunning || isSubmitting || typeof onRunCode !== 'function'}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border text-xs font-semibold text-emerald-400 transition-all disabled:opacity-50 ${isDark ? 'bg-slate-800 hover:bg-slate-700 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 border-slate-200'}`}
          >
            <Play className="w-3.5 h-3.5 fill-emerald-400" />
            {isRunning ? 'Running Docker...' : 'Run Code'}
          </button>

          <button
            onClick={handleSubmit}
            disabled={readOnly || isRunning || isSubmitting || typeof onSubmitCode !== 'function'}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-xs font-bold text-white shadow-md shadow-indigo-500/25 transition-all disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            {isSubmitting ? 'Evaluating...' : 'Submit Solution'}
          </button>
        </div>
      </div>

      {/* Monaco Core Instance */}
      <div
        className="flex-1 min-h-[360px] relative overflow-auto"
        style={{ resize: 'vertical' }}
        onPaste={handleReadOnlyInteraction}
        onDrop={handleReadOnlyInteraction}
        onDragStart={handleReadOnlyInteraction}
        onKeyDown={handleReadOnlyInteraction}
        onMouseDown={handleReadOnlyInteraction}
        aria-readonly={readOnly}
      >
        <Editor
          height="100%"
          language={language === 'cpp' ? 'cpp' : language}
          theme={isDark ? 'vs-dark' : 'vs-light'}
          value={code}
          onChange={onChange}
          onMount={handleEditorDidMount}
          options={{
            readOnly,
            fontSize: 14,
            fontFamily: '"Fira Code", monospace',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            padding: { top: 12, bottom: 12 },
            cursorBlinking: 'smooth',
            smoothScrolling: true,
            renderLineHighlight: 'all',
          }}
        />
      </div>
    </div>
  );
};
