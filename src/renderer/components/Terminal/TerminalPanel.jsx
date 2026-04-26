import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { DownOutlined } from '@ant-design/icons';
import 'xterm/css/xterm.css';
import { sanitizeTerminalOutput } from '../../utils';

function TerminalPanel({ projectId }) {
  const containerRef = useRef(null);
  const terminalRef = useRef(null);
  const fitRef = useRef(null);
  const outputBufferRef = useRef('');
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [outputStats, setOutputStats] = useState({ lines: 0, rate: 0 });
  const statsRef = useRef({ lines: 0, lastUpdate: Date.now(), chunks: 0 });

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) {
      return undefined;
    }

    const terminal = new Terminal({
      convertEol: true,
      theme: {
        background: '#101828',
        foreground: '#e2e8f0',
        cursor: '#7dd3fc',
        cursorBlink: true,
        cursorStyle: 'block',
        selectionBackground: 'rgba(125, 211, 252, 0.25)',
        black: '#101828',
        brightBlack: '#555',
        red: '#e06c75',
        brightRed: '#e06c75',
        green: '#98c379',
        brightGreen: '#98c379',
        yellow: '#e5c07b',
        brightYellow: '#e5c07b',
        blue: '#61afef',
        brightBlue: '#61afef',
        magenta: '#c678dd',
        brightMagenta: '#c678dd',
        cyan: '#56b6c2',
        brightCyan: '#56b6c2',
        white: '#abb2bf',
        brightWhite: '#e0e0e0',
      },
      fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      scrollback: 8000,
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(containerRef.current);
    fitAddon.fit();
    terminalRef.current = terminal;
    fitRef.current = fitAddon;

    // Track scroll position
    terminal.onScroll(() => {
      const viewport = terminal.buffer.active.viewportY;
      const scrollback = terminal.buffer.active.length - terminal.rows;
      setShowScrollButton(scrollback - viewport > 5);
    });

    const ro = new ResizeObserver(() => {
      try { fitRef.current?.fit(); } catch (e) {}
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
      outputBufferRef.current = '';
    };
  }, []);

  // Update output stats periodically
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - statsRef.current.lastUpdate) / 1000;
      if (elapsed >= 1) {
        setOutputStats({
          lines: statsRef.current.lines,
          rate: Math.round(statsRef.current.chunks / elapsed),
        });
        statsRef.current.chunks = 0;
        statsRef.current.lastUpdate = now;
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Load history when project changes
  useEffect(() => {
    let active = true;

    async function loadHistory() {
      try {
        if (!projectId || !terminalRef.current) return;
        const history = await window.vct.getTerminalHistory(projectId);
        if (active && terminalRef.current) {
          const sanitized = sanitizeTerminalOutput(history?.content || '');
          outputBufferRef.current = sanitized;
          terminalRef.current.clear();
          terminalRef.current.write(sanitized);
          statsRef.current.lines = sanitized.split('\n').length;
          try { fitRef.current?.fit(); } catch (e) {}
        }
      } catch (err) {
        console.error('Failed to load terminal history:', err);
      }
    }

    loadHistory();

    return () => {
      active = false;
    };
  }, [projectId]);

  // Listen for real-time data with incremental writes
  useEffect(() => {
    const onData = ({ projectId: incomingProjectId, data, seq }) => {
      if (incomingProjectId !== projectId || !terminalRef.current) return;

      const sanitized = sanitizeTerminalOutput(data);
      if (!sanitized) return;

      // Incremental comparison: only write new content
      if (seq !== undefined && seq > 0) {
        // Batched data from output batcher - write incrementally
        outputBufferRef.current += sanitized;
        terminalRef.current.write(sanitized);
      } else {
        // Immediate data (phase headers, etc.) or legacy data
        outputBufferRef.current += sanitized;
        terminalRef.current.write(sanitized);
      }

      // Update stats
      statsRef.current.lines += sanitized.split('\n').length - 1;
      statsRef.current.chunks += 1;

      // Auto-scroll to bottom if user is near the bottom
      const term = terminalRef.current;
      if (term.buffer?.active) {
        const viewport = term.buffer.active.viewportY;
        const scrollback = term.buffer.active.length - term.rows;
        if (scrollback - viewport < 5) {
          term.scrollToBottom();
        }
      }
    };

    const onClear = ({ projectId: incomingProjectId }) => {
      if (incomingProjectId === projectId && terminalRef.current) {
        terminalRef.current.clear();
        outputBufferRef.current = '';
        statsRef.current.lines = 0;
      }
    };

    window.vct.onTerminalData(onData);
    window.vct.onTerminalClear(onClear);

    return () => {
      window.vct.removeTerminalDataListener();
      window.vct.removeTerminalClearListener();
    };
  }, [projectId]);

  const scrollToBottom = () => {
    terminalRef.current?.scrollToBottom();
    setShowScrollButton(false);
  };

  return (
    <div className="terminal-container">
      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          background: '#101828',
        }}
      />
      {showScrollButton && (
        <button className="terminal-scroll-btn" onClick={scrollToBottom} title="滚动到底部">
          <DownOutlined />
        </button>
      )}
    </div>
  );
}

export default TerminalPanel;