FROM node:24-alpine AS web
RUN npm install -g pnpm@12.11.2
WORKDIR /src/web
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ROOMX_DATA=/data \
    ROOMX_STATIC=/app/static
WORKDIR /app
COPY server/pyproject.toml ./server/pyproject.toml
COPY server/app ./server/app
RUN pip install --no-cache-dir ./server && rm -rf ./server
COPY --from=web /src/web/build ./static
RUN useradd --system --uid 10001 --no-create-home roomx \
    && mkdir /data \
    && chown roomx:roomx /data
USER roomx
VOLUME /data
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
