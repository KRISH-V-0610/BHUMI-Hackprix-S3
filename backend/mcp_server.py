"""Bhumi MCP server — exposes the climate tools over the Model Context Protocol.

This is the same tool registry the in-app agent uses (backend/tools.py), re-exported as a
standards-compliant MCP server. That means ANY MCP client (Claude Desktop, IDE agents,
other LLMs) can drive Bhumi's Hyderabad climate twin — not just our own backend. It's the
"MCP" pillar from the concept art, made real.

Run as a stdio MCP server:
    python backend/mcp_server.py

Register in an MCP client (e.g. Claude Desktop config):
    {
      "mcpServers": {
        "bhumi": { "command": "python", "args": ["D:/Hackathon/ADT/backend/mcp_server.py"] }
      }
    }
"""
from __future__ import annotations

from mcp.server.fastmcp import FastMCP

import tools as toolkit

mcp = FastMCP("bhumi-climate-twin")


@mcp.tool()
def get_layer(layer: str = "heat", year: int = 2026) -> dict:
    """Get the map tile layer (tileUrl + legend) for a climate layer and year.

    layer: one of flood, heat, veg, urban, water, lake. year: 2016 or 2026.
    """
    return toolkit.get_layer(layer, year)


@mcp.tool()
def get_ward_stats(layer: str = "heat", year: int = 2026) -> list:
    """Per-ward 0-100 climate risk scores for a layer/year, sorted worst-first."""
    return toolkit.get_ward_stats(layer, year)


@mcp.tool()
def top_risk_wards(layer: str = "heat", n: int = 5, year: int = 2026) -> list:
    """The N highest-risk Hyderabad wards for a climate layer/year."""
    return toolkit.top_risk_wards(layer, n, year)


@mcp.tool()
def compare_years(layer: str = "heat", y1: int = 2016, y2: int = 2026) -> dict:
    """Compare a climate layer between two years (Time Machine): city + ward deltas."""
    return toolkit.compare_years(layer, y1, y2)


@mcp.tool()
def recommend_actions(layer: str = "heat", wards: list[str] | None = None) -> dict:
    """Concrete municipal interventions for a climate layer, optionally targeting wards."""
    return toolkit.recommend_actions(layer, wards)


@mcp.tool()
def explain_risk(layer: str = "heat") -> dict:
    """Explain the main cause of a given Hyderabad climate risk layer in plain language."""
    return toolkit.explain_risk(layer)


@mcp.tool()
def get_scorecards(year: int = 2026) -> dict:
    """City-wide aggregate climate risk scorecards for Hyderabad for a year."""
    return toolkit.get_scorecards(year)


@mcp.tool()
def simulate_intervention(ward: str, intervention: str = "tree_cover",
                          magnitude: float = 15, year: int = 2026) -> dict:
    """What-if: project how an intervention (tree_cover, cool_roof, permeable_surface,
    drain_desilt, lake_restore) would change a Hyderabad ward's climate risk scores."""
    return toolkit.simulate_intervention(ward, intervention, magnitude, year)


if __name__ == "__main__":
    mcp.run()
