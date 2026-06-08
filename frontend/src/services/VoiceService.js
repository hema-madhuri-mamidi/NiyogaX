/**
 * VoiceService.js
 *
 * PURPOSE:
 *   Handles all Text-To-Speech (TTS) for the Niyo assistant.
 *   - Picks the best available Telugu FEMALE voice in the browser.
 *   - Queues speech so messages never overlap.
 *   - Exposes simple speak() / cancel() methods.
 *
 * HOW TO EXTEND WITH AN LLM LATER:
 *   Replace the static responses in AssistantIntentHandler with an API call,
 *   then pipe the returned text through VoiceService.speak().
 */

class VoiceService {
  constructor() {
    this._queue = [];          // pending utterances
    this._speaking = false;    // is something playing right now?
    this._voices = [];         // populated after voices load
    this._selectedVoice = null;

    // Load voices — they may load asynchronously in Chrome
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      this._loadVoices();
      window.speechSynthesis.onvoiceschanged = () => this._loadVoices();
    }
  }

  // ─── Private: load and pick the best Telugu female voice ─────────────────

  _loadVoices() {
    const all = window.speechSynthesis.getVoices();
    if (!all.length) return;
    this._voices = all;
    this._selectedVoice = this._pickTeluguFemaleVoice(all);
  }

  _pickTeluguFemaleVoice(voices) {
    /*
     * PRIORITY ORDER (best → acceptable):
     * 1. Telugu female voice (lang = te-IN, name contains "female" or "woman")
     * 2. Any Telugu voice (te or te-IN)
     * 3. Any Indian English female (en-IN, female indicator)
     * 4. Any Indian English voice
     * 5. Default (first available)
     *
     * Browser voice names vary — we check multiple signals.
     */
    const teluguFemale = voices.find(v =>
      (v.lang === 'te-IN' || v.lang === 'te') &&
      /female|woman|girl/i.test(v.name)
    );
    if (teluguFemale) return teluguFemale;

    const teluguAny = voices.find(v =>
      v.lang === 'te-IN' || v.lang === 'te' || v.lang.startsWith('te')
    );
    if (teluguAny) return teluguAny;

    // Fallback: Indian English female sounds friendlier than default robotic
    const indianEnglishFemale = voices.find(v =>
      v.lang === 'en-IN' && /female|woman|girl/i.test(v.name)
    );
    if (indianEnglishFemale) return indianEnglishFemale;

    const indianEnglish = voices.find(v => v.lang === 'en-IN');
    if (indianEnglish) return indianEnglish;

    return voices[0] || null;
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * speak(text, options)
   *
   * Adds text to the speech queue.
   * The next item plays only after the current one finishes.
   *
   * @param {string} text       - Telugu (or any) text to speak
   * @param {object} [options]  - { rate: 0.9, pitch: 1.1, volume: 1 }
   */
  speak(text, options = {}) {
    if (!window.speechSynthesis || !text) return;

    // Re-check voices in case they loaded late
    if (!this._selectedVoice) this._loadVoices();

    const utterance = new SpeechSynthesisUtterance(text);

    // Voice settings — slightly slower rate + higher pitch = warmer / more natural
    utterance.voice  = this._selectedVoice;
    utterance.lang   = 'te-IN';
    utterance.rate   = options.rate   ?? 0.88;   // slightly slower than default 1.0
    utterance.pitch  = options.pitch  ?? 1.1;    // slightly higher = friendlier
    utterance.volume = options.volume ?? 1.0;

    utterance.onend   = () => this._onUtteranceEnd();
    utterance.onerror = () => this._onUtteranceEnd();   // recover on error too

    this._queue.push(utterance);
    if (!this._speaking) this._playNext();
  }

  /**
   * cancel()
   * Stops current speech and clears the queue.
   * Call this ONLY when the user explicitly closes the assistant.
   */
  cancel() {
    this._queue = [];
    this._speaking = false;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  /** Returns true if speech is currently playing or queued. */
  get isSpeaking() {
    return this._speaking || this._queue.length > 0;
  }

  // ─── Private: queue management ───────────────────────────────────────────

  _playNext() {
    if (!this._queue.length) {
      this._speaking = false;
      return;
    }
    this._speaking = true;
    const utterance = this._queue.shift();

    // Chrome bug workaround: long utterances get cut off; use a keep-alive resume
    window.speechSynthesis.cancel();  // ensure clean slate before each item
    window.speechSynthesis.speak(utterance);
  }

  _onUtteranceEnd() {
    this._speaking = false;
    this._playNext();   // automatically play the next queued item
  }

  /** Expose the detected voice name for debugging (shown in console). */
  get detectedVoiceName() {
    return this._selectedVoice?.name ?? 'None detected';
  }
}

// Export a singleton so the same queue is shared across the app
const voiceService = new VoiceService();
export default voiceService;
