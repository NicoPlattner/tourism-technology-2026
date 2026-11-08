# Refresh pipeline of the Challenge 04 data product (c04/models/refresh.py). Build from the repository root:
#   docker build -f c04/pipeline/Dockerfile -t c04-pipeline .
# Runs as a Kubernetes CronJob with a persistent volume at /work; the API serves /work/snapshots/current.
FROM python:3.13-slim
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 WORK_DIR=/work HOME=/tmp MPLCONFIGDIR=/tmp
WORKDIR /app
COPY c04/pipeline/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
# /app mirrors the c04/ folder of the repository
COPY c04/data/*.py data/
COPY c04/data/static/ data/static/
COPY c04/models/*.py models/
COPY c04/docs/*.md docs/
COPY c04/api/app.py api/
COPY c04/api/tests/ api/tests/
COPY c04/results/ baked-results/
COPY c04/pipeline/seed/ pipeline/seed/
# the scripts write to data/raw, data/processed, out and results: refresh.py links them to /work
RUN chown -R 1000:1000 /app
USER 1000:1000
ENTRYPOINT ["python", "/app/models/refresh.py"]
CMD ["fast"]
