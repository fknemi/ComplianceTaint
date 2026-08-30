from dotenv import load_dotenv

load_dotenv()

import time
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from api.routes import graph, audit, sanitize, files, file, report
import uvicorn

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Compliance Taint API",
    description="Engine for taint propagation and compliance zone analysis.",
    version="1.0.0",
)

# 3. Middlewares
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)


@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    logger.info(f"{request.method} {request.url.path} - {process_time:.4f}s")
    return response


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "An internal server error occurred.",
            "path": request.url.path,
        },
    )


app.include_router(graph.router, prefix="/api/v1/graph", tags=["Graph"])
app.include_router(audit.router, prefix="/api/v1/audit", tags=["Audit"])
app.include_router(sanitize.router, prefix="/api/v1/sanitize", tags=["Sanitizer"])
app.include_router(files.router, prefix="/api/v1/files", tags=["ListFiles"])
app.include_router(file.router, prefix="/api/v1/file", tags=["FileContent"])
app.include_router(report.router, prefix="/api/v1/report", tags=["Report"])


@app.get("/health", tags=["System"])
async def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
