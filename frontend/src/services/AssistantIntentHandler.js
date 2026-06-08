/**
 * AssistantIntentHandler.js
 *
 * PURPOSE:
 *   Analyses what the user said and decides:
 *   1. ACTION  — navigate somewhere / filter jobs / perform an app action
 *   2. CONVERSATION — answer a question, keep panel open
 *
 * HOW TO EXTEND WITH AN LLM:
 *   In the handleInput() method, replace the keyword-matching blocks with:
 *     const response = await callClaudeAPI(userText, conversationHistory);
 *   The LLM can return structured JSON like:
 *     { type: 'action', action: 'navigate', target: '/jobs', filter: 'painting' }
 *   or
 *     { type: 'conversation', reply: 'NiyogaX helps connect workers...' }
 *   Everything else in this file stays the same.
 */

// ─── Intent database ─────────────────────────────────────────────────────────
// Maps keywords (Telugu & English) → intent objects

const ACTION_INTENTS = [
  // ── Job category navigation ──
  {
    keywords: ['painting', 'పెయింటింగ్', 'పెయింట్'],
    type: 'navigate_jobs',
    filter: 'Painting',
    reply: 'మీ దగ్గరలో ఉన్న పెయింటింగ్ పనులను చూపిస్తున్నాను.',
    replyEn: 'Showing painting jobs near you.',
  },
  {
    keywords: ['driving', 'driver', 'డ్రైవింగ్', 'డ్రైవర్'],
    type: 'navigate_jobs',
    filter: 'Driving',
    reply: 'డ్రైవింగ్ పనులను చూపిస్తున్నాను.',
    replyEn: 'Showing driving jobs.',
  },
  {
    keywords: ['construction', 'నిర్మాణం', 'బిల్డింగ్', 'కట్టడం'],
    type: 'navigate_jobs',
    filter: 'Construction',
    reply: 'నిర్మాణ పనులను చూపిస్తున్నాను.',
    replyEn: 'Showing construction jobs.',
  },
  {
    keywords: ['agriculture', 'farming', 'వ్యవసాయం', 'పొలం'],
    type: 'navigate_jobs',
    filter: 'Agriculture',
    reply: 'వ్యవసాయ పనులను చూపిస్తున్నాను.',
    replyEn: 'Showing agriculture jobs.',
  },
  {
    keywords: ['plumbing', 'ప్లంబింగ్', 'పైపులైన్'],
    type: 'navigate_jobs',
    filter: 'Plumbing',
    reply: 'ప్లంబింగ్ పనులను చూపిస్తున్నాను.',
    replyEn: 'Showing plumbing jobs.',
  },
  {
    keywords: ['electrical', 'electrician', 'ఎలక్ట్రిషన్', 'విద్యుత్'],
    type: 'navigate_jobs',
    filter: 'Electrical',
    reply: 'ఎలక్ట్రికల్ పనులను చూపిస్తున్నాను.',
    replyEn: 'Showing electrical jobs.',
  },
  {
    keywords: ['cleaning', 'housekeeping', 'శుభ్రపరచడం', 'క్లీనింగ్'],
    type: 'navigate_jobs',
    filter: 'Cleaning',
    reply: 'క్లీనింగ్ పనులను చూపిస్తున్నాను.',
    replyEn: 'Showing cleaning jobs.',
  },
  {
    keywords: ['jobs', 'work', 'పనులు', 'పని', 'nearby jobs', 'దగ్గరలో'],
    type: 'navigate_jobs',
    filter: null,    // null = show all jobs, no filter
    reply: 'మీ దగ్గరలో ఉన్న అన్ని పనులను చూపిస్తున్నాను.',
    replyEn: 'Showing all nearby jobs.',
  },

  // ── Page navigation ──
  {
    keywords: ['profile', 'ప్రొఫైల్', 'నా ప్రొఫైల్'],
    type: 'navigate_page',
    path: '/profile',
    reply: 'మీ ప్రొఫైల్ పేజీకి వెళ్తున్నాను.',
    replyEn: 'Opening your profile.',
  },
  {
    keywords: ['home', 'హోమ్', 'గృహం', 'మొదటి పేజీ'],
    type: 'navigate_page',
    path: '/',
    reply: 'హోమ్ పేజీకి వెళ్తున్నాను.',
    replyEn: 'Going home.',
  },
  {
    keywords: ['dashboard', 'డాష్‌బోర్డ్'],
    type: 'navigate_page',
    path: '/dashboard',
    reply: 'డాష్‌బోర్డ్ తెరుస్తున్నాను.',
    replyEn: 'Opening dashboard.',
  },
  {
    keywords: ['post a job', 'post job', 'పని పోస్ట్', 'జాబ్ పోస్ట్'],
    type: 'navigate_page',
    path: '/post-job',
    reply: 'పని పోస్ట్ చేయడానికి వెళ్తున్నాను.',
    replyEn: 'Opening post a job.',
  },
];

// ─── Conversation answers ─────────────────────────────────────────────────────
// Static FAQ-style answers (replace with LLM for dynamic answers)

const CONVERSATION_ANSWERS = [
  {
    keywords: ['niyogax', 'niyoga x', 'నియోగాX', 'ఏమిటి', 'ఏంటి', 'what is'],
    reply: 'NiyogaX అనేది శ్రమికులు మరియు కాంట్రాక్టర్‌లను కలిపే ఒక వేదిక. మీరు ఇక్కడ సులభంగా పని కనుగొనవచ్చు లేదా కార్మికులను నియమించవచ్చు.',
  },
  {
    keywords: ['apply', 'అప్లై', 'పని ఎలా', 'how to apply'],
    reply: 'పని చేయడానికి, ముందు మీ ప్రొఫైల్ పూర్తి చేయండి. తర్వాత Jobs పేజీలో మీకు నచ్చిన పనిని ఎంచుకుని "Apply" నొక్కండి.',
  },
  {
    keywords: ['profile', 'complete profile', 'ప్రొఫైల్ ఎలా', 'పూర్తి'],
    reply: 'ప్రొఫైల్ పూర్తి చేయడానికి: మీ పేరు, నైపుణ్యం, అనుభవం మరియు స్థానం జోడించండి. ఫొటో కూడా జోడిస్తే మీకు ఎక్కువ అవకాశాలు వస్తాయి.',
  },
  {
    keywords: ['payment', 'money', 'జీతం', 'పేమెంట్', 'పైసలు'],
    reply: 'NiyogaX ద్వారా పని పూర్తి చేసిన తర్వాత కాంట్రాక్టర్ నేరుగా మీకు చెల్లిస్తారు. మీ చెల్లింపు వివరాలు సేఫ్‌గా ఉంటాయి.',
  },
  {
    keywords: ['safe', 'sos', 'emergency', 'సురక్షిత', 'అత్యవసరం'],
    reply: 'మీ భద్రత మాకు చాలా ముఖ్యం. SOS బటన్ నొక్కితే వెంటనే మీ అత్యవసర సంప్రదింపు వ్యక్తికి అలర్ట్ వెళ్తుంది.',
  },
];

// ─── Default fallback ─────────────────────────────────────────────────────────

const FALLBACK_REPLY =
  'క్షమించండి, నేను అర్థం చేసుకోలేదు. మీరు "పనులు చూపించు" లేదా "ప్రొఫైల్ తెరు" అని చెప్పగలరా?';

const GREETING_REPLY =
  'నమస్కారం! నేను నియో. మీకు పని కనుగొనడంలో లేదా యాప్ వాడటంలో సహాయం చేయగలను. మీకు ఏ విధమైన పని కావాలి?';

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * handleInput(text)
 *
 * @param {string} text - what the user typed or said
 * @returns {object} intent
 *   { type: 'action', action: object, reply: string }
 *   or
 *   { type: 'conversation', reply: string }
 *   or
 *   { type: 'greeting', reply: string }
 */
function handleInput(text) {
  if (!text) return { type: 'conversation', reply: FALLBACK_REPLY };

  const lower = text.toLowerCase().trim();

  // ── Greeting detection ──
  if (/^(hi|hello|hey|నమస్కారం|హలో|అరె|అరె నియో)/.test(lower)) {
    return { type: 'greeting', reply: GREETING_REPLY };
  }

  // ── Action detection (navigation + job filters) ──
  for (const intent of ACTION_INTENTS) {
    if (intent.keywords.some(kw => lower.includes(kw.toLowerCase()))) {
      return {
        type: 'action',
        action: intent,
        reply: intent.reply,
      };
    }
  }

  // ── Conversation / FAQ detection ──
  for (const qa of CONVERSATION_ANSWERS) {
    if (qa.keywords.some(kw => lower.includes(kw.toLowerCase()))) {
      return { type: 'conversation', reply: qa.reply };
    }
  }

  // ── Fallback ──
  return { type: 'conversation', reply: FALLBACK_REPLY };
}

export { handleInput, GREETING_REPLY, FALLBACK_REPLY };
