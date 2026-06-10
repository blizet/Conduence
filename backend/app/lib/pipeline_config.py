import os

from app.lib.graph_topology import graph_id_for, user_slug_from_node_id

MAIN_USER_NODE_ID = os.getenv("MAIN_USER_NODE_ID", "user_771")
MAIN_USER_SLUG = user_slug_from_node_id(MAIN_USER_NODE_ID)
MAIN_GRAPH_ID = os.getenv("MAIN_GRAPH_ID", graph_id_for(MAIN_USER_SLUG, "main"))
MAIN_AGENT_ID = f"{MAIN_USER_SLUG}.main"

PUBLISHER_USER_NODE_ID = os.getenv("COT_PUBLISHER_USER_ID", "user_117")
SEEKER_USER_NODE_ID = os.getenv("COT_SEEKER_USER_ID", "User_902")

PUBLISHER_USER_SLUG = user_slug_from_node_id(PUBLISHER_USER_NODE_ID)
SEEKER_USER_SLUG = user_slug_from_node_id(SEEKER_USER_NODE_ID)

PUBLISHER_GRAPH_ID = os.getenv(
    "PUBLISHER_GRAPH_ID", graph_id_for(PUBLISHER_USER_SLUG, "publisher")
)
SEEKER_GRAPH_ID = os.getenv("SEEKER_GRAPH_ID", graph_id_for(SEEKER_USER_SLUG, "seeker"))

PUBLISHER_AGENT_ID = f"{PUBLISHER_USER_SLUG}.publisher"
SEEKER_AGENT_ID = f"{SEEKER_USER_SLUG}.seeker"
