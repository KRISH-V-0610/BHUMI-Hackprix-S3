"""Conversation memory for Bhumi — turns the stateless agent into a chat with context.

Keeps a short rolling window of prior turns per `session_id` so follow-up questions
("what about flooding there?", "and in 2028?") resolve against earlier context.

Storage: an in-process cache for speed, hydrated from MongoDB on a cache miss so threads
survive a server restart (and work across processes). Only the plain user/assistant text is
kept as context — tool-call plumbing is not replayed, which keeps prompts small and robust.
"""
from __future__ import annotations

from db import store

_MEM: dict[str, list[dict]] = {}
_MAX_TURNS = 6                      # remember up to 6 user+assistant pairs
_MAX_MSGS = _MAX_TURNS * 2


def history(session_id: str | None) -> list[dict]:
    """Return prior [{role, content}] for a session (oldest-first). Empty if none."""
    if not session_id:
        return []
    if session_id in _MEM:
        return _MEM[session_id]
    msgs: list[dict] = []
    for d in store.recent_conversation(session_id, _MAX_TURNS):
        if d.get("question"):
            msgs.append({"role": "user", "content": d["question"]})
        if d.get("answer_text"):
            msgs.append({"role": "assistant", "content": d["answer_text"]})
    _MEM[session_id] = msgs
    return msgs


def append(session_id: str | None, user_text: str, assistant_text: str) -> None:
    """Record one completed turn into the rolling in-memory window."""
    if not session_id:
        return
    h = _MEM.setdefault(session_id, [])
    if user_text:
        h.append({"role": "user", "content": user_text})
    if assistant_text:
        h.append({"role": "assistant", "content": assistant_text})
    if len(h) > _MAX_MSGS:
        del h[: len(h) - _MAX_MSGS]


def reset(session_id: str | None) -> None:
    """Clear a session's memory (in-process + persisted)."""
    if not session_id:
        return
    _MEM.pop(session_id, None)
    store.clear_conversation(session_id)
