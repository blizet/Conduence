from .base import Tool, ToolRegistry
from .coingecko import CoinGeckoPriceTool
from .divergence import DivergenceTool
from .polymarket_data import PolymarketWalletTool
from .polymarket_gamma import PolymarketGammaTool

__all__ = [
    "Tool",
    "ToolRegistry",
    "CoinGeckoPriceTool",
    "DivergenceTool",
    "PolymarketWalletTool",
    "PolymarketGammaTool",
]


def default_registry(simulate: bool = False) -> ToolRegistry:
    """All built-in tools, ready to plug into sub-agents."""
    return ToolRegistry(
        [
            CoinGeckoPriceTool(simulate=simulate),
            PolymarketGammaTool(simulate=simulate),
            PolymarketWalletTool(simulate=simulate),
            DivergenceTool(simulate=simulate),
        ]
    )
