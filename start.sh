echo "Starting MiA-RAG services..."
export DEEPSEEK_API_KEY="sk-52d6e8f7ad8f46da95741eb4ed80971f"
export FEDERATION_INTERNAL_TOKEN="mia-federation-internal-token-2024"
export JWT_SECRET_KEY="your-production-secret-key"
export FEDERATION_SM4_KEY="mia-sm4-key-2024"

# 模型路径配置 - 修改为你的实际路径
export MODEL_PATH="/root/autodl-tmp/models/MiA-Emb-8B"
export BASE_MODEL_PATH="/root/autodl-tmp/models/Qwen3-Embedding-8B/Qwen/Qwen3-Embedding-8B"
echo "Starting FastAPI on port 6006..."
python -m api.main --host 0.0.0.0 --port 6006 &
sleep 5
echo "Starting Node Server on port 6008..."
python node_server.py --port 6008 &
echo "All services started!"
echo "FastAPI: http://0.0.0.0:6006"
echo "Node Server: http://0.0.0.0:6008"
echo "API Docs: http://0.0.0.0:6006/docs"
wait