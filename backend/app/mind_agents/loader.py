"""Dynamic import of mind agents from agents/{agentId}/agent.py (cry-style folders)."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

_REPO_ROOT = Path(__file__).resolve().parents[3]
_AGENTS_ROOT = _REPO_ROOT / "agents"

_MODULE_CACHE: dict[str, ModuleType] = {}


def agents_root() -> Path:
    return _AGENTS_ROOT


def _load_agent_folder(agent_folder: str) -> ModuleType:
    if agent_folder in _MODULE_CACHE:
        return _MODULE_CACHE[agent_folder]

    folder = _AGENTS_ROOT / agent_folder
    agent_path = folder / "agent.py"
    if not agent_path.exists():
        raise FileNotFoundError(f"Mind agent not found: {agent_path}")

    folder_str = str(folder)
    if folder_str not in sys.path:
        sys.path.insert(0, folder_str)

    spec = importlib.util.spec_from_file_location(f"mind_agent.{agent_folder}", agent_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load mind agent module: {agent_path}")

    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    _MODULE_CACHE[agent_folder] = module
    return module


def _load_news_support_module(module_name: str) -> ModuleType:
    cache_key = f"newsAgent.{module_name}"
    if cache_key in _MODULE_CACHE:
        return _MODULE_CACHE[cache_key]

    folder = _AGENTS_ROOT / "newsAgent"
    path = folder / f"{module_name}.py"
    folder_str = str(folder)
    if folder_str not in sys.path:
        sys.path.insert(0, folder_str)

    spec = importlib.util.spec_from_file_location(cache_key, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load module: {path}")

    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    _MODULE_CACHE[cache_key] = module
    return module


def get_news_agent():
    return _load_agent_folder("newsAgent").news_agent


def get_arbitrage_agent():
    return _load_agent_folder("arbitrageAgent").arbitrage_agent


def get_coindesk_module() -> ModuleType:
    return _load_news_support_module("coindesk")
