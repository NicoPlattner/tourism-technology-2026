# Challenge 04 data API (read-only). Build from the repository root:
#   docker build -f c04/api/Dockerfile -t c04-api .
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DATA_DIR=/data C04_DIR=/c04 BASE_PATH=/c04-api PORT=8080
WORKDIR /app
COPY c04/api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY c04/api/app.py .
COPY c04/results/gui/ /data/
COPY c04/results/c04/ /c04/
USER 1000:1000
EXPOSE 8080
HEALTHCHECK CMD python -c "import os,urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}{os.environ[\"BASE_PATH\"]}/health')"
CMD ["sh", "-c", "exec uvicorn app:app --host 0.0.0.0 --port ${PORT} --proxy-headers"]
