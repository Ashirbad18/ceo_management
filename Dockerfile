# Stage 1: Build the React frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /frontend

# Copy frontend dependency manifests
COPY frontend/package.json ./

# Install frontend dependencies and build
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Unified Python backend and frontend host
FROM python:3.12-slim
WORKDIR /app

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend app file
COPY app.py ./app.py

# Copy built frontend assets
COPY --from=frontend-builder /frontend/dist ./frontend/dist

# Create SQLite data directory
RUN mkdir -p /app/data

# Default environment variables for SQLite
ENV DATABASE_URL=sqlite:////app/data/cmas.db
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
