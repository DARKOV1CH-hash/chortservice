import asyncio
import json
from typing import Any

import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from src.redis.client import redis_service

logger = structlog.get_logger(__name__)

router = APIRouter()


class ConnectionManager:
    """Manages WebSocket connections and broadcasts."""

    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self.user_connections: dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_email: str):
        """Accept and register new connection."""
        await websocket.accept()
        self.active_connections.append(websocket)
        self.user_connections[user_email] = websocket
        
        logger.info(
            "WebSocket connected",
            user=user_email,
            total_connections=len(self.active_connections)
        )

    def disconnect(self, websocket: WebSocket, user_email: str | None = None):
        """Remove connection."""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        
        if user_email and user_email in self.user_connections:
            del self.user_connections[user_email]
        
        logger.info(
            "WebSocket disconnected",
            user=user_email,
            total_connections=len(self.active_connections)
        )

    async def broadcast(self, message: dict[str, Any]):
        """Broadcast message to all connected clients."""
        disconnected = []
        
        for connection in self.active_connections:
            try:
                if connection.client_state == WebSocketState.CONNECTED:
                    await connection.send_json(message)
                else:
                    disconnected.append(connection)
            except Exception as e:
                logger.error("Error broadcasting to client", error=str(e))
                disconnected.append(connection)
        
        # Clean up disconnected clients
        for conn in disconnected:
            if conn in self.active_connections:
                self.active_connections.remove(conn)

    async def send_personal(self, message: dict[str, Any], user_email: str):
        """Send message to specific user."""
        if user_email in self.user_connections:
            connection = self.user_connections[user_email]
            try:
                if connection.client_state == WebSocketState.CONNECTED:
                    await connection.send_json(message)
            except Exception as e:
                logger.error("Error sending personal message", user=user_email, error=str(e))


manager = ConnectionManager()


async def redis_listener():
    """
    Listen to Redis pub/sub and broadcast to WebSocket clients.

    Subscribes to: servers, domains, assignments channels.
    """
    await redis_service.initialize()
    client = redis_service.client
    pubsub = client.pubsub()
    
    await pubsub.subscribe("servers", "domains", "assignments")
    
    logger.info("Redis listener started")
    
    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                channel = message["channel"]
                data = json.loads(message["data"])
                
                logger.debug(
                    "Redis message received",
                    channel=channel,
                    action=data.get("action")
                )
                
                # Broadcast to all WebSocket clients
                await manager.broadcast({
                    "channel": channel,
                    "data": data,
                })
    except Exception as e:
        logger.error("Redis listener error", error=str(e))
    finally:
        await pubsub.unsubscribe("servers", "domains", "assignments")
        await pubsub.close()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time updates.
    
    Authentication is done via query param: /ws?token=<jwt_token>
    Or via cookie session.
    """
    # Get user from query params or session
    # For simplicity, we'll use a basic authentication via query
    token = websocket.query_params.get("token")
    user_email = websocket.query_params.get("user", "anonymous")
    
    # TODO: Properly verify JWT token here
    # For now, accept connection
    
    await manager.connect(websocket, user_email)
    
    try:
        # Send initial connection confirmation
        await websocket.send_json({
            "type": "connected",
            "message": "WebSocket connection established",
            "user": user_email,
        })
        
        # Keep connection alive and handle incoming messages
        while True:
            try:
                data = await websocket.receive_json()
                
                # Handle different message types
                msg_type = data.get("type")
                
                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
                
                elif msg_type == "subscribe":
                    # Client wants to subscribe to specific channels
                    channels = data.get("channels", [])
                    await websocket.send_json({
                        "type": "subscribed",
                        "channels": channels,
                    })
                
                elif msg_type == "lock_acquired":
                    # Notify other clients about lock
                    await manager.broadcast({
                        "channel": "locks",
                        "data": {
                            "action": "acquired",
                            "resource": data.get("resource"),
                            "user": user_email,
                        }
                    })
                
                elif msg_type == "lock_released":
                    # Notify other clients about lock release
                    await manager.broadcast({
                        "channel": "locks",
                        "data": {
                            "action": "released",
                            "resource": data.get("resource"),
                            "user": user_email,
                        }
                    })
                
            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.error("WebSocket message error", user=user_email, error=str(e))
                break
    
    finally:
        manager.disconnect(websocket, user_email)


@router.on_event("startup")
async def startup_event():
    """Start Redis listener on app startup."""
    asyncio.create_task(redis_listener())
    logger.info("WebSocket service started")