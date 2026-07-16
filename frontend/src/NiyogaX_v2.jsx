import { useState, useEffect, useRef } from "react";
import NiyoAssistant from './components/NiyoAssistant';
import { useJobFilter } from './hooks/useJobFilter.jsx';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;700;800;900&family=Noto+Sans+Telugu:wght@400;600;700&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#040d1a;color:#f1f5f9;font-family:'Rajdhani',sans-serif;overflow-x:hidden}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  @keyframes slideUp{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}
  @keyframes slideRight{from{opacity:0;transform:translateX(-28px)}to{opacity:1;transform:translateX(0)}}
  @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
  @keyframes breathe{0%,100%{box-shadow:0 4px 24px rgba(34,197,94,.5)}50%{box-shadow:0 4px 40px rgba(34,197,94,.8)}}
  @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(8px)}}
  @keyframes floatUp{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
  @keyframes glowText{0%{opacity:0}50%{opacity:1;text-shadow:0 0 60px rgba(255,140,0,.8)}100%{opacity:1}}
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  @keyframes countUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes scanLine{0%{top:-10%}100%{top:110%}}
  @keyframes emergencyGlow{0%,100%{box-shadow:0 0 20px rgba(239,68,68,.5)}50%{box-shadow:0 0 60px rgba(239,68,68,1)}}
  @keyframes waveBar{from{transform:scaleY(.3)}to{transform:scaleY(1)}}
  @keyframes voiceToast{0%{opacity:0;transform:translateX(-50%) translateY(12px)}15%{opacity:1;transform:translateX(-50%) translateY(0)}80%{opacity:1}100%{opacity:0;transform:translateX(-50%) translateY(-8px)}}
  input::placeholder{color:#475569}
  ::-webkit-scrollbar{width:4px}
  ::-webkit-scrollbar-track{background:#040d1a}
  ::-webkit-scrollbar-thumb{background:rgba(255,140,0,.3);border-radius:2px}
`;

/* ── VOICE ENGINE ── */

// Cached best voice — reset when voices reload
let _cv = null;
let _voicesReady = false;

// Score a voice for warmth/naturalness. Higher = better.
// Strongly prefers: Telugu female, then Indian female, then any natural-sounding female.
// Penalises: news-reader, corporate, robotic, male voices.
function _scoreVoice(v) {
  const n = v.name.toLowerCase();
  const l = (v.lang || "").toLowerCase();
  let score = 0;

  // Language match — Telugu first, then Indian English as fallback
  if (l === "te-in")         score += 100;
  else if (l.startsWith("te")) score += 80;
  else if (l === "en-in")    score += 20;
  else if (l.startsWith("en")) score += 5;

  // Gender — strongly prefer female
  if (/female|woman|girl/i.test(n))  score += 60;
  if (/\bmale\b|man\b/i.test(n))     score -= 40;   // penalise male

  // Warm / natural name hints
  if (/lekha|priya|kavya|suma|ananya|meera|nandini|sangeetha|rashmi|divya/i.test(n)) score += 30;
  if (/google/i.test(n))             score += 20;   // Google TTS is generally smoother
  if (/neural|natural|enhanced/i.test(n)) score += 25;

  // Penalise robotic / corporate styles
  if (/news|formal|ivona|espeak|festival|flite|mbrola/i.test(n)) score -= 30;
  if (/microsoft/i.test(n)) score += 5;   // neutral — MS voices are OK on Windows

  // Local (device) voices are usually higher quality than remote network voices
  if (!v.localService) score -= 5;

  return score;
}

function _bestVoice() {
  if (_cv) return _cv;
  const vs = window.speechSynthesis?.getVoices() || [];
  if (!vs.length) return null;
  // Sort all voices by score descending; pick the top
  const ranked = [...vs].sort((a, b) => _scoreVoice(b) - _scoreVoice(a));
  _cv = ranked[0] || null;
  return _cv;
}

// Ensure voices are loaded (browsers load them async on first call)
function _ensureVoices(cb) {
  const vs = window.speechSynthesis?.getVoices() || [];
  if (vs.length) { cb(); return; }
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    _cv = null; // reset cache so _bestVoice re-scores
    _voicesReady = true;
    cb();
  }, { once: true });
}

// Insert a short SSML-style pause (via a tiny silence character) between sentences
// so long Telugu strings sound more natural without changing actual text.
function _addNaturalPauses(text) {
  // Insert a brief pause after sentence-ending punctuation and after commas
  // We do this by splitting and rejoining with short silence utterances;
  // since Web Speech API doesn't support SSML, we approximate with a
  // slightly lowered rate and gentle pitch shaping instead (handled in speak()).
  return text
    .replace(/([।!?])\s+/g, "$1  ")   // double-space after Telugu/Devanagari full-stop
    .replace(/([,،])\s+/g, "$1 ");    // single extra space after commas
}

function speak(text, lang = "te-IN") {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();

  const prepared = _addNaturalPauses(text);

  const _doSpeak = () => {
    const u = new SpeechSynthesisUtterance(prepared);
    u.lang  = lang;
    // Softer, more conversational parameters:
    //   rate  0.82 — slightly slower than natural for clarity; avoids rush
    //   pitch 1.12 — gently lifted for a warm, friendly female feel
    //   volume 0.95 — just below max to avoid harshness on laptop speakers
    u.rate   = 0.82;
    u.pitch  = 1.12;
    u.volume = 0.95;
    const v = _bestVoice();
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  };

  _ensureVoices(_doSpeak);
}

function speakLater(text, ms = 400) {
  const id = setTimeout(() => speak(text), ms);
  return () => clearTimeout(id);
}

function stopSpeech() {
  try { window.speechSynthesis?.cancel(); } catch (e) { /* ignore */ }
}

/* ── TRANSLATIONS (te = Telugu, en = English, va = Telugu+Voice) ── */
const T = {
  te: {
    // Nav
    navHome: "హోమ్", navDash: "డాష్", navPost: "పని", navWorkers: "కార్మి", navProfile: "ప్రొఫైల్", navMyJobs: "నా పనులు",
    // CLang
    langTitle: "భాష ఎంచుకోండి", langSub: "Which language do you prefer?",
    // CReg
    cRegTitle: "కాంట్రాక్టర్ నమోదు", cRegStep: "Contractor — Step 1 of 3",
    cRegMicHint: '🎤 "Face", "Voice" లేదా "Phone" అని చెప్పండి',
    face: "ముఖం", faceVia: "ముఖం ద్వారా", faceTitle: "ముఖం ద్వారా నమోదు", faceDone: "ముఖం నమోదు ✓", faceDoneMsg: "మీ నమోదు పూర్తైంది",
    voiceReg: "వాయిస్", voiceVia: "వాయిస్ ద్వారా", voiceTitle: "వాయిస్ నమోదు", voiceAsk: "మీ కంపెనీ పేరు చెప్పండి", voiceDoneMsg: "మీ నమోదు పూర్తైంది!",
    phone: "ఫోన్", phoneVia: "ఫోన్ ద్వారా", phoneTitle: "ఫోన్ నమోదు",
    phoneLabel: "ఫోన్ నంబర్", phoneSend: "OTP పంపు →", otpLabel: "OTP నమోదు", otpVerify: "ధృవీకరించు ✓",
    otpSent: (ph) => `✅ OTP ${ph} కి పంపబడింది`, otpSentSpeak: "OTP పంపబడింది", regDone: "మీ నమోదు పూర్తైంది",
    // CProfile
    cProfLabel: "Contractor Profile",
    cProfNext: "తదుపరి →", cProfDone: "పూర్తి చేయండి ✓", cProfSkip: "దాటవేయి (ఐచ్ఛికం)",
    cProfHintManual: "🎤 మైక్ ద్వారా fill చేసి Next నొక్కండి",
    cProfHintVoice: "🎤 వాయిస్ లో చెప్పితే స్వయంగా వెళ్ళిపోతుంది",
    cProfFinishSpeak: "అభినందనలు! కాంట్రాక్టర్ ప్రొఫైల్ పూర్తయింది.",
    // CDash
    dashWelcome: (name) => `స్వాగతం, ${name}!`, dashTitle: "మీ డాష్‌బోర్డ్",
    dashSubtitle: "నిర్వహణ కేంద్రం",
    dashStatActive: "Active", dashStatJobs: "Jobs", dashStatDone: "Done", dashStatRating: "Rating",
    dashActPost: "పని పోస్ట్", dashActWorkers: "కార్మికులు", dashActUrgent: "అర్జెంట్",
    dashActAttend: "హాజరు", dashActNotify: "నోటిఫై", dashActRating: "రేటింగ్",
    dashNearby: "దగ్గర కార్మికులు", dashCall: "పిలవండి →", dashUnavail: "అందుబాటులో లేరు",
    dashEmerTitle: "అర్జెంట్ హైరింగ్ సక్రియమైంది!", dashEmerSub: "దగ్గర కార్మికులకు నోటిఫికేషన్ పంపబడింది",
    dashEmerCancel: "రద్దు", dashWelcomeSpeak: "స్వాగతం! మీ కాంట్రాక్టర్ డాష్‌బోర్డ్ సిద్ధంగా ఉంది.",
    dashCallSpeak: (n) => `${n} కి పిలుపు పంపబడింది`,
    dashUrgentSpeak: "అర్జెంట్! దగ్గర కార్మికులకు నోటిఫికేషన్ పంపబడింది. మీ దగ్గర పని ఉంది.",
    dashAttendSpeak: "హాజరు తెరుచుకుంటోంది", dashNotifySpeak: "3 కొత్త నోటిఫికేషన్లు", dashRatingSpeak: "రేటింగ్ మేనేజ్‌మెంట్",
    dashMicPost: "పోస్ట్", dashMicWorkers: "కార్మి",
    // PostJob
    pjStep: (n) => `Step ${n} of 5`, pjTypeTitle: "ఏ పని కోసం Workers కావాలి?", pjTypeSub: "Work type",
    pjLocTitle: "Location చెప్పండి", pjLocSub: "Work site location",
    pjLocLive: "📍 లైవ్ లొకేషన్ వాడండి", pjLocPh: "నగరం / జిల్లా",
    pjSalTitle: "రోజు Salary ఎంత?", pjSalSub: "Daily wage (₹)",
    pjDetTitle: "పని వివరాలు", pjDetSub: "Work details",
    pjWorkers: "కార్మికులు", pjDays: "పని రోజులు",
    pjUrgentLabel: "🚨 అర్జెంట్ హైరింగ్", pjUrgentSub: "Emergency notifications to nearby workers",
    pjContactTitle: "Contact వివరాలు", pjContactSub: "Confirm & Submit",
    pjSummary: "📋 పని సారాంశం", pjPhPh: "ఫోన్ నంబర్",
    pjPublish: "🚀 పని Publish చేయండి",
    pjPublishSpeak: "అభినందనలు! మీ పని పోస్ట్ publish అయింది. దగ్గర కార్మికులకు నోటిఫికేషన్ పంపబడింది.",
    pjNext: "తదుపరి →",
    pjSpeaks: ["", "ఏ పని కోసం workers కావాలి?", "Location చెప్పండి", "రోజుకి ఎంత salary ఇస్తారు?", "పని వివరాలు చెప్పండి", "Contact details ఇవ్వండి"],
    // WorkerMgmt
    wmTitle: "కార్మికుల నిర్వహణ", wmTabActive: "Active", wmTabAttend: "హాజరు", wmTabRatings: "రేటింగ్స్",
    wmPresent: "హాజరు ✓", wmAbsent: "గైర్హాజరు", wmPresentBtn: "✓ Present", wmAbsentBtn: "✗ Absent",
    wmActionAttend: "✓ హాజరు", wmActionRating: "⭐ రేటింగ్", wmActionDone: "✅ పూర్తయింది",
    wmSubmit: "సమర్పించు ✓", wmCancel: "రద్దు", wmOpenSpeak: "కార్మికుల నిర్వహణ తెరుచుకుంది",
    wmPresentSpeak: (n) => `${n} హాజరు`, wmAbsentSpeak: (n) => `${n} గైర్హాజరు`,
    wmRatingSpeak: (n, r) => `${n} కి ${r} star రేటింగ్!`,
    // CHome
    cHomeBtn: "డాష్‌బోర్డ్ →", cHomeWelcome: (n) => `స్వాగతం, ${n}!`,
    // CProfile page
    cpName: "👤 పేరు", cpLoc: "📍 స్థానం", cpTrust: "⭐ Trust", cpVerified: "✅ Verified", cpVerifiedVal: "పూర్తయింది",
    // Completion
    cDoneSpeak: "అభినందనలు! NiyogaX కి స్వాగతం!",
    // Worker nav / home / profile
    wHomeWelcome: "స్వాగతం!",
    wHomeBtn: "పనులు చూడండి →",
    wProfileLoc: "📍 స్థానం",
    wProfileRating: "⭐ రేటింగ్",
    wProfileVerified: "✅ ధృవీకరణ",
    wProfileDaily: "💰 రోజు కూలి",
    wProfileGender: "🧬 లింగం",
    wProfileNoContact: "అత్యవసర సంప్రదింపు జోడించబడలేదు",
    wProfileUrgentHint: "⚠️ అత్యవసర పరిస్థితుల్లో ఈ నంబర్ కి notification పంపబడుతుంది.",
    wProfileEmergencyLabel: "అత్యవసర సంప్రదింపు",
    wProfileAddContact: "➕ సంప్రదింపు జోడించు",
    wProfileSkipContact: "దాటవేయి →",
    wProfileDone: "పూర్తి చేయండి ✓",
    wNavHome: "హోమ్",
    wNavJobs: "పనులు",
    wNavApplications: "అప్లికేషన్స్",
    wNavProfile: "ప్రొఫైల్",
    // Reset
    resetSpeak: "మళ్లీ స్వాగతం!",
    // Logout
    logout: "లాగ్ అవుట్",
  },
  en: {
    navHome: "Home", navDash: "Dash", navPost: "Job", navWorkers: "Workers", navProfile: "Profile", navMyJobs: "My Jobs",
    langTitle: "Choose Language", langSub: "Which language do you prefer?",
    cRegTitle: "Contractor Registration", cRegStep: "Contractor — Step 1 of 3",
    cRegMicHint: '🎤 Say "Face", "Voice" or "Phone"',
    face: "Face ID", faceVia: "Face ID", faceTitle: "Face Registration", faceDone: "Face Registered ✓", faceDoneMsg: "",
    voiceReg: "Voice", voiceVia: "Voice", voiceTitle: "Voice Registration", voiceAsk: "Say your company name", voiceDoneMsg: "",
    phone: "Phone", phoneVia: "Phone", phoneTitle: "Phone Registration",
    phoneLabel: "Phone Number", phoneSend: "Send OTP →", otpLabel: "Enter OTP", otpVerify: "Verify ✓",
    otpSent: (ph) => `✅ OTP sent to ${ph}`, otpSentSpeak: "", regDone: "",
    cProfLabel: "Contractor Profile",
    cProfNext: "Next →", cProfDone: "Complete ✓", cProfSkip: "Skip (optional)",
    cProfHintManual: "🎤 Mic fills the field — tap Next to continue",
    cProfHintVoice: "🎤 Speak to fill — auto-advances",
    cProfFinishSpeak: "",
    dashWelcome: (name) => `Welcome, ${name}!`, dashTitle: "Your Dashboard",
    dashSubtitle: "Management Center",
    dashStatActive: "Active", dashStatJobs: "Jobs", dashStatDone: "Done", dashStatRating: "Rating",
    dashActPost: "Post Job", dashActWorkers: "Workers", dashActUrgent: "Urgent",
    dashActAttend: "Attendance", dashActNotify: "Notify", dashActRating: "Ratings",
    dashNearby: "Nearby Workers", dashCall: "Contact →", dashUnavail: "Unavailable",
    dashEmerTitle: "Urgent Hiring Activated!", dashEmerSub: "Notifications sent to nearby workers",
    dashEmerCancel: "Cancel", dashWelcomeSpeak: "",
    dashCallSpeak: () => "", dashUrgentSpeak: "", dashAttendSpeak: "", dashNotifySpeak: "", dashRatingSpeak: "",
    dashMicPost: "post", dashMicWorkers: "worker",
    pjStep: (n) => `Step ${n} of 5`, pjTypeTitle: "What type of workers do you need?", pjTypeSub: "Work type",
    pjLocTitle: "Work Location", pjLocSub: "Work site location",
    pjLocLive: "📍 Use Live Location", pjLocPh: "City / District",
    pjSalTitle: "Daily Salary?", pjSalSub: "Daily wage (₹)",
    pjDetTitle: "Work Details", pjDetSub: "Work details",
    pjWorkers: "Workers needed", pjDays: "Working days",
    pjUrgentLabel: "🚨 Urgent Hiring", pjUrgentSub: "Emergency notifications to nearby workers",
    pjContactTitle: "Contact Details", pjContactSub: "Confirm & Submit",
    pjSummary: "📋 Job Summary", pjPhPh: "Phone Number",
    pjPublish: "🚀 Publish Job",
    pjPublishSpeak: "",
    pjNext: "Next →",
    pjSpeaks: ["", "", "", "", "", ""],
    wmTitle: "Worker Management", wmTabActive: "Active", wmTabAttend: "Attendance", wmTabRatings: "Ratings",
    wmPresent: "Present ✓", wmAbsent: "Absent", wmPresentBtn: "✓ Present", wmAbsentBtn: "✗ Absent",
    wmActionAttend: "✓ Attendance", wmActionRating: "⭐ Rating", wmActionDone: "✅ Done",
    wmSubmit: "Submit ✓", wmCancel: "Cancel", wmOpenSpeak: "",
    wmPresentSpeak: () => "", wmAbsentSpeak: () => "", wmRatingSpeak: () => "",
    cHomeBtn: "Dashboard →", cHomeWelcome: (n) => `Welcome, ${n}!`,
    cpName: "👤 Name", cpLoc: "📍 Location", cpTrust: "⭐ Trust", cpVerified: "✅ Verified", cpVerifiedVal: "Complete",
    cDoneSpeak: "", resetSpeak: "", logout: "Log Out",
    wHomeWelcome: "Welcome!",
    wHomeBtn: "View Jobs →",
    wNavApplications: "Applications",
    wProfileLoc: "📍 Location",
    wProfileVerified: "✅ Verified",
    wProfileDaily: "💰 Daily wage",
    wProfileGender: "🧬 Gender",
    wProfileNoContact: "No emergency contact added",
    wProfileUrgentHint: "⚠️ This number will be notified if you press SOS.",
    wProfileEmergencyLabel: "Emergency Contact",
    wProfileAddContact: "➕ Add contact",
    wProfileSkipContact: "Skip →",
    wProfileDone: "Complete ✓",
  },
};
T.va = T.te; // Voice Assisted uses same Telugu text

/* ── PARTICLE BG ── */
function Particles({ color = "255,140,0" }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d");
    const rs = () => { c.width = window.innerWidth; c.height = window.innerHeight; };
    rs();
    const pts = Array.from({ length: 50 }, () => ({
      x: Math.random() * c.width, y: Math.random() * c.height,
      r: Math.random() * 2 + .5, dx: (Math.random() - .5) * .4, dy: (Math.random() - .5) * .4,
      a: Math.random() * .5 + .2
    }));
    let id;
    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      pts.forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color},${p.a})`; ctx.fill();
        p.x += p.dx; p.y += p.dy;
        if (p.x < 0 || p.x > c.width) p.dx *= -1;
        if (p.y < 0 || p.y > c.height) p.dy *= -1;
      });
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
        if (d < 90) {
          ctx.beginPath(); ctx.strokeStyle = `rgba(${color},${.1 * (1 - d / 90)})`; ctx.lineWidth = .5;
          ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke();
        }
      }
      id = requestAnimationFrame(draw);
    };
    draw(); window.addEventListener("resize", rs);
    return () => { cancelAnimationFrame(id); window.removeEventListener("resize", rs); };
  }, [color]);
  return <canvas ref={ref} style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />;
}

/* ── SILHOUETTES ── */
function Silhouettes() {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
      {[{ left: "4%", delay: "0s", sc: 1, op: .07 }, { left: "18%", delay: "1s", sc: .8, op: .05 }, { right: "6%", delay: ".5s", sc: 1.1, op: .07 }, { right: "20%", delay: "1.5s", sc: .75, op: .05 }].map((s, i) => (
        <svg key={i} viewBox="0 0 80 200" style={{ position: "absolute", bottom: 0, left: s.left, right: s.right, width: `${s.sc * 55}px`, opacity: s.op, animation: "floatUp 8s ease-in-out infinite", animationDelay: s.delay }}>
          <circle cx="40" cy="25" r="18" fill="#FF8C00" /><rect x="22" y="45" width="36" height="80" rx="8" fill="#FF8C00" />
          <rect x="10" y="48" width="14" height="55" rx="7" fill="#FF8C00" /><rect x="56" y="48" width="14" height="55" rx="7" fill="#FF8C00" />
          <rect x="24" y="125" width="14" height="60" rx="7" fill="#FF8C00" /><rect x="42" y="125" width="14" height="60" rx="7" fill="#FF8C00" />
        </svg>
      ))}
    </div>
  );
}

/* ── VOICE TOAST ── */
function useToast() {
  const [t, setT] = useState({ msg: "", color: "#ff8c00", k: 0 });
  const show = (msg, color = "#ff8c00") => { setT(p => ({ msg, color, k: p.k + 1 })); setTimeout(() => setT(p => ({ ...p, msg: "" })), 2900); };
  return { t, show };
}
function Toast({ msg, color, k }) {
  if (!msg) return null;
  return <div key={k} style={{ position: "fixed", bottom: 220, left: "50%", zIndex: 9000, background: "rgba(4,13,26,.95)", border: `1px solid ${color}60`, borderRadius: 50, padding: "10px 24px", display: "flex", alignItems: "center", gap: 10, backdropFilter: "blur(16px)", animation: "voiceToast 2.8s ease forwards", pointerEvents: "none", maxWidth: "85vw", whiteSpace: "nowrap" }}>
    <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, animation: "pulse 1s infinite", flexShrink: 0 }} />
    <span style={{ color: "#f1f5f9", fontSize: 13, fontFamily: "'Noto Sans Telugu',sans-serif" }}>{msg}</span>
  </div>;
}

/* ── MIC BUTTON ── */
function Mic({ onResult, size = 48, color = "#ff8c00", label = "మాట్లాడండి" }) {
  const [on, setOn] = useState(false);
  const [tmp, setTmp] = useState("");
  const rr = useRef(null);
  const go = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Chrome లో voice recognition వాడండి"); return; }
    if (on) { rr.current?.stop(); setOn(false); setTmp(""); return; }
    const r = new SR(); r.lang = "te-IN"; r.continuous = false; r.interimResults = true;
    r.onstart = () => setOn(true);
    r.onend = () => { setOn(false); setTmp(""); };
    r.onerror = () => { setOn(false); setTmp(""); };
    r.onresult = e => {
      let fin = "", par = "";
      for (let i = e.resultIndex; i < e.results.length; i++)
        e.results[i].isFinal ? (fin += e.results[i][0].transcript) : (par += e.results[i][0].transcript);
      if (par) setTmp(par);
      if (fin) { setTmp(""); onResult?.(fin.trim()); }
    };
    r.start(); rr.current = r;
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
      <button onClick={go} title={label} style={{ width: size, height: size, borderRadius: "50%", border: "none", background: on ? `radial-gradient(circle,${color}ff,${color}99)` : `linear-gradient(135deg,${color},${color}cc)`, boxShadow: on ? `0 0 0 6px ${color}30,0 0 0 12px ${color}12` : `0 4px 20px ${color}55`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .3s", animation: on ? "pulse 1.2s infinite" : "none", flexShrink: 0 }}>
        {on ? (
          <div style={{ display: "flex", alignItems: "center", gap: 2, height: size * .38 }}>
            {[.4, .7, 1, .7, .4].map((h, i) => <div key={i} style={{ width: size * .06, height: `${h * size * .38}px`, background: "#fff", borderRadius: 99, animation: `waveBar .6s ${i * .1}s ease-in-out infinite alternate` }} />)}
          </div>
        ) : (
          <svg width={size * .42} height={size * .42} viewBox="0 0 24 24" fill="white">
            <rect x="9" y="2" width="6" height="13" rx="3" />
            <path d="M5 11a7 7 0 0014 0" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
            <line x1="12" y1="18" x2="12" y2="22" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <line x1="8" y1="22" x2="16" y2="22" stroke="white" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </button>
      {tmp && <div style={{ background: `${color}18`, border: `1px solid ${color}40`, borderRadius: 10, padding: "4px 12px", color: "#f1f5f9", fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif", maxWidth: 180, textAlign: "center" }}>🎤 {tmp}</div>}
      {on && <div style={{ color, fontSize: 11, fontFamily: "'Noto Sans Telugu',sans-serif", fontWeight: 700, animation: "pulse 1s infinite" }}>వింటున్నాను…</div>}
    </div>
  );
}

/* ── SPEAKER BUTTON (per job card) ── */
function Speaker({ text, color = "#ff8c00" }) {
  const [playing, setPlaying] = useState(false);
  const tap = e => {
    e.stopPropagation();
    if (playing) { window.speechSynthesis.cancel(); setPlaying(false); return; }
    setPlaying(true);
    const u = new SpeechSynthesisUtterance(_addNaturalPauses(text));
    u.lang = "te-IN"; u.rate = 0.82; u.pitch = 1.12; u.volume = 0.95;
    const v = _bestVoice(); if (v) u.voice = v;
    u.onend = () => setPlaying(false); u.onerror = () => setPlaying(false);
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
  };
  return (
    <button onClick={tap} title={playing ? "ఆపు" : "వినండి"} style={{ width: 34, height: 34, borderRadius: "50%", border: `1.5px solid ${color}60`, background: playing ? `${color}25` : "rgba(255,255,255,.06)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all .25s", boxShadow: playing ? `0 0 12px ${color}50` : "none" }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M11 5L6 9H2v6h4l5 4V5z" fill={color} opacity={playing ? 1 : .7} />
        <path d="M15.54 8.46a5 5 0 010 7.07" stroke={color} strokeWidth="2" strokeLinecap="round" opacity={playing ? 1 : .5} style={playing ? { animation: "pulse .8s infinite" } : {}} />
        {playing && <path d="M19.07 4.93a10 10 0 010 14.14" stroke={color} strokeWidth="2" strokeLinecap="round" />}
      </svg>
    </button>
  );
}

/* ── SOS BUTTON + EMERGENCY WORKFLOW ──────────────────────────────────────────
   ARCHITECTURE:
   - workerProfile.emergencyContact = { name, phone } stored in App Shell state
   - sosDispatch(contact, location) is the single point to swap for real integrations:
       SMS:       POST /api/sos/sms    { to: phone, message }
       WhatsApp:  POST /api/sos/whatsapp { to: phone, message }
       Push:      POST /api/sos/push   { userId, payload }
       Backend:   POST /api/emergency  { workerId, location, timestamp }
   - This component only handles UI; wire real calls inside sosDispatch().
── */

// Future-ready dispatch stub — replace body with real API calls
function sosDispatch(contact, locationStr) {
  // FUTURE: await fetch("/api/sos/sms", { method:"POST", body: JSON.stringify({ to: contact.phone, message: `SOS from ${contact.name}. Location: ${locationStr}` }) })
  // FUTURE: await fetch("/api/sos/whatsapp", ...)
  // FUTURE: await fetch("/api/emergency/notify", ...)
  return Promise.resolve({ status: "simulated", channel: "ui-only" });
}

function SOS({ workerProfile, style }) {
  const [modal, setModal]     = useState(false);   // show modal
  const [stage, setStage]     = useState("idle");  // idle | confirming | sending | sent
  const [location, setLocation] = useState("");

  const ec = workerProfile?.emergencyContact || null;
  const isFemale = workerProfile?.gender === "female";

  const openSOS = () => {
    setModal(true);
    setStage("confirming");
    speak("ప్రమాదం! SOS నొక్కారు. సహాయం పంపిస్తున్నారా?", "te-IN");
    // Try to get location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setLocation(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`),
        () => setLocation("Location unavailable")
      );
    } else setLocation("Location unavailable");
  };

  const sendAlert = async () => {
    setStage("sending");
    speak(ec ? `${ec.name} కి notification పంపబడుతోంది` : "సహాయం పంపబడుతోంది", "te-IN");
    await sosDispatch(ec || { name: "Emergency Services", phone: "112" }, location);
    setTimeout(() => { setStage("sent"); speak("అత్యవసర notification పంపబడింది. సహాయం దారిలో ఉంది.", "te-IN"); }, 1400);
  };

  const close = () => { setModal(false); setStage("idle"); };

  return (
      <>
      {/* SOS trigger button — unchanged position/style */}
      <button
        onClick={openSOS}
        style={{ position: "fixed", bottom: 90, right: 20, zIndex: 1000, width: 56, height: 56, borderRadius: "50%", border: "3px solid #ff3c00", background: modal ? "#ff3c00" : "rgba(255,60,0,.15)", color: modal ? "#fff" : "#ff3c00", fontWeight: 900, fontSize: 13, cursor: "pointer", boxShadow: "0 0 20px rgba(255,60,0,.5)", animation: modal ? "pulse .5s infinite" : "none", transition: "all .3s", backdropFilter: "blur(10px)", ...style }}>
        SOS
      </button>

      {/* Emergency Modal */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(4,13,26,.92)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", animation: "fadeIn .2s ease" }}>
          <div style={{ width: "100%", maxWidth: 420, background: "linear-gradient(145deg,rgba(15,25,50,.99),rgba(10,18,38,.99))", border: "2px solid rgba(255,60,0,.6)", borderRadius: 24, padding: "28px 26px", boxShadow: "0 0 60px rgba(255,60,0,.3),0 24px 80px rgba(0,0,0,.8)", animation: "slideUp .3s cubic-bezier(.34,1.56,.64,1) both" }}>

            {/* ── CONFIRMING stage ── */}
            {stage === "confirming" && (<>
              <div style={{ textAlign: "center", marginBottom: 22 }}>
                <div style={{ fontSize: 64, animation: "pulse 1s infinite", marginBottom: 10 }}>🆘</div>
                <div style={{ color: "#ef4444", fontWeight: 800, fontSize: 22, fontFamily: "'Rajdhani',sans-serif", letterSpacing: 1 }}>అత్యవసర సహాయం</div>
                <div style={{ color: "#94a3b8", fontSize: 13, fontFamily: "'Noto Sans Telugu',sans-serif", marginTop: 5 }}>Emergency Alert</div>
              </div>

              {/* EC card if saved */}
              {ec ? (
                <div style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", borderRadius: 14, padding: "14px 16px", marginBottom: 16 }}>
                  <div style={{ color: "#64748b", fontSize: 11, fontFamily: "'Rajdhani',sans-serif", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Notification will be sent to</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: isFemale ? "rgba(236,72,153,.2)" : "rgba(255,140,0,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{isFemale ? "👩" : "👤"}</div>
                    <div>
                      <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 15, fontFamily: "'Rajdhani',sans-serif" }}>{ec.name}</div>
                      <div style={{ color: "#94a3b8", fontSize: 13, fontFamily: "'Rajdhani',sans-serif" }}>📞 {ec.phone}</div>
                    </div>
                    {isFemale && <span style={{ marginLeft: "auto", background: "rgba(236,72,153,.15)", border: "1px solid rgba(236,72,153,.3)", borderRadius: 50, padding: "2px 9px", color: "#f472b6", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>🛡️ SAFE</span>}
                  </div>
                </div>
              ) : (
                <div style={{ background: "rgba(255,140,0,.07)", border: "1px solid rgba(255,140,0,.2)", borderRadius: 14, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 9 }}>
                  <span style={{ fontSize: 18 }}>⚠️</span>
                  <div style={{ color: "#fbbf24", fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif", lineHeight: 1.5 }}>అత్యవసర సంప్రదింపు నమోదు కాలేదు. అత్యవసర సేవలకు (112) alert పంపబడుతుంది.</div>
                </div>
              )}

              {/* Location */}
              {location && (
                <div style={{ background: "rgba(34,197,94,.06)", border: "1px solid rgba(34,197,94,.2)", borderRadius: 10, padding: "8px 13px", marginBottom: 18, display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ fontSize: 14 }}>📍</span>
                  <span style={{ color: "#86efac", fontSize: 11, fontFamily: "'Rajdhani',sans-serif" }}>{location}</span>
                </div>
              )}

              {/* Notification preview */}
              <div style={{ background: "rgba(239,68,68,.07)", border: "1px solid rgba(239,68,68,.18)", borderRadius: 10, padding: "10px 14px", marginBottom: 20 }}>
                <div style={{ color: "#64748b", fontSize: 10, fontFamily: "'Rajdhani',sans-serif", letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 }}>Message Preview</div>
                <div style={{ color: "#fca5a5", fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif", lineHeight: 1.5 }}>
                  "🆘 {workerProfile?.name || "Worker"} కి సహాయం కావాలి! స్థానం: {location || "తెలియదు"}. వెంటనే సంప్రదించండి."
                </div>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={close}
                  style={{ flex: 1, padding: "13px", borderRadius: 12, border: "1px solid rgba(255,255,255,.12)", background: "none", color: "#64748b", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Rajdhani',sans-serif" }}>
                  రద్దు
                </button>
                <button onClick={sendAlert}
                  style={{ flex: 2, padding: "13px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "'Rajdhani',sans-serif", boxShadow: "0 4px 20px rgba(239,68,68,.45)", letterSpacing: .5 }}>
                  🚨 Alert పంపు
                </button>
              </div>
            </>)}

            {/* ── SENDING stage ── */}
            {stage === "sending" && (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ fontSize: 64, marginBottom: 16, animation: "spin 1s linear infinite", display: "inline-block" }}>🔄</div>
                <div style={{ color: "#ef4444", fontWeight: 800, fontSize: 20, fontFamily: "'Rajdhani',sans-serif" }}>పంపుతున్నాం…</div>
                <div style={{ color: "#94a3b8", fontSize: 13, fontFamily: "'Noto Sans Telugu',sans-serif", marginTop: 8 }}>Sending emergency alert</div>
                <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 20 }}>
                  {["SMS","WhatsApp","Location"].map((ch, i) => (
                    <div key={ch} style={{ background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.25)", borderRadius: 8, padding: "5px 10px", color: "#fca5a5", fontSize: 11, fontFamily: "'Rajdhani',sans-serif", animation: `pulse 1s ${i*.3}s infinite` }}>{ch}</div>
                  ))}
                </div>
              </div>
            )}

            {/* ── SENT stage ── */}
            {stage === "sent" && (
              <div style={{ textAlign: "center", padding: "10px 0" }}>
                <div style={{ fontSize: 64, marginBottom: 14 }}>✅</div>
                <div style={{ color: "#22c55e", fontWeight: 800, fontSize: 20, fontFamily: "'Rajdhani',sans-serif", marginBottom: 6 }}>Alert పంపబడింది!</div>
                <div style={{ color: "#94a3b8", fontSize: 13, fontFamily: "'Noto Sans Telugu',sans-serif", marginBottom: 20, lineHeight: 1.6 }}>
                  {ec ? `${ec.name} కి notification పంపబడింది.` : "అత్యవసర సేవలకు alert పంపబడింది."}<br />
                  <span style={{ color: "#475569", fontSize: 11 }}>Help is on the way.</span>
                </div>

                {/* Simulated delivery receipts */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20, textAlign: "left" }}>
                  {[
                    { ch: "📱 SMS",      status: "Delivered",  color: "#22c55e" },
                    { ch: "💬 WhatsApp", status: "Sent",       color: "#22c55e" },
                    { ch: "📍 Location", status: "Shared",     color: "#3b82f6" },
                  ].map(r => (
                    <div key={r.ch} style={{ background: "rgba(255,255,255,.04)", borderRadius: 10, padding: "8px 13px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "#94a3b8", fontSize: 12, fontFamily: "'Rajdhani',sans-serif" }}>{r.ch}</span>
                      <span style={{ color: r.color, fontWeight: 700, fontSize: 11 }}>✓ {r.status}</span>
                    </div>
                  ))}
                </div>

                <button onClick={close}
                  style={{ width: "100%", padding: "13px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "'Rajdhani',sans-serif" }}>
                  సరే ✓
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* ── FLOATING ASSISTANT ── */
function Bot({ onCmd, onOpenChange, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [rep, setRep] = useState("");
  const handle = t => {
    const l = t.toLowerCase(); let r = "";
    if (l.includes("worker") || l.includes("కార్మి")) { r = "వర్కర్ ఎంపిక!"; onCmd?.("worker"); }
    else if (l.includes("contractor") || l.includes("కాంట్రా")) { r = "కాంట్రాక్టర్ ఎంపిక!"; onCmd?.("contractor"); }
    else r = "వినబడింది: " + t;
    setRep(r); speak(r);
  };
  return <>
    <button onClick={() => { const next = !open; setOpen(next); onOpenChange?.(next); }} style={{ position: "fixed", bottom: 155, right: 20, zIndex: 1000, width: 56, height: 56, borderRadius: "50%", border: "none", background: "linear-gradient(135deg,#1a6b3c,#22c55e)", boxShadow: "0 4px 24px rgba(34,197,94,.5)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", animation: "breathe 3s ease-in-out infinite", fontSize: 24 }}>🤖</button>
    {open && (
      <NiyoAssistant
        isOpen={open}
        onClose={() => { setOpen(false); onOpenChange?.(false); }}
        onNavigate={onNavigate}
      />
    )}
  </>;
}

/* ── BACK BUTTON ── */
function Back({ onClick }) {
  return <button onClick={onClick} style={{ position: "fixed", top: 18, left: 18, zIndex: 500, display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,140,0,.25)", borderRadius: 50, padding: "9px 18px", cursor: "pointer", color: "#ff8c00", fontWeight: 700, fontSize: 13, fontFamily: "'Rajdhani',sans-serif", backdropFilter: "blur(12px)", transition: "all .2s" }}
    onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,140,0,.15)"; }}
    onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,.07)"; }}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ff8c00" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>వెనక్కి
  </button>;
}

/* ── NAV BAR ── */
function Nav({ page, go, role, langMode = "te" }) {
  const tx = T[langMode] || T.te;
  const wn = [
    { id: "home", icon: "🏠", l: tx.wNavHome || "హోమ్" },
    { id: "jobs", icon: "🔍", l: tx.wNavJobs || "పనులు" },
    { id: "applications", icon: "📄", l: tx.wNavApplications || "అప్లికేషన్స్" },
    { id: "profile", icon: "👤", l: tx.wNavProfile || "ప్రొఫైల్" },
  ];
  const cn = [
    { id: "home",      icon: "🏠", l: tx.navHome },
    { id: "dashboard", icon: "📊", l: tx.navDash },
    { id: "myjobs",    icon: "📋", l: tx.navMyJobs },
    { id: "post",      icon: "➕", l: tx.navPost },
    { id: "workers",   icon: "👷", l: tx.navWorkers },
    { id: "profile",   icon: "🏢", l: tx.navProfile },
  ];
  const navs = role === "contractor" ? cn : wn;
  if (!role) return null;
  const ac = role === "contractor" ? "#22c55e" : "#ff8c00";
  return <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 900, background: "rgba(4,13,26,.97)", backdropFilter: "blur(20px)", borderTop: `1px solid ${ac}30`, display: "flex", justifyContent: "space-around", padding: "9px 0 7px" }}>
    {navs.map(n => <button key={n.id} onClick={() => go(n.id)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "3px 8px" }}>
      <span style={{ fontSize: 19 }}>{n.icon}</span>
      <span style={{ color: page === n.id ? ac : "#475569", fontSize: 10, fontFamily: "'Noto Sans Telugu',sans-serif", fontWeight: 600 }}>{n.l}</span>
    </button>)}
  </nav>;
}

/* ── SHARED FORM HELPERS ── */
function Card({ title, sub, children, onBack, ac = "#ff8c00" }) {
  return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 20px 40px", position: "relative", zIndex: 2 }}>
    {onBack && <Back onClick={onBack} />}
    <div style={{ width: "100%", maxWidth: 440, background: "rgba(255,255,255,.04)", border: `1px solid ${ac}40`, borderRadius: 28, padding: "38px 30px", backdropFilter: "blur(20px)", animation: "slideUp .5s ease both" }}>
      <h2 style={{ color: "#f1f5f9", fontFamily: "'Rajdhani',sans-serif", fontWeight: 800, fontSize: 24, margin: "0 0 4px", textAlign: "center" }}>{title}</h2>
      <p style={{ color: "#64748b", textAlign: "center", marginBottom: 28, fontFamily: "'Noto Sans Telugu',sans-serif", fontSize: 13 }}>{sub}</p>
      {children}
    </div>
  </div>;
}
function Field({ label, sub, value, onChange, type, ph, ac = "#ff8c00" }) {
  return <div style={{ marginBottom: 18 }}>
    <div style={{ color: "#94a3b8", fontSize: 13, fontFamily: "'Noto Sans Telugu',sans-serif", marginBottom: 7 }}>{label} <span style={{ color: "#475569", fontSize: 11 }}>({sub})</span></div>
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={ph}
      style={{ width: "100%", boxSizing: "border-box", padding: "13px 16px", background: "rgba(255,255,255,.07)", border: `1px solid ${ac}4d`, borderRadius: 12, color: "#f1f5f9", fontSize: 15, outline: "none", fontFamily: "'Noto Sans Telugu',sans-serif" }}
      onFocus={e => e.target.style.borderColor = ac} onBlur={e => e.target.style.borderColor = `${ac}4d`} />
  </div>;
}
function Btn({ onClick, color = "#ff8c00", disabled, children }) {
  return <button onClick={onClick} disabled={disabled} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: disabled ? "rgba(255,255,255,.08)" : `linear-gradient(135deg,${color},${color}cc)`, color: disabled ? "#475569" : "#fff", fontWeight: 800, fontSize: 15, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "'Rajdhani',sans-serif", letterSpacing: 1, transition: "transform .2s" }}
    onMouseEnter={e => !disabled && (e.currentTarget.style.transform = "scale(1.02)")}
    onMouseLeave={e => e.currentTarget.style.transform = "none"}>{children}</button>;
}

/* ════════════════════════════════════════
   SCREENS
════════════════════════════════════════ */

/* ── LANDING ── */
function Landing({ onGo }) {
  const [cin, setCin] = useState(true);
  const { t, show } = useToast();
  useEffect(() => {
    speak("NiyogaX కి స్వాగతం");
    setTimeout(() => { setCin(false); speakLater("ప్రారంభించండి అని చెప్పండి", 600); }, 3000);
  }, []);
  const go = () => { speak("మీరు worker ఆ contractor ఆ?"); onGo(); };
  const vr = t => {
    const l = t.toLowerCase();
    if (l.includes("ప్రారంభ") || l.includes("start") || l.includes("hello") || l.includes("హాయ్")) {
      show("✓ ప్రారంభిస్తున్నాం…", "#ff8c00"); speak("సరే!"); setTimeout(go, 800);
    } else show("\"ప్రారంభించండి\" అని చెప్పండి", "#64748b");
  };
  if (cin) return <div style={{ position: "fixed", inset: 0, background: "#040d1a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 9999, animation: "fadeIn .5s" }}>
    <div style={{ fontSize: "clamp(44px,9vw,92px)", fontWeight: 900, letterSpacing: "-3px", fontFamily: "'Rajdhani',sans-serif", animation: "glowText 2s ease-in-out" }}>
      <span style={{ color: "#ff8c00" }}>NIYOGA</span><span style={{ color: "#22c55e" }}>X</span>
    </div>
    <div style={{ color: "#94a3b8", fontSize: "clamp(14px,3vw,22px)", marginTop: 12, fontFamily: "'Noto Sans Telugu',sans-serif", animation: "slideUp 1s .5s both" }}>స్వాగతం 🙏</div>
    <div style={{ marginTop: 24, display: "flex", gap: 4, alignItems: "flex-end", height: 24, animation: "fadeIn 1s 1s both" }}>
      {[.4,.7,1,.7,.4,.7,1].map((h,i)=><div key={i} style={{width:3,height:`${h*24}px`,background:"#ff8c0060",borderRadius:99,animation:`waveBar .7s ${i*.08}s ease-in-out infinite alternate`}}/>)}
    </div>
  </div>;
  return <div style={{ minHeight: "100vh", position: "relative" }}>
    <Toast {...t} />
    <section style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "40px 20px", position: "relative", zIndex: 2 }}>
      <div style={{ animation: "slideUp .8s both" }}>
        <div style={{ fontSize: "clamp(48px,10vw,100px)", fontWeight: 900, letterSpacing: "-3px", fontFamily: "'Rajdhani',sans-serif", lineHeight: 1 }}>
          <span style={{ color: "#ff8c00" }}>NIYOGA</span><span style={{ color: "#22c55e" }}>X</span>
        </div>
        <div style={{ fontFamily: "'Noto Sans Telugu',sans-serif", fontSize: "clamp(16px,4vw,30px)", color: "#e2e8f0", marginTop: 8, fontWeight: 600 }}>నియోగX – మీ పని, మీ గర్వం</div>
        <div style={{ color: "#94a3b8", fontSize: "clamp(13px,2vw,17px)", maxWidth: 460, margin: "14px auto 0", lineHeight: 1.7, fontFamily: "'Noto Sans Telugu',sans-serif" }}>కార్మికులను గౌరవించే, నమ్మకమైన, ఆధునిక నియామక వేదిక</div>
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 38, flexWrap: "wrap", justifyContent: "center", alignItems: "center", animation: "slideUp .8s .3s both" }}>
        <button onClick={go} style={{ padding: "15px 38px", background: "linear-gradient(135deg,#ff8c00,#ff6b00)", border: "none", borderRadius: 50, color: "#fff", fontWeight: 800, fontSize: 17, cursor: "pointer", boxShadow: "0 8px 32px rgba(255,140,0,.4)", transition: "transform .2s", fontFamily: "'Rajdhani',sans-serif", letterSpacing: 1 }}
          onMouseEnter={e=>e.target.style.transform="scale(1.05)"} onMouseLeave={e=>e.target.style.transform="scale(1)"}>ప్రారంభించండి →</button>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
          <Mic onResult={vr} size={54} />
          <span style={{ color: "#47556980", fontSize: 11, fontFamily: "'Noto Sans Telugu',sans-serif" }}>లేదా మాట్లాడండి</span>
        </div>
      </div>
      <div style={{ marginTop: 24, padding: "9px 20px", background: "rgba(255,140,0,.07)", border: "1px solid rgba(255,140,0,.18)", borderRadius: 50, animation: "slideUp .8s .6s both" }}>
        <span style={{ color: "#ff8c0099", fontSize: 13, fontFamily: "'Noto Sans Telugu',sans-serif" }}>🎤 "ప్రారంభించండి" అని చెప్పండి</span>
      </div>
      <div style={{ display: "flex", gap: 28, marginTop: 52, flexWrap: "wrap", justifyContent: "center", animation: "slideUp .8s .6s both" }}>
        {[{ i: "👷", v: "50K+", l: "కార్మికులు" }, { i: "🏗️", v: "10K+", l: "పనులు" }, { i: "🌏", v: "500+", l: "గ్రామాలు" }, { i: "⭐", v: "4.9", l: "రేటింగ్" }].map(s =>
          <div key={s.l} style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,140,0,.2)", borderRadius: 16, padding: "18px 24px", textAlign: "center", backdropFilter: "blur(10px)", minWidth: 100 }}>
            <div style={{ fontSize: 26 }}>{s.i}</div>
            <div style={{ color: "#ff8c00", fontWeight: 800, fontSize: 20, fontFamily: "'Rajdhani',sans-serif" }}>{s.v}</div>
            <div style={{ color: "#94a3b8", fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif" }}>{s.l}</div>
          </div>
        )}
      </div>
    </section>
  </div>;
}

/* ── ROLE SELECT ── */
function RoleSelect({ onSelect, onBack }) {
  const { t, show } = useToast();
  useEffect(() => { speakLater("మీరు worker ఆ contractor ఆ?", 300); }, []);
  const vr = tx => {
    const l = tx.toLowerCase();
    if (l.includes("worker") || l.includes("కార్మి") || l.includes("వర్కర్")) {
      show("✓ కార్మికుడు ఎంచుకున్నారు", "#ff8c00"); speak("సరే! కార్మికుడు గా వెళ్దాం"); setTimeout(() => onSelect("worker"), 1000);
    } else if (l.includes("contractor") || l.includes("కాంట్రా")) {
      show("✓ కాంట్రాక్టర్ ఎంచుకున్నారు", "#22c55e"); speak("సరే! కాంట్రాక్టర్ గా వెళ్దాం"); setTimeout(() => onSelect("contractor"), 1000);
    } else { speak("మళ్ళీ చెప్పండి — worker లేదా contractor?"); }
  };
  const roles = [
    { id: "worker", icon: "👷", title: "కార్మికుడు", sub: "Worker", desc: "పని వెతికే వారు", color: "#ff8c00", perks: ["పని వెతకండి", "వేతనం నిర్ణయించండి", "ప్రొఫైల్ సృష్టించండి"] },
    { id: "contractor", icon: "🏢", title: "కాంట్రాక్టర్", sub: "Contractor", desc: "పని ఇచ్చే వారు", color: "#22c55e", perks: ["కార్మికులు వెతకండి", "పని పోస్ట్ చేయండి", "జట్టు నిర్వహించండి"] },
  ];
  return <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", position: "relative", zIndex: 2 }}>
    <Toast {...t} /><Back onClick={onBack} />
    <div style={{ textAlign: "center", marginBottom: 44, animation: "slideUp .6s both" }}>
      <div style={{ color: "#ff8c00", fontSize: 12, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", marginBottom: 12, fontFamily: "'Rajdhani',sans-serif" }}>Step 1 of 3</div>
      <h1 style={{ color: "#f1f5f9", fontSize: "clamp(22px,5vw,40px)", fontWeight: 800, fontFamily: "'Rajdhani',sans-serif", margin: 0 }}>మీరు ఎవరు?</h1>
      <p style={{ color: "#94a3b8", marginTop: 10, fontFamily: "'Noto Sans Telugu',sans-serif", fontSize: 15 }}>Who are you?</p>
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
        <Mic onResult={vr} size={50} />
        <span style={{ color: "#47556980", fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif" }}>🎤 "Worker" లేదా "Contractor" అని చెప్పండి</span>
      </div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(270px,1fr))", gap: 22, maxWidth: 660, width: "100%" }}>
      {roles.map((r, i) => <button key={r.id} onClick={() => { speak(r.title + " ఎంచుకున్నారు"); onSelect(r.id); }}
        style={{ background: "rgba(255,255,255,.04)", border: `2px solid ${r.color}40`, borderRadius: 24, padding: "32px 26px", cursor: "pointer", textAlign: "left", backdropFilter: "blur(16px)", transition: "all .35s cubic-bezier(.34,1.56,.64,1)", animation: `slideUp .6s ${i*.15}s both`, boxShadow: `0 4px 32px ${r.color}25` }}
        onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-8px) scale(1.02)"; e.currentTarget.style.borderColor = r.color; }}
        onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = r.color + "40"; }}>
        <div style={{ fontSize: 60, marginBottom: 14 }}>{r.icon}</div>
        <div style={{ color: r.color, fontWeight: 800, fontSize: 26, fontFamily: "'Rajdhani',sans-serif" }}>{r.title}</div>
        <div style={{ color: "#64748b", fontSize: 13, marginBottom: 12 }}>{r.sub}</div>
        <div style={{ color: "#cbd5e1", fontSize: 14, fontFamily: "'Noto Sans Telugu',sans-serif", marginBottom: 18 }}>{r.desc}</div>
        {r.perks.map(p => <div key={p} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
          <div style={{ width: 18, height: 18, borderRadius: "50%", background: r.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0 }}>✓</div>
          <span style={{ color: "#94a3b8", fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif" }}>{p}</span>
        </div>)}
      </button>)}
    </div>
  </div>;
}

/* ── WORKER REGISTRATION ── */
function WorkerReg({ langMode = "te", onDone, onBack, setWorkerPhone }) {
  const tx = T[langMode] || T.te;
  const va = langMode === "va";
  const isEn = langMode === "en";
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState(null);
  const [phone, setPhone] = useState(""); const [otp, setOtp] = useState(""); const [sent, setSent] = useState(false);
  const { t, show } = useToast();
  useEffect(() => {
    if (!va) return;
    const cancel = speakLater("మీరు ఎలా నమోదు చేసుకోవాలనుకుంటున్నారు? ముఖం ద్వారా, voice ద్వారా, లేక phone number ద్వారా?", 300);
    return cancel;
  }, []);
  const vr = tx => {
    const l = tx.toLowerCase();
    if (l.includes("ముఖం") || l.includes("face")) {
      show("✓ " + (isEn ? "Face" : "ముఖం ద్వారా"), "#ff8c00");
      if (va) speak("ముఖం ద్వారా నమోదు");
      setTimeout(() => { setMethod("face"); setStep(1); }, 800);
    } else if (l.includes("voice") || l.includes("వాయిస్")) {
      show("✓ " + (isEn ? "Voice" : "వాయిస్ ద్వారా"), "#ff8c00");
      if (va) speak("వాయిస్ ద్వారా నమోదు");
      setTimeout(() => { setMethod("voice"); setStep(1); }, 800);
    } else if (l.includes("phone") || l.includes("ఫోన్") || l.includes("number")) {
      show("✓ " + (isEn ? "Phone" : "ఫోన్ ద్వారా"), "#ff8c00");
      if (va) speak("ఫోన్ ద్వారా నమోదు");
      setTimeout(() => { setMethod("phone"); setStep(1); }, 800);
    } else if (va) {
      speak("మళ్ళీ చెప్పండి — face, voice లేదా phone?");
    }
  };

  const doSend = async () => {
    if (!phone) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/accounts/send-otp/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        console.log("SEND OTP failed", data);
        return;
      }
      setSent(true);
      if (va) speak("OTP పంపబడింది. దయచేసి నమోదు చేయండి.");
    } catch (err) {
      console.log("SEND OTP error", err);
    }
  };

  const doLogin = async () => {
    if (!otp) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/accounts/verify-otp/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.verified) {
        alert("Invalid OTP");
        return;
      }
      if (setWorkerPhone) setWorkerPhone(phone);
      if (va) speak("మీ నమోదు పూర్తైంది");
      setTimeout(onDone, 500);
    } catch (err) {
      alert("Unable to verify OTP");
    }
  };

  if (step === 0) return <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px 40px", position: "relative", zIndex: 2 }}>
    <Toast {...t} /><Back onClick={onBack} />
    <div style={{ textAlign: "center", marginBottom: 44 }}>
      <div style={{ color: "#ff8c00", fontSize: 12, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", marginBottom: 12, fontFamily: "'Rajdhani',sans-serif" }}>Step 2 of 3</div>
      <h1 style={{ color: "#f1f5f9", fontSize: "clamp(20px,5vw,36px)", fontWeight: 800, fontFamily: "'Rajdhani',sans-serif", margin: 0 }}>{isEn ? "Register" : "నమోదు చేసుకోండి"}</h1>
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
        <Mic onResult={vr} size={50} />
        <span style={{ color: "#47556980", fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif" }}>{isEn ? '🎤 Say "Face", "Voice" or "Phone"' : '🎤 "Face", "Voice" లేదా "Phone" అని చెప్పండి'}</span>
      </div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 18, maxWidth: 590, width: "100%" }}>
      {[{ id: "face", icon: "🤳", title: isEn ? "Face" : "ముఖం ద్వారా", sub: isEn ? "Face ID" : "Face ID" }, { id: "voice", icon: "🎤", title: isEn ? "Voice" : "వాయిస్ ద్వారా", sub: isEn ? "Voice" : "Voice" }, { id: "phone", icon: "📱", title: isEn ? "Phone" : "ఫోన్ ద్వారా", sub: isEn ? "Phone OTP" : "Phone OTP" }].map(m =>
        <button key={m.id} onClick={() => { setMethod(m.id); setStep(1); if (va) speak(m.title + " ఎంచుకున్నారు"); }}
          style={{ background: "rgba(255,255,255,.05)", border: "2px solid rgba(255,140,0,.3)", borderRadius: 20, padding: "28px 18px", cursor: "pointer", textAlign: "center", transition: "all .3s", backdropFilter: "blur(12px)" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#ff8c00"; e.currentTarget.style.transform = "scale(1.04)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,140,0,.3)"; e.currentTarget.style.transform = "none"; }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>{m.icon}</div>
          <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 15, fontFamily: "'Noto Sans Telugu',sans-serif" }}>{m.title}</div>
          <div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>{m.sub}</div>
        </button>
      )}
    </div>
  </div>;
  if (method === "face") return <Card title="ముఖం ద్వారా నమోదు" sub="Face Registration" onBack={() => setStep(0)}>
    <div style={{ width: 180, height: 180, borderRadius: "50%", border: "3px dashed #ff8c00", margin: "0 auto 22px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(255,140,0,.05)", animation: "pulse 2s infinite", position: "relative", overflow: "hidden" }}>
      <div style={{ fontSize: 66 }}>🤳</div>
      <div style={{ color: "#94a3b8", fontSize: 11, fontFamily: "'Noto Sans Telugu',sans-serif", marginTop: 7 }}>కెమెరా వైపు చూడండి</div>
      <div style={{ position: "absolute", left: 0, right: 0, height: 3, background: "linear-gradient(90deg,transparent,#ff8c00,transparent)", animation: "scanLine 2s linear infinite", top: 0 }} />
    </div>
    <Btn onClick={() => { if (va) speak("మీ నమోదు పూర్తైంది"); setTimeout(onDone, 600); }}>ముఖం నమోదు అయింది ✓</Btn>
  </Card>;
  if (method === "voice") return <Card title="వాయిస్ ద్వారా నమోదు" sub="Voice Registration" onBack={() => setStep(0)}>
    <div style={{ textAlign: "center" }}>
      <div style={{ color: "#94a3b8", fontSize: 14, fontFamily: "'Noto Sans Telugu',sans-serif", marginBottom: 18 }}>మీ పేరు చెప్పండి</div>
      <Mic onResult={tx => { if (va) speak("మీ వాయిస్ నమోదు అయింది. మీ నమోదు పూర్తైంది!"); setTimeout(onDone, 1600); }} size={68} />
    </div>
  </Card>;
  return <Card title="ఫోన్ నమోదు" sub="Phone OTP" onBack={() => setStep(0)}>
    {!sent ? <>
      <Field label="ఫోన్ నంబర్" sub="Phone" value={phone} onChange={setPhone} type="tel" ph="9XXXXXXXXX" />
      <Btn onClick={doSend} disabled={!phone}>OTP పంపు →</Btn>
    </> : <>
      <div style={{ color: "#22c55e", fontSize: 13, fontFamily: "'Noto Sans Telugu',sans-serif", marginBottom: 18, textAlign: "center" }}>✅ OTP {phone} కి పంపబడింది</div>
      <Field label="OTP నమోదు" sub="Enter OTP" value={otp} onChange={setOtp} type="number" ph="______" />
      <Btn onClick={doLogin} color="#22c55e" disabled={!otp}>{isEn ? "Verify OTP" : "ధృవీకరించు ✓"}</Btn>
    </>}
  </Card>;
}

/* ── WORKER PROFILE WRAP (standalone — must NOT be defined inside WorkerProfile
   because inline component definitions get a new identity every render, causing
   React to unmount+remount the subtree on every keystroke, breaking text inputs) ── */
function WorkerProfileWrap({ children, onBack, currentStepNum, totalSteps, prog }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px 40px", position: "relative", zIndex: 2 }}>
      <Back onClick={onBack} />
      <div style={{ width: "100%", maxWidth: 500, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,140,0,.2)", borderRadius: 28, padding: "34px 30px", backdropFilter: "blur(20px)" }}>
        {/* Progress */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 9 }}>
            <span style={{ color: "#94a3b8", fontSize: 12, fontFamily: "'Rajdhani',sans-serif" }}>Profile Setup</span>
            <span style={{ color: "#ff8c00", fontWeight: 700, fontSize: 12 }}>{currentStepNum}/{totalSteps}</span>
          </div>
          <div style={{ height: 5, background: "rgba(255,255,255,.1)", borderRadius: 99 }}>
            <div style={{ height: "100%", width: `${prog}%`, background: "linear-gradient(90deg,#ff8c00,#ffa500)", borderRadius: 99, transition: "width .5s" }} />
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── WORKER PROFILE SETUP (voice auto-advance + gender + emergency contact) ──
   ARCHITECTURE NOTE:
   onDone(profile) emits the full profile object including:
     profile.gender        — "female" | "male" | "other"
     profile.emergencyContact = {
       name: string,
       phone: string,
       relation: string   // optional, future use
     }
   SOS reads profile.emergencyContact to simulate notification.
   Future: replace the simulated dispatch in SOS with real SMS/WhatsApp/push call.
── */
function WorkerProfile({ langMode = "te", phone, onDone, onBack }) {
  const va = langMode === "va";
  const isEn = langMode === "en";
  const d = (te, en) => isEn ? en : te;
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // ── Phase A: core profile questions ──────────────────────────────
  const coreQs = [
    { id: "name",     te: "మీ పేరు ఏమిటి?",          en: "Your name?",          icon: "👤", type: "text"   },
    { id: "age",      te: "మీ వయసు ఎంత?",             en: "Age?",                icon: "🎂", type: "number" },
    { id: "location", te: "మీరు ఎక్కడ ఉన్నారు?",      en: "Location?",           icon: "📍", type: "text"   },
    { id: "state",    te: "మీ రాష్ట్రం ఏమిటి?",       en: "State?",              icon: "🗺️", type: "text"   },
    { id: "district", te: "మీ జిల్లా ఏమిటి?",       en: "District?",           icon: "🏘️", type: "text"   },
    { id: "area",     te: "మీ ప్రాంతం లేదా గ్రామం ఏమిటి?", en: "Area / Village?", icon: "🏡", type: "text"   },
    { id: "workType", te: "మీకు ఏ పని వస్తుంది?",     en: "Work type?",          icon: "🔨", type: "text"   },
    { id: "exp",      te: "ఎంత అనుభవం ఉంది?",        en: "Years experience?",   icon: "⭐", type: "number" },
    { id: "wage",     te: "రోజు కూలి ఎంత కావాలి?",   en: "Daily wage (₹)?",    icon: "💰", type: "number" },
  ];

  // phase: "core" | "gender" | "emContact" | "emPhone" | "emOptional" | "done"
  const [phase, setPhase]     = useState("core");
  const [cur, setCur]         = useState(0);
  const [ans, setAns]         = useState({});
  const [val, setVal]         = useState("");
  const [gender, setGender]   = useState(null);   // "female" | "male" | "other"
  const [ecName, setEcName]   = useState("");
  const [ecPhone, setEcPhone] = useState("");
  const [skipOptional, setSkipOptional] = useState(false);

  const q = coreQs[cur];
  const qMain = q ? d(q.te, q.en) : "";
  const qSub = q ? d(q.en, q.te) : "";

  // Speak prompts when phase/step changes
  useEffect(() => {
    if (!va) return;
    if (phase === "core"       && q)       speakLater(q.te, 300);
    if (phase === "gender")                speakLater("మీ లింగం ఎంచుకోండి — Male, Female, లేదా Other", 300);
    if (phase === "emContact")             speakLater("మీ అత్యవసర సంప్రదింపు పేరు చెప్పండి", 300);
    if (phase === "emPhone")               speakLater("అత్యవసర సంప్రదింపు ఫోన్ నంబర్ చెప్పండి", 300);
    if (phase === "emOptional")            speakLater("అత్యవసర సంప్రదింపు జోడించాలంటే నొక్కండి. లేదా దాటవేయి.", 300);
  }, [phase, cur]);

  // Advance core questions
  const advCore = v => {
    const u = { ...ans, [q.id]: v }; setAns(u); setVal("");
    if (cur + 1 < coreQs.length) { setCur(cur + 1); }
    else { setPhase("gender"); }
  };
  const vrCore = t => { setVal(t); if (va) speak(t + ". సరే!"); setTimeout(() => advCore(t), 900); };

  // Finish — build full profile, register with backend if possible, then call onDone
  const finish = async (ec) => {
    const profile = {
      ...ans,
      gender,
      emergencyContact: ec || null,
      // Future-ready hook: add backend dispatch here
      // _sosDispatch: { channel: "sms", endpoint: "/api/sos/notify" }
    };

    if (!phone) {
      const message = "Phone number is required to register a worker account.";
      setError(message);
      if (va) speak("ఫోన్ నంబర్ అవసరం. ఖాతా కోసం ఫోన్ అవసరం.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/accounts/register-worker/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          name: ans.name,
          age: ans.age,
          workType: ans.workType,
          location: ans.location,
          state: ans.state,
          district: ans.district,
          area: ans.area,
          exp: ans.exp,
          wage: ans.wage,
          gender,
          emergencyPhone: ec?.phone || "",
          language: langMode === "va" ? "te" : langMode,
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Registration failed. Please try again.");
        return;
      }
      if (!(data?.success || data?.message)) {
        setError(data?.error || "Registration failed. Please try again.");
        return;
      }
      if (va) speak("అభినందనలు! మీ ప్రొఫైల్ పూర్తయింది.");
      setTimeout(() => onDone(profile, data?.token || null), 700);
    } catch (err) {
      setError("Unable to register. Check your network and try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── TOTAL STEPS for progress bar ─────────────────────────────────
  // core(6) + gender(1) + emContact(0-2 depending on gender) = 7 or 9
  const isFemale = gender === "female";
  const totalSteps = isFemale ? 11 : 10; // 9 core + gender + optional 2 EC
  const currentStepNum =
    phase === "core"       ? cur + 1 :
    phase === "gender"     ? 10 :
    phase === "emContact"  ? 11 :
    phase === "emPhone"    ? 12 :
    phase === "emOptional" ? 10 :
    totalSteps;
  const prog = ((currentStepNum - 1) / totalSteps) * 100;

  // ── Shared card wrapper (passed as props to avoid inline component definition) ──
  const wrapBack = () => {
    if (phase === "core" && cur > 0) { setCur(cur - 1); setVal(""); }
    else if (phase === "core")       onBack();
    else if (phase === "gender")     { setPhase("core"); setCur(coreQs.length - 1); }
    else if (phase === "emContact")  setPhase("gender");
    else if (phase === "emPhone")    setPhase("emContact");
    else if (phase === "emOptional") setPhase("gender");
  };

  // ── PHASE: core questions ─────────────────────────────────────────
  if (phase === "core") return (
    <WorkerProfileWrap onBack={wrapBack} currentStepNum={currentStepNum} totalSteps={totalSteps} prog={prog}>
      <div key={cur} style={{ textAlign: "center", marginBottom: 28, animation: "slideUp .4s both" }}>
        <div style={{ fontSize: 52, marginBottom: 14 }}>{q.icon}</div>
        <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: "clamp(16px,4vw,24px)", fontFamily: "'Rajdhani',sans-serif", marginBottom: 6 }}>{qMain}</div>
        <div style={{ color: "#64748b", fontSize: 13 }}>{qSub}</div>
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 7 }}>
        <input type={q.type} value={val} onChange={e => setVal(e.target.value)} placeholder={qMain}
          style={{ flex: 1, padding: "13px 16px", background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,140,0,.3)", borderRadius: 13, color: "#f1f5f9", fontSize: 15, outline: "none", fontFamily: "'Noto Sans Telugu',sans-serif" }}
          onFocus={e => e.target.style.borderColor = "#ff8c00"} onBlur={e => e.target.style.borderColor = "rgba(255,140,0,.3)"} />
        <Mic onResult={vrCore} size={46} />
      </div>
      <div style={{ color: "#47556970", fontSize: 11, fontFamily: "'Noto Sans Telugu',sans-serif", marginBottom: 18, textAlign: "center" }}>🎤 వాయిస్ లో చెప్పితే స్వయంగా వెళ్ళిపోతుంది</div>
      <button onClick={() => advCore(val)} disabled={!val}
        style={{ width: "100%", padding: "14px", borderRadius: 13, border: "none", background: val ? "linear-gradient(135deg,#ff8c00,#ff6b00)" : "rgba(255,255,255,.08)", color: val ? "#fff" : "#475569", fontWeight: 800, fontSize: 15, cursor: val ? "pointer" : "not-allowed", fontFamily: "'Rajdhani',sans-serif", letterSpacing: 1 }}>
        {d('తదుపరి →', 'Next →')}
      </button>
    </WorkerProfileWrap>
  );

  // ── PHASE: gender selection ───────────────────────────────────────
  if (phase === "gender") {
    const gOpts = [
      { id: "male",   icon: "👨", te: "పురుషుడు",   en: "Male",   color: "#3b82f6" },
      { id: "female", icon: "👩", te: "స్త్రీ",      en: "Female", color: "#ec4899" },
      { id: "other",  icon: "🧑", te: "ఇతర",        en: "Other",  color: "#8b5cf6" },
    ];
    const vrGender = t => {
      const l = t.toLowerCase();
      const hit = gOpts.find(g => l.includes(g.en.toLowerCase()) || l.includes(g.te));
      if (hit) { if (va) speak(hit.te + " ఎంచుకున్నారు"); setGender(hit.id); setTimeout(() => { hit.id === "female" ? setPhase("emContact") : setPhase("emOptional"); }, 600); }
      else if (va) speak("మళ్ళీ చెప్పండి — male, female లేదా other?");
    };
    return (
      <WorkerProfileWrap onBack={wrapBack} currentStepNum={currentStepNum} totalSteps={totalSteps} prog={prog}>
        <div style={{ textAlign: "center", marginBottom: 28, animation: "slideUp .4s both" }}>
          <div style={{ fontSize: 52, marginBottom: 14 }}>🧬</div>
          <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: "clamp(16px,4vw,24px)", fontFamily: "'Rajdhani',sans-serif", marginBottom: 6 }}>{d('మీ లింగం?', 'Your gender?')}</div>
          <div style={{ color: "#64748b", fontSize: 13 }}>{d('Your gender', 'Your gender')}</div>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
            <Mic onResult={vrGender} size={44} />
            <span style={{ color: "#47556970", fontSize: 11, fontFamily: "'Noto Sans Telugu',sans-serif" }}>{d('🎤 "Male", "Female" లేదా "Other" అని చెప్పండి', '🎤 Say "Male", "Female" or "Other"')}</span>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          {gOpts.map(g => (
            <button key={g.id}
              onClick={() => { if (va) speak(g.te + " ఎంచుకున్నారు"); setGender(g.id); setTimeout(() => { g.id === "female" ? setPhase("emContact") : setPhase("emOptional"); }, 400); }}
              style={{ background: gender === g.id ? `${g.color}20` : "rgba(255,255,255,.05)", border: `2px solid ${gender === g.id ? g.color : g.color + "35"}`, borderRadius: 18, padding: "22px 10px", cursor: "pointer", textAlign: "center", transition: "all .3s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = g.color; e.currentTarget.style.transform = "translateY(-3px)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = gender === g.id ? g.color : g.color + "35"; e.currentTarget.style.transform = "none"; }}>
              <div style={{ fontSize: 38, marginBottom: 9 }}>{g.icon}</div>
              <div style={{ color: gender === g.id ? g.color : "#94a3b8", fontWeight: 700, fontSize: 13, fontFamily: "'Noto Sans Telugu',sans-serif" }}>{d(g.te, g.en)}</div>
              <div style={{ color: "#475569", fontSize: 11, marginTop: 3 }}>{d(g.en, g.te)}</div>
            </button>
          ))}
        </div>
      </WorkerProfileWrap>
    );
  }

  // ── PHASE: optional emergency contact (male/other) ────────────────
  if (phase === "emOptional") return (
    <WorkerProfileWrap onBack={wrapBack} currentStepNum={currentStepNum} totalSteps={totalSteps} prog={prog}>
      <div style={{ textAlign: "center", marginBottom: 22, animation: "slideUp .4s both" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🆘</div>
        <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: "clamp(15px,4vw,22px)", fontFamily: "'Rajdhani',sans-serif", marginBottom: 6 }}>{d('అత్యవసర సంప్రదింపు', 'Emergency Contact')}</div>
        <div style={{ color: "#64748b", fontSize: 13 }}>{d('Emergency Contact (optional)', 'Emergency Contact (optional)')}</div>
      </div>
      <div style={{ background: "rgba(255,140,0,.07)", border: "1px solid rgba(255,140,0,.2)", borderRadius: 14, padding: "14px 16px", marginBottom: 22 }}>
        <div style={{ color: "#fbbf24", fontSize: 13, fontFamily: "'Noto Sans Telugu',sans-serif", lineHeight: 1.6 }}>
          {d('⚠️ అత్యవసర పరిస్థితుల్లో SOS నొక్కినప్పుడు ఈ నంబర్ కి notification పంపబడుతుంది.', '⚠️ This number will be notified if you press SOS.')}
        </div>
        <div style={{ color: "#64748b", fontSize: 11, marginTop: 5 }}>Emergency contact will be notified if you press SOS.</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <button onClick={() => setPhase("emContact")}
          style={{ width: "100%", padding: "14px", borderRadius: 13, border: "none", background: "linear-gradient(135deg,#ff8c00,#ff6b00)", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "'Rajdhani',sans-serif" }}>
          {d('➕ సంప్రదింపు జోడించు', '➕ Add contact')}
        </button>
        <button onClick={() => finish(null)} disabled={loading}
          style={{ width: "100%", padding: "13px", borderRadius: 13, border: "1px solid rgba(255,255,255,.12)", background: "none", color: "#64748b", fontWeight: 700, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: "'Rajdhani',sans-serif" }}>
          {loading ? (isEn ? 'Processing...' : 'ప్రాసెస్ చేస్తున్నాం...') : d('దాటవేయి →', 'Skip →')}
        </button>
      </div>
      {error && <div style={{ color: "#f87171", fontSize: 13, marginTop: 14, textAlign: "center" }}>{error}</div>}
    </WorkerProfileWrap>
  );

  // ── PHASE: emergency contact NAME (female mandatory, others optional) ──
  if (phase === "emContact") return (
    <WorkerProfileWrap onBack={wrapBack} currentStepNum={currentStepNum} totalSteps={totalSteps} prog={prog}>
      <div style={{ animation: "slideUp .4s both" }}>
        {isFemale && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(236,72,153,.1)", border: "1px solid rgba(236,72,153,.25)", borderRadius: 12, padding: "10px 14px", marginBottom: 20 }}>
            <span style={{ fontSize: 16 }}>🛡️</span>
            <div>
              <div style={{ color: "#f472b6", fontWeight: 700, fontSize: 13, fontFamily: "'Rajdhani',sans-serif" }}>మహిళా సురక్షిత మోడ్</div>
              <div style={{ color: "#94a3b8", fontSize: 11, fontFamily: "'Noto Sans Telugu',sans-serif" }}>అత్యవసర పరిస్థితుల్లో మీ సంప్రదింపుకి notification పంపుతాం</div>
            </div>
          </div>
        )}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>👤</div>
          <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: "clamp(15px,4vw,22px)", fontFamily: "'Rajdhani',sans-serif", marginBottom: 5 }}>{d('అత్యవసర సంప్రదింపు పేరు', 'Emergency contact name')}</div>
          <div style={{ color: "#64748b", fontSize: 13 }}>{d('Emergency contact name', 'Emergency contact name')}</div>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 7 }}>
          <input type="text" value={ecName} onChange={e => setEcName(e.target.value)} placeholder={d('పేరు / Name', 'Name')}
            style={{ flex: 1, padding: "13px 16px", background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,140,0,.3)", borderRadius: 13, color: "#f1f5f9", fontSize: 15, outline: "none", fontFamily: "'Noto Sans Telugu',sans-serif" }}
            onFocus={e => e.target.style.borderColor = "#ff8c00"} onBlur={e => e.target.style.borderColor = "rgba(255,140,0,.3)"} />
          <Mic onResult={t => { setEcName(t); if (va) speak(t + ". సరే!"); setTimeout(() => setPhase("emPhone"), 900); }} size={46} />
        </div>
        <div style={{ color: "#47556970", fontSize: 11, fontFamily: "'Noto Sans Telugu',sans-serif", marginBottom: 18, textAlign: "center" }}>{d('🎤 వాయిస్ లో చెప్పితే స్వయంగా వెళ్ళిపోతుంది', '🎤 Speak it to move on automatically')}</div>
        <button onClick={() => setPhase("emPhone")} disabled={!ecName}
          style={{ width: "100%", padding: "14px", borderRadius: 13, border: "none", background: ecName ? "linear-gradient(135deg,#ff8c00,#ff6b00)" : "rgba(255,255,255,.08)", color: ecName ? "#fff" : "#475569", fontWeight: 800, fontSize: 15, cursor: ecName ? "pointer" : "not-allowed", fontFamily: "'Rajdhani',sans-serif" }}>
          {d('తదుపరి →', 'Next →')}
        </button>
        {!isFemale && (
          <button onClick={() => finish(null)} style={{ width: "100%", marginTop: 10, padding: "12px", borderRadius: 13, border: "1px solid rgba(255,255,255,.1)", background: "none", color: "#64748b", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Rajdhani',sans-serif" }}>
            {d('దాటవేయి →', 'Skip →')}
          </button>
        )}
      </div>
    </WorkerProfileWrap>
  );

  // ── PHASE: emergency contact PHONE ───────────────────────────────
  if (phase === "emPhone") return (
    <WorkerProfileWrap onBack={wrapBack} currentStepNum={currentStepNum} totalSteps={totalSteps} prog={prog}>
      <div style={{ animation: "slideUp .4s both" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>📞</div>
          <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: "clamp(15px,4vw,22px)", fontFamily: "'Rajdhani',sans-serif", marginBottom: 5 }}>{d('అత్యవసర ఫోన్ నంబర్', 'Emergency contact phone number')}</div>
          <div style={{ color: "#64748b", fontSize: 13 }}>{d('Emergency contact phone number', 'Emergency contact phone number')}</div>
        </div>
        {/* Explain clearly what this is for */}
        <div style={{ background: "rgba(239,68,68,.07)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 12, padding: "11px 15px", marginBottom: 18, display: "flex", alignItems: "flex-start", gap: 9 }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>ℹ️</span>
          <div style={{ color: "#fca5a5", fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif", lineHeight: 1.5 }}>
            {d(`మీరు SOS నొక్కినప్పుడు <strong style={{ color: "#f87171" }}>${ecName || "ఈ వ్యక్తి"}</strong> కి అత్యవసర notification పంపబడుతుంది.`, `When you press SOS, <strong style={{ color: "#f87171" }}>${ecName || "this person"}</strong> will receive an emergency notification.`)}
            <br /><span style={{ color: "#64748b" }}>{d('This number will be notified when you press SOS.', 'This number will be notified when you press SOS.')}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 7 }}>
          <input type="tel" value={ecPhone} onChange={e => setEcPhone(e.target.value)} placeholder="9XXXXXXXXX"
            style={{ flex: 1, padding: "13px 16px", background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,140,0,.3)", borderRadius: 13, color: "#f1f5f9", fontSize: 15, outline: "none", fontFamily: "'Noto Sans Telugu',sans-serif" }}
            onFocus={e => e.target.style.borderColor = "#ff8c00"} onBlur={e => e.target.style.borderColor = "rgba(255,140,0,.3)"} />
          <Mic onResult={t => { const n = t.replace(/\D/g, ""); setEcPhone(n); if (va) speak("నంబర్ నమోదు అయింది"); setTimeout(() => finish({ name: ecName, phone: n }), 900); }} size={46} />
        </div>
        <div style={{ color: "#47556970", fontSize: 11, fontFamily: "'Noto Sans Telugu',sans-serif", marginBottom: 18, textAlign: "center" }}>{d('🎤 వాయిస్ లో చెప్పితే స్వయంగా వెళ్ళిపోతుంది', '🎤 Speak it to move on automatically')}</div>
        <button onClick={() => finish({ name: ecName, phone: ecPhone })} disabled={!ecPhone || loading}
          style={{ width: "100%", padding: "14px", borderRadius: 13, border: "none", background: (ecPhone && !loading) ? "linear-gradient(135deg,#22c55e,#16a34a)" : "rgba(255,255,255,.08)", color: (ecPhone && !loading) ? "#fff" : "#475569", fontWeight: 800, fontSize: 15, cursor: (!ecPhone || loading) ? "not-allowed" : "pointer", fontFamily: "'Rajdhani',sans-serif" }}>
          {loading ? (isEn ? 'Processing...' : 'ప్రాసెస్ చేస్తున్నాం...') : d('పూర్తి చేయండి ✓', 'Complete ✓')}
        </button>
      </div>
      {error && <div style={{ color: "#f87171", fontSize: 13, marginTop: 14, textAlign: "center" }}>{error}</div>}
    </WorkerProfileWrap>
  );

  return null;
}

/* ── JOB BOARD (with SpeakerButton + category icons) ── */
function Jobs({ langMode = "te" }) {
  const isEn = langMode === "en";
  const { jobFilter } = useJobFilter();
  const [filter, setFilter] = useState("all");
  const [applyingJobId, setApplyingJobId] = useState(null);
  const [appliedJobs, setAppliedJobs] = useState([]);
  const [workerLocation, setWorkerLocation] = useState({ state: "", district: "", area: "" });
  const [jobs, setJobs] = useState([
    { id: 1, icon: "🌾", cat: "farming", te: "వ్యవసాయం", en: "Farming", loc: "హైదరాబాద్ – 3 km", enLoc: "Hyderabad – 3 km", wage: "₹500/day", trust: 5, urgent: true, w: 8, color: "#22c55e" },
    { id: 2, icon: "🏗️", cat: "construction", te: "నిర్మాణం", en: "Construction", loc: "సికింద్రాబాద్ – 5 km", enLoc: "Secunderabad – 5 km", wage: "₹650/day", trust: 4, urgent: false, w: 15, color: "#ff8c00" },
    { id: 3, icon: "🎨", cat: "painting", te: "పెయింటింగ్", en: "Painting", loc: "కూకట్‌పల్లి – 7 km", enLoc: "Kukatpally – 7 km", wage: "₹550/day", trust: 5, urgent: false, w: 4, color: "#3b82f6" },
    { id: 4, icon: "🚗", cat: "driving", te: "డ్రైవింగ్", en: "Driving", loc: "మాదాపూర్ – 2 km", enLoc: "Madapur – 2 km", wage: "₹700/day", trust: 4, urgent: true, w: 2, color: "#8b5cf6" },
    { id: 5, icon: "📦", cat: "loading", te: "లోడింగ్", en: "Loading", loc: "నగరం లోడ్ సైట్", enLoc: "City loading site", wage: "₹450/day", trust: 4, urgent: false, w: 5, color: "#06b6d4" },
    { id: 6, icon: "⚡", cat: "electrician", te: "ఎలక్ట్రీషియన్", en: "Electrician", loc: "బంజారాహిల్స్ – 4 km", enLoc: "Banjara Hills – 4 km", wage: "₹700/day", trust: 4, urgent: false, w: 4, color: "#fbbf24" },
    { id: 7, icon: "🔧", cat: "mechanic", te: "మెకానిక్", en: "Mechanic", loc: "అమీర్‌పేట్ – 6 km", enLoc: "Ameerpet – 6 km", wage: "₹600/day", trust: 5, urgent: false, w: 3, color: "#ef4444" },
    { id: 8, icon: "🧹", cat: "cleaning", te: "శుభ్రత", en: "Cleaning", loc: "జూబ్లీ హిల్స్ – 4 km", enLoc: "Jubilee Hills – 4 km", wage: "₹400/day", trust: 4, urgent: false, w: 6, color: "#06b6d4" },
  ]);
  const { t, show } = useToast();

  useEffect(() => {
    if (jobFilter !== undefined && jobFilter !== null) {
      setFilter(jobFilter || "all");
    }
  }, [jobFilter]);

  const mapBackendJob = raw => {
    const normalizedType = String(raw.job_type || "").toLowerCase().trim();
    const typeMap = {
      farming: { icon: "🌾", color: "#22c55e", en: "Farming", te: "వ్యవసాయం", cat: "farming" },
      construction: { icon: "🏗️", color: "#ff8c00", en: "Construction", te: "నిర్మాణం", cat: "construction" },
      painting: { icon: "🎨", color: "#3b82f6", en: "Painting", te: "పెయింటింగ్", cat: "painting" },
      driving: { icon: "🚗", color: "#8b5cf6", en: "Driving", te: "డ్రైవింగ్", cat: "driving" },
      driver: { icon: "🚗", color: "#8b5cf6", en: "Driving", te: "డ్రైవింగ్", cat: "driving" },
      loading: { icon: "📦", color: "#06b6d4", en: "Loading", te: "లోడింగ్", cat: "loading" },
      electrician: { icon: "⚡", color: "#fbbf24", en: "Electrician", te: "ఎలక్ట్రీషియన్", cat: "electrician" },
      mechanic: { icon: "🔧", color: "#ef4444", en: "Mechanic", te: "మెకానిక్", cat: "mechanic" },
    };
    const match = Object.keys(typeMap).find(key => normalizedType.includes(key));
    const meta = match ? typeMap[match] : { icon: "💼", color: "#64748b", en: raw.job_type || "Job", te: raw.job_type || "పని", cat: "all" };

    const locationParts = [raw.area, raw.district, raw.state].filter(Boolean);
    const location = raw.location ? (locationParts.length ? `${locationParts.join(" • ")} • ${raw.location}` : raw.location) : (locationParts.join(" • ") || "Unknown location");
    const wage = raw.daily_salary != null ? `₹${raw.daily_salary}/day` : "₹500/day";
    const workers = Number(raw.workers_needed) || 1;

    return {
      id: raw.id,
      icon: meta.icon,
      color: meta.color,
      cat: meta.cat,
      te: meta.te,
      en: meta.en,
      loc: location,
      enLoc: location,
      wage,
      trust: 4,
      urgent: Boolean(raw.urgent_hiring),
      w: workers,
      state: raw.state || "",
      district: raw.district || "",
      area: raw.area || "",
    };
  };

  useEffect(() => {
    const token = localStorage.getItem("niyoga_token") || "";
    const fetchWorkerProfile = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/accounts/profile/`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Token ${token}`
          }
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success && data?.profile) {
          setWorkerLocation({
            state: data.profile.state || "",
            district: data.profile.district || "",
            area: data.profile.area || ""
          });
        }
      } catch (err) {
        // ignore profile fetch failures and fall back to showing all jobs
      }
    };
    fetchWorkerProfile();
  }, []);

  useEffect(() => {
    const fetchJobs = async () => {
      const token = localStorage.getItem("niyoga_token") || "";
      try {
        const res = await fetch(`${BACKEND_URL}/api/jobs/`, {
          headers: { Authorization: `Token ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (Array.isArray(data)) {
          const sortedJobs = (data.length ? data : []).map(mapBackendJob).sort((a, b) => {
            const workerArea = (workerLocation.area || "").trim().toLowerCase();
            const workerDistrict = (workerLocation.district || "").trim().toLowerCase();
            const workerState = (workerLocation.state || "").trim().toLowerCase();
            const aArea = (a.area || "").trim().toLowerCase();
            const aDistrict = (a.district || "").trim().toLowerCase();
            const aState = (a.state || "").trim().toLowerCase();
            const bArea = (b.area || "").trim().toLowerCase();
            const bDistrict = (b.district || "").trim().toLowerCase();
            const bState = (b.state || "").trim().toLowerCase();

            if (!workerArea && !workerDistrict && !workerState) return 0;

            const aPriority = aArea && workerArea && aArea === workerArea ? 3 : aDistrict && workerDistrict && aDistrict === workerDistrict ? 2 : aState && workerState && aState === workerState ? 1 : 0;
            const bPriority = bArea && workerArea && bArea === workerArea ? 3 : bDistrict && workerDistrict && bDistrict === workerDistrict ? 2 : bState && workerState && bState === workerState ? 1 : 0;

            if (aPriority !== bPriority) return bPriority - aPriority;
            return 0;
          });
          setJobs(sortedJobs);
        }
      } catch (err) {
        // keep fallback jobs if backend fetch fails
      }
    };
    fetchJobs();
  }, [workerLocation.state, workerLocation.district, workerLocation.area]);

  const cats = [
    { id: "all", l: isEn ? "All" : "అన్నీ", i: "🔍", en: "All" },
    { id: "farming", l: isEn ? "Farming" : "వ్యవసాయం", i: "🌾", en: "Farming" },
    { id: "construction", l: isEn ? "Construction" : "నిర్మాణం", i: "🏗️", en: "Construction" },
    { id: "painting", l: isEn ? "Painting" : "పెయింటింగ్", i: "🎨", en: "Painting" },
    { id: "driving", l: isEn ? "Driving" : "డ్రైవింగ్", i: "🚗", en: "Driving" },
    { id: "loading", l: isEn ? "Loading" : "లోడింగ్", i: "📦", en: "Loading" },
    { id: "electrician", l: isEn ? "Electrician" : "ఎలక్ట్రీషియన్", i: "⚡", en: "Electrician" },
    { id: "mechanic", l: isEn ? "Mechanic" : "మెకానిక్", i: "🔧", en: "Mechanic" },
  ];
  const filtered = filter === "all" ? jobs : jobs.filter(j => j.cat === filter);

  const applyToJob = async jobId => {
    if (applyingJobId || appliedJobs.includes(jobId)) return;
    const token = localStorage.getItem("niyoga_token") || "";
    setApplyingJobId(jobId);
    try {
      const res = await fetch(`${BACKEND_URL}/api/jobs/${jobId}/apply/`, {
        method: "POST",
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        show && show(data?.detail || data?.error || "Apply failed", "#ef4444");
        return;
      }
      setAppliedJobs(prev => [...prev, jobId]);
      show && show("Applied", "#22c55e");
      if (langMode === "va") {
        const job = jobs.find(j => j.id === jobId);
        if (job) speak(isEn ? `${job.en} job applied for!` : `${job.te} పని కోసం దరఖాస్తు చేయబడింది!`);
      }
    } catch (err) {
      show && show("Unable to apply. Try again.", "#ef4444");
    } finally {
      setApplyingJobId(null);
    }
  };

  console.log('[Jobs] filtering', { filter, filteredLength: filtered.length });
  const jobText = j => {
    const type = isEn ? j.en : j.te;
    const loc = isEn ? j.enLoc : j.loc;
    const urgent = j.urgent ? (isEn ? "Urgent!" : "అర్జెంట్!") : "";
    return isEn ? `${type} job. Location ${loc}. Wage ${j.wage}. ${j.w} workers needed. ${urgent}`
                : `${type} పని. స్థానం ${loc}. వేతనం ${j.wage}. ${j.w} కార్మికులు అవసరం. ${urgent}`;
  };
  const vf = tx => {
    const m = cats.find(c => tx.includes(c.l));
    if (m) {
      setFilter(m.id);
      show(`✓ ${m.l} ${isEn ? "jobs" : "పనులు"}`, "#ff8c00");
      if (langMode === "va") speak(isEn ? `${m.l} jobs` : `${m.l} పనులు చూపిస్తున్నాం`);
    }
    else if (langMode === "va") speak(isEn ? "Please say farming, construction, or all." : "మళ్ళీ చెప్పండి — వ్యవసాయం, నిర్మాణం, లేదా అన్నీ?");
  };
  return <div style={{ minHeight: "100vh", padding: "36px 18px 100px", position: "relative", zIndex: 2 }}>
    <Toast {...t} />
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 26, flexWrap: "wrap", gap: 14 }}>
        <div>
          <h1 style={{ color: "#f1f5f9", fontFamily: "'Rajdhani',sans-serif", fontSize: "clamp(20px,5vw,34px)", fontWeight: 800, margin: 0 }}>{isEn ? "Nearby Jobs" : "దగ్గర పనులు"}</h1>
          <p style={{ color: "#94a3b8", fontFamily: "'Noto Sans Telugu',sans-serif", fontSize: 13, marginTop: 4 }}>{isEn ? "Nearby Jobs — Hyderabad" : "Nearby Jobs — హైదరాబాద్"}</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <Mic onResult={vf} size={50} /><span style={{ color: "#47556970", fontSize: 11, fontFamily: "'Noto Sans Telugu',sans-serif" }}>{isEn ? '🎤 Say a category name' : '🎤 పని పేరు చెప్పండి'}</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 9, marginBottom: 24, flexWrap: "wrap" }}>
        {cats.map(c => <button key={c.id} onClick={() => { setFilter(c.id); if (c.id !== "all" && langMode === "va") speak(isEn ? `${c.l} jobs` : `${c.l} పనులు`); }}
          style={{ padding: "7px 16px", borderRadius: 50, border: "none", cursor: "pointer", background: filter === c.id ? "#ff8c00" : "rgba(255,255,255,.07)", color: filter === c.id ? "#fff" : "#94a3b8", fontFamily: "'Noto Sans Telugu',sans-serif", fontSize: 13, fontWeight: 600, transition: "all .2s", display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 15 }}>{c.i}</span>{c.l}
        </button>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(255px,1fr))", gap: 18 }}>
        {filtered.map((j, i) => <div key={j.id}
          style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${j.color}30`, borderRadius: 20, padding: "22px 18px", backdropFilter: "blur(12px)", transition: "all .3s", animation: `slideUp .4s ${i*.07}s both`, position: "relative", overflow: "hidden" }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.borderColor = j.color + "80"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = j.color + "30"; }}>
          {j.urgent && <div style={{ position: "absolute", top: 13, right: 48, background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 50 }}>{isEn ? "Urgent" : "అర్జెంట్"}</div>}
          <div style={{ position: "absolute", top: 11, right: 11 }}><Speaker text={jobText(j)} color={j.color} /></div>
          <div style={{ fontSize: 44, marginBottom: 10 }}>{j.icon}</div>
          <div style={{ color: j.color, fontWeight: 800, fontSize: 19, fontFamily: "'Rajdhani',sans-serif" }}>{isEn ? j.en : j.te}</div>
          <div style={{ color: "#64748b", fontSize: 11, marginBottom: 14 }}>{isEn ? j.enLoc : j.loc}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>📍 <span style={{ color: "#94a3b8", fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif" }}>{isEn ? j.enLoc : j.loc}</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>💰 <span style={{ color: "#22c55e", fontWeight: 700, fontSize: 14, fontFamily: "'Rajdhani',sans-serif" }}>{j.wage}</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>👷 <span style={{ color: "#94a3b8", fontSize: 12 }}>{isEn ? `${j.w} workers needed` : `${j.w} కార్మికులు కావాలి`}</span></div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>{[...Array(5)].map((_, si) => <span key={si} style={{ fontSize: 13, color: si < j.trust ? "#ff8c00" : "#334155" }}>★</span>)}</div>
            {(() => {
              const isApplied = appliedJobs.includes(j.id);
              const isApplying = applyingJobId === j.id;
              return <button
                onClick={() => applyToJob(j.id)}
                disabled={isApplying || isApplied}
                style={{ padding: "7px 16px", borderRadius: 50, border: "none", background: `linear-gradient(135deg,${j.color},${j.color}cc)`, color: "#fff", fontWeight: 700, fontSize: 12, cursor: isApplying || isApplied ? "not-allowed" : "pointer", fontFamily: "'Rajdhani',sans-serif" }}>
                {isApplying ? "Applying..." : isApplied ? "Applied" : (isEn ? "Apply →" : "Apply →")}
              </button>;
            })()}
          </div>
        </div>)}
      </div>
    </div>
  </div>;
}

function WorkerApplications({ langMode = "te" }) {
  const isEn = langMode === "en";
  const [applications, setApplications] = useState(null);
  const [loading, setLoading] = useState(true);
  const [applicationActionLoading, setApplicationActionLoading] = useState(null);
  const { t, show } = useToast();

  const jobIconMap = {
    farming: "🌾",
    construction: "🏗️",
    painting: "🎨",
    driving: "🚗",
    driver: "🚗",
    electrician: "⚡",
    loading: "📦",
    mechanic: "🔧",
  };
  const getJobIcon = (type) => jobIconMap[(type || "").toString().toLowerCase().trim()] || "💼";
  const getStatusBadge = (status) => {
    if (status === "applied") return { label: "🟠 Applied", bg: "#fef3c7", color: "#b45309" };
    if (status === "accepted") return { label: "🟢 Accepted", bg: "#dcfce7", color: "#166534" };
    if (status === "confirmed") return { label: "✅ Confirmed", bg: "#d1fae5", color: "#065f46" };
    if (status === "unavailable") return { label: "⚠️ Unavailable", bg: "#fef2f2", color: "#991b1b" };
    if (status === "rejected") return { label: "🔴 Rejected", bg: "#fee2e2", color: "#991b1b" };
    return { label: status ? status.charAt(0).toUpperCase() + status.slice(1) : "Unknown", bg: "#e2e8f0", color: "#475569" };
  };

  const updateApplicationStatus = (applicationId, newStatus) => {
    setApplications(current => current ? current.map(item => item.id === applicationId ? { ...item, status: newStatus } : item) : current);
  };

  const handleApplicationAction = async (applicationId, action) => {
    if (applicationActionLoading) return;
    const token = localStorage.getItem('niyoga_token') || "";
    setApplicationActionLoading(applicationId);
    try {
      const res = await fetch(`${BACKEND_URL}/api/jobs/applications/${applicationId}/${action}/`, {
        method: 'POST',
        headers: { Authorization: `Token ${token}` }
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        const status = action === 'confirm' ? 'confirmed' : 'unavailable';
        const statusLabel = action === 'confirm'
          ? (isEn ? 'Confirmed' : 'నిర్ధారించబడింది')
          : (isEn ? 'Marked unavailable' : 'ఉపలభ్యంకాదు అని గుర్తించబడింది');
        updateApplicationStatus(applicationId, status);
        show && show(statusLabel, '#22c55e');
        if (langMode === 'va') {
          speak(action === 'confirm'
            ? (isEn ? 'Application confirmed.' : 'అప్లికేషన్ నిర్ధారించబడింది.')
            : (isEn ? 'Application marked unavailable.' : 'అప్లికేషన్ అందుబాటులో లేదు అని గుర్తించబడింది.'));
        }
      } else {
        show && show(data && (data.detail || data.error) ? (data.detail || data.error) : (isEn ? 'Unable to update application' : 'అప్లికేషన్‌ను నవీకరించలేము'), '#ef4444');
      }
    } catch (err) {
      console.error('[WorkerApplications] application action failed', err);
      show && show(isEn ? 'Network error' : 'నెట్‌వర్క్ లోపం', '#ef4444');
    } finally {
      setApplicationActionLoading(null);
    }
  };

  useEffect(() => {
    let mounted = true;
    const token = localStorage.getItem('niyoga_token') || "";
    fetch(`${BACKEND_URL}/api/jobs/applications/my/`, {
      headers: { Authorization: `Token ${token}` }
    })
      .then(async res => {
        const data = await res.json().catch(() => null);
        if (!mounted) return;
        if (res.ok && Array.isArray(data)) {
          setApplications(data);
        } else {
          setApplications([]);
          show && show(data && (data.detail || data.error) ? (data.detail || data.error) : (isEn ? 'Failed to load applications' : 'అప్లికేషన్స్‌ని లోడ్ చేయలేకపోయాము'), '#ef4444');
        }
      })
      .catch(err => {
        console.error('[WorkerApplications] fetch failed', err);
        if (!mounted) return;
        setApplications([]);
        show && show(isEn ? 'Network error' : 'నెట్‌వర్క్ లోపం', '#ef4444');
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [isEn]);

  return <div style={{ minHeight: '100vh', padding: '36px 18px 120px', position: 'relative', zIndex: 2 }}>
    <Toast {...t} />
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h1 style={{ color: '#f1f5f9', fontFamily: "'Rajdhani',sans-serif", fontSize: 'clamp(20px,5vw,34px)', fontWeight: 800, margin: 0 }}>{isEn ? 'My Applications' : 'నా అప్లికేషన్స్'}</h1>
          <p style={{ color: '#94a3b8', fontFamily: "'Noto Sans Telugu',sans-serif", fontSize: 13, marginTop: 4 }}>{isEn ? 'Track your job status here' : 'మీ అనువర్తన స్థితిని ఇక్కడ చూడండి'}</p>
        </div>
      </div>
      {loading ? (
        <div style={{ minHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>{isEn ? 'Loading applications…' : 'అప్లికేషన్స్‌ని లోడ్ చేస్తున్నాం…'}</div>
      ) : !applications || applications.length === 0 ? (
        <div style={{ minHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: '#94a3b8' }}>
          <div>{isEn ? 'No applications yet' : 'ఇంకా అప్లికేషన్స్ లేవు'}</div>
          <button onClick={() => window.location.reload()} style={{ padding: '10px 18px', borderRadius: 14, border: 'none', background: '#ff8c00', color: '#fff', cursor: 'pointer' }}>{isEn ? 'Refresh' : 'పునఃసమీకరించు'}</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 18 }}>
          {applications.map(app => {
            const title = app.job_type || 'Job';
            const location = app.job_location || 'Unknown Location';
            const wage = app.daily_salary != null ? `₹${app.daily_salary}/day` : 'Not specified';
            const badge = getStatusBadge(app.status);
            return (
              <div key={app.id} style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,140,0,.15)', borderRadius: 20, padding: 18, position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12 }}>
                  <div style={{ fontSize: 42, lineHeight: 1 }}>{getJobIcon(app.job_type)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#f1f5f9', fontWeight: 800, fontSize: 18, lineHeight: 1.2, marginBottom: 6 }}>{title}</div>
                    <div style={{ color: '#94a3b8', fontSize: 13 }}>{location}</div>
                  </div>
                  <span style={{ background: badge.bg, color: badge.color, borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{badge.label}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, color: '#94a3b8', fontSize: 13 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span>📍</span>{location}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span>💰</span>{wage}</div>
                  <div>{isEn ? `Applied on ${new Date(app.applied_at).toLocaleDateString()}` : `అప్లై చేసిన తేదీ ${new Date(app.applied_at).toLocaleDateString()}`}</div>
                  <div>{isEn ? `Job status: ${app.job_status || '—'}` : `పని స్థితి: ${app.job_status || '—'}`}</div>
                </div>
                {app.status === 'confirmed' ? (
                  <div style={{ marginTop: 16, background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.2)', borderRadius: 16, padding: 14, color: '#94a3b8', fontSize: 13 }}>
                    <div style={{ color: '#f1f5f9', fontWeight: 700, marginBottom: 8 }}>{isEn ? 'Contractor Contact' : 'కాంట్రాక్టర్ సంప్రదింపు'}</div>
                    {app.contractor_name ? <div style={{ marginBottom: 8 }}>{app.contractor_name}</div> : null}
                    <div><strong style={{ color: '#f1f5f9' }}>{isEn ? 'Phone Number:' : 'ఫోన్ నంబర్:'}</strong> {app.contractor_phone || '—'}</div>
                  </div>
                ) : null}
                {app.status === 'accepted' ? (
                  <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <button onClick={() => handleApplicationAction(app.id, 'confirm')} disabled={applicationActionLoading === app.id}
                      style={{ padding: '10px 12px', borderRadius: 14, border: 'none', background: '#22c55e', color: '#fff', fontWeight: 700, cursor: applicationActionLoading === app.id ? 'not-allowed' : 'pointer' }}>
                      {applicationActionLoading === app.id ? (isEn ? 'Processing…' : 'చేస్తోంది…') : (isEn ? 'Confirm Availability' : 'అందుబాటులో ఉన్నాను')}
                    </button>
                    <button onClick={() => handleApplicationAction(app.id, 'unavailable')} disabled={applicationActionLoading === app.id}
                      style={{ padding: '10px 12px', borderRadius: 14, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, cursor: applicationActionLoading === app.id ? 'not-allowed' : 'pointer' }}>
                      {applicationActionLoading === app.id ? (isEn ? 'Processing…' : 'చేస్తోంది…') : (isEn ? 'Not Available' : 'అందుబాటులో లేను')}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  </div>;
}

/* ── CONTRACTOR LANGUAGE ── */
function CLang({ onSelect, onBack, workerMode = false }) {
  // No auto-speak — voice only activates after user picks Voice Mode
  const opts = [
    { id: "te", icon: "అఆ", title: "తెలుగు", color: "#ff8c00", desc: "తెలుగు భాషలో కొనసాగండి", hint: "Touch & type only" },
    { id: "en", icon: "🔤", title: "English", color: "#3b82f6", desc: "Continue in English", hint: "Touch & type only" },
    { id: "va", icon: "🎤", title: "Voice Mode", color: "#22c55e", desc: "AI voice guides every step", hint: "Telugu voice + speech recognition" },
  ];
  return <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px 40px", position: "relative", zIndex: 2 }}>
    <Back onClick={onBack} />
    <div style={{ textAlign: "center", marginBottom: 44, animation: "slideUp .6s both" }}>
      <div style={{ display: "inline-block", background: "rgba(34,197,94,.1)", border: "1px solid rgba(34,197,94,.3)", borderRadius: 50, padding: "5px 18px", color: "#22c55e", fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", marginBottom: 14, fontFamily: "'Rajdhani',sans-serif" }}>{workerMode ? "Worker Onboarding" : "Contractor Onboarding"}</div>
      <h1 style={{ color: "#f1f5f9", fontSize: "clamp(22px,5vw,38px)", fontWeight: 800, fontFamily: "'Rajdhani',sans-serif", margin: 0 }}>భాష ఎంచుకోండి</h1>
      <p style={{ color: "#94a3b8", marginTop: 10, fontFamily: "'Noto Sans Telugu',sans-serif", fontSize: 15 }}>Which language do you prefer?</p>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 18, maxWidth: 700, width: "100%" }}>
      {opts.map((o, i) => <button key={o.id} onClick={() => {
          if (o.id === "va") speakLater("Voice mode ఎంచుకున్నారు. మీరు మాట్లాడవచ్చు.", 200);
          onSelect(o.id);
        }}
        style={{ background: "rgba(255,255,255,.04)", border: `2px solid ${o.color}40`, borderRadius: 22, padding: "32px 22px", cursor: "pointer", textAlign: "center", backdropFilter: "blur(16px)", transition: "all .35s cubic-bezier(.34,1.56,.64,1)", animation: `slideUp .5s ${i*.1}s both` }}
        onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-8px) scale(1.03)"; e.currentTarget.style.borderColor = o.color; }}
        onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = o.color + "40"; }}>
        <div style={{ fontSize: 44, marginBottom: 14 }}>{o.icon}</div>
        <div style={{ color: o.color, fontWeight: 800, fontSize: 22, fontFamily: "'Rajdhani',sans-serif" }}>{o.title}</div>
        <div style={{ color: "#94a3b8", fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif", marginTop: 10, lineHeight: 1.5 }}>{o.desc}</div>
        <div style={{ color: "#475569", fontSize: 10, marginTop: 8, fontFamily: "'Rajdhani',sans-serif" }}>{o.hint}</div>
        {o.id === "va" && <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", animation: "pulse 1s infinite" }} />
          <span style={{ color: "#22c55e", fontSize: 10, fontWeight: 700 }}>AI Voice Active</span>
        </div>}
      </button>)}
    </div>
  </div>;
}

/* ── CONTRACTOR REGISTRATION ── */
function CReg({ onDone, onBack, langMode = "te", setContractorPhone }) {
  const tx = T[langMode] || T.te;
  const va = langMode === "va"; // voice assisted?
  const [step, setStep] = useState(0); const [method, setMethod] = useState(null);
  const [phone, setPhone] = useState(""); const [otp, setOtp] = useState(""); const [sent, setSent] = useState(false);
  const { t, show } = useToast();
  useEffect(() => { if (va) speakLater("కాంట్రాక్టర్ నమోదు — మీకు ఇష్టమైన పద్ధతి ఎంచుకోండి.", 300); }, []);
  const vr = tx2 => {
    const l = tx2.toLowerCase();
    if (l.includes("face") || l.includes("ముఖం")) { show("✓ " + tx.face, "#22c55e"); setTimeout(() => { setMethod("face"); setStep(1); }, 700); }
    else if (l.includes("voice") || l.includes("వాయిస్")) { show("✓ " + tx.voiceReg, "#22c55e"); setTimeout(() => { setMethod("voice"); setStep(1); }, 700); }
    else if (l.includes("phone") || l.includes("ఫోన్")) { show("✓ " + tx.phone, "#22c55e"); setTimeout(() => { setMethod("phone"); setStep(1); }, 700); }
    else if (va) speak("మళ్ళీ చెప్పండి");
  };

  const doSend = async () => {
    if (!phone) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/accounts/send-otp/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        console.log("SEND OTP failed", data);
        return;
      }
      setSent(true);
      if (va) speak(tx.otpSentSpeak);
    } catch (err) {
      console.log("SEND OTP error", err);
    }
  };

  const doLogin = async () => {
    if (!otp) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/accounts/verify-otp/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.verified) {
        alert("Invalid OTP");
        return;
      }
      if (setContractorPhone) setContractorPhone(phone);
      if (va) speak(tx.regDone);
      setTimeout(onDone, 500);
    } catch (err) {
      alert("Unable to verify OTP");
    }
  };

  if (step === 0) return <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px 40px", position: "relative", zIndex: 2 }}>
    <Toast {...t} /><Back onClick={onBack} />
    <div style={{ textAlign: "center", marginBottom: 42 }}>
      <div style={{ color: "#22c55e", fontSize: 12, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", marginBottom: 12, fontFamily: "'Rajdhani',sans-serif" }}>{tx.cRegStep}</div>
      <h1 style={{ color: "#f1f5f9", fontSize: "clamp(20px,5vw,36px)", fontWeight: 800, fontFamily: "'Rajdhani',sans-serif", margin: 0 }}>{tx.cRegTitle}</h1>
      {va && <div style={{ marginTop: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
        <Mic onResult={vr} size={50} color="#22c55e" />
        <span style={{ color: "#47556980", fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif" }}>{tx.cRegMicHint}</span>
      </div>}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 18, maxWidth: 590, width: "100%" }}>
      {[{ id: "face", icon: "🤳", label: tx.faceVia }, { id: "voice", icon: "🎤", label: tx.voiceVia }, { id: "phone", icon: "📱", label: tx.phoneVia }].map(m =>
        <button key={m.id} onClick={() => { setMethod(m.id); setStep(1); if (va) speak(m.label); }}
          style={{ background: "rgba(255,255,255,.05)", border: "2px solid rgba(34,197,94,.3)", borderRadius: 20, padding: "28px 18px", cursor: "pointer", textAlign: "center", transition: "all .3s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#22c55e"; e.currentTarget.style.transform = "scale(1.04)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(34,197,94,.3)"; e.currentTarget.style.transform = "none"; }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>{m.icon}</div>
          <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 15, fontFamily: "'Noto Sans Telugu',sans-serif" }}>{m.label}</div>
        </button>
      )}
    </div>
  </div>;
  if (method === "face") return <Card title={tx.faceTitle} sub="Face ID" onBack={() => setStep(0)} ac="#22c55e">
    <div style={{ width: 180, height: 180, borderRadius: "50%", border: "3px dashed #22c55e", margin: "0 auto 20px", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(34,197,94,.05)", animation: "pulse 2s infinite", position: "relative", overflow: "hidden" }}>
      <div style={{ fontSize: 66 }}>🤳</div>
      <div style={{ position: "absolute", left: 0, right: 0, height: 3, background: "linear-gradient(90deg,transparent,#22c55e,transparent)", animation: "scanLine 2s linear infinite", top: 0 }} />
    </div>
    <Btn onClick={() => { if (va) speak(tx.faceDoneMsg); setTimeout(onDone, 500); }} color="#22c55e">{tx.faceDone}</Btn>
  </Card>;
  if (method === "voice") return <Card title={tx.voiceTitle} sub="Voice" onBack={() => setStep(0)} ac="#22c55e">
    <div style={{ textAlign: "center" }}>
      <div style={{ color: "#94a3b8", fontSize: 14, fontFamily: "'Noto Sans Telugu',sans-serif", marginBottom: 18 }}>{tx.voiceAsk}</div>
      <Mic onResult={tx2 => { if (va) speak(tx2 + ". " + tx.voiceDoneMsg); setTimeout(onDone, 1500); }} size={68} color="#22c55e" />
    </div>
  </Card>;
  return <Card title={tx.phoneTitle} sub="OTP" onBack={() => setStep(0)} ac="#22c55e">
    {!sent ? <>
      <Field label={tx.phoneLabel} sub="Primary" value={phone} onChange={setPhone} type="tel" ph="9XXXXXXXXX" ac="#22c55e" />
      <Btn onClick={doSend} color="#22c55e" disabled={!phone}>{tx.phoneSend}</Btn>
    </> : <>
      <div style={{ color: "#22c55e", fontSize: 13, marginBottom: 16, textAlign: "center", fontFamily: "'Noto Sans Telugu',sans-serif" }}>{tx.otpSent(phone)}</div>
      <Field label={tx.otpLabel} sub="OTP" value={otp} onChange={setOtp} type="number" ph="______" ac="#22c55e" />
      <Btn onClick={doLogin} color="#22c55e" disabled={!otp}>{tx.otpVerify}</Btn>
    </>}
  </Card>;
}

/* ── CONTRACTOR PROFILE (voice auto-advance) ── */
function CProfile({ phone, onDone, onBack, langMode = "te" }) {
  const tx = T[langMode] || T.te;
  const va = langMode === "va";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const qs = [
    { id: "name",     te: "మీ పేరు ఏమిటి?",                en: "Your name?",              icon: "👤", type: "text"   },
    { id: "company",  te: "మీ కంపెనీ పేరు?",               en: "Company name?",            icon: "🏢", type: "text"   },
    { id: "location", te: "మీరు ఎక్కడ ఉన్నారు?",           en: "Location?",                icon: "📍", type: "text"   },
    { id: "state",    te: "మీ రాష్ట్రం ఏమిటి?",            en: "State?",                   icon: "🗺️", type: "text"   },
    { id: "district", te: "మీ జిల్లా ఏమిటి?",            en: "District?",                icon: "🏘️", type: "text"   },
    { id: "area",     te: "మీ ప్రాంతం లేదా గ్రామం ఏమిటి?",  en: "Area / Village?",          icon: "🏡", type: "text"   },
    { id: "workType", te: "ఏ రకమైన పని ఇస్తారు?",          en: "Work type?",               icon: "🔨", type: "text"   },
    { id: "workers",  te: "ఎంత మంది కార్మికులు కావాలి?",   en: "Workers needed?",          icon: "👷", type: "number" },
    { id: "budget",   te: "రోజు వేతన బడ్జెట్ ఎంత?",       en: "Daily wage budget (₹)?",   icon: "💰", type: "number" },
    { id: "gst",      te: "GST నంబర్ (ఐచ్ఛికం)",           en: "GST (optional)",           icon: "📋", type: "text"   },
  ];
  const [cur, setCur] = useState(0); const [ans, setAns] = useState({}); const [val, setVal] = useState("");
  const q = qs[cur];
  // Only speak question aloud in Voice Assisted mode
  useEffect(() => { if (va && q) speakLater(q.te, 300); }, [cur]);
  const adv = v => {
    const u = { ...ans, [q.id]: v }; setAns(u); setVal("");
    if (cur + 1 < qs.length) {
      setCur(cur + 1);
    } else {
      if (va) speak(tx.cProfFinishSpeak);
      setTimeout(() => finish(u), 700);
    }
  };
  // Voice auto-advance only in va mode; in te/en mic fills but user taps Next
  const handleMic = tv => {
    setVal(tv);
    if (va) { speak(tv + ". సరే!"); setTimeout(() => adv(tv), 900); }
  };
  const prog = (cur / qs.length) * 100;
  const canNext = val || q.id === "gst";

  const finish = async (profileData) => {
    if (!phone) {
      const message = "Phone number is required to register a contractor account.";
      setError(message);
      if (va) speak("ఫోన్ నంబర్ అవసరం. ఖాతా కోసం ఫోన్ అవసరం.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/accounts/register-contractor/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          name: profileData.name,
          company: profileData.company,
          location: profileData.location,
          state: profileData.state,
          district: profileData.district,
          area: profileData.area,
          workType: profileData.workType,
          workers: profileData.workers,
          budget: profileData.budget,
          gst: profileData.gst,
          language: langMode === "va" ? "te" : langMode,
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Registration failed. Please try again.");
        return;
      }
      if (!data?.profile) {
        setError(data?.error || "Registration failed. Please try again.");
        return;
      }
      onDone(data.profile, data.token || null);
    } catch (err) {
      console.error("Contractor registration error", err);
      setError("Unable to register. Check your network and try again.");
    } finally {
      setLoading(false);
    }
  };
  // Show the question in the active language
  const qLabel = langMode === "en" ? q.en : q.te;
  const qSub   = langMode === "en" ? q.te : q.en;
  return <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px 40px", position: "relative", zIndex: 2 }}>
    <Back onClick={cur > 0 ? () => { setCur(cur - 1); setVal(""); } : onBack} />
    <div style={{ width: "100%", maxWidth: 500, background: "rgba(255,255,255,.04)", border: "1px solid rgba(34,197,94,.2)", borderRadius: 28, padding: "34px 30px", backdropFilter: "blur(20px)" }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 9 }}>
          <span style={{ color: "#94a3b8", fontSize: 12, fontFamily: "'Rajdhani',sans-serif" }}>{tx.cProfLabel}</span>
          <span style={{ color: "#22c55e", fontWeight: 700, fontSize: 12 }}>{cur + 1}/{qs.length}</span>
        </div>
        <div style={{ height: 5, background: "rgba(255,255,255,.1)", borderRadius: 99 }}>
          <div style={{ height: "100%", width: `${prog}%`, background: "linear-gradient(90deg,#22c55e,#16a34a)", borderRadius: 99, transition: "width .5s" }} />
        </div>
      </div>
      <div key={cur} style={{ textAlign: "center", marginBottom: 28, animation: "slideUp .4s both" }}>
        <div style={{ fontSize: 52, marginBottom: 14 }}>{q.icon}</div>
        <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: "clamp(15px,4vw,22px)", fontFamily: "'Noto Sans Telugu',sans-serif", marginBottom: 6 }}>{qLabel}</div>
        <div style={{ color: "#64748b", fontSize: 13 }}>{qSub}</div>
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 7 }}>
        <input type={q.type} value={val} onChange={e => setVal(e.target.value)} placeholder={qLabel}
          style={{ flex: 1, padding: "13px 16px", background: "rgba(255,255,255,.07)", border: "1px solid rgba(34,197,94,.3)", borderRadius: 13, color: "#f1f5f9", fontSize: 15, outline: "none", fontFamily: "'Noto Sans Telugu',sans-serif" }}
          onFocus={e => e.target.style.borderColor = "#22c55e"} onBlur={e => e.target.style.borderColor = "rgba(34,197,94,.3)"} />
        <Mic onResult={handleMic} size={46} color="#22c55e" />
      </div>
      <div style={{ color: "#47556970", fontSize: 11, fontFamily: "'Noto Sans Telugu',sans-serif", marginBottom: 18, textAlign: "center" }}>
        {va ? tx.cProfHintVoice : tx.cProfHintManual}
      </div>
      <button onClick={() => cur + 1 < qs.length ? adv(val) : finish({
        name: ans.name,
        company: ans.company,
        location: ans.location,
        state: ans.state,
        district: ans.district,
        area: ans.area,
        workType: ans.workType,
        workers: ans.workers,
        budget: ans.budget,
        gst: ans.gst,
      })} disabled={!canNext || loading} style={{ width: "100%", padding: "14px", borderRadius: 13, border: "none", background: canNext ? "linear-gradient(135deg,#22c55e,#16a34a)" : "rgba(255,255,255,.08)", color: canNext ? "#fff" : "#475569", fontWeight: 800, fontSize: 15, cursor: canNext ? "pointer" : "not-allowed", fontFamily: "'Rajdhani',sans-serif" }}>
        {loading ? (langMode === "en" ? "Saving..." : "సేవ్ చేస్తున్నాం...") : (cur + 1 < qs.length ? tx.cProfNext : tx.cProfDone)}
      </button>
      {q.id === "gst" && <div style={{ textAlign: "center", marginTop: 10, color: "#64748b", fontSize: 11 }}>{tx.cProfSkip}</div>}
      {error && <div style={{ color: "#f87171", fontSize: 13, marginTop: 14, textAlign: "center" }}>{error}</div>}
    </div>
  </div>;
}

/* ── EMERGENCY HIRING POPUP ── */
function EmerPopup({ langMode = "te", onSend, onClose }) {
  const tx = T[langMode] || T.te;
  const va = langMode === "va";
  const [form, setForm] = useState({ type: "", workers: "", salary: "", location: "", timing: "", notes: "" });
  const [sent, setSent] = useState(false);
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const cats = [
    { id: "నిర్మాణం",     en: "Construction", icon: "🏗️", color: "#ff8c00" },
    { id: "వ్యవసాయం",    en: "Farming",      icon: "🌾", color: "#22c55e" },
    { id: "పెయింటింగ్",  en: "Painting",     icon: "🎨", color: "#3b82f6" },
    { id: "ఎలక్ట్రీషియన్", en: "Electrician", icon: "⚡", color: "#fbbf24" },
    { id: "డ్రైవింగ్",   en: "Driving",      icon: "🚗", color: "#8b5cf6" },
    { id: "లోడింగ్",     en: "Loading",      icon: "📦", color: "#06b6d4" },
  ];

  const handleSend = () => {
    if (!form.type || !form.workers) return;
    setSent(true);
    if (va) speak(tx.dashUrgentSpeak);
    setTimeout(() => { onSend(form); }, 2200);
  };

  // Overlay backdrop
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 999,
      background: "rgba(4,13,26,0.88)",
      backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "20px", animation: "fadeIn .25s ease"
    }}>
      <div style={{
        width: "100%", maxWidth: 520,
        background: "linear-gradient(145deg,rgba(15,25,50,0.98),rgba(10,18,38,0.99))",
        border: "2px solid rgba(239,68,68,0.5)",
        borderRadius: 24, padding: "28px 26px",
        boxShadow: "0 0 60px rgba(239,68,68,0.25), 0 24px 80px rgba(0,0,0,0.7)",
        animation: "slideUp .3s cubic-bezier(.34,1.56,.64,1) both",
        maxHeight: "90vh", overflowY: "auto",
        position: "relative"
      }}>
        {/* Close */}
        <button onClick={onClose} style={{
          position: "absolute", top: 14, right: 16,
          background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: "50%", width: 32, height: 32, cursor: "pointer",
          color: "#ef4444", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center"
        }}>✕</button>

        {!sent ? <>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
            <div style={{ width: 50, height: 50, borderRadius: "50%", background: "rgba(239,68,68,0.15)", border: "2px solid rgba(239,68,68,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, animation: "pulse 1.5s infinite" }}>🚨</div>
            <div>
              <div style={{ color: "#ef4444", fontWeight: 800, fontSize: 18, fontFamily: "'Rajdhani',sans-serif", letterSpacing: 1 }}>
                {langMode === "en" ? "Emergency Hiring" : "అర్జెంట్ హైరింగ్"}
              </div>
              <div style={{ color: "#94a3b8", fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif", marginTop: 2 }}>
                {langMode === "en" ? "Fill work details — nearby workers notified instantly" : "పని వివరాలు నమోదు చేయండి"}
              </div>
            </div>
          </div>

          {/* Work type */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ color: "#94a3b8", fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif", marginBottom: 9, fontWeight: 600 }}>
              {langMode === "en" ? "Work Type *" : "పని రకం *"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {cats.map(c => (
                <button key={c.id} onClick={() => upd("type", langMode === "en" ? c.en : c.id)}
                  style={{
                    padding: "10px 6px", borderRadius: 10, cursor: "pointer", textAlign: "center",
                    border: `2px solid ${form.type === (langMode === "en" ? c.en : c.id) ? c.color : c.color + "25"}`,
                    background: form.type === (langMode === "en" ? c.en : c.id) ? `${c.color}18` : "rgba(255,255,255,0.03)",
                    transition: "all .2s"
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = c.color; e.currentTarget.style.background = `${c.color}12`; }}
                  onMouseLeave={e => {
                    const sel = form.type === (langMode === "en" ? c.en : c.id);
                    e.currentTarget.style.borderColor = sel ? c.color : c.color + "25";
                    e.currentTarget.style.background = sel ? `${c.color}18` : "rgba(255,255,255,0.03)";
                  }}>
                  <div style={{ fontSize: 22, marginBottom: 4 }}>{c.icon}</div>
                  <div style={{ color: form.type === (langMode === "en" ? c.en : c.id) ? c.color : "#94a3b8", fontWeight: 700, fontSize: 11, fontFamily: "'Rajdhani',sans-serif" }}>
                    {langMode === "en" ? c.en : c.id}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Workers needed + Salary */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ color: "#94a3b8", fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif", marginBottom: 6 }}>
                {langMode === "en" ? "Workers Needed *" : "కార్మికులు *"}
              </div>
              <input
                type="number" min="1" value={form.workers}
                onChange={e => upd("workers", e.target.value)}
                placeholder={langMode === "en" ? "e.g. 5" : "ఎంత మంది?"}
                style={{ width: "100%", padding: "11px 14px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 11, color: "#f1f5f9", fontSize: 14, outline: "none", fontFamily: "'Rajdhani',sans-serif", boxSizing: "border-box" }}
                onFocus={e => e.target.style.borderColor = "#ef4444"}
                onBlur={e => e.target.style.borderColor = "rgba(239,68,68,0.3)"}
              />
            </div>
            <div>
              <div style={{ color: "#94a3b8", fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif", marginBottom: 6 }}>
                {langMode === "en" ? "Daily Salary (₹)" : "రోజు వేతనం (₹)"}
              </div>
              <input
                type="number" value={form.salary}
                onChange={e => upd("salary", e.target.value)}
                placeholder="₹500"
                style={{ width: "100%", padding: "11px 14px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 11, color: "#f1f5f9", fontSize: 14, outline: "none", fontFamily: "'Rajdhani',sans-serif", boxSizing: "border-box" }}
                onFocus={e => e.target.style.borderColor = "#ef4444"}
                onBlur={e => e.target.style.borderColor = "rgba(239,68,68,0.3)"}
              />
            </div>
          </div>

          {/* Location */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ color: "#94a3b8", fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif", marginBottom: 6 }}>
              {langMode === "en" ? "Work Location" : "పని స్థానం"}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text" value={form.location}
                onChange={e => upd("location", e.target.value)}
                placeholder={langMode === "en" ? "Area / City" : "ప్రాంతం / నగరం"}
                style={{ flex: 1, padding: "11px 14px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 11, color: "#f1f5f9", fontSize: 14, outline: "none", fontFamily: "'Noto Sans Telugu',sans-serif" }}
                onFocus={e => e.target.style.borderColor = "#ef4444"}
                onBlur={e => e.target.style.borderColor = "rgba(239,68,68,0.3)"}
              />
              <Mic onResult={t => upd("location", t)} size={44} color="#ef4444" />
            </div>
          </div>

          {/* Timing */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ color: "#94a3b8", fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif", marginBottom: 6 }}>
              {langMode === "en" ? "Work Timing" : "పని సమయం"}
            </div>
            <input
              type="text" value={form.timing}
              onChange={e => upd("timing", e.target.value)}
              placeholder={langMode === "en" ? "e.g. 8AM – 6PM" : "ఉ. 8AM – 6PM"}
              style={{ width: "100%", padding: "11px 14px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 11, color: "#f1f5f9", fontSize: 14, outline: "none", fontFamily: "'Noto Sans Telugu',sans-serif", boxSizing: "border-box" }}
              onFocus={e => e.target.style.borderColor = "#ef4444"}
              onBlur={e => e.target.style.borderColor = "rgba(239,68,68,0.3)"}
            />
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ color: "#94a3b8", fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif", marginBottom: 6 }}>
              {langMode === "en" ? "Additional Notes (optional)" : "అదనపు వివరాలు (ఐచ్ఛికం)"}
            </div>
            <textarea
              rows={2} value={form.notes}
              onChange={e => upd("notes", e.target.value)}
              placeholder={langMode === "en" ? "Any special requirements..." : "ప్రత్యేక అవసరాలు..."}
              style={{ width: "100%", padding: "11px 14px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 11, color: "#f1f5f9", fontSize: 13, outline: "none", fontFamily: "'Noto Sans Telugu',sans-serif", resize: "none", boxSizing: "border-box" }}
              onFocus={e => e.target.style.borderColor = "#ef4444"}
              onBlur={e => e.target.style.borderColor = "rgba(239,68,68,0.3)"}
            />
          </div>

          {/* Preview chip */}
          {(form.type || form.workers) && (
            <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>📢</span>
              <span style={{ color: "#fca5a5", fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif" }}>
                {langMode === "en"
                  ? `"${form.type || "?"} work nearby — ${form.workers || "?"} workers needed${form.salary ? `, ₹${form.salary}/day` : ""}"`
                  : `"మీ దగ్గర ${form.type || "?"} పని ఉంది — ${form.workers || "?"} మంది కావాలి${form.salary ? `, ₹${form.salary}/day` : ""}"`}
              </span>
            </div>
          )}

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!form.type || !form.workers}
            style={{
              width: "100%", padding: "15px", borderRadius: 13, border: "none",
              background: (form.type && form.workers) ? "linear-gradient(135deg,#ef4444,#dc2626)" : "rgba(255,255,255,0.07)",
              color: (form.type && form.workers) ? "#fff" : "#475569",
              fontWeight: 800, fontSize: 16, cursor: (form.type && form.workers) ? "pointer" : "not-allowed",
              fontFamily: "'Rajdhani',sans-serif", letterSpacing: 1,
              boxShadow: (form.type && form.workers) ? "0 4px 24px rgba(239,68,68,0.4)" : "none",
              transition: "all .3s"
            }}
          >
            🚨 {langMode === "en" ? "Send Emergency Notification" : "Notification పంపు"}
          </button>
        </> : (
          /* Sent confirmation */
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: 64, marginBottom: 16, animation: "pulse 1s infinite" }}>✅</div>
            <div style={{ color: "#22c55e", fontWeight: 800, fontSize: 20, fontFamily: "'Rajdhani',sans-serif", marginBottom: 8 }}>
              {langMode === "en" ? "Notifications Sent!" : "Notification పంపబడింది!"}
            </div>
            <div style={{ color: "#94a3b8", fontFamily: "'Noto Sans Telugu',sans-serif", fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
              {langMode === "en"
                ? `47 nearby workers notified for "${form.type}" — ${form.workers} needed`
                : `దగ్గర 47 మంది కార్మికులకు "${form.type}" పని నోటిఫికేషన్ వెళ్ళింది`}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
              {[["రవి కుమార్","accept"],["లక్ష్మి దేవి","accept"],["సురేష్ బాబు","details"]].map(([n,r]) => (
                <div key={n} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "9px 13px", display: "flex", alignItems: "center", gap: 9, textAlign: "left" }}>
                  <span style={{ fontSize: 16 }}>👷</span>
                  <span style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 13, fontFamily: "'Rajdhani',sans-serif" }}>{n}</span>
                  <span style={{ color: r === "accept" ? "#22c55e" : "#f59e0b", fontSize: 12, marginLeft: 4 }}>
                    {r === "accept" ? "✓ Accepted" : "❓ Asking details"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── CONTRACTOR DASHBOARD ── */
function CDash({ profile = {}, onPost, onWorkers, langMode = "te" }) {
  const tx = T[langMode] || T.te;
  const va = langMode === "va";
  const [emer, setEmer] = useState(false);
  const [emerPopup, setEmerPopup] = useState(false);
  const [stats, setStats] = useState([
    { icon: "👷", label: tx.dashStatActive, val: 0, color: "#22c55e" },
    { icon: "📋", label: tx.dashStatJobs,   val: 0, color: "#ff8c00" },
    { icon: "✅", label: tx.dashStatDone,   val: 0, color: "#3b82f6" },
    { icon: "⭐", label: tx.dashStatRating, val: "0", color: "#fbbf24" },
  ]);
  const [nearby, setNearby] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { if (va) speakLater(tx.dashWelcomeSpeak, 400); }, []);
  useEffect(() => {
    const token = localStorage.getItem("niyoga_token") || "";
    const loadDashboard = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/jobs/dashboard/`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Token ${token}`,
          },
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data) {
          setStats([
            { icon: "👷", label: tx.dashStatActive, val: 0, color: "#22c55e" },
            { icon: "📋", label: tx.dashStatJobs,   val: 0, color: "#ff8c00" },
            { icon: "✅", label: tx.dashStatDone,   val: 0, color: "#3b82f6" },
            { icon: "⭐", label: tx.dashStatRating, val: "0", color: "#fbbf24" },
          ]);
          setNearby([]);
          return;
        }
        const dashboardStats = data.stats || {};
        setStats([
          { icon: "👷", label: tx.dashStatActive, val: Number(dashboardStats.active_jobs || 0), color: "#22c55e" },
          { icon: "📋", label: tx.dashStatJobs,   val: Number(dashboardStats.total_jobs_posted || 0), color: "#ff8c00" },
          { icon: "✅", label: tx.dashStatDone,   val: Number(dashboardStats.total_workers_hired || dashboardStats.total_applications_received || 0), color: "#3b82f6" },
          { icon: "⭐", label: tx.dashStatRating, val: String(dashboardStats.total_applications_received || 0), color: "#fbbf24" },
        ]);
        setNearby((data.nearby_workers || []).map((worker) => ({
          id: worker.id,
          name: worker.name,
          skill: worker.work_type || "",
          dist: worker.area || "",
          trust: 5,
          avail: true,
          g: "M",
          area: worker.area || "",
          experience: worker.experience,
          wage: worker.wage,
          contactNumber: worker.contact_number,
        })));
      } catch (err) {
        console.error("[CDash] failed to load dashboard data", err);
      } finally {
        setLoading(false);
      }
    };
    loadDashboard();
  }, [tx.dashStatActive, tx.dashStatJobs, tx.dashStatDone, tx.dashStatRating, va]);
  const actions = [
    { icon: "➕", label: tx.dashActPost,    color: "#22c55e", fn: onPost },
    { icon: "👷", label: tx.dashActWorkers, color: "#ff8c00", fn: onWorkers },
    { icon: "🚨", label: tx.dashActUrgent,  color: "#ef4444", fn: () => setEmerPopup(true) },
    { icon: "📊", label: tx.dashActAttend,  color: "#3b82f6", fn: () => { if (va) speak(tx.dashAttendSpeak); } },
    { icon: "🔔", label: tx.dashActNotify,  color: "#8b5cf6", fn: () => { if (va) speak(tx.dashNotifySpeak); } },
    { icon: "⭐", label: tx.dashActRating,  color: "#fbbf24", fn: () => { if (va) speak(tx.dashRatingSpeak); } },
  ];
  return <div style={{ minHeight: "100vh", padding: "22px 18px 100px", position: "relative", zIndex: 2 }}>

    {/* ── Emergency Popup Modal ── */}
    {emerPopup && (
      <EmerPopup
        langMode={langMode}
        onClose={() => setEmerPopup(false)}
        onSend={(formData) => {
          setEmerPopup(false);
          setEmer(true);
        }}
      />
    )}

    <div style={{ maxWidth: 920, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 26 }}>🏢</span>
            <h1 style={{ color: "#f1f5f9", fontFamily: "'Rajdhani',sans-serif", fontSize: "clamp(18px,4vw,28px)", fontWeight: 800, margin: 0 }}>{profile.company || tx.dashTitle}</h1>
          </div>
          <div style={{ display: "flex", gap: 7, marginTop: 6, flexWrap: "wrap" }}>
            <span style={{ background: "rgba(34,197,94,.15)", border: "1px solid rgba(34,197,94,.4)", borderRadius: 50, padding: "2px 12px", color: "#22c55e", fontSize: 10, fontWeight: 700, fontFamily: "'Rajdhani',sans-serif" }}>✓ VERIFIED</span>
            <span style={{ background: "rgba(255,140,0,.1)", border: "1px solid rgba(255,140,0,.3)", borderRadius: 50, padding: "2px 12px", color: "#ff8c00", fontSize: 10, fontWeight: 700, fontFamily: "'Rajdhani',sans-serif" }}>SAFE WORKPLACE</span>
          </div>
        </div>
        {/* Mic only shown in va mode */}
        {va && <Mic onResult={t => {
          if (t.toLowerCase().includes(tx.dashMicPost) || t.toLowerCase().includes("post")) onPost();
          else if (t.toLowerCase().includes(tx.dashMicWorkers) || t.toLowerCase().includes("worker")) onWorkers();
        }} size={50} color="#22c55e" />}
      </div>

      {emer && <div style={{ background: "rgba(239,68,68,.15)", border: "2px solid #ef4444", borderRadius: 16, padding: "14px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12, animation: "emergencyGlow 1s infinite" }}>
        <span style={{ fontSize: 26 }}>🚨</span>
        <div>
          <div style={{ color: "#ef4444", fontWeight: 800, fontSize: 15, fontFamily: "'Rajdhani',sans-serif" }}>{tx.dashEmerTitle}</div>
          <div style={{ color: "#fca5a5", fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif" }}>{tx.dashEmerSub}</div>
        </div>
        <button onClick={() => setEmer(false)} style={{ marginLeft: "auto", background: "none", border: "1px solid #ef4444", borderRadius: 8, padding: "5px 12px", color: "#ef4444", cursor: "pointer", fontSize: 11 }}>{tx.dashEmerCancel}</button>
      </div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 14, marginBottom: 24 }}>
        {stats.map((s, i) => <div key={s.label} style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${s.color}30`, borderRadius: 16, padding: "18px 14px", textAlign: "center", animation: `slideUp .4s ${i*.07}s both` }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>{s.icon}</div>
          <div style={{ color: s.color, fontWeight: 800, fontSize: 26, fontFamily: "'Rajdhani',sans-serif" }}>{s.val}</div>
          <div style={{ color: "#64748b", fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif" }}>{s.label}</div>
        </div>)}
      </div>

      <h2 style={{ color: "#f1f5f9", fontFamily: "'Rajdhani',sans-serif", fontSize: 18, fontWeight: 800, marginBottom: 14 }}>{tx.dashSubtitle}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 28 }}>
        {actions.map((a, i) => <button key={a.label} onClick={a.fn} style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${a.color}30`, borderRadius: 16, padding: "18px 12px", cursor: "pointer", textAlign: "center", transition: "all .3s", animation: `slideUp .4s ${i*.06}s both` }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.borderColor = a.color + "80"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = a.color + "30"; }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: `${a.color}20`, margin: "0 auto 9px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{a.icon}</div>
          <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif" }}>{a.label}</div>
        </button>)}
      </div>

      <h2 style={{ color: "#f1f5f9", fontFamily: "'Rajdhani',sans-serif", fontSize: 18, fontWeight: 800, marginBottom: 14 }}>{tx.dashNearby}</h2>
      {loading ? (
        <div style={{ color: "#94a3b8", fontSize: 13, fontFamily: "'Noto Sans Telugu',sans-serif" }}>Loading nearby workers…</div>
      ) : nearby.length === 0 ? (
        <div style={{ color: "#94a3b8", fontSize: 13, fontFamily: "'Noto Sans Telugu',sans-serif" }}>No nearby workers found.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 13 }}>
          {nearby.map((w, i) => <div key={w.id || w.name} style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(34,197,94,.3)", borderRadius: 14, padding: "14px", animation: `slideUp .4s ${i*.07}s both` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 9 }}>
              <div style={{ width: 42, height: 42, borderRadius: "50%", background: "linear-gradient(135deg,#ff8c00,#ffa500)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>👷</div>
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px #22c55e" }} />
            </div>
            <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 14, fontFamily: "'Rajdhani',sans-serif" }}>{w.name}</div>
            <div style={{ color: "#94a3b8", fontSize: 11, fontFamily: "'Noto Sans Telugu',sans-serif", marginTop: 2 }}>{w.skill || "—"}</div>
            <div style={{ color: "#94a3b8", fontSize: 11, fontFamily: "'Noto Sans Telugu',sans-serif", marginTop: 4 }}>Area: {w.area || "—"}</div>
            <div style={{ color: "#94a3b8", fontSize: 11, fontFamily: "'Noto Sans Telugu',sans-serif", marginTop: 2 }}>Exp: {w.experience ?? "—"} yrs</div>
            <div style={{ color: "#94a3b8", fontSize: 11, fontFamily: "'Noto Sans Telugu',sans-serif", marginTop: 2 }}>Wage: ₹{w.wage || "—"}</div>
            <div style={{ color: "#94a3b8", fontSize: 11, fontFamily: "'Noto Sans Telugu',sans-serif", marginTop: 2 }}>Contact: {w.contactNumber || "—"}</div>
            <button onClick={() => { if (va) speak(tx.dashCallSpeak(w.name)); }} style={{ marginTop: 10, width: "100%", padding: "7px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "'Rajdhani',sans-serif" }}>
              {tx.dashCall}
            </button>
          </div>)}
        </div>
      )}
    </div>
  </div>;
}
/* ── POST JOB FLOW ── */
function PostJob({ onBack, onDone, langMode = "te", initialData }) {
  const tx = T[langMode] || T.te;
  const va = langMode === "va";
  const { t, show } = useToast();
  const [step, setStep] = useState(1);
  // Support optional editing: initialData prop or `niyoga_edit_job` in localStorage
  const editInitial = initialData || (() => {
    try { const s = localStorage.getItem('niyoga_edit_job'); const parsed = s ? JSON.parse(s) : null; console.log("[POSTJOB] editInitial =", parsed); console.log("[POSTJOB] editInitial.id =", parsed?.id); return parsed; } catch(e) { console.error(e); return null; }
  })();
  const [editJobId] = useState(editInitial?.id || null);
  const defaultState = { type: "", state: "", district: "", area: "", loc: "", salary: "", workers: "", days: "", timing: "", phone: "", urgent: false };
  const mapped = editInitial ? {
    type: editInitial.job_type || "",
    state: editInitial.state || "",
    district: editInitial.district || "",
    area: editInitial.area || "",
    loc: editInitial.location || "",
    salary: editInitial.daily_salary || "",
    workers: editInitial.workers_needed || "",
    days: editInitial.days_of_work || "",
    timing: editInitial.shift_timing || "",
    phone: editInitial.phone_number || "",
    urgent: editInitial.urgent_hiring || false
  } : defaultState;
  const [d, setD] = useState(mapped);

  // Clear edit payload when component unmounts
  useEffect(() => { return () => { try { localStorage.removeItem('niyoga_edit_job'); } catch(e){} }; }, []);
  const cats = [
    { id: "construction", icon: "🏗️", t: langMode === "en" ? "Construction" : "నిర్మాణం",   color: "#ff8c00" },
    { id: "farming",      icon: "🌾", t: langMode === "en" ? "Farming"      : "వ్యవసాయం",   color: "#22c55e" },
    { id: "painting",     icon: "🎨", t: langMode === "en" ? "Painting"     : "పెయింటింగ్", color: "#3b82f6" },
    { id: "electrician",  icon: "⚡", t: langMode === "en" ? "Electrician"  : "ఎలక్ట్రీషియన్", color: "#fbbf24" },
    { id: "driver",       icon: "🚗", t: langMode === "en" ? "Driver"       : "డ్రైవింగ్",  color: "#8b5cf6" },
    { id: "loading",      icon: "📦", t: langMode === "en" ? "Loading"      : "లోడింగ్",    color: "#06b6d4" },
    { id: "mechanic",     icon: "🔧", t: langMode === "en" ? "Mechanic"     : "మెకానిక్",   color: "#ef4444" },
  ];
  useEffect(() => { if (va && tx.pjSpeaks[step]) speakLater(tx.pjSpeaks[step], 300); }, [step]);
  const prog = ((step - 1) / 5) * 100;
  const H = ({ t, s }) => <div style={{ marginBottom: 24 }}>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
      <span style={{ color: "#94a3b8", fontSize: 12, fontFamily: "'Rajdhani',sans-serif" }}>{tx.pjStep(step)}</span>
      <span style={{ color: "#22c55e", fontWeight: 700, fontSize: 12 }}>{Math.round(prog)}%</span>
    </div>
    <div style={{ height: 5, background: "rgba(255,255,255,.1)", borderRadius: 99 }}>
      <div style={{ height: "100%", width: `${prog}%`, background: "linear-gradient(90deg,#22c55e,#16a34a)", borderRadius: 99, transition: "width .5s" }} />
    </div>
    <h2 style={{ color: "#f1f5f9", fontFamily: "'Rajdhani',sans-serif", fontWeight: 800, fontSize: "clamp(18px,4vw,26px)", margin: "16px 0 4px" }}>{t}</h2>
    <p style={{ color: "#64748b", fontFamily: "'Noto Sans Telugu',sans-serif", fontSize: 13 }}>{s}</p>
  </div>;

  if (step === 1) return <div style={{ minHeight: "100vh", padding: "60px 18px 40px", position: "relative", zIndex: 2 }}>
    <Back onClick={onBack} />
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <H t="ఏ పని కోసం Workers కావాలి?" s="Select work type" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 14 }}>
        {cats.map((c, i) => <button key={c.id} onClick={() => { setD(x => ({ ...x, type: c.id })); speak(c.t + " ఎంచుకున్నారు"); setStep(2); }}
          style={{ background: d.type === c.id ? `${c.color}20` : "rgba(255,255,255,.04)", border: `2px solid ${d.type === c.id ? c.color : c.color + "30"}`, borderRadius: 16, padding: "22px 14px", cursor: "pointer", textAlign: "center", transition: "all .3s", animation: `slideUp .4s ${i*.05}s both` }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = c.color; e.currentTarget.style.transform = "translateY(-3px)"; }}
          onMouseLeave={e => { if (d.type !== c.id) { e.currentTarget.style.borderColor = c.color + "30"; e.currentTarget.style.transform = "none"; } }}>
          <div style={{ fontSize: 38, marginBottom: 8 }}>{c.icon}</div>
          <div style={{ color: c.color, fontWeight: 800, fontSize: 14, fontFamily: "'Rajdhani',sans-serif" }}>{c.t}</div>
        </button>)}
      </div>
    </div>
  </div>;

  if (step === 2) return <div style={{ minHeight: "100vh", padding: "60px 18px 40px", position: "relative", zIndex: 2 }}>
    <Back onClick={() => setStep(1)} />
    <div style={{ maxWidth: 520, margin: "0 auto" }}>
      <H t="Location వివరాలు చెప్పండి" s="Work site structured location" />
      <div style={{ background: "rgba(34,197,94,.06)", border: "1px solid rgba(34,197,94,.3)", borderRadius: 16, height: 160, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18, flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 36, animation: "bounce 2s infinite" }}>📍</span>
        <span style={{ color: "#22c55e", fontSize: 13, fontWeight: 700, fontFamily: "'Rajdhani',sans-serif" }}>Live Location Active</span>
      </div>
      <div style={{ display: "grid", gap: 12, marginBottom: 18 }}>
        {[
          { key: "state", label: langMode === "en" ? "State" : "రాష్ట్రం", placeholder: langMode === "en" ? "Telangana" : "తెలంగాణ" },
          { key: "district", label: langMode === "en" ? "District" : "జిల్లా", placeholder: langMode === "en" ? "Hyderabad" : "హైదరాబాద్" },
          { key: "area", label: langMode === "en" ? "Area / Village" : "ప్రాంతం / గ్రామం", placeholder: langMode === "en" ? "Madhapur" : "మాదాపూర్" },
        ].map(f => <div key={f.key}>
          <div style={{ color: "#94a3b8", fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif", marginBottom: 7 }}>{f.label}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <input value={d[f.key]} onChange={e => setD(x => ({ ...x, [f.key]: e.target.value }))} placeholder={f.placeholder}
              style={{ flex: 1, padding: "13px 16px", background: "rgba(255,255,255,.07)", border: "1px solid rgba(34,197,94,.3)", borderRadius: 13, color: "#f1f5f9", fontSize: 15, outline: "none", fontFamily: "'Noto Sans Telugu',sans-serif" }}
              onFocus={e => e.target.style.borderColor = "#22c55e"} onBlur={e => e.target.style.borderColor = "rgba(34,197,94,.3)"} />
            <Mic onResult={t => setD(x => ({ ...x, [f.key]: t }))} size={46} color="#22c55e" />
          </div>
        </div>)}
        <div>
          <div style={{ color: "#94a3b8", fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif", marginBottom: 7 }}>{langMode === "en" ? "Landmark / Full Address" : "ల్యాండ్ మార్క్ / పూర్తి చిరునామా"}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <input value={d.loc} onChange={e => setD(x => ({ ...x, loc: e.target.value }))} placeholder={langMode === "en" ? "Near bus stand / full address" : "బస్సు స్టాండ్ సమీపం / పూర్తి చిరునామా"}
              style={{ flex: 1, padding: "13px 16px", background: "rgba(255,255,255,.07)", border: "1px solid rgba(34,197,94,.3)", borderRadius: 13, color: "#f1f5f9", fontSize: 15, outline: "none", fontFamily: "'Noto Sans Telugu',sans-serif" }}
              onFocus={e => e.target.style.borderColor = "#22c55e"} onBlur={e => e.target.style.borderColor = "rgba(34,197,94,.3)"} />
            <Mic onResult={t => setD(x => ({ ...x, loc: t }))} size={46} color="#22c55e" />
          </div>
        </div>
      </div>
      <button onClick={() => setD(x => ({ ...x, state: x.state || "తెలంగాణ", district: x.district || "హైదరాబాద్", area: x.area || "మాదాపూర్", loc: x.loc || "బస్సు స్టాండ్ సమీపం" }))} style={{ width: "100%", padding: "11px", borderRadius: 12, border: "1px solid rgba(34,197,94,.3)", background: "rgba(34,197,94,.08)", color: "#22c55e", fontWeight: 700, cursor: "pointer", fontFamily: "'Rajdhani',sans-serif", marginBottom: 14 }}>📍 లైవ్ లొకేషన్ వాడండి</button>
      <Btn onClick={() => setStep(3)} color="#22c55e" disabled={!d.state || !d.district || !d.area || !d.loc}>తదుపరి →</Btn>
    </div>
  </div>;

  if (step === 3) return <div style={{ minHeight: "100vh", padding: "60px 18px 40px", position: "relative", zIndex: 2 }}>
    <Back onClick={() => setStep(2)} />
    <div style={{ maxWidth: 500, margin: "0 auto" }}>
      <H t="రోజు Salary ఎంత?" s="Daily wage (₹)" />
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 22 }}>
        <div style={{ display: "inline-flex", alignItems: "center", background: "rgba(34,197,94,.08)", border: "2px solid rgba(34,197,94,.4)", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", color: "#22c55e", fontWeight: 800, fontSize: 26, fontFamily: "'Rajdhani',sans-serif", borderRight: "1px solid rgba(34,197,94,.2)" }}>₹</div>
          <input type="number" value={d.salary} onChange={e => setD(x => ({ ...x, salary: e.target.value }))} placeholder="500"
            style={{ background: "none", border: "none", padding: "14px 18px", color: "#f1f5f9", fontSize: 30, fontWeight: 800, outline: "none", width: 150, fontFamily: "'Rajdhani',sans-serif" }} />
          <div style={{ padding: "14px 14px", color: "#64748b", fontSize: 13, borderLeft: "1px solid rgba(34,197,94,.2)" }}>/day</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap", justifyContent: "center" }}>
        {["400","500","600","700","800","900","1000"].map(a => <button key={a} onClick={() => setD(x => ({ ...x, salary: a }))}
          style={{ padding: "8px 16px", borderRadius: 50, border: "none", background: d.salary === a ? "linear-gradient(135deg,#22c55e,#16a34a)" : "rgba(255,255,255,.07)", color: d.salary === a ? "#fff" : "#94a3b8", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Rajdhani',sans-serif" }}>₹{a}</button>)}
      </div>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
        <Mic onResult={t => { const n = t.match(/\d+/); if (n) setD(x => ({ ...x, salary: n[0] })); }} size={50} color="#22c55e" />
      </div>
      <Btn onClick={() => setStep(4)} color="#22c55e" disabled={!d.salary}>తదుపరి →</Btn>
    </div>
  </div>;

  if (step === 4) return <div style={{ minHeight: "100vh", padding: "60px 18px 40px", position: "relative", zIndex: 2 }}>
    <Back onClick={() => setStep(3)} />
    <div style={{ maxWidth: 540, margin: "0 auto" }}>
      <H t="పని వివరాలు" s="Work details" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13, marginBottom: 13 }}>
        {[{ l: "కార్మికులు", k: "workers", ph: "10" }, { l: "పని రోజులు", k: "days", ph: "15" }].map(f => <div key={f.k}>
          <div style={{ color: "#94a3b8", fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif", marginBottom: 7 }}>{f.l}</div>
          <input type="number" value={d[f.k]} onChange={e => setD(x => ({ ...x, [f.k]: e.target.value }))} placeholder={f.ph}
            style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,.07)", border: "1px solid rgba(34,197,94,.3)", borderRadius: 12, color: "#f1f5f9", fontSize: 15, outline: "none", boxSizing: "border-box" }}
            onFocus={e => e.target.style.borderColor = "#22c55e"} onBlur={e => e.target.style.borderColor = "rgba(34,197,94,.3)"} />
        </div>)}
      </div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ color: "#94a3b8", fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif", marginBottom: 8 }}>Shift Timing</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["6AM-2PM","8AM-6PM","9AM-5PM","Night"].map(t => <button key={t} onClick={() => setD(x => ({ ...x, timing: t }))}
            style={{ padding: "7px 14px", borderRadius: 50, border: "none", background: d.timing === t ? "linear-gradient(135deg,#22c55e,#16a34a)" : "rgba(255,255,255,.07)", color: d.timing === t ? "#fff" : "#94a3b8", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "'Rajdhani',sans-serif" }}>{t}</button>)}
        </div>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", marginBottom: 18 }}>
        <div onClick={() => setD(x => ({ ...x, urgent: !x.urgent }))} style={{ width: 46, height: 24, borderRadius: 12, background: d.urgent ? "#ef4444" : "rgba(255,255,255,.15)", position: "relative", transition: "all .3s", cursor: "pointer", flexShrink: 0 }}>
          <div style={{ position: "absolute", top: 3, left: d.urgent ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .3s" }} />
        </div>
        <div>
          <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 13, fontFamily: "'Rajdhani',sans-serif" }}>🚨 అర్జెంట్ హైరింగ్</div>
          <div style={{ color: "#64748b", fontSize: 11, fontFamily: "'Noto Sans Telugu',sans-serif" }}>Emergency notifications to nearby workers</div>
        </div>
      </label>
      <Btn onClick={() => setStep(5)} color="#22c55e" disabled={!d.workers}>తదుపరి →</Btn>
    </div>
  </div>;

  return <div style={{ minHeight: "100vh", padding: "60px 18px 40px", position: "relative", zIndex: 2 }}>
    <Back onClick={() => setStep(4)} />
    <div style={{ maxWidth: 520, margin: "0 auto" }}>
      <H t="Contact వివరాలు" s="Confirm & Submit" />
      <div style={{ background: "rgba(34,197,94,.06)", border: "1px solid rgba(34,197,94,.25)", borderRadius: 14, padding: "14px 18px", marginBottom: 18 }}>
        <div style={{ color: "#22c55e", fontWeight: 700, fontSize: 12, fontFamily: "'Rajdhani',sans-serif", marginBottom: 9 }}>📋 పని సారాంశం</div>
        {[["Type", cats.find(c => c.id === d.type)?.t || d.type], ["Location", d.loc], ["Workers", d.workers + " మంది"], ["Salary", "₹" + d.salary + "/day"], ["Days", d.days], ["Urgent", d.urgent ? "✅ Yes" : "No"]].filter(r => r[1]).map(r => <div key={r[0]} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
          <span style={{ color: "#64748b", fontSize: 12, fontFamily: "'Rajdhani',sans-serif" }}>{r[0]}</span>
          <span style={{ color: "#f1f5f9", fontSize: 12, fontWeight: 700, fontFamily: "'Rajdhani',sans-serif" }}>{r[1]}</span>
        </div>)}
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 13 }}>
        <input value={d.phone} onChange={e => setD(x => ({ ...x, phone: e.target.value }))} placeholder="ఫోన్ నంబర్"
          style={{ flex: 1, padding: "13px 16px", background: "rgba(255,255,255,.07)", border: "1px solid rgba(34,197,94,.3)", borderRadius: 13, color: "#f1f5f9", fontSize: 15, outline: "none", fontFamily: "'Noto Sans Telugu',sans-serif" }}
          onFocus={e => e.target.style.borderColor = "#22c55e"} onBlur={e => e.target.style.borderColor = "rgba(34,197,94,.3)"} />
        <Mic onResult={t => setD(x => ({ ...x, phone: t }))} size={46} color="#22c55e" />
      </div>
      <Btn onClick={async () => {
        // Validation
        const payload = {
          job_type: d.type,
          location: d.loc,
          state: d.state,
          district: d.district,
          area: d.area,
          daily_salary: Number(d.salary || 0),
          workers_needed: Number(d.workers || 0),
          days_of_work: Number(d.days || 0),
          shift_timing: d.timing,
          urgent_hiring: Boolean(d.urgent),
          phone_number: d.phone,
        };

        // Simple client-side validation
        if (!payload.job_type) { show && show("Please select a job type", "#ef4444"); return; }
        if (!payload.state || !payload.district || !payload.area || !payload.location) { show && show("Please enter state, district, area and landmark address", "#ef4444"); return; }
        if (!payload.daily_salary || payload.daily_salary <= 0) { show && show("Please enter a valid daily salary", "#ef4444"); return; }
        if (!payload.workers_needed || payload.workers_needed <= 0) { show && show("Please enter number of workers needed", "#ef4444"); return; }
        if (!payload.days_of_work || payload.days_of_work <= 0) { show && show("Please enter number of days", "#ef4444"); return; }
        if (!payload.shift_timing) { show && show("Please select shift timing", "#ef4444"); return; }
        if (!payload.phone_number) { show && show("Please enter a phone number", "#ef4444"); return; }

        // Send request to backend
        const token = localStorage.getItem("niyoga_token") || "";
        console.log("[PostJob] request payload:", payload);

        try {
          const editId = editJobId;
          const url = editId ? `${BACKEND_URL}/api/jobs/${editId}/` : `${BACKEND_URL}/api/jobs/`;
          const method = editId ? "PATCH" : "POST";
          console.log("[FIX] editJobId =", editJobId);
          console.log("[FIX] method =", method);
          console.log("[FIX] url =", url);
          const res = await fetch(url, {
            method,
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Token ${token}`
            },
            body: JSON.stringify(payload)
          });

          const json = await res.json().catch(() => ({}));
          console.log("[PostJob] response status:", res.status);
          console.log("[PostJob] response json:", json);

          if (res.status === 201 || res.status === 200) {
            const successMessage = editId ? "Job updated successfully" : "Job posted successfully";
            show && show(successMessage, "#22c55e");
            speak(editId ? "Job details have been updated." : "అభినందనలు! మీ పని పోస్ట్ publish అయింది. దగ్గర కార్మికులకు నోటిఫికేషన్ పంపబడింది.");
            try { localStorage.removeItem('niyoga_edit_job'); } catch(e){}
            setTimeout(onDone, 1200);
          } else {
            // Show backend error message
            const errMsg = (json && (json.detail || json.error || Object.values(json)[0])) || (editId ? "Failed to update job" : "Failed to create job");
            show && show(String(errMsg), "#ef4444");
          }
        } catch (err) {
          console.error("[PostJob] request failed:", err);
          show && show(editInitial ? "Network error while updating job" : "Network error while creating job", "#ef4444");
        }
      }} color="#22c55e" disabled={!d.phone}>🚀 పని Publish చేయండి</Btn>
    </div>
  </div>;
}

/* ── WORKER MANAGEMENT ── */
function WorkerMgmt({ onBack }) {
  const [tab, setTab] = useState("active");
  const [rw, setRw] = useState(null); const [rv, setRv] = useState(0);
  useEffect(() => { speakLater("కార్మికుల నిర్వహణ తెరుచుకుంది", 300); }, []);
  const workers = [
    { id: 1, name: "రవి కుమార్", skill: "నిర్మాణం", wage: "₹650/day", days: 8, trust: 5, present: true, g: "M", badge: "Top" },
    { id: 2, name: "లక్ష్మి దేవి", skill: "వ్యవసాయం", wage: "₹500/day", days: 12, trust: 4, present: true, g: "F", badge: "" },
    { id: 3, name: "సురేష్ బాబు", skill: "పెయింటింగ్", wage: "₹550/day", days: 5, trust: 5, present: false, g: "M", badge: "" },
    { id: 4, name: "ప్రియా శ్రీ", skill: "Electrician", wage: "₹700/day", days: 15, trust: 5, present: true, g: "F", badge: "Expert" },
  ];
  return <div style={{ minHeight: "100vh", padding: "58px 18px 100px", position: "relative", zIndex: 2 }}>
    <Back onClick={onBack} />
    <div style={{ maxWidth: 780, margin: "0 auto" }}>
      <h1 style={{ color: "#f1f5f9", fontFamily: "'Rajdhani',sans-serif", fontSize: "clamp(20px,5vw,32px)", fontWeight: 800, margin: "0 0 20px" }}>కార్మికుల నిర్వహణ</h1>
      <div style={{ display: "flex", gap: 7, marginBottom: 22, background: "rgba(255,255,255,.04)", borderRadius: 13, padding: 5 }}>
        {["active", "attendance", "ratings"].map(tb => <button key={tb} onClick={() => setTab(tb)} style={{ flex: 1, padding: "9px", borderRadius: 10, border: "none", background: tab === tb ? "linear-gradient(135deg,#22c55e,#16a34a)" : "none", color: tab === tb ? "#fff" : "#64748b", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Rajdhani',sans-serif" }}>{tb === "active" ? "Active" : tb === "attendance" ? "హాజరు" : "రేటింగ్స్"}</button>)}
      </div>
      {tab === "active" && <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {workers.map((w, i) => <div key={w.id} style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${w.present ? "rgba(34,197,94,.3)" : "rgba(255,255,255,.1)"}`, borderRadius: 16, padding: "16px 18px", animation: `slideRight .4s ${i*.06}s both` }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: `linear-gradient(135deg,${w.g === "F" ? "#ec4899,#f472b6" : "#ff8c00,#ffa500"})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{w.g === "F" ? "👩" : "👷"}</div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                  <span style={{ color: "#f1f5f9", fontWeight: 800, fontSize: 15, fontFamily: "'Rajdhani',sans-serif" }}>{w.name}</span>
                  {w.badge && <span style={{ background: "rgba(255,140,0,.15)", border: "1px solid rgba(255,140,0,.3)", borderRadius: 50, padding: "1px 8px", color: "#ff8c00", fontSize: 10, fontWeight: 700 }}>🏆 {w.badge}</span>}
                  {w.g === "F" && <span style={{ background: "rgba(236,72,153,.15)", border: "1px solid rgba(236,72,153,.3)", borderRadius: 50, padding: "1px 8px", color: "#f472b6", fontSize: 10, fontWeight: 700 }}>🛡️ SAFE</span>}
                </div>
                <div style={{ color: "#94a3b8", fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif" }}>{w.skill} • {w.wage}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: w.present ? "#22c55e" : "#64748b", boxShadow: w.present ? "0 0 8px #22c55e" : "none" }} />
              <span style={{ color: w.present ? "#22c55e" : "#64748b", fontSize: 12, fontWeight: 700 }}>{w.present ? "హాజరు ✓" : "గైర్హాజరు"}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 9, marginTop: 12, flexWrap: "wrap" }}>
            {[["✓ హాజరు", "#22c55e"], ["⭐ రేటింగ్", "#ff8c00"], ["✅ పూర్తయింది", "#3b82f6"]].map(([l, c]) => <button key={l} onClick={() => { speak(w.name + " — " + l, "te-IN"); if (l.includes("రేటింగ్")) setRw(w); }} style={{ padding: "7px 13px", borderRadius: 8, border: "none", background: `rgba(${c === "#22c55e" ? "34,197,94" : c === "#ff8c00" ? "255,140,0" : "59,130,246"},.15)`, color: c, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{l}</button>)}
          </div>
        </div>)}
      </div>}
      {tab === "attendance" && <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(34,197,94,.2)", borderRadius: 18, overflow: "hidden" }}>
        {workers.map(w => <div key={w.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 18px", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>{w.g === "F" ? "👩" : "👷"}</span>
            <div>
              <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 14, fontFamily: "'Rajdhani',sans-serif" }}>{w.name}</div>
              <div style={{ color: "#64748b", fontSize: 11 }}>{w.skill}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => speak(w.name + " హాజరు")} style={{ padding: "6px 13px", borderRadius: 8, border: "none", background: w.present ? "linear-gradient(135deg,#22c55e,#16a34a)" : "rgba(34,197,94,.1)", color: w.present ? "#fff" : "#22c55e", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>✓ Present</button>
            <button onClick={() => speak(w.name + " గైర్హాజరు")} style={{ padding: "6px 13px", borderRadius: 8, border: "none", background: !w.present ? "rgba(239,68,68,.2)" : "rgba(255,255,255,.07)", color: !w.present ? "#ef4444" : "#64748b", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>✗ Absent</button>
          </div>
        </div>)}
      </div>}
      {tab === "ratings" && <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {workers.map(w => <div key={w.id} style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,140,0,.2)", borderRadius: 16, padding: "16px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22 }}>{w.g === "F" ? "👩" : "👷"}</span>
              <div>
                <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 14, fontFamily: "'Rajdhani',sans-serif" }}>{w.name}</div>
                <div style={{ color: "#64748b", fontSize: 11 }}>{w.skill}</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ display: "flex", gap: 2 }}>{[...Array(5)].map((_, si) => <span key={si} onClick={() => speak(w.name + " కి " + (si + 1) + " star")} style={{ fontSize: 20, color: si < w.trust ? "#ff8c00" : "#334155", cursor: "pointer" }}>★</span>)}</div>
              <div style={{ color: "#ff8c00", fontWeight: 700, fontSize: 12 }}>{w.trust}.0 / 5.0</div>
            </div>
          </div>
        </div>)}
      </div>}
    </div>
    {rw && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "rgba(4,13,26,.98)", border: "1px solid rgba(255,140,0,.3)", borderRadius: 22, padding: 28, maxWidth: 360, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 44, marginBottom: 7 }}>{rw.g === "F" ? "👩" : "👷"}</div>
          <div style={{ color: "#f1f5f9", fontWeight: 800, fontSize: 18, fontFamily: "'Rajdhani',sans-serif" }}>{rw.name}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 7, marginBottom: 22 }}>
          {[1,2,3,4,5].map(s => <span key={s} onClick={() => setRv(s)} style={{ fontSize: 34, color: s <= rv ? "#ff8c00" : "#334155", cursor: "pointer", transition: "all .2s", transform: s <= rv ? "scale(1.2)" : "scale(1)" }}>★</span>)}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => { setRw(null); setRv(0); }} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1px solid rgba(255,255,255,.15)", background: "none", color: "#64748b", fontWeight: 700, cursor: "pointer", fontFamily: "'Rajdhani',sans-serif" }}>రద్దు</button>
          <button onClick={() => { speak(rw.name + " కి " + rv + " star రేటింగ్!"); setRw(null); setRv(0); }} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: rv ? "linear-gradient(135deg,#ff8c00,#ff6b00)" : "rgba(255,255,255,.1)", color: rv ? "#fff" : "#475569", fontWeight: 700, cursor: rv ? "pointer" : "not-allowed", fontFamily: "'Rajdhani',sans-serif" }}>సమర్పించు ✓</button>
        </div>
      </div>
    </div>}
  </div>;
}

// ══════════════════════════════════════════════════════
// ADD THIS — AUTH CHOICE SCREEN (Register OR Login)
// Shared by Worker and Contractor flows.
// In Voice Assisted mode only, asks the user by voice.
// ══════════════════════════════════════════════════════
function AuthChoice({ role, langMode = "te", onRegister, onLogin, onBack }) {
  const va    = langMode === "va";
  const isEn  = langMode === "en";
  const { t, show } = useToast();
  const ac    = role === "contractor" ? "#22c55e" : "#ff8c00";

  // Labels driven by langMode
  const heading    = isEn ? "Welcome Back or New?" : "స్వాగతం!";
  const subHead    = isEn ? "Choose how to continue" : "ఎలా కొనసాగాలో ఎంచుకోండి";
  const regLabel   = isEn ? "Register" : "నమోదు చేసుకోండి";
  const regSub     = isEn ? "I'm new here" : "నేను కొత్తగా వస్తున్నాను";
  const loginLabel = isEn ? "Login" : "లాగిన్";
  const loginSub   = isEn ? "I already have an account" : "నాకు ఇప్పటికే account ఉంది";
  const micHint    = "🎤 \"అవును\" లేదా \"లేదు\" అని చెప్పండి";

  // VA mode: ask "ఇంతకు ముందు నమోదు చేసుకున్నారా?" once on mount
  useEffect(() => {
    if (!va) return;
    const cancel = speakLater("ఇంతకు ముందు నమోదు చేసుకున్నారా?", 350);
    return cancel;
  }, []);

  // Voice handler — only active in VA mode
  const vr = tx => {
    const l = tx.toLowerCase();
    if (l.includes("అవున") || l.includes("yes") || l.includes("లాగిన్") || l.includes("login") || l.includes("ఉంది")) {
      show("✓ Login ఎంచుకున్నారు", ac);
      stopSpeech(); speak("సరే! Login కి వెళ్దాం");
      setTimeout(onLogin, 900);
    } else if (l.includes("లేద") || l.includes("no") || l.includes("కొత్త") || l.includes("new") || l.includes("నమోదు")) {
      show("✓ నమోదు ఎంచుకున్నారు", ac);
      stopSpeech(); speak("సరే! నమోదు కి వెళ్దాం");
      setTimeout(onRegister, 900);
    } else {
      speak("మళ్ళీ చెప్పండి — అవును లేదా లేదు?");
    }
  };

  const opts = [
    {
      id: "register", icon: "✨", label: regLabel, sub: regSub,
      onClick: () => { stopSpeech(); onRegister(); },
    },
    {
      id: "login", icon: "🔑", label: loginLabel, sub: loginSub,
      onClick: () => { stopSpeech(); onLogin(); },
    },
  ];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px 40px", position: "relative", zIndex: 2 }}>
      <Toast {...t} />
      <Back onClick={() => { stopSpeech(); onBack(); }} />

      <div style={{ textAlign: "center", marginBottom: 44, animation: "slideUp .6s both" }}>
        <h1 style={{ color: "#f1f5f9", fontSize: "clamp(22px,5vw,40px)", fontWeight: 800, fontFamily: "'Rajdhani',sans-serif", margin: 0 }}>{heading}</h1>
        <p style={{ color: "#94a3b8", marginTop: 10, fontFamily: "'Noto Sans Telugu',sans-serif", fontSize: 15 }}>{subHead}</p>

        {/* Mic + hint shown only in VA mode */}
        {va && (
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
            <div style={{ background: `${ac}12`, border: `1px solid ${ac}35`, borderRadius: 12, padding: "9px 18px", marginBottom: 8 }}>
              <span style={{ color: ac, fontSize: 13, fontFamily: "'Noto Sans Telugu',sans-serif", fontWeight: 700 }}>
                🎤 "ఇంతకు ముందు నమోదు చేసుకున్నారా?"
              </span>
            </div>
            <Mic onResult={vr} size={52} color={ac} />
            <span style={{ color: "#47556980", fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif" }}>{micHint}</span>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 20, maxWidth: 580, width: "100%" }}>
        {opts.map((o, i) => (
          <button key={o.id} onClick={o.onClick}
            style={{ background: "rgba(255,255,255,.04)", border: `2px solid ${ac}35`, borderRadius: 22, padding: "34px 26px", cursor: "pointer", textAlign: "center", backdropFilter: "blur(16px)", transition: "all .35s cubic-bezier(.34,1.56,.64,1)", animation: `slideUp .5s ${i * .12}s both`, boxShadow: `0 4px 28px ${ac}15` }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-7px) scale(1.02)"; e.currentTarget.style.borderColor = ac; e.currentTarget.style.boxShadow = `0 12px 40px ${ac}30`; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = `${ac}35`; e.currentTarget.style.boxShadow = `0 4px 28px ${ac}15`; }}>
            <div style={{ fontSize: 52, marginBottom: 14 }}>{o.icon}</div>
            <div style={{ color: ac, fontWeight: 800, fontSize: 24, fontFamily: "'Rajdhani',sans-serif" }}>{o.label}</div>
            <div style={{ color: "#94a3b8", fontSize: 13, fontFamily: "'Noto Sans Telugu',sans-serif", marginTop: 8, lineHeight: 1.5 }}>{o.sub}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// ADD THIS — WORKER LOGIN
// Simple OTP-based login. No profile questions.
// ══════════════════════════════════════════════════════
function WorkerLogin({ langMode = "te", onDone, onBack, setWProf, setToken, setUserId, setPhoneId, setProfileError, setRole }) {
  const va   = langMode === "va";
  const isEn = langMode === "en";
  const [phone, setPhone]   = useState("");
  const [otp,   setOtp]     = useState("");
  const [sent,  setSent]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");
  const [step, setStep]     = useState(0); // 0: choose method, 1: method flow
  const [method, setMethod] = useState(null); // 'face'|'voice'|'phone'

  const heading  = isEn ? "Worker Login"        : "కార్మికుడు లాగిన్";
  const phLabel  = isEn ? "Phone Number"         : "ఫోన్ నంబర్";
  const sendBtn  = isEn ? "Send OTP →"           : "OTP పంపు →";
  const otpLabel = isEn ? "Enter OTP"            : "OTP నమోదు";
  const verBtn   = isEn ? "Login ✓"              : "లాగిన్ ✓";
  const sentMsg  = isEn ? `✅ OTP sent to ${phone}` : `✅ OTP ${phone} కి పంపబడింది`;

  useEffect(() => {
    if (va && step === 0) return speakLater("మీ ఫోన్ నంబర్ చెప్పండి", 350);
  }, [step]);

  const doSend = async () => {
    if (!phone) return;
    setError("");
    setLoading(true);
    try {
      const normPhone = ("" + phone).replace(/\D/g, '').slice(-10);
      const res = await fetch(`${BACKEND_URL}/api/accounts/send-otp/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normPhone })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Failed to send OTP");
        return;
      }
      setSent(true);
      if (va) speak("OTP పంపబడింది");
    } catch (err) {
      setError("Unable to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const doLogin = async () => {
    if (!otp) return;
    setError("");
    setLoading(true);
    try {
      const normPhone = ("" + phone).replace(/\D/g, '').slice(-10);
      const res = await fetch(`${BACKEND_URL}/api/accounts/verify-otp/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normPhone, otp })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "OTP verification failed");
        return;
      }
      if (data?.verified && data?.token) {
        setToken(data.token);
        if (data.user_id) setUserId(data.user_id);
        if (data.phone) setPhoneId(data.phone);
        setRole("worker");
        setProfileError("");
        let profilePayload = null;
        try {
          const profileRes = await fetch(`${BACKEND_URL}/api/accounts/profile/`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Token ${data.token}`
            }
          });
          const profileData = await profileRes.json().catch(() => null);
          console.log("Worker profileRes JSON:", profileData);
          if (profileRes.ok && profileData?.success && profileData?.profile) {
            profilePayload = profileData.profile;
            setWProf(profilePayload);
          } else {
            const profileError = profileData?.error || "Unable to load worker profile";
            setProfileError(profileError);
          }
        } catch (profileErr) {
          setProfileError("Unable to load worker profile");
        }
        if (va) speak("స్వాగతం! లాగిన్ అయ్యారు.");
        setTimeout(() => onDone(data.token, data.user_id, data.phone, profilePayload), 600);
      } else if (data?.verified && !data?.token) {
        setError("User account not found. Please register first.");
      } else {
        setError("OTP verification failed");
      }
    } catch (err) {
      setError("Unable to verify OTP");
    } finally {
      setLoading(false);
    }
  };

  // Method chooser UI
  if (step === 0) return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px 40px", position: "relative", zIndex: 2 }}>
      <Card title={heading} sub={isEn ? "Login to your account" : "మీ account లోకి లాగిన్ చేయండి"} onBack={() => { stopSpeech(); onBack(); }} ac="#ff8c00">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 18, maxWidth: 590, width: "100%" }}>
          {[{ id: "face", icon: "🤳", label: "Face" }, { id: "voice", icon: "🎤", label: "Voice" }, { id: "phone", icon: "📱", label: "Phone" }].map(m =>
            <button key={m.id} onClick={() => { setMethod(m.id); setStep(1); if (va && m.id === 'voice') speak(m.label); }}
              style={{ background: "rgba(255,255,255,.05)", border: "2px solid rgba(255,140,0,.3)", borderRadius: 20, padding: "28px 18px", cursor: "pointer", textAlign: "center", transition: "all .3s", backdropFilter: "blur(12px)" }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>{m.icon}</div>
              <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 15, fontFamily: "'Noto Sans Telugu',sans-serif" }}>{m.label}</div>
              <div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>{m.id === 'phone' ? 'OTP' : (m.id === 'voice' ? 'Voice login' : 'Face login')}</div>
            </button>
          )}
        </div>
      </Card>
    </div>
  );

  // step === 1: method-specific flows
  if (method === 'face') return (
    <Card title={heading} sub={isEn ? "Face login" : "Face ద్వారా లాగిన్"} onBack={() => { setStep(0); }} ac="#ff8c00">
      <div style={{ width: 180, height: 180, borderRadius: "50%", border: "3px dashed #ff8c00", margin: "0 auto 22px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(255,140,0,.05)", animation: "pulse 2s infinite", position: "relative", overflow: "hidden" }}>
        <div style={{ fontSize: 66 }}>🤳</div>
        <div style={{ color: "#94a3b8", fontSize: 11, fontFamily: "'Noto Sans Telugu',sans-serif", marginTop: 7 }}>Look at the camera</div>
        <div style={{ position: "absolute", left: 0, right: 0, height: 3, background: "linear-gradient(90deg,transparent,#ff8c00,transparent)", animation: "scanLine 2s linear infinite", top: 0 }} />
      </div>
      <Btn onClick={() => { if (va) speak("లాగిన్ అయింది"); setTimeout(onDone, 600); }}>Login ✓</Btn>
    </Card>
  );

  if (method === 'voice') return (
    <Card title={heading} sub={isEn ? "Voice login" : "Voice ద్వారా లాగిన్"} onBack={() => { setStep(0); }} ac="#ff8c00">
      <div style={{ textAlign: "center" }}>
        <div style={{ color: "#94a3b8", fontSize: 14, fontFamily: "'Noto Sans Telugu',sans-serif", marginBottom: 18 }}>Speak your passphrase</div>
        <Mic onResult={tx => { if (va) speak("లాగిన్ అయింది"); setTimeout(onDone, 600); }} size={68} />
      </div>
    </Card>
  );

  // phone method (reuse OTP flow)
  return (
    <Card title={heading} sub={isEn ? "Phone OTP" : "ఫోన్ OTP"} onBack={() => { setStep(0); }} ac="#ff8c00">
      {!sent ? (
        <>
          <Field label={phLabel} sub="Phone" value={phone} onChange={setPhone} type="tel" ph="9XXXXXXXXX" ac="#ff8c00" />
          {va && (
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
              <Mic onResult={t => { const n = t.replace(/\D/g, ""); if (n.length >= 10) { setPhone(n); speak("నంబర్ నమోదు అయింది"); } }} size={46} color="#ff8c00" />
            </div>
          )}
          <Btn onClick={doSend} color="#ff8c00" disabled={!phone || loading}>{loading ? "Sending..." : sendBtn}</Btn>
          {error && <div style={{ color: "#f87171", fontSize: 13, marginTop: 14, textAlign: "center" }}>{error}</div>}
        </>
      ) : (
        <>
          <div style={{ color: "#22c55e", fontSize: 13, fontFamily: "'Noto Sans Telugu',sans-serif", marginBottom: 18, textAlign: "center" }}>{sentMsg}</div>
          <Field label={otpLabel} sub="OTP" value={otp} onChange={setOtp} type="number" ph="_ _ _ _ _ _" ac="#ff8c00" />
          {va && (
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
              <Mic onResult={t => { const n = t.replace(/\D/g, ""); if (n) { setOtp(n); speak("OTP నమోదు అయింది"); } }} size={46} color="#ff8c00" />
            </div>
          )}
          <Btn onClick={doLogin} color="#22c55e" disabled={!otp || loading}>{loading ? "Verifying..." : verBtn}</Btn>
          {error && <div style={{ color: "#f87171", fontSize: 13, marginTop: 14, textAlign: "center" }}>{error}</div>}
        </>
      )}
    </Card>
  );
}

// ══════════════════════════════════════════════════════
// ADD THIS — CONTRACTOR LOGIN
// Simple OTP-based login. No profile questions.
// ══════════════════════════════════════════════════════
function ContractorLogin({ langMode = "te", onDone, onBack, setCProf, setToken, setUserId, setPhoneId, setProfileError, setRole }) {
  const va   = langMode === "va";
  const isEn = langMode === "en";
  const [phone, setPhone]   = useState("");
  const [otp,   setOtp]     = useState("");
  const [sent,  setSent]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");
  const [step, setStep]     = useState(0);
  const [method, setMethod] = useState(null);

  const heading  = isEn ? "Contractor Login"     : "కాంట్రాక్టర్ లాగిన్";
  const phLabel  = isEn ? "Phone Number"          : "ఫోన్ నంబర్";
  const sendBtn  = isEn ? "Send OTP →"            : "OTP పంపు →";
  const otpLabel = isEn ? "Enter OTP"             : "OTP నమోదు";
  const verBtn   = isEn ? "Login ✓"               : "లాగిన్ ✓";
  const sentMsg  = isEn ? `✅ OTP sent to ${phone}` : `✅ OTP ${phone} కి పంపబడింది`;

  useEffect(() => {
    if (va && step === 0) return speakLater("మీ ఫోన్ నంబర్ చెప్పండి", 350);
  }, [step]);

  const doSend = async () => {
    if (!phone) return;
    setError("");
    setLoading(true);
    try {
      const normPhone = ("" + phone).replace(/\D/g, '').slice(-10);
      const res = await fetch(`${BACKEND_URL}/api/accounts/send-otp/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normPhone })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Failed to send OTP");
        return;
      }
      setSent(true);
      if (va) speak("OTP పంపబడింది");
    } catch (err) {
      setError("Unable to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const doLogin = async () => {
    if (!otp) return;
    setError("");
    setLoading(true);
    try {
      const normPhone = ("" + phone).replace(/\D/g, '').slice(-10);
      const res = await fetch(`${BACKEND_URL}/api/accounts/verify-otp/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normPhone, otp })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "OTP verification failed");
        return;
      }
      if (data?.verified && data?.token) {
        setToken(data.token);
        if (data.user_id) setUserId(data.user_id);
        if (data.phone) setPhoneId(data.phone);
        setRole("contractor");
        setProfileError("");
        let profilePayload = null;
        try {
          const profileRes = await fetch(`${BACKEND_URL}/api/accounts/profile/`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Token ${data.token}`
            }
          });
          const profileData = await profileRes.json().catch(() => null);
          if (profileRes.ok && profileData?.success && profileData?.profile) {
            profilePayload = profileData.profile;
            setCProf(profilePayload);
          } else {
            const profileError = profileData?.error || "Unable to load contractor profile";
            setProfileError(profileError);
          }
        } catch (profileErr) {
          setProfileError("Unable to load contractor profile");
        }
        if (va) speak("స్వాగతం! కాంట్రాక్టర్ లాగిన్ అయ్యారు.");
        setTimeout(() => onDone(data.token, data.user_id, data.phone, profilePayload), 600);
      } else if (data?.verified && !data?.token) {
        setError("User account not found. Please register first.");
      } else {
        setError("OTP verification failed");
      }
    } catch (err) {
      setError("Unable to verify OTP");
    } finally {
      setLoading(false);
    }
  };

  if (step === 0) return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px 40px", position: "relative", zIndex: 2 }}>
      <Card title={heading} sub={isEn ? "Login to your account" : "మీ account లోకి లాగిన్ చేయండి"} onBack={() => { stopSpeech(); onBack(); }} ac="#22c55e">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 18, maxWidth: 590, width: "100%" }}>
          {[{ id: "face", icon: "🤳", label: "Face" }, { id: "voice", icon: "🎤", label: "Voice" }, { id: "phone", icon: "📱", label: "Phone" }].map(m =>
            <button key={m.id} onClick={() => { setMethod(m.id); setStep(1); if (va && m.id === 'voice') speak(m.label); }}
              style={{ background: "rgba(255,255,255,.04)", border: "2px solid rgba(34,197,94,.3)", borderRadius: 20, padding: "28px 18px", cursor: "pointer", textAlign: "center", transition: "all .3s" }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>{m.icon}</div>
              <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 15, fontFamily: "'Noto Sans Telugu',sans-serif" }}>{m.label}</div>
              <div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>{m.id === 'phone' ? 'OTP' : (m.id === 'voice' ? 'Voice login' : 'Face login')}</div>
            </button>
          )}
        </div>
      </Card>
    </div>
  );

  if (method === 'face') return (
    <Card title={heading} sub={isEn ? "Face login" : "Face ద్వారా లాగిన్"} onBack={() => { setStep(0); }} ac="#22c55e">
      <div style={{ width: 180, height: 180, borderRadius: "50%", border: "3px dashed #22c55e", margin: "0 auto 22px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(34,197,94,.05)", animation: "pulse 2s infinite", position: "relative", overflow: "hidden" }}>
        <div style={{ fontSize: 66 }}>🤳</div>
        <div style={{ position: "absolute", left: 0, right: 0, height: 3, background: "linear-gradient(90deg,transparent,#22c55e,transparent)", animation: "scanLine 2s linear infinite", top: 0 }} />
      </div>
      <Btn onClick={() => { if (va) speak("లాగిన్ అయింది"); setTimeout(onDone, 600); }} color="#22c55e">Login ✓</Btn>
    </Card>
  );

  if (method === 'voice') return (
    <Card title={heading} sub={isEn ? "Voice login" : "Voice ద్వారా లాగిన్"} onBack={() => { setStep(0); }} ac="#22c55e">
      <div style={{ textAlign: "center" }}>
        <div style={{ color: "#94a3b8", fontSize: 14, fontFamily: "'Noto Sans Telugu',sans-serif", marginBottom: 18 }}>Speak your passphrase</div>
        <Mic onResult={tx => { if (va) speak("లాగిన్ అయ్యారు"); setTimeout(onDone, 600); }} size={68} color="#22c55e" />
      </div>
    </Card>
  );

  return (
    <Card title={heading} sub={isEn ? "Phone OTP" : "ఫోన్ OTP"} onBack={() => { setStep(0); }} ac="#22c55e">
      {!sent ? (
        <>
          <Field label={phLabel} sub="Phone" value={phone} onChange={setPhone} type="tel" ph="9XXXXXXXXX" ac="#22c55e" />
          {va && (
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
              <Mic onResult={t => { const n = t.replace(/\D/g, ""); if (n.length >= 10) { setPhone(n); speak("నంబర్ నమోదు అయింది"); } }} size={46} color="#22c55e" />
            </div>
          )}
          <Btn onClick={doSend} color="#22c55e" disabled={!phone || loading}>{loading ? "Sending..." : sendBtn}</Btn>
          {error && <div style={{ color: "#f87171", fontSize: 13, marginTop: 14, textAlign: "center" }}>{error}</div>}
        </>
      ) : (
        <>
          <div style={{ color: "#22c55e", fontSize: 13, fontFamily: "'Noto Sans Telugu',sans-serif", marginBottom: 18, textAlign: "center" }}>{sentMsg}</div>
          <Field label={otpLabel} sub="OTP" value={otp} onChange={setOtp} type="number" ph="_ _ _ _ _ _" ac="#22c55e" />
          {va && (
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
              <Mic onResult={t => { const n = t.replace(/\D/g, ""); if (n) { setOtp(n); speak("OTP నమోదు అయింది"); } }} size={46} color="#22c55e" />
            </div>
          )}
          <Btn onClick={doLogin} color="#22c55e" disabled={!otp || loading}>{loading ? "Verifying..." : verBtn}</Btn>
          {error && <div style={{ color: "#f87171", fontSize: 13, marginTop: 14, textAlign: "center" }}>{error}</div>}
        </>
      )}
    </Card>
  );
}

/* ═════════════════════════════════════════════
   APP SHELL
═════════════════════════════════════════════ */
export default function NiyogaX() {
  // CHECK localStorage on startup — restore session if user was already logged in
  const getSavedScreen = () => {
    const loggedIn = localStorage.getItem("niyoga_loggedIn");
    const role = localStorage.getItem("niyoga_role");
    if (loggedIn === "true" && role) {
      return "main"; // skip landing, go straight to main app
    }
    return "landing"; // first time or logged out
  };
  const [screen, setScreen] = useState(getSavedScreen());
  const [role, setRole] = useState(localStorage.getItem("niyoga_role") || null);
  const [token, setToken] = useState(localStorage.getItem("niyoga_token") || "");
  const [userId, setUserId] = useState(localStorage.getItem("niyoga_user_id") || null);
  const [phoneId, setPhoneId] = useState(localStorage.getItem("niyoga_phone") || null);
  const [profileError, setProfileError] = useState("");
  // RESTORE the last page — worker goes to jobs, contractor goes to dashboard
  const getSavedPage = () => {
    const role = localStorage.getItem("niyoga_role");
    if (role === "worker") return "jobs";
    if (role === "contractor") return "dashboard";
    return "dashboard";
  };
  const [page, setPage] = useState(getSavedPage());
  // SESSION HELPER — saves login state to localStorage
  const saveSession = (role, lang, targetPage, authToken, authUserId = null, authPhone = null) => {
    localStorage.setItem("niyoga_loggedIn", "true");
    localStorage.setItem("niyoga_role", role);        // "worker" or "contractor"
    localStorage.setItem("niyoga_lang", lang || "te"); // language code
    localStorage.setItem("niyoga_page", targetPage);  // page to restore on reload
    if (authToken) {
      localStorage.setItem("niyoga_token", authToken);
      setToken(authToken);
    }
    if (authUserId) {
      localStorage.setItem("niyoga_user_id", authUserId);
    }
    if (authPhone) {
      localStorage.setItem("niyoga_phone", authPhone);
    }
  };
  // SESSION HELPER — clears login state from localStorage
  const clearSession = () => {
    localStorage.removeItem("niyoga_loggedIn");
    localStorage.removeItem("niyoga_role");
    localStorage.removeItem("niyoga_lang");
    localStorage.removeItem("niyoga_page");
    localStorage.removeItem("niyoga_token");
    localStorage.removeItem("niyoga_user_id");
    localStorage.removeItem("niyoga_phone");
    setToken("");
    setRole(null);
    setUserId(null);
    setPhoneId(null);
    setProfileError("");
  };
  const [cProf, setCProf] = useState({});
  const [wProf, setWProf] = useState({});
  const [langMode, setLangMode]   = useState(localStorage.getItem("niyoga_lang") || "te");
  const [wLangMode, setWLangMode] = useState(localStorage.getItem("niyoga_lang") || "te");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [workerPhone, setWorkerPhone] = useState("");
  const [contractorPhone, setContractorPhone] = useState("");

  // Niyo assistant + job filter wiring — unchanged from original
  const { jobFilter, setJobFilter } = useJobFilter();
  useEffect(() => {
    if (jobFilter) { setPage("jobs"); setScreen("main"); }
  }, [jobFilter]);

  useEffect(() => {
    const restoreProfile = async () => {
      if (!token || !role) return;
      const hasProfile = role === "worker" ? Object.keys(wProf).length > 0 : Object.keys(cProf).length > 0;
      if (hasProfile) return;

      try {
        const profileRes = await fetch(`${BACKEND_URL}/api/accounts/profile/`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Token ${token}`
          }
        });
        const profileData = await profileRes.json().catch(() => null);

        if (profileRes.ok && profileData?.success && profileData?.profile) {
          if (role === "worker") {
            setWProf(profileData.profile);
          } else if (role === "contractor") {
            setCProf(profileData.profile);
          }
          return;
        }

        if (profileRes.status === 401 || profileRes.status === 403 || profileData?.error?.toString().toLowerCase().includes("token")) {
          clearSession();
          setScreen("landing");
          setPage("dashboard");
          return;
        }

        setProfileError(profileData?.error || "Unable to restore profile");
      } catch (err) {
        setProfileError("Unable to restore profile");
      }
    };

    restoreProfile();
  }, [token, role, wProf, cProf]);

  const handleAssistantNavigate = (path, filter) => {
    console.log('[NiyogaX] handleAssistantNavigate start', { path, filter });
    // SAFETY CHECK — only navigate if user is already logged in
    // If role is not set, the user is not logged in yet, so do nothing
    if (!role) {
      return;
    }

    if (filter !== null && filter !== undefined) {
      console.log('[NiyogaX] handleAssistantNavigate setJobFilter', filter);
      setJobFilter(filter);
    }

    const pageMap = {
      "/": "home",
      "/jobs": "jobs",
      "/profile": "profile",
      "/dashboard": "dashboard",
      "/post-job": "post"
    };

    // WORKER page guard — only show worker pages to workers
    // CONTRACTOR page guard — only show contractor pages to contractors
    const workerOnlyPages = ["jobs", "home", "profile", "applications"];
    const contractorOnlyPages = ["home", "dashboard", "post", "workers", "profile"];

    if (["/jobs", "/", "/dashboard", "/profile", "/post-job"].includes(path)) {
      setScreen("main");
    }

    if (pageMap[path]) {
      const targetPage = pageMap[path];
      // Only navigate to a page that exists for the current role
      if (role === "worker" && workerOnlyPages.includes(targetPage)) {
        setPage(targetPage);
      } else if (role === "contractor" && contractorOnlyPages.includes(targetPage)) {
        setPage(targetPage);
      } else if (targetPage === "home") {
        // home exists for both roles
        setPage("home");
      }
    }
  };

  const vSpeak = (text) => { if (langMode === "va") speak(text); };

  const wTx = T[wLangMode] || T.te;

  const reset = () => {
    // CLEAR session from localStorage on logout
    clearSession();
    stopSpeech();
    setScreen("landing"); setRole(null); setPage("dashboard");
    setCProf({}); setWProf({}); setLangMode("te"); setWLangMode("te");
    speak("మళ్ళీ స్వాగతం!");
  };

  const selectRole = r => {
    stopSpeech();
    setRole(r);
    setScreen(r === "contractor" ? "c_lang" : "w_lang");
  };

  const tx = T[langMode] || T.te;

  return (
      <>
      <style>{CSS}</style>
      <div style={{ position: "fixed", inset: 0, background: "radial-gradient(ellipse at 20% 50%,rgba(255,140,0,.06),transparent 60%),radial-gradient(ellipse at 80% 20%,rgba(34,197,94,.05),transparent 60%),#040d1a", zIndex: -1 }} />
      <Particles color={role === "contractor" ? "34,197,94" : "255,140,0"} />
      <Silhouettes />

      {screen === "landing"   && <Landing onGo={() => setScreen("role")} />}
      {screen === "role"      && <RoleSelect onBack={() => { stopSpeech(); setScreen("landing"); }} onSelect={selectRole} />}

      {/* ── WORKER FLOW ── */}
      {/* ADD THIS — Worker language selection (same CLang component, same UI) */}
      {screen === "w_lang" && (
        <CLang
          workerMode={true}
          onBack={() => { stopSpeech(); setScreen("role"); }}
          onSelect={m => {
            setWLangMode(m);
            setScreen("w_auth");
          }}
        />
      )}
      {/* ADD THIS — Worker register / login choice */}
      {screen === "w_auth" && (
        <AuthChoice
          role="worker"
          langMode={wLangMode}
          onBack={() => { stopSpeech(); setScreen("w_lang"); }}
          onRegister={() => { stopSpeech(); setScreen("w_reg"); }}
          onLogin={() => { stopSpeech(); setScreen("w_login"); }}
        />
      )}
      {/* ADD THIS — Worker login */}
      {screen === "w_login" && (
        <WorkerLogin
          langMode={wLangMode}
          onBack={() => { stopSpeech(); setScreen("w_auth"); }}
          setWProf={setWProf}
          setToken={setToken}
          setUserId={setUserId}
          setPhoneId={setPhoneId}
          setProfileError={setProfileError}
          setRole={setRole}
            onDone={(loginToken, loginUserId, loginPhone, profilePayload) => {
              setRole("worker");
              if (wLangMode === "va") speak("స్వాగతం! లాగిన్ అయ్యారు.");
              setToken(loginToken);
              setUserId(loginUserId);
              setPhoneId(loginPhone);
              setWProf(profilePayload || {});
              // SAVE worker session to localStorage
              saveSession("worker", wLangMode || "te", "jobs", loginToken, loginUserId, loginPhone);
              setPage("jobs"); setScreen("main");
            }}
        />
      )}
      {/* Existing worker registration — UNCHANGED */}
      {screen === "w_reg"  && <WorkerReg langMode={wLangMode} onBack={() => { stopSpeech(); setScreen("w_auth"); }} onDone={() => setScreen("w_prof")} setWorkerPhone={setWorkerPhone} />}
      {screen === "w_prof" && <WorkerProfile langMode={wLangMode} phone={workerPhone} onBack={() => { stopSpeech(); setScreen("w_reg"); }} onDone={(profile, tokenParam) => {
        setWProf(profile);
        if (wLangMode === "va") speak("ప్రొఫైల్ పూర్తయింది! స్వాగతం!");
        if (tokenParam) {
          setToken(tokenParam);
          setUserId(profile?.user_id || null);
          setPhoneId(profile?.phone || null);
          saveSession("worker", wLangMode || "te", "jobs", tokenParam, profile?.user_id || null, profile?.phone || null);
        }
        setPage("jobs"); setScreen("main");
      }} />}

      {/* ── CONTRACTOR FLOW — all existing screens UNCHANGED ── */}
      {screen === "c_lang" && <CLang onBack={() => { stopSpeech(); setScreen("role"); }} onSelect={m => { setLangMode(m); setScreen("c_auth"); }} />}
      {/* ADD THIS — Contractor register / login choice */}
      {screen === "c_auth" && (
        <AuthChoice
          role="contractor"
          langMode={langMode}
          onBack={() => { stopSpeech(); setScreen("c_lang"); }}
          onRegister={() => { stopSpeech(); setScreen("c_reg"); }}
          onLogin={() => { stopSpeech(); setScreen("c_login"); }}
        />
      )}
      {/* ADD THIS — Contractor login */}
      {screen === "c_login" && (
        <ContractorLogin
          langMode={langMode}
          onBack={() => { stopSpeech(); setScreen("c_auth"); }}
          setCProf={setCProf}
          setToken={setToken}
          setUserId={setUserId}
          setPhoneId={setPhoneId}
          setProfileError={setProfileError}
          setRole={setRole}
            onDone={(loginToken, loginUserId, loginPhone, profilePayload) => {
              setRole("contractor");
              if (langMode === "va") speak(T.va.cDoneSpeak);
              setToken(loginToken);
              setUserId(loginUserId);
              setPhoneId(loginPhone);
              setCProf(profilePayload || {});
              // SAVE contractor session to localStorage
              saveSession("contractor", langMode || "en", "dashboard", loginToken, loginUserId, loginPhone);
              setPage("dashboard"); setScreen("main");
            }}
        />
      )}
      {/* Existing contractor registration — UNCHANGED */}
      {screen === "c_reg"  && <CReg   langMode={langMode} onBack={() => { stopSpeech(); setScreen("c_auth"); }} onDone={() => setScreen("c_prof")} setContractorPhone={setContractorPhone} />}
      {screen === "c_prof" && <CProfile phone={contractorPhone} langMode={langMode} onBack={() => { stopSpeech(); setScreen("c_reg"); }} onDone={(profile, tokenParam) => {
        setCProf(profile);
        if (langMode === "va") speak(T.va.cDoneSpeak);
        if (tokenParam) {
          setToken(tokenParam);
          setUserId(profile?.user_id || null);
          setPhoneId(profile?.phone || null);
          saveSession("contractor", langMode || "en", "dashboard", tokenParam, profile?.user_id || null, profile?.phone || null);
        }
        setPage("dashboard"); setScreen("main");
      }} />}

      {/* Worker main */}
      {screen === "main" && role === "worker" && page === "jobs"    && <Jobs langMode={wLangMode} />}
      {screen === "main" && role === "worker" && page === "applications" && <WorkerApplications langMode={wLangMode} />}
      {screen === "main" && role === "worker" && page === "home"    && <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 2, position: "relative", textAlign: "center", padding: 40 }}>
        <div style={{ fontSize: 72, marginBottom: 20 }}>👋</div>
        <h2 style={{ color: "#f1f5f9", fontFamily: "'Rajdhani',sans-serif", fontSize: 30, fontWeight: 800 }}>{wTx.wHomeWelcome}</h2>
        <button onClick={() => setPage("jobs")} style={{ marginTop: 24, padding: "13px 34px", background: "linear-gradient(135deg,#ff8c00,#ff6b00)", border: "none", borderRadius: 50, color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "'Rajdhani',sans-serif" }}>{wTx.wHomeBtn}</button>
      </div>}
      {screen === "main" && role === "worker" && page === "profile" && (() => {
        const ec = wProf?.emergencyContact;
        const genderIcon = wProf?.gender === "female" ? "👩" : wProf?.gender === "male" ? "👨" : "🧑";
        return (
          <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 2, position: "relative", padding: "40px 20px 100px" }}>
            <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,140,0,.2)", borderRadius: 24, padding: 34, maxWidth: 400, width: "100%", textAlign: "center" }}>
              <div style={{ width: 76, height: 76, borderRadius: "50%", background: "linear-gradient(135deg,#ff8c00,#22c55e)", margin: "0 auto 18px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34 }}>{genderIcon}</div>
              <div style={{ color: "#f1f5f9", fontWeight: 800, fontSize: 22, fontFamily: "'Rajdhani',sans-serif" }}>{wProf?.name || "మీ ప్రొఫైల్"}</div>
              <div style={{ color: "#64748b", fontSize: 12, marginTop: 3, fontFamily: "'Noto Sans Telugu',sans-serif" }}>{wProf?.workType || "కార్మికుడు"}</div>
              {/* Profile rows */}
              {[
                [wTx.wProfileLoc,    wProf?.location || "—"],
                [wTx.wProfileRating,   "4.9 / 5.0"],
                [wTx.wProfileVerified,  wLangMode === "en" ? "Complete" : "పూర్తయింది"],
                [wTx.wProfileDaily, wProf?.wage ? `₹${wProf.wage}/day` : "—"],
                [wTx.wProfileGender,    wProf?.gender === "female" ? (wLangMode === "en" ? "Female" : "స్త్రీ") : wProf?.gender === "male" ? (wLangMode === "en" ? "Male" : "పురుషుడు") : wProf?.gender ? (wLangMode === "en" ? "Other" : "ఇతర") : "—"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 13px", background: "rgba(255,255,255,.05)", borderRadius: 11, marginTop: 8 }}>
                  <span style={{ color: "#94a3b8", fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif" }}>{k}</span>
                  <span style={{ color: "#ff8c00", fontWeight: 700, fontSize: 12 }}>{v}</span>
                </div>
              ))}
              {/* Emergency contact section */}
              {ec ? (
                <div style={{ marginTop: 14, background: "rgba(239,68,68,.07)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 14, padding: "13px 16px", textAlign: "left" }}>
                  <div style={{ color: "#ef4444", fontWeight: 700, fontSize: 12, fontFamily: "'Rajdhani',sans-serif", letterSpacing: 1, textTransform: "uppercase", marginBottom: 9, display: "flex", alignItems: "center", gap: 6 }}>
                    <span>🆘</span> {wTx.wProfileEmergencyLabel}
                  </div>
                  {[[wLangMode === "en" ? "👤 Name" : "👤 పేరు", ec.name], [wLangMode === "en" ? "📞 Phone" : "📞 ఫోన్", ec.phone]].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                      <span style={{ color: "#64748b", fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif" }}>{k}</span>
                      <span style={{ color: "#fca5a5", fontWeight: 700, fontSize: 12 }}>{v}</span>
                    </div>
                  ))}
                  {wProf?.gender === "female" && (
                    <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ background: "rgba(236,72,153,.15)", border: "1px solid rgba(236,72,153,.3)", borderRadius: 50, padding: "2px 10px", color: "#f472b6", fontSize: 10, fontWeight: 700 }}>🛡️ SAFE MODE ON</span>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ marginTop: 14, background: "rgba(255,140,0,.05)", border: "1px solid rgba(255,140,0,.15)", borderRadius: 12, padding: "10px 14px", display: "flex", gap: 7, alignItems: "center" }}>
                  <span style={{ fontSize: 14 }}>⚠️</span>
                  <span style={{ color: "#64748b", fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif" }}>{wTx.wProfileNoContact}</span>
                </div>
              )}
              <button onClick={reset} style={{ marginTop: 18, padding: "11px 26px", borderRadius: 50, border: "1px solid rgba(255,60,0,.4)", background: "none", color: "#ef4444", cursor: "pointer", fontSize: 13, fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 }}>లాగ్ అవుట్</button>
            </div>
          </div>
        );
      })()}

      {/* Contractor main — all pages receive langMode */}
      {screen === "main" && role === "contractor" && page === "home" && <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 2, position: "relative", padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 72, marginBottom: 20 }}>🏢</div>
        <h2 style={{ color: "#f1f5f9", fontFamily: "'Rajdhani',sans-serif", fontSize: 28, fontWeight: 800 }}>{tx.cHomeWelcome(cProf.name || (langMode === "en" ? "Contractor" : "కాంట్రాక్టర్"))}</h2>
        <button onClick={() => setPage("dashboard")} style={{ marginTop: 24, padding: "13px 34px", background: "linear-gradient(135deg,#22c55e,#16a34a)", border: "none", borderRadius: 50, color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "'Rajdhani',sans-serif" }}>{tx.cHomeBtn}</button>
      </div>}
      {screen === "main" && role === "contractor" && page === "dashboard" && <CDash langMode={langMode} profile={cProf} onPost={() => setPage("post")} onWorkers={() => setPage("workers")} />}
          {screen === "main" && role === "contractor" && page === "post"      && <PostJob langMode={langMode} onBack={() => { try{ localStorage.removeItem('niyoga_edit_job'); }catch(e){}; setPage("dashboard"); }} onDone={() => setPage("dashboard")} />}
      {screen === "main" && role === "contractor" && page === "workers"   && <WorkerMgmt langMode={langMode} onBack={() => setPage("dashboard")} />}
          {screen === "main" && role === "contractor" && page === "myjobs"    && <MyJobs langMode={langMode} onBack={() => setPage("dashboard")} onEdit={job => { console.log("[EDIT CLICK] selected job =", job); try{ localStorage.setItem('niyoga_edit_job', JSON.stringify(job)); }catch(e){}; setPage('post'); }} />}
      {screen === "main" && role === "contractor" && page === "profile"   && <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 2, position: "relative", padding: "40px 20px 100px" }}>
        <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(34,197,94,.2)", borderRadius: 24, padding: 34, maxWidth: 400, width: "100%", textAlign: "center" }}>
          <div style={{ width: 76, height: 76, borderRadius: "50%", background: "linear-gradient(135deg,#22c55e,#16a34a)", margin: "0 auto 18px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34 }}>🏢</div>
          <div style={{ color: "#f1f5f9", fontWeight: 800, fontSize: 22, fontFamily: "'Rajdhani',sans-serif" }}>{cProf.company || "—"}</div>
          <div style={{ display: "flex", gap: 7, justifyContent: "center", marginTop: 10, flexWrap: "wrap" }}>
            <span style={{ background: "rgba(34,197,94,.15)", border: "1px solid rgba(34,197,94,.4)", borderRadius: 50, padding: "2px 12px", color: "#22c55e", fontSize: 10, fontWeight: 700 }}>✓ VERIFIED</span>
            <span style={{ background: "rgba(255,140,0,.1)", border: "1px solid rgba(255,140,0,.3)", borderRadius: 50, padding: "2px 12px", color: "#ff8c00", fontSize: 10, fontWeight: 700 }}>SAFE WORKPLACE</span>
          </div>
          {[[tx.cpName, cProf.name||"—"],[tx.cpLoc, cProf.location||"—"],[tx.cpTrust,"4.8/5.0"],[tx.cpVerified, tx.cpVerifiedVal]].map(([k,v]) => <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "11px 14px", background: "rgba(255,255,255,.05)", borderRadius: 11, marginTop: 10 }}>
            <span style={{ color: "#94a3b8", fontSize: 12, fontFamily: "'Noto Sans Telugu',sans-serif" }}>{k}</span>
            <span style={{ color: "#22c55e", fontWeight: 700, fontSize: 12 }}>{v}</span>
          </div>)}
          <button onClick={reset} style={{ marginTop: 22, padding: "11px 26px", borderRadius: 50, border: "1px solid rgba(255,60,0,.4)", background: "none", color: "#ef4444", cursor: "pointer", fontSize: 13, fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 }}>{wTx.logout}</button>
        </div>
      </div>}

      <Nav page={page} go={setPage} role={screen === "main" ? role : null} langMode={screen === "main" && role === "worker" ? wLangMode : langMode} />
      <Bot onCmd={r => { setRole(r); setScreen(r === "contractor" ? "c_lang" : "w_reg"); }} onOpenChange={setAssistantOpen} onNavigate={handleAssistantNavigate} />
      {/* SOS now receives worker profile so it can read emergencyContact */}
      <SOS workerProfile={role === "worker" ? wProf : null} style={assistantOpen ? { bottom: "90px", right: "80px" } : undefined} />
      </>
  );
}

/* ── MY JOBS (CONTRACTOR) ── */
function MyJobs({ langMode = "te", onBack, onEdit }) {
  const isEn = langMode === "en";
  const [jobs, setJobs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showApplicants, setShowApplicants] = useState(false);
  const [applicantJob, setApplicantJob] = useState(null);
  const [applicants, setApplicants] = useState(null);
  const [applicantsLoading, setApplicantsLoading] = useState(false);
  const [applicationActionLoading, setApplicationActionLoading] = useState(null);
  const { t, show } = useToast();

  useEffect(() => {
    let mounted = true;
    const token = localStorage.getItem('niyoga_token') || "";
    fetch(`${BACKEND_URL}/api/jobs/my/`, { headers: { Authorization: `Token ${token}` } })
      .then(r => r.json().then(j => ({ status: r.status, body: j })).catch(() => ({ status: r.status, body: {} })))
      .then(res => {
        if (!mounted) return;
        if (res.status === 200) setJobs(res.body);
        else { setJobs([]); show && show(res.body && (res.body.detail || res.body.error) ? (res.body.detail || res.body.error) : 'Failed to load jobs', '#ef4444'); }
      })
      .catch(err => { console.error('[MyJobs] fetch failed', err); setJobs([]); show && show('Network error', '#ef4444'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const closeApplicants = () => {
    setShowApplicants(false);
    setApplicantJob(null);
    setApplicants(null);
    setApplicantsLoading(false);
    setApplicationActionLoading(null);
  };

  const updateApplicantStatus = (applicationId, newStatus) => {
    setApplicants(current => current ? current.map(item => item.id === applicationId ? { ...item, status: newStatus } : item) : current);
  };

  const handleApplicantDecision = async (applicationId, decision) => {
    if (applicationActionLoading) return;
    const token = localStorage.getItem('niyoga_token') || "";
    setApplicationActionLoading(applicationId);
    try {
      const res = await fetch(`${BACKEND_URL}/api/jobs/applications/${applicationId}/${decision}/`, {
        method: 'POST',
        headers: { Authorization: `Token ${token}` }
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        const statusLabel = decision === 'accept' ? (isEn ? 'Accepted' : 'అంగీకరించబడింది') : (isEn ? 'Rejected' : 'నిరాకరించబడింది');
        updateApplicantStatus(applicationId, decision === 'accept' ? 'accepted' : 'rejected');
        show && show(statusLabel, '#22c55e');
      } else {
        show && show(data && (data.detail || data.error) ? (data.detail || data.error) : (isEn ? 'Unable to update application' : 'అప్లికేషన్‌ను నవీకరించలేము'), '#ef4444');
      }
    } catch (err) {
      console.error('[MyJobs] applicant decision failed', err);
      show && show(isEn ? 'Network error' : 'నెట్‌వర్క్ లోపం', '#ef4444');
    } finally {
      setApplicationActionLoading(null);
    }
  };

  const openApplicants = async job => {
    setApplicantJob(job);
    setShowApplicants(true);
    setApplicants(null);
    setApplicantsLoading(true);
    const token = localStorage.getItem('niyoga_token') || "";
    try {
      const res = await fetch(`${BACKEND_URL}/api/jobs/${job.id}/applications/`, {
        headers: { Authorization: `Token ${token}` }
      });
      const data = await res.json().catch(() => null);
      if (res.ok && Array.isArray(data)) {
        setApplicants(data);
      } else {
        setApplicants([]);
        show && show(data && (data.detail || data.error) ? (data.detail || data.error) : (isEn ? 'Failed to load applicants' : 'అభ్యర్థులను లోడ్ చేయలేకపోయాము'), '#ef4444');
      }
    } catch (err) {
      console.error('[MyJobs] applicants fetch failed', err);
      setApplicants([]);
      show && show(isEn ? 'Network error' : 'నెట్‌వర్క్ లోపం', '#ef4444');
    } finally {
      setApplicantsLoading(false);
    }
  };

  if (loading) return <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading jobs…</div>;
  if (!jobs || jobs.length === 0) return <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
    <div style={{ color: '#94a3b8' }}>{isEn ? 'No jobs yet' : 'ఇప్పటి వరకు పనులు లేవు'}</div>
    <button onClick={onBack} style={{ padding: '8px 14px', borderRadius: 10, background: '#22c55e', color: '#fff', border: 'none' }}>{isEn ? 'Back' : 'వెనుకకు'}</button>
  </div>;

  return <div style={{ minHeight: '100vh', padding: '60px 18px 100px', position: 'relative', zIndex: 2 }}>
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
        <h1 style={{ color: '#f1f5f9', fontFamily: "'Rajdhani',sans-serif", fontSize: 22, fontWeight: 800 }}>{isEn ? 'My Jobs' : 'నా పనులు'}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onBack} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.06)', background: 'transparent', color: '#94a3b8' }}>{isEn ? 'Back' : 'వెనుకకు'}</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 18 }}>
        {jobs.map((j, i) => <div key={j.id} style={{ background: 'rgba(255,255,255,.04)', border: `1px solid ${j.status === 'active' ? '#22c55e' : '#64748b'}30`, borderRadius: 20, padding: 18, position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div style={{ fontWeight: 800, color: '#f1f5f9' }}>{j.job_type}</div>
            <div style={{ color: '#94a3b8', fontSize: 12 }}>{new Date(j.created_at).toLocaleString()}</div>
          </div>
          <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 8 }}>{j.location}</div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <div style={{ color: '#22c55e', fontWeight: 800 }}>₹{j.daily_salary}</div>
            <div style={{ color: '#94a3b8' }}>{j.workers_needed} {isEn ? 'workers' : 'మంది'}</div>
            <div style={{ color: '#94a3b8' }}>{j.days_of_work} {isEn ? 'days' : 'రోజులు'}</div>
          </div>
          <div style={{ color: '#94a3b8', marginBottom: 12 }}>{j.shift_timing} • <strong style={{ color: '#f1f5f9' }}>{j.status}</strong></div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => onEdit && onEdit(j)} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.06)', background: 'transparent', color: '#94a3b8' }}>Edit</button>
            <button onClick={() => openApplicants(j)} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.06)', background: 'transparent', color: '#94a3b8' }}>{isEn ? 'Applicants' : 'అభ్యర్థులు'}</button>
            <button onClick={async () => {
              if (!window.confirm(isEn ? 'Delete this job?' : 'ఈ పనిని తొలగించాలా?')) return;
              const token = localStorage.getItem('niyoga_token') || "";
              try {
                const res = await fetch(`${BACKEND_URL}/api/jobs/${j.id}/`, {
                  method: 'DELETE',
                  headers: { Authorization: `Token ${token}` }
                });
                const json = await res.json().catch(() => ({}));
                if (res.status === 200) {
                  setJobs(current => current.filter(item => item.id !== j.id));
                  show && show(isEn ? 'Job deleted' : 'పని తొలగించబడింది', '#22c55e');
                } else {
                  show && show(json && (json.detail || json.error) ? (json.detail || json.error) : (isEn ? 'Failed to delete job' : 'పని తొలగించలేకపోయింది'), '#ef4444');
                }
              } catch (err) {
                console.error('[MyJobs] delete failed', err);
                show && show(isEn ? 'Network error while deleting job' : 'పని తొలగించేటప్పుడు నెట్‌వర్క్ లోపం', '#ef4444');
              }
            }} style={{ padding: '8px 12px', borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff' }}>Delete</button>
          </div>
        </div>)}
      </div>
    </div>

    {showApplicants && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(4,13,26,.92)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', animation: 'fadeIn .2s ease' }}>
        <div style={{ width: '100%', maxWidth: 520, background: 'linear-gradient(145deg,rgba(15,25,50,.99),rgba(10,18,38,.99))', border: '2px solid rgba(59,130,246,.4)', borderRadius: 24, padding: '26px 24px', boxShadow: '0 0 60px rgba(59,130,246,.3),0 24px 80px rgba(0,0,0,.8)', animation: 'slideUp .3s cubic-bezier(.34,1.56,.64,1) both' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
            <div>
              <div style={{ color: '#fff', fontSize: 20, fontWeight: 800, fontFamily: "'Rajdhani',sans-serif" }}>{isEn ? 'Applicants' : 'అభ్యర్థులు'}</div>
              <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>{applicantJob?.job_type || ''}</div>
            </div>
            <button onClick={closeApplicants} style={{ border: 'none', background: 'transparent', color: '#94a3b8', fontSize: 16, cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 4 }}>
            {applicantsLoading ? (
              <div style={{ color: '#94a3b8', textAlign: 'center', padding: '40px 0' }}>{isEn ? 'Loading applicants…' : 'అభ్యర్థులను లోడ్ చేస్తున్నాం…'}</div>
            ) : applicants && applicants.length > 0 ? (
              applicants.map((a, idx) => (
                <div key={a.id || idx} style={{ padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(148,163,184,.12)', marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ color: '#f1f5f9', fontWeight: 700 }}>{a.worker_name || (isEn ? 'Unnamed worker' : 'పేరు లేని పని')}</div>
                    <div style={{ color: '#94a3b8', fontSize: 12 }}>{new Date(a.applied_at).toLocaleDateString()}</div>
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 6 }}>{a.worker_phone || '-'}</div>
                  <div style={{ color: '#94a3b8', fontSize: 13 }}><strong style={{ color: '#f1f5f9' }}>{isEn ? 'Status:' : 'స్థితి:'}</strong> {a.status || '-'}</div>
                  {a.status === 'applied' ? (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      <button onClick={() => handleApplicantDecision(a.id, 'accept')} disabled={applicationActionLoading === a.id}
                        style={{ flex: 1, padding: '9px 12px', borderRadius: 12, border: 'none', background: '#22c55e', color: '#fff', fontWeight: 700, cursor: applicationActionLoading === a.id ? 'not-allowed' : 'pointer' }}>
                        {applicationActionLoading === a.id ? (isEn ? 'Processing…' : 'చేస్తోంది…') : (isEn ? 'Accept' : 'అంగీకరించు')}
                      </button>
                      <button onClick={() => handleApplicantDecision(a.id, 'reject')} disabled={applicationActionLoading === a.id}
                        style={{ flex: 1, padding: '9px 12px', borderRadius: 12, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, cursor: applicationActionLoading === a.id ? 'not-allowed' : 'pointer' }}>
                        {applicationActionLoading === a.id ? (isEn ? 'Processing…' : 'చేస్తోంది…') : (isEn ? 'Reject' : 'నిరాకరించు')}
                      </button>
                    </div>
                  ) : a.status === 'accepted' ? (
                    <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 8, color: '#22c55e', fontWeight: 700, fontSize: 13 }}>
                      <span style={{ background: '#dcfce7', borderRadius: 12, padding: '5px 10px', color: '#166534' }}>{isEn ? 'Accepted' : 'అంగీకరించబడింది'}</span>
                    </div>
                  ) : a.status === 'rejected' ? (
                    <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 8, color: '#ef4444', fontWeight: 700, fontSize: 13 }}>
                      <span style={{ background: '#fee2e2', borderRadius: 12, padding: '5px 10px', color: '#b91c1c' }}>{isEn ? 'Rejected' : 'నిరాకరించబడింది'}</span>
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <div style={{ color: '#94a3b8', textAlign: 'center', padding: '40px 0' }}>{isEn ? 'No applicants yet' : 'ఇంకా అభ్యర్థులు లేరు'}</div>
            )}
          </div>
        </div>
      </div>
    )}
  </div>;
}