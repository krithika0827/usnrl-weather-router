# Backend containerization — Owner: Joseph
FROM python:3.12-slim

WORKDIR /code

# Install dependencies first so this layer is cached unless requirements change.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the app (also bind-mounted in docker-compose.yml for live editing).
COPY . .

EXPOSE 8000

# --host 0.0.0.0 makes the server reachable from outside the container.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
