from django.shortcuts import render
import google.generativeai as genai
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from django.conf import settings
import json
from .services import GeminiService

# Create your views here.

@csrf_exempt
def test_gemini(request):
    try:
        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel('gemini-2.5-flash')
        response = model.generate_content("Hello")
        return JsonResponse({
            "success": True,
            "response": response.text
        })
    except Exception as e:
        return JsonResponse({
            "success": False,
            "error": str(e)
        })


@csrf_exempt
def list_models(request):
    try:
        genai.configure(api_key=settings.GEMINI_API_KEY)
        models = []
        for model in genai.list_models():
            if 'generateContent' in model.supported_generation_methods:
                models.append({
                    'name': model.name,
                    'display_name': model.display_name,
                    'supported_generation_methods': list(model.supported_generation_methods),
                })
        return JsonResponse({
            'success': True,
            'count': len(models),
            'models': models,
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e),
        })

@csrf_exempt
@require_POST
def niyo_chat(request):
    try:
        data = json.loads(request.body)
        message = data.get('message', '').strip()
        if not message:
            return JsonResponse({'error': 'Message is required'}, status=400)
            
        reply = GeminiService.generate_chat_reply(message)
        return JsonResponse({'reply': reply})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

