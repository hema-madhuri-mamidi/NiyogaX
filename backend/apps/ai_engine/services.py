import google.generativeai as genai
from django.conf import settings

class GeminiService:
    @staticmethod
    def generate_chat_reply(message: str) -> str:
        if not settings.GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY is not set in backend settings.")

        # Niyo system prompt guidelines
        system_instruction = (
            "You are Niyo.\n"
            "You are the Telugu AI assistant of NiyogaX.\n"
            "Responsibilities:\n"
            "- Help workers find jobs.\n"
            "- Help workers understand the platform.\n"
            "- Help workers improve skills.\n"
            "- Provide career guidance.\n"
            "- Suggest learning paths.\n"
            "- Explain app features.\n"
            "- Help users grow professionally.\n\n"
            "Rules:\n"
            "- Understand Telugu.\n"
            "- Understand English.\n"
            "- Understand Telugu-English mixed language.\n"
            "- Respond in simple Telugu.\n"
            "- Be friendly.\n"
            "- Be encouraging.\n"
            "- Avoid formal Telugu.\n"
            "- Avoid corporate language.\n"
            "- Keep replies short, conversational, and easy to read/speak aloud (speech synthesis friendly)."
        )

        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel(
            model_name='gemini-2.5-flash',
            system_instruction=system_instruction
        )
        
        response = model.generate_content(message)
        return response.text.strip()
