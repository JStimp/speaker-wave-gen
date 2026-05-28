FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY exporter/pyproject.toml exporter/README.md /app/exporter/
COPY exporter/wavecad_exporter /app/exporter/wavecad_exporter

RUN python -m pip install --no-cache-dir --upgrade pip \
  && python -m pip install --no-cache-dir "/app/exporter[cad]"

ENTRYPOINT ["wavecad-export"]

