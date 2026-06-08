/**
 * SpeechRecognitionService.js
 *
 * PURPOSE:
 *   Wraps the browser's Web Speech Recognition API.
 *   - Listens in Telugu (te-IN).
 *   - Falls back to English if Telugu recognition fails.
 *   - Exposes start() / stop() with simple callbacks.
 *
 * HOW TO EXTEND:
 *   Replace with a custom server-side STT (Whisper, Google Cloud STT)
 *   by changing the _handleResult method to send audio to your API.
 */

class SpeechRecognitionService {
  constructor() {
    // Browser compatibility check
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('SpeechRecognitionService: Web Speech API not supported in this browser.');
      this.supported = false;
      return;
    }

    this.supported = true;
    this._recognition = new SpeechRecognition();
    this._configure();

    // Callbacks — set from outside
    this.onResult  = null;   // (transcript: string) => void
    this.onStart   = null;   // () => void
    this.onEnd     = null;   // () => void
    this.onError   = null;   // (error: string) => void
  }

  // ─── Configuration ────────────────────────────────────────────────────────

  _configure() {
    const r = this._recognition;

    r.lang            = 'te-IN';    // Telugu (India)
    r.continuous      = false;      // stop after one phrase (more reliable)
    r.interimResults  = false;      // only final results (cleaner)
    r.maxAlternatives = 1;

    r.onresult = (event) => {
      const transcript = event.results[0][0].transcript.trim();
      if (this.onResult) this.onResult(transcript);
    };

    r.onstart = () => {
      if (this.onStart) this.onStart();
    };

    r.onend = () => {
      this._listening = false;
      if (this.onEnd) this.onEnd();
    };

    r.onerror = (event) => {
      this._listening = false;
      // 'no-speech' is common and not a real error — just report it softly
      const msg = event.error === 'no-speech'
        ? 'మీరు ఏమీ చెప్పలేదు. మళ్ళీ ప్రయత్నించండి.'   // "You said nothing. Try again."
        : `గుర్తింపు లోపం: ${event.error}`;
      if (this.onError) this.onError(msg);
    };
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * start()
   * Begins listening. No-op if already listening or not supported.
   */
  start() {
    if (!this.supported || this._listening) return;
    try {
      this._listening = true;
      this._recognition.start();
    } catch (e) {
      // Already started — silently ignore
      this._listening = false;
    }
  }

  /**
   * stop()
   * Manually stop listening (triggers onend).
   */
  stop() {
    if (!this.supported || !this._listening) return;
    this._recognition.stop();
  }

  get isListening() {
    return !!this._listening;
  }
}

// Export a singleton
const speechRecognitionService = new SpeechRecognitionService();
export default speechRecognitionService;
