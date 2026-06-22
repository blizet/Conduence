"""
A tiny provider-agnostic wrapper so `chat_agent.py` can call "the LLM"
without caring whether that's Anthropic, OpenAI, or Gemini under the hood.

Each provider has a very different SDK shape (Claude wants `system` as a
top-level kwarg and "assistant" role messages; OpenAI wants a "system" role
message in the list; Gemini wants `system_instruction` in a config object
and uses "model" instead of "assistant" as the role) -- that's all
normalized away here so the rest of the app just sees:

    generate_reply(settings, system_prompt, conversation_messages) -> str

where `conversation_messages` is always a plain list of
{"role": "user" | "assistant", "content": str} dicts, oldest first.
"""
from __future__ import annotations

from config import Settings

MAX_TOKENS = 1024


def generate_reply(
    settings: Settings,
    *,
    system_prompt: str,
    messages: list[dict[str, str]],
) -> str:
    if settings.llm_provider == "anthropic":
        return _generate_anthropic(settings, system_prompt, messages)
    if settings.llm_provider == "openai":
        return _generate_openai(settings, system_prompt, messages)
    if settings.llm_provider == "gemini":
        return _generate_gemini(settings, system_prompt, messages)
    raise ValueError(f"Unsupported LLM provider: {settings.llm_provider}")


def _generate_anthropic(settings: Settings, system_prompt: str, messages: list[dict[str, str]]) -> str:
    import anthropic

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    response = client.messages.create(
        model=settings.model,
        max_tokens=MAX_TOKENS,
        system=system_prompt,
        messages=messages,
    )
    return "".join(block.text for block in response.content if block.type == "text").strip()


def _generate_openai(settings: Settings, system_prompt: str, messages: list[dict[str, str]]) -> str:
    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key)
    full_messages = [{"role": "system", "content": system_prompt}, *messages]
    response = client.chat.completions.create(
        model=settings.model,
        max_tokens=MAX_TOKENS,
        messages=full_messages,
    )
    return (response.choices[0].message.content or "").strip()


def _generate_gemini(settings: Settings, system_prompt: str, messages: list[dict[str, str]]) -> str:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=settings.gemini_api_key)

    # Gemini uses "model" instead of "assistant" for the assistant role,
    # and expects each turn's text wrapped in a "parts" list.
    contents = [
        {
            "role": "model" if message["role"] == "assistant" else "user",
            "parts": [{"text": message["content"]}],
        }
        for message in messages
    ]

    response = client.models.generate_content(
        model=settings.model,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            max_output_tokens=MAX_TOKENS,
        ),
    )
    return (response.text or "").strip()
