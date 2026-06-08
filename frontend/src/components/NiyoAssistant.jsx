/**
 * NiyoAssistant.jsx
 *
 * PURPOSE:
 *   This is the main UI component for the Niyo assistant.
 *   It EXTENDS (not replaces) your existing floating chat panel.
 *
 * WHAT CHANGED VS YOUR EXISTING CHAT:
 *   + Added microphone button for voice input
 *   + Added greeting spoken aloud when the panel opens
 *   + Responses are spoken via VoiceService
 *   + Action commands navigate the app and close the panel automatically
 *   + Conversation mode keeps the panel open
 *
 * WHAT STAYED THE SAME:
 *   - Floating robot icon (controlled by parent, unchanged)
 *   - Chat message list (still renders text in bubbles)
 *   - Text input + send button
 *   - Panel open/close behavior
 *
 * USAGE (in your existing App.jsx or wherever the chat icon lives):
 *
 *   import NiyoAssistant from './components/NiyoAssistant';
 *
 *   // Replace your existing chat panel JSX with:
 *   <NiyoAssistant
 *     isOpen={chatOpen}
 *     onClose={() => setChatOpen(false)}
 *     onNavigate={(path, filter) => {
 *       navigate(path);                        // your router navigation
 *       if (filter) setJobFilter(filter);      // your jobs filter state
 *     }}
 *   />
 *
 * PROPS:
 *   isOpen     {boolean}            - whether the panel is visible
 *   onClose    {function}           - called when panel should close
 *   onNavigate {function(path, filter)} - called on action commands
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import voiceService from '../services/VoiceService';
import speechRecognitionService from '../services/SpeechRecognitionService';
import { handleInput, GREETING_REPLY } from '../services/AssistantIntentHandler';

// ─── Styles (inline — no new CSS file needed) ─────────────────────────────────

const styles = {
  // Outer panel — sits above your existing floating icon
  panel: {
    position: 'fixed',
    bottom: '90px',
    right: '20px',
    width: '340px',
    maxWidth: 'calc(100vw - 32px)',
    maxHeight: '70vh',
    background: 'var(--color-background-primary, #fff)',
    borderRadius: '16px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'visible',
    zIndex: 1000,
    fontFamily: 'sans-serif',
    transition: 'opacity 0.2s, transform 0.2s',
  },

  // Header bar
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '14px 16px',
    background: 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)',
    color: '#fff',
  },
  avatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
    flexShrink: 0,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontWeight: '600',
    fontSize: '15px',
    lineHeight: '1.2',
  },
  headerSub: {
    fontSize: '11px',
    opacity: 0.8,
    marginTop: '1px',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '20px',
    lineHeight: 1,
    padding: '4px',
    opacity: 0.8,
  },

  // Message list
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '14px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },

  // Individual message bubble
  bubble: (fromUser) => ({
    maxWidth: '82%',
    padding: '9px 13px',
    borderRadius: fromUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
    background: fromUser ? '#7C3AED' : '#F3F4F6',
    color: fromUser ? '#fff' : '#111',
    fontSize: '14px',
    lineHeight: '1.5',
    alignSelf: fromUser ? 'flex-end' : 'flex-start',
    wordBreak: 'break-word',
  }),

  // "Niyo is listening..." indicator
  listeningIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    background: '#FEF3C7',
    color: '#92400E',
    fontSize: '12px',
    borderTop: '1px solid #FDE68A',
  },
  listeningDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#F59E0B',
    animation: 'pulse 1s infinite',
  },

  // Input row
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    borderTop: '1px solid #E5E7EB',
    background: 'var(--color-background-primary, #fff)',
  },
  textInput: {
    flex: 1,
    border: '1px solid #D1D5DB',
    borderRadius: '20px',
    padding: '8px 14px',
    fontSize: '14px',
    outline: 'none',
    background: '#F9FAFB',
    color: '#111',
    minWidth: 0,
  },
  iconBtn: (active, color) => ({
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    background: active ? color : '#E5E7EB',
    color: active ? '#fff' : '#6B7280',
    flexShrink: 0,
    transition: 'background 0.15s',
  }),
};

// ─── Pulse animation (injected once) ─────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('niyo-pulse-style')) {
  const styleEl = document.createElement('style');
  styleEl.id = 'niyo-pulse-style';
  styleEl.textContent = `
    @keyframes niyo-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50%       { opacity: 0.5; transform: scale(0.85); }
    }
    #niyo-listening-dot { animation: niyo-pulse 1s ease-in-out infinite; }
  `;
  document.head.appendChild(styleEl);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NiyoAssistant({ isOpen, onClose, onNavigate }) {
  const [messages, setMessages]     = useState([]);
  const [inputText, setInputText]   = useState('');
  const [isListening, setListening] = useState(false);
  const [hasGreeted, setHasGreeted] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);

  // ── Auto-scroll to latest message ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Greet on first open ──
  useEffect(() => {
    if (isOpen && !hasGreeted) {
      setHasGreeted(true);
      addMessage('niyo', GREETING_REPLY);
      // Small delay so the panel animation finishes before speaking
      setTimeout(() => voiceService.speak(GREETING_REPLY), 400);
    }
    // Stop listening when panel closes
    if (!isOpen) {
      speechRecognitionService.stop();
      setListening(false);
    }
  }, [isOpen, hasGreeted]);

  // ── Wire up speech recognition callbacks ──
  useEffect(() => {
    speechRecognitionService.onStart  = () => setListening(true);
    speechRecognitionService.onEnd    = () => setListening(false);
    speechRecognitionService.onResult = (transcript) => {
      setListening(false);
      processInput(transcript);
    };
    speechRecognitionService.onError  = (errMsg) => {
      setListening(false);
      addMessage('niyo', errMsg);
      voiceService.speak(errMsg);
    };
    // Cleanup on unmount
    return () => {
      speechRecognitionService.onStart  = null;
      speechRecognitionService.onEnd    = null;
      speechRecognitionService.onResult = null;
      speechRecognitionService.onError  = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Message helpers ───────────────────────────────────────────────────────

  const addMessage = useCallback((sender, text) => {
    setMessages(prev => [...prev, { id: Date.now() + Math.random(), sender, text }]);
  }, []);

  // ─── Core: process any input (voice transcript or typed text) ──────────────

  const processInput = useCallback((text) => {
    if (!text.trim()) return;

    // 1. Show user's message in chat
    addMessage('user', text);

    // 2. Determine intent
    const intent = handleInput(text);

    if (intent.type === 'action') {
      // ── ACTION MODE ──
      const { action, reply } = intent;

      // 3a. Show + speak the confirmation
      addMessage('niyo', reply);
      voiceService.speak(reply);

      // 3b. Perform the navigation after a short delay (let speech start)
      setTimeout(() => {
        if (action.type === 'navigate_jobs') {
          // Navigate to jobs page and apply filter
          onNavigate?.('/jobs', action.filter);
        } else if (action.type === 'navigate_page') {
          onNavigate?.(action.path, null);
        }

        // 3c. Close the panel (keep floating icon visible)
        onClose?.();
      }, 800);

    } else {
      // ── CONVERSATION MODE ──
      const { reply } = intent;
      addMessage('niyo', reply);
      voiceService.speak(reply);
      // Panel stays open — user can continue the conversation
    }
  }, [addMessage, onNavigate, onClose]);

  // ─── Event handlers ────────────────────────────────────────────────────────

  const handleSend = () => {
    const text = inputText.trim();
    setInputText('');
    if (text) processInput(text);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleMicClick = () => {
    if (isListening) {
      speechRecognitionService.stop();
    } else {
      // Stop any ongoing speech so the mic can hear clearly
      voiceService.cancel();
      speechRecognitionService.start();
    }
  };

  const handleClose = () => {
    speechRecognitionService.stop();
    voiceService.cancel();
    onClose?.();
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  return (
    <div style={styles.panel} role="dialog" aria-label="Niyo assistant">

      {/* ── Header ── */}
      <div style={styles.header}>
        <div style={styles.avatar}>🤖</div>
        <div style={styles.headerText}>
          <div style={styles.headerTitle}>నియో (Niyo)</div>
          <div style={styles.headerSub}>
            {isListening ? '🎙️ వింటున్నాను...' : 'NiyogaX సహాయకుడు'}
          </div>
        </div>
        <button style={styles.closeBtn} onClick={handleClose} aria-label="Close assistant">
          ✕
        </button>
      </div>

      {/* ── Message list ── */}
      <div style={styles.messages} aria-live="polite">
        {messages.map(msg => (
          <div key={msg.id} style={styles.bubble(msg.sender === 'user')}>
            {msg.text}
          </div>
        ))}
        {messages.length === 0 && (
          <div style={{ color: '#9CA3AF', fontSize: '13px', textAlign: 'center', marginTop: '20px' }}>
            మీరు మాట్లాడగలరు లేదా టైప్ చేయగలరు
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Listening indicator ── */}
      {isListening && (
        <div style={styles.listeningIndicator}>
          <div id="niyo-listening-dot" style={styles.listeningDot} />
          <span>వింటున్నాను... మీరు మాట్లాడండి</span>
        </div>
      )}

      {/* ── Input row ── */}
      <div style={styles.inputRow}>

        {/* Microphone button */}
        {speechRecognitionService.supported && (
          <button
            style={styles.iconBtn(isListening, '#EF4444')}
            onClick={handleMicClick}
            aria-label={isListening ? 'Stop listening' : 'Start voice input'}
            title={isListening ? 'ఆపు' : 'మాట్లాడండి'}
          >
            🎙️
          </button>
        )}

        {/* Text input */}
        <input
          ref={inputRef}
          style={styles.textInput}
          type="text"
          placeholder="మీరు అడగాలనుకున్నది టైప్ చేయండి..."
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Message input"
        />

        <button
          onClick={handleSend}
          style={{
            backgroundColor: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            cursor: 'pointer',
            fontSize: '18px'
          }}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
