const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
const CHAT_API_URL = `${BACKEND_URL}/api/niyo/chat/`;

const GREETING_REPLY = 'నమస్కారం! నేను నియో. మీకు పని కనుగొనడంలో సహాయం చేయగలను. మీకు ఏ విధమైన పని కావాలి?';
const FALLBACK_REPLY = 'క్షమించండి, నేను అర్థం చేసుకోలేదు. మీరు మళ్ళీ చెప్పగలరా?';

function detectAction(text) {
  const lower = text.toLowerCase().trim();

  // 1. Greetings
  if (/^(hi|hello|hey|నమస్కారం|హలో)/.test(lower)) {
    return { type: 'greeting', reply: GREETING_REPLY };
  }
  // Helpers: detect explicit job-browsing intent (English and Telugu)
  function isExplicitJobBrowseFor(keyword) {
    const verbs = '(?:show|find|open|list|display|search|show me|find me|search for)';
    const exactJobs = new RegExp(`\\b${keyword}\\s+jobs?\\b`);
    const verbThenKeyword = new RegExp(`\\b${verbs}\\b.*\\b${keyword}\\b`);
    const jobsThenKeyword = new RegExp(`\\bjobs?\\b.*\\b${keyword}\\b`);
    return exactJobs.test(lower) || verbThenKeyword.test(lower) || jobsThenKeyword.test(lower);
  }

  function isExplicitJobBrowseForTel(telKeyword) {
    const telJobWords = ['పని', 'పనులు', 'పని చూప', 'చూపించ', 'చూపించండి', 'చూడె', 'చూడు'];
    if (!lower.includes(telKeyword)) return false;
    return telJobWords.some(w => lower.includes(w)) || /\b(షో|షో చేయు|షో చేయండి)\b/.test(lower);
  }

  // 2. Action: Show painting jobs (only when user explicitly asks to browse jobs)
  if (isExplicitJobBrowseFor('painting') || isExplicitJobBrowseForTel('పెయింటింగ్')) {
    return {
      type: 'action',
      action: { type: 'navigate_jobs', filter: 'painting' },
      reply: 'పెయింటింగ్ పనులను చూపిస్తున్నాను.'
    };
  }

  // 3. Action: Show driving jobs (only when user explicitly asks to browse jobs)
  if (isExplicitJobBrowseFor('driving') || isExplicitJobBrowseForTel('డ్రైవింగ్')) {
    return {
      type: 'action',
      action: { type: 'navigate_jobs', filter: 'driving' },
      reply: 'డ్రైవింగ్ పనులను చూపిస్తున్నాను.'
    };
  }

  // 4. Action: Show agriculture jobs (farming / agriculture) (only on explicit browse requests)
  if (
    isExplicitJobBrowseFor('farming') ||
    isExplicitJobBrowseFor('agriculture') ||
    isExplicitJobBrowseForTel('వ్యవసాయం') ||
    isExplicitJobBrowseForTel('వ్యవసాయ')
  ) {
    return {
      type: 'action',
      action: { type: 'navigate_jobs', filter: 'farming' },
      reply: 'వ్యవసాయ పనులను చూపిస్తున్నాను.'
    };
  }

  // 5. Action: Open profile
  if (lower.includes('profile') || lower.includes('ప్రొఫైల్')) {
    return {
      type: 'action',
      action: { type: 'navigate_page', path: '/profile' },
      reply: 'ప్రొఫైల్ తెరుస్తున్నాను.'
    };
  }

  // 6. Action: Open dashboard
  if (lower.includes('dashboard') || lower.includes('డాష్‌బోర్డ్')) {
    return {
      type: 'action',
      action: { type: 'navigate_page', path: '/dashboard' },
      reply: 'డాష్‌బోర్డ్ తెరుస్తున్నాను.'
    };
  }

  // 7. Action: Go home
  if (lower.includes('home') || lower.includes('హోమ్') || lower.includes('ఇల్లు') || lower.includes('ఇంటికి')) {
    return {
      type: 'action',
      action: { type: 'navigate_page', path: '/' },
      reply: 'హోమ్ పేజీకి వెళ్తున్నాను.'
    };
  }

  // 8. Action: Post a job
  if (
    lower.includes('post a job') ||
    lower.includes('post job') ||
    lower.includes('పని పోస్ట్') ||
    lower.includes('జాబ్ పోస్ట్') ||
    lower.includes('పనిని పోస్ట్')
  ) {
    return {
      type: 'action',
      action: { type: 'navigate_page', path: '/post-job' },
      reply: 'పనిని పోస్ట్ చేసే విభాగానికి వెళ్తున్నాను.'
    };
  }

  // Fallbacks for other categories if the user mentions them
  if (isExplicitJobBrowseFor('construction') || isExplicitJobBrowseForTel('నిర్మాణం')) {
    return {
      type: 'action',
      action: { type: 'navigate_jobs', filter: 'construction' },
      reply: 'నిర్మాణ పనులను చూపిస్తున్నాను.'
    };
  }
  if (isExplicitJobBrowseFor('mechanic') || isExplicitJobBrowseForTel('మెకానిక్')) {
    return {
      type: 'action',
      action: { type: 'navigate_jobs', filter: 'mechanic' },
      reply: 'మెకానిక్ పనులను చూపిస్తున్నాను.'
    };
  }
  if (isExplicitJobBrowseFor('cleaning') || isExplicitJobBrowseForTel('క్లీనింగ్')) {
    return {
      type: 'action',
      action: { type: 'navigate_jobs', filter: 'cleaning' },
      reply: 'క్లీనింగ్ పనులను చూపిస్తున్నాను.'
    };
  }
  if (isExplicitJobBrowseFor('plumbing') || isExplicitJobBrowseForTel('ప్లంబింగ్')) {
    return {
      type: 'action',
      action: { type: 'navigate_jobs', filter: 'plumbing' },
      reply: 'ప్లంబింగ్ పనులను చూపిస్తున్నాను.'
    };
  }
  if (isExplicitJobBrowseFor('electrical') || isExplicitJobBrowseForTel('ఎలక్ట్రికల్')) {
    return {
      type: 'action',
      action: { type: 'navigate_jobs', filter: 'electrical' },
      reply: 'ఎలక్ట్రికల్ పనులను 보여ిస్తున్నాను.'
    };
  }

  // Generic "jobs" request: only navigate if user explicitly asks to browse jobs or input is very short (e.g., "jobs", "పని")
  const explicitJobsRequest = /\b(?:show|find|open|list|display|search|show me|find me|search for)\b.*\b(jobs?|పని|పనులు)\b/.test(lower) || /^\s*(jobs?|పని|పనులు)\s*$/.test(lower);
  if (explicitJobsRequest) {
    return {
      type: 'action',
      action: { type: 'navigate_jobs', filter: null },
      reply: 'అన్ని పనులను చూపిస్తున్నాను.'
    };
  }

  return null;
}

async function handleInput(text) {
  if (!text) return { type: 'conversation', reply: FALLBACK_REPLY };

  // 1. Detect action locally first (do not send action inputs to Gemini)
  const actionIntent = detectAction(text);
  if (actionIntent) {
    return actionIntent;
  }

  // 2. If it's not a local action, send to Django backend for conversational intelligence
  try {
    const response = await fetch(CHAT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: text })
    });

    if (!response.ok) {
      console.error('Django Niyo backend API error:', response.status);
      return { type: 'conversation', reply: FALLBACK_REPLY };
    }

    const data = await response.json();
    return {
      type: 'conversation',
      reply: data.reply || FALLBACK_REPLY
    };

  } catch (error) {
    console.error('Error contacting Django Niyo backend:', error);
    return { type: 'conversation', reply: FALLBACK_REPLY };
  }
}

export { handleInput, GREETING_REPLY, FALLBACK_REPLY };
