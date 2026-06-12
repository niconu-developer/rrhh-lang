FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PLANNER_HOST=0.0.0.0
ENV PLANNER_PORT=8765

WORKDIR /app

COPY . /app

RUN pip install --no-cache-dir -r requirements.txt

RUN mkdir -p /data

EXPOSE 8765

CMD ["python3", "backend/app.py"]
