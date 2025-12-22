import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.database import Base, engine
from src.main import app
from src.models.server import CapacityMode, Server


@pytest.fixture
async def db_session():
    """Create test database session."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    yield
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def client():
    """Create test client."""
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_create_server(client: AsyncClient, db_session):
    """Test server creation."""
    server_data = {
        "name": "test-server-01",
        "ip_address": "192.168.1.100",
        "capacity_mode": "1:5",
        "is_central_config": True,
        "description": "Test server",
    }
    
    response = await client.post("/api/v1/servers", json=server_data)
    assert response.status_code == 201
    
    data = response.json()
    assert data["name"] == "test-server-01"
    assert data["ip_address"] == "192.168.1.100"
    assert data["max_domains"] == 5
    assert data["current_domains"] == 0
    assert data["status"] == "free"


@pytest.mark.asyncio
async def test_list_servers(client: AsyncClient, db_session):
    """Test server listing."""
    # Create test servers
    for i in range(3):
        await client.post("/api/v1/servers", json={
            "name": f"server-{i}",
            "ip_address": f"192.168.1.{100+i}",
            "capacity_mode": "1:5",
        })
    
    # List all servers
    response = await client.get("/api/v1/servers")
    assert response.status_code == 200
    
    data = response.json()
    assert data["total"] == 3
    assert len(data["servers"]) == 3


@pytest.mark.asyncio
async def test_update_server(client: AsyncClient, db_session):
    """Test server update."""
    # Create server
    create_response = await client.post("/api/v1/servers", json={
        "name": "test-server",
        "ip_address": "192.168.1.100",
        "capacity_mode": "1:5",
    })
    server_id = create_response.json()["id"]
    
    # Update server
    update_data = {
        "capacity_mode": "1:10",
        "description": "Updated description",
    }
    
    response = await client.patch(f"/api/v1/servers/{server_id}", json=update_data)
    assert response.status_code == 200
    
    data = response.json()
    assert data["capacity_mode"] == "1:10"
    assert data["max_domains"] == 10
    assert data["description"] == "Updated description"


@pytest.mark.asyncio
async def test_delete_server(client: AsyncClient, db_session):
    """Test server deletion."""
    # Create server
    create_response = await client.post("/api/v1/servers", json={
        "name": "test-server",
        "ip_address": "192.168.1.100",
        "capacity_mode": "1:5",
    })
    server_id = create_response.json()["id"]
    
    # Delete server
    response = await client.delete(f"/api/v1/servers/{server_id}")
    assert response.status_code == 204
    
    # Verify deletion
    get_response = await client.get(f"/api/v1/servers/{server_id}")
    assert get_response.status_code == 404


@pytest.mark.asyncio
async def test_server_lock(client: AsyncClient, db_session):
    """Test server locking mechanism."""
    # Create server
    create_response = await client.post("/api/v1/servers", json={
        "name": "test-server",
        "ip_address": "192.168.1.100",
        "capacity_mode": "1:5",
    })
    server_id = create_response.json()["id"]
    
    # Lock server
    lock_response = await client.post(f"/api/v1/servers/{server_id}/lock")
    assert lock_response.status_code == 200
    
    # Try to lock again (should fail)
    lock_again_response = await client.post(f"/api/v1/servers/{server_id}/lock")
    assert lock_again_response.status_code == 409
    
    # Unlock server
    unlock_response = await client.post(f"/api/v1/servers/{server_id}/unlock")
    assert unlock_response.status_code == 200


@pytest.mark.asyncio
async def test_capacity_modes(client: AsyncClient, db_session):
    """Test different capacity modes."""
    modes = [
        ("1:5", 5),
        ("1:7", 7),
        ("1:10", 10),
    ]
    
    for mode, expected_capacity in modes:
        response = await client.post("/api/v1/servers", json={
            "name": f"server-{mode}",
            "ip_address": "192.168.1.100",
            "capacity_mode": mode,
        })
        
        assert response.status_code == 201
        data = response.json()
        assert data["capacity_mode"] == mode
        assert data["max_domains"] == expected_capacity