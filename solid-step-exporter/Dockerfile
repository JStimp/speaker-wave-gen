FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
  && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir cadquery==2.5.2

WORKDIR /opt/wavegen3d
COPY wavegen_solid_exporter ./wavegen_solid_exporter

ENTRYPOINT ["python", "-m", "wavegen_solid_exporter"]
