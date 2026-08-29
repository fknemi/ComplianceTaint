"""
graph/broker.py

Derives implicit Kafka and Redis edges by parsing get_file() summaries
for topic and channel references, then matching publishers to subscribers.

No hardcoded service names, topic strings, or function names — everything
is extracted from what the API reports about each file's summary.

Each edge carries the specific publisher function name extracted from the
summary (e.g. publishTransaction, syncConfigToRedis) so the builder can
wire a function-level source node rather than a file-level one.
"""


import re
import logging
from typing import Dict, List, Set, Tuple, Any, Optional

from mcp.client import get_file

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Patterns — each captures (function_name, topic_or_channel_name)
# Matched against get_file() summaries (markdown prose with backtick names).
# ---------------------------------------------------------------------------

_PUBLISH_PATTERNS: List[str] = [
    # `publishTransaction(txn)`: Dispatches ... to the `transactions.completed` Kafka topic
    r"`(\w+)[^`]*`[^.\n]*?dispatches?\s+(?:.*?)\s+to\s+(?:the\s+)?`([\w.]+)`",
    # `publishTransaction`: ... publishes ... to the `transactions.completed` topic
    r"`(\w+)[^`]*`[^.\n]*?publish(?:es|ing)?\s+(?:.*?)\s+to\s+(?:the\s+)?`([\w.]+)`",
    # `syncConfigToRedis()`: Broadcasts ... to the `config.updates` Redis channel
    r"`(\w+)[^`]*`[^.\n]*?broadcasts?\s+(?:.*?)\s+to\s+(?:the\s+)?`([\w.]+)`",
    # `fn`: ... sends ... to the `channel.name` channel
    r"`(\w+)[^`]*`[^.\n]*?sends?\s+(?:.*?)\s+to\s+(?:the\s+)?`([\w.]+)`\s+(?:redis\s+)?channel",
    # `fn`: ... writes/emits ... to the `topic.name` topic
    r"`(\w+)[^`]*`[^.\n]*?(?:writes?|emits?)\s+(?:.*?)\s+to\s+(?:the\s+)?`([\w.]+)`\s+(?:kafka\s+)?topic",
]

_CONSUME_PATTERNS: List[str] = [
    # `consumeTransactions()`: Subscribes to the `transactions.completed` topic
    r"`(\w+)[^`]*`[^.\n]*?subscribes?\s+to\s+(?:the\s+)?`([\w.]+)`",
    # `fn`: ... consumes ... from the `topic.name` topic
    r"`(\w+)[^`]*`[^.\n]*?consumes?\s+(?:.*?)\s+from\s+(?:the\s+)?`([\w.]+)`",
    # `fn`: ... listens to the `channel.name` channel
    r"`(\w+)[^`]*`[^.\n]*?listens?\s+(?:to\s+)?(?:the\s+)?`([\w.]+)`",
    # `readRedisConfig()`: ... receives ... from the `config.updates` channel
    r"`(\w+)[^`]*`[^.\n]*?receives?\s+(?:.*?)\s+(?:from\s+)?(?:the\s+)?`([\w.]+)`\s+channel",
    # `fn`: ... reads from the `channel.name` channel
    r"`(\w+)[^`]*`[^.\n]*?reads?\s+(?:.*?)\s+(?:from\s+)?(?:the\s+)?`([\w.]+)`\s+channel",
]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_file_summary(
    project_id: str,
    path: str,
    branch: str,
    api_key: Optional[str] = None,
) -> str:
    try:
        result = get_file(project_id, path, branch, api_key=api_key)
        if isinstance(result, dict):
            return result.get("summary", "")
    except Exception as exc:
        logger.warning("get_file failed for %s: %s", path, exc)
    return ""


def _extract_function_topic_pairs(
    summary: str, patterns: List[str]
) -> List[Tuple[str, str]]:
    found = []
    for pattern in patterns:
        for match in re.finditer(pattern, summary, re.IGNORECASE):  # no DOTALL
            func = match.group(1).strip()
            topic = match.group(2).strip()
            if func and topic and "." in topic:
                found.append((func, topic))
    return found

def _resolve_flow_type(
    topic: str, kafka_topics: Set[str], redis_channels: Set[str]
) -> str:
    if topic in kafka_topics:
        return "kafka"
    if topic in redis_channels:
        return "redis"
    return "implicit"


def _extract_broker_topics_from_configs(
    project_id: str,
    branch: str,
    api_key: Optional[str] = None,
) -> Tuple[Set[str], Set[str]]:
    """
    Read kafka.config.js and redis.config.js summaries to extract
    known topic and channel names (backtick-quoted strings containing dots).
    """
    kafka_topics: Set[str] = set()
    redis_channels: Set[str] = set()

    kafka_summary = _get_file_summary(
        project_id, "config/kafka.config.js", branch, api_key
    )
    for match in re.finditer(r"`([\w]+\.[\w.]+)`", kafka_summary):
        kafka_topics.add(match.group(1))

    redis_summary = _get_file_summary(
        project_id, "config/redis.config.js", branch, api_key
    )
    for match in re.finditer(r"`([\w]+\.[\w.]+)`", redis_summary):
        redis_channels.add(match.group(1))

    logger.info("Kafka topics from config:  %s", kafka_topics)
    logger.info("Redis channels from config: %s", redis_channels)

    return kafka_topics, redis_channels


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def derive_implicit_edges(
    project_id: str,
    branch: str,
    file_paths: List[str],
    api_key: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Scan each service file's get_file() summary for publish/subscribe
    language referencing known broker topics and channels.

    Returns a list of edge dicts:
        {
            src_file:       str,          # publishing file path
            src_func:       str | None,   # specific publisher function (if extracted)
            dst:            str,          # subscribing file path
            data_flow_type: str,          # "kafka" | "redis" | "implicit"
            topic:          str,          # topic or channel name
        }
    """
    kafka_topics, redis_channels = _extract_broker_topics_from_configs(
        project_id, branch, api_key
    )

    # Skip config files, test files, shared infrastructure
    service_files = [
        p for p in file_paths
        if not p.startswith("config/")
        and not p.startswith("tests/")
        and not p.startswith("services/shared/")
    ]

    # topic -> [(file_path, func_name)]
    publishers: Dict[str, List[Tuple[str, str]]] = {}
    subscribers: Dict[str, List[Tuple[str, str]]] = {}

    for file_path in service_files:
        summary = _get_file_summary(project_id, file_path, branch, api_key)
        if not summary:
            continue

        for func, topic in _extract_function_topic_pairs(summary, _PUBLISH_PATTERNS):
            publishers.setdefault(topic, []).append((file_path, func))
            logger.info("  PUBLISHES %s via %s(): %s", topic, func, file_path)

        for func, topic in _extract_function_topic_pairs(summary, _CONSUME_PATTERNS):
            subscribers.setdefault(topic, []).append((file_path, func))
            logger.info("  SUBSCRIBES %s via %s(): %s", topic, func, file_path)

    # Wire publisher → subscriber for each topic
    edges: List[Dict[str, Any]] = []
    all_topics_seen = set(publishers) | set(subscribers)

    for topic in all_topics_seen:
        flow_type = _resolve_flow_type(topic, kafka_topics, redis_channels)
        for src_file, src_func in publishers.get(topic, []):
            for dst_file, _dst_func in subscribers.get(topic, []):
                if src_file != dst_file:
                    edges.append({
                        "src_file":       src_file,
                        "src_func":       src_func or None,
                        "dst":            dst_file,
                        "data_flow_type": flow_type,
                        "topic":          topic,
                    })
                    logger.info(
                        "Derived implicit edge: %s::%s -> %s [%s] via %s",
                        src_file, src_func, dst_file, flow_type, topic,
                    )

    return edges
