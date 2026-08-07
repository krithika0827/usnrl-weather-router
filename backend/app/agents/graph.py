# LangGraph state machine orchestration — Owner: Ryan

from typing import Any

from langgraph.graph import END, START, StateGraph

from app.agents.specialized.critic import validate_summary_against_route
from app.agents.specialized.generator import generate_weather_summary
from app.agents.state import ValidationState
from app.models.weather_data import SummaryMode


def _summary_mode_value(mode: Any) -> str:
    # Converts SummaryMode enum values or strings into a plain string.
    if hasattr(mode, "value"):
        return mode.value

    if mode is None:
        return SummaryMode.deterministic.value

    return str(mode)


def _has_summary_validation_warning(state: ValidationState) -> str:
    # Uses a conditional edge after the critic node.
    # Gemini should fall back only when the summary itself has a validation warning.
    summary_mode = _summary_mode_value(state.get("summary_mode"))

    if summary_mode != SummaryMode.gemini.value:
        return "end"

    for finding in state.get("validation", []):
        if (
            finding.get("field") == "summary"
            and finding.get("severity") in {"warning", "error"}
        ):
            return "fallback"

    return "end"


def _deterministic_summary_fallback(state: ValidationState) -> dict:
    # Regenerates the summary using the deterministic generator.
    summary = generate_weather_summary(
        state.get("route", []),
        vehicle_name=state.get("vehicle_name"),
        route_name=state.get("route_name"),
    )

    return {
        "summary": summary,
        "summary_mode": SummaryMode.deterministic.value,
        "validation": [],
        "summary_fallback_warning": (
            "Gemini summary failed validation; generated the deterministic summary instead."
        ),
    }


def build_validation_graph():
    # Creates the LangGraph validation workflow.
    graph = StateGraph(ValidationState)

    # Adds the critic function as one workflow step.
    graph.add_node("critic", validate_summary_against_route)

    # Adds deterministic fallback as a graph node.
    graph.add_node("deterministic_fallback", _deterministic_summary_fallback)

    # Starts the graph at the critic step.
    graph.add_edge(START, "critic")

    # If Gemini summary has summary warnings, fall back to deterministic.
    graph.add_conditional_edges(
        "critic",
        _has_summary_validation_warning,
        {
            "fallback": "deterministic_fallback",
            "end": END,
        },
    )

    # After fallback, validate the deterministic summary too.
    graph.add_edge("deterministic_fallback", "critic")

    # Compiles the graph so it can run.
    return graph.compile()


validation_graph = build_validation_graph()


def run_validation(route: list, summary: str | None = None) -> list:
    # Runs the validation graph using route and summary data.
    result = validation_graph.invoke({
        "route": route,
        "summary": summary,
        "validation": [],
        "summary_mode": SummaryMode.deterministic.value,
    })

    # Returns the validation findings.
    return result.get("validation", [])


def run_validation_with_summary_fallback(
    route: list,
    summary: str | None = None,
    summary_mode: SummaryMode | str = SummaryMode.deterministic,
    vehicle_name: str | None = None,
    route_name: str | None = None,
) -> dict:
    # Runs validation and lets the graph replace a bad Gemini summary if needed.
    result = validation_graph.invoke({
        "route": route,
        "summary": summary,
        "validation": [],
        "summary_mode": _summary_mode_value(summary_mode),
        "vehicle_name": vehicle_name,
        "route_name": route_name,
    })

    validation = result.get("validation", [])

    if result.get("summary_fallback_warning"):
        validation.insert(0, {
            "severity": "warning",
            "field": "summary",
            "message": result["summary_fallback_warning"],
        })

    return {
        "summary": result.get("summary"),
        "summary_mode": result.get("summary_mode", _summary_mode_value(summary_mode)),
        "validation": validation,
    }