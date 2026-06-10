import os

from app.lib.pipeline_config import (
    MAIN_AGENT_ID,
    MAIN_GRAPH_ID,
    PUBLISHER_AGENT_ID,
    PUBLISHER_GRAPH_ID,
    SEEKER_AGENT_ID,
    SEEKER_GRAPH_ID,
)

MARKET_SIGNALS_TOPIC = os.getenv("MARKET_SIGNALS_TOPIC", "market.signals.public")

KAFKA_HEADER_PUBLISHER_ID = "publisher_id"
KAFKA_HEADER_SEEKER_ID = "seeker_id"
KAFKA_HEADER_AGENT_ROLE = "agent_role"

PUBLISHER_WORKER_GROUP = os.getenv("PUBLISHER_WORKER_GROUP_ID", "cot-publisher-worker")
SEEKER_WORKER_GROUP = os.getenv("SEEKER_WORKER_GROUP_ID", "cot-seeker-worker")
MAIN_WORKER_GROUP = os.getenv("MAIN_WORKER_GROUP_ID", "cot-main-worker")

EVENT_TYPE_COT_DELTA = "cot.delta"

WORKER_TARGETS = {
    "publisher": {"agentId": PUBLISHER_AGENT_ID, "graphId": PUBLISHER_GRAPH_ID},
    "seeker": {"agentId": SEEKER_AGENT_ID, "graphId": SEEKER_GRAPH_ID},
    "main": {"agentId": MAIN_AGENT_ID, "graphId": MAIN_GRAPH_ID},
}
