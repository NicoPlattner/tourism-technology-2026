# Refresh pipeline of the Challenge 04 data product (models/refresh.py). Build from the repository root:
#   docker build -f pipeline/c04/Dockerfile -t c04-pipeline .
# Runs as a Kubernetes CronJob with a persistent volume at /work; the API serves /work/snapshots/current.
FROM python:3.13-slim
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 WORK_DIR=/work HOME=/tmp MPLCONFIGDIR=/tmp
WORKDIR /app
COPY pipeline/c04/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
COPY data/*.py data/
COPY data/static/ data/static/
COPY models/*.py models/
COPY docs/challenge-04/*.md docs/challenge-04/
COPY api/c04/app.py api/c04/
COPY api/c04/tests/ api/c04/tests/
COPY results/ baked-results/
COPY pipeline/c04/seed/ pipeline/c04/seed/
# the scripts write to data/raw, data/processed, out and results: refresh.py links them to /work
RUN chown -R 1000:1000 /app
USER 1000:1000
ENTRYPOINT ["python", "/app/models/refresh.py"]
CMD ["fast"]
