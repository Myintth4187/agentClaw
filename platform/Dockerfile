FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim

WORKDIR /app

# Use Tsinghua mirror for Python packages (China)
ENV UV_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple

# Copy dependency files first for better layer caching
COPY pyproject.toml ./

# Install dependencies
RUN uv pip install --system --no-cache -r pyproject.toml

# Copy application code
COPY app/ app/
COPY alembic/ alembic/
COPY alembic.ini ./

EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
