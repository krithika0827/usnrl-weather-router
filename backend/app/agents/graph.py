# LangGraph state machine orchestration — Owner: Ryan
from langgraph.graph import StateGraph, START, END

from app.agents.state import ValidationState
from app.agents.specialized.critic import validate_summary_against_route


def build_validation_graph():
    # Creates the LangGraph validation workflow.
    graph = StateGraph(ValidationState)

    # Adds the critic function as one workflow step.
    graph.add_node("critic", validate_summary_against_route)

    # Starts the graph at the critic step.
    graph.add_edge(START, "critic")

    # Ends the graph after the critic step.
    graph.add_edge("critic", END)

    # Compiles the graph so it can run.
    return graph.compile()


validation_graph = build_validation_graph()


def run_validation(route: list, summary: str | None = None) -> list:
    # Runs the validation graph using route and summary data.
    result = validation_graph.invoke({
        "route": route,
        "summary": summary,
        "validation": []
    })

    # Returns the validation findings.
    return result.get("validation", [])