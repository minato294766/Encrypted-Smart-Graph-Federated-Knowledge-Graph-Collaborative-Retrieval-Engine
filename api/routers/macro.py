"""
Macro router: macro platform data APIs for dashboard visualization.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db
from ..models import Cluster, ClusterFile, Node, QueryLog, User

router = APIRouter(prefix="/api/macro", tags=["macro"])


@router.get("/nodes")
def get_macro_nodes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all nodes with their positions for 3D map visualization."""
    nodes = db.query(Node).filter(Node.status == "active").all()
    result = []
    for i, node in enumerate(nodes):
        # Generate position for 3D map (x, y, z)
        radius = 8
        x = radius * (i % 3 - 1)
        z = radius * (i // 3 - 1)
        result.append({
            "id": node.node_id,
            "label": node.name,
            "labelCode": f"SECTOR-{i+1:02d}",
            "position": [x, 0, z],
            "isHome": node.node_id == current_user.node_id,
            "nodeType": node.node_type,
        })
    return {"nodes": result}


@router.get("/search-frequency")
def get_search_frequency(
    period: str = Query("today", pattern="^(today|week|month|quarter|year)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get search frequency ranking by period."""
    now = datetime.now(timezone.utc)

    if period == "today":
        start_time = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        start_time = now - timedelta(days=7)
    elif period == "month":
        start_time = now - timedelta(days=30)
    elif period == "quarter":
        start_time = now - timedelta(days=90)
    else:  # year
        start_time = now - timedelta(days=365)

    # Query search counts per user
    from sqlalchemy import func
    search_counts = (
        db.query(
            User.username,
            func.count(QueryLog.id).label("count"),
        )
        .join(QueryLog, QueryLog.user_id == User.id)
        .filter(QueryLog.created_at >= start_time)
        .group_by(User.username)
        .order_by(func.count(QueryLog.id).desc())
        .limit(5)
        .all()
    )

    result = [
        {"name": username, "value": count}
        for username, count in search_counts
    ]

    # Add current user if not in top 5
    current_user_in_list = any(r["name"] == current_user.username for r in result)
    if not current_user_in_list:
        user_count = (
            db.query(func.count(QueryLog.id))
            .filter(
                QueryLog.user_id == current_user.id,
                QueryLog.created_at >= start_time,
            )
            .scalar()
        ) or 0
        result.insert(0, {"name": current_user.username, "value": user_count})

    return {"period": period, "rankings": result}


@router.get("/node-contributions")
def get_node_contributions(
    period: str = Query("recent", pattern="^(recent|24h|7d|30d)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get node contribution curves over time."""
    now = datetime.now(timezone.utc)

    if period == "24h":
        start_time = now - timedelta(hours=24)
        intervals = 7
    elif period == "7d":
        start_time = now - timedelta(days=7)
        intervals = 7
    elif period == "30d":
        start_time = now - timedelta(days=30)
        intervals = 7
    else:  # recent
        start_time = now - timedelta(days=1)
        intervals = 5

    from sqlalchemy import func

    # Get all active nodes
    nodes = db.query(Node).filter(Node.status == "active").all()

    result = {}
    for node in nodes:
        # Get query counts per interval
        user = db.query(User).filter(User.node_id == node.node_id).first()
        if not user:
            continue

        interval_duration = (now - start_time) / intervals
        series = []
        for i in range(intervals):
            interval_start = start_time + interval_duration * i
            interval_end = start_time + interval_duration * (i + 1)
            count = (
                db.query(func.count(QueryLog.id))
                .filter(
                    QueryLog.user_id == user.id,
                    QueryLog.created_at >= interval_start,
                    QueryLog.created_at < interval_end,
                )
                .scalar()
            ) or 0
            series.append(count)

        result[node.node_id] = {
            "label": node.name,
            "series": series,
        }

    return {"period": period, "contributions": result}


@router.get("/word-cloud")
def get_word_cloud(
    node_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get word cloud data for a specific node or all nodes."""
    from sqlalchemy import func

    # Get recent queries
    query_filter = db.query(QueryLog)
    if node_id:
        user = db.query(User).filter(User.node_id == node_id).first()
        if user:
            query_filter = query_filter.filter(QueryLog.user_id == user.id)

    recent_queries = (
        query_filter
        .order_by(QueryLog.created_at.desc())
        .limit(100)
        .all()
    )

    # Extract keywords from questions
    import jieba
    word_freq = {}
    for query in recent_queries:
        words = jieba.cut(query.question)
        for word in words:
            word = word.strip()
            if len(word) >= 2:
                word_freq[word] = word_freq.get(word, 0) + 1

    # Sort by frequency and take top 30
    sorted_words = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)[:30]

    # Build word cloud data
    if sorted_words:
        max_weight = sorted_words[0][1]
        word_cloud = [
            {"text": word, "weight": max(30, int(98 * count / max_weight))}
            for word, count in sorted_words
        ]
    else:
        word_cloud = []

    return {"nodeId": node_id, "words": word_cloud}


@router.get("/updates")
def get_updates(
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get recent updates timeline."""
    from ..models import Cluster, ClusterFile

    updates = []

    # Get recent cluster creations
    clusters = (
        db.query(Cluster)
        .order_by(Cluster.created_at.desc())
        .limit(limit // 2)
        .all()
    )
    for cluster in clusters:
        user = db.query(User).filter(User.id == cluster.user_id).first()
        updates.append({
            "id": f"cluster-{cluster.id}",
            "actor": user.username if user else "unknown",
            "action": f"新建了聚类《{cluster.name}》",
            "type": "cluster",
            "createdAt": cluster.created_at.isoformat(),
        })

    # Get recent file uploads
    files = (
        db.query(ClusterFile)
        .order_by(ClusterFile.uploaded_at.desc())
        .limit(limit // 2)
        .all()
    )
    for file in files:
        cluster = db.query(Cluster).filter(Cluster.id == file.cluster_id).first()
        user = db.query(User).filter(User.id == cluster.user_id).first() if cluster else None
        updates.append({
            "id": f"file-{file.id}",
            "actor": user.username if user else "unknown",
            "action": f"上传了文件《{file.filename}》",
            "type": "file",
            "createdAt": file.uploaded_at.isoformat(),
        })

    # Sort by time
    updates.sort(key=lambda x: x["createdAt"], reverse=True)
    updates = updates[:limit]

    return {"updates": updates}
