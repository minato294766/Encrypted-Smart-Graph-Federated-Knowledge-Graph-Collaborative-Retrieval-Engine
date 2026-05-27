"""
Chat history router: conversations and messages CRUD.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db
from ..models import ChatConversation, ChatMessage, User
from ..schemas import (
    ChatConversationCreate,
    ChatConversationListResponse,
    ChatConversationResponse,
    ChatMessageCreate,
    ChatMessageResponse,
)

router = APIRouter(prefix="/api/chat-history", tags=["chat-history"])


@router.get("", response_model=ChatConversationListResponse)
def list_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all conversations for the current user."""
    conversations = (
        db.query(ChatConversation)
        .filter(ChatConversation.user_id == current_user.id)
        .order_by(ChatConversation.updated_at.desc())
        .all()
    )
    return ChatConversationListResponse(
        total=len(conversations),
        conversations=[ChatConversationResponse.model_validate(c) for c in conversations],
    )


@router.post("", response_model=ChatConversationResponse)
def create_conversation(
    body: ChatConversationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new conversation."""
    conversation = ChatConversation(
        user_id=current_user.id,
        title=body.title,
        mode=body.mode,
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return ChatConversationResponse.model_validate(conversation)


@router.get("/{conversation_id}", response_model=ChatConversationResponse)
def get_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a conversation with all messages."""
    conversation = (
        db.query(ChatConversation)
        .filter(
            ChatConversation.id == conversation_id,
            ChatConversation.user_id == current_user.id,
        )
        .first()
    )
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )
    return ChatConversationResponse.model_validate(conversation)


@router.delete("/{conversation_id}")
def delete_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a conversation and all its messages."""
    conversation = (
        db.query(ChatConversation)
        .filter(
            ChatConversation.id == conversation_id,
            ChatConversation.user_id == current_user.id,
        )
        .first()
    )
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )
    db.delete(conversation)
    db.commit()
    return {"message": "Conversation deleted"}


@router.post("/{conversation_id}/messages", response_model=ChatMessageResponse)
def add_message(
    conversation_id: int,
    body: ChatMessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a message to a conversation."""
    conversation = (
        db.query(ChatConversation)
        .filter(
            ChatConversation.id == conversation_id,
            ChatConversation.user_id == current_user.id,
        )
        .first()
    )
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    message = ChatMessage(
        conversation_id=conversation_id,
        role=body.role,
        content=body.content,
        confidence=body.confidence,
        evidence_json=body.evidence_json,
    )
    db.add(message)

    # Update conversation title if it's the first user message
    if body.role == "user" and not conversation.messages:
        conversation.title = body.content[:50] + ("..." if len(body.content) > 50 else "")

    # Update conversation timestamp
    conversation.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(message)
    return ChatMessageResponse.model_validate(message)
