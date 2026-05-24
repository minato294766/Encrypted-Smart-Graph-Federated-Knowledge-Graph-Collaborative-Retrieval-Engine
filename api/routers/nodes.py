"""
Nodes router: register, list, apply for center status, approve/reject.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db
from ..models import Node, User
from ..schemas import (
    NodeApplyCenter,
    NodeApprove,
    NodeListResponse,
    NodeRegister,
    NodeResponse,
)

router = APIRouter(prefix="/api/nodes", tags=["nodes"])


@router.post("/register", response_model=NodeResponse)
def register_node(
    body: NodeRegister,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    node_id = f"node-{uuid.uuid4().hex[:12]}"
    node = Node(
        node_id=node_id,
        name=body.name,
        node_type=body.node_type,
        endpoint_url=body.endpoint_url,
        description=body.description,
        status="active" if body.node_type == "edge" else "pending",
    )
    db.add(node)
    db.commit()
    db.refresh(node)

    current_user.node_id = node_id
    db.commit()

    return NodeResponse.model_validate(node)


@router.get("/", response_model=NodeListResponse)
def list_nodes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    nodes = db.query(Node).order_by(Node.registered_at.desc()).all()
    return NodeListResponse(
        total=len(nodes),
        nodes=[NodeResponse.model_validate(n) for n in nodes],
    )


@router.get("/{node_id}", response_model=NodeResponse)
def get_node(
    node_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    node = db.query(Node).filter(Node.node_id == node_id).first()
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Node not found")
    return NodeResponse.model_validate(node)


@router.post("/{node_id}/apply-center")
def apply_center(
    node_id: str,
    body: NodeApplyCenter,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    node = db.query(Node).filter(Node.node_id == node_id).first()
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Node not found")
    if node.node_type != "edge":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only edge nodes can apply")

    node.center_application = body.reason
    node.status = "pending"
    db.commit()

    return {"detail": "Application submitted", "node_id": node_id}


@router.put("/{node_id}/approve", response_model=NodeResponse)
def approve_node(
    node_id: str,
    body: NodeApprove,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")

    node = db.query(Node).filter(Node.node_id == node_id).first()
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Node not found")

    if body.approved:
        node.node_type = "center"
        node.status = "active"
    else:
        node.status = "active"  # stays edge node
        node.center_application = None

    db.commit()
    db.refresh(node)
    return NodeResponse.model_validate(node)
