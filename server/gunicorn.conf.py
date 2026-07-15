import multiprocessing
import os

# Bind can be overridden with GUNICORN_BIND env
bind = os.getenv("GUNICORN_BIND", "0.0.0.0:8000")

# Cap at 4: each gthread worker holds Django in memory (~60MB).
# formula cpu*2+1 on a 10-core host gives 21 workers → OOM at 768MB limit.
_default_workers = min(multiprocessing.cpu_count() * 2 + 1, 4)
workers = int(os.getenv("GUNICORN_WORKERS", str(_default_workers)))
worker_class = os.getenv("GUNICORN_WORKER_CLASS", "gthread")
threads = int(os.getenv("GUNICORN_THREADS", "4"))

timeout = int(os.getenv("GUNICORN_TIMEOUT", "120"))
graceful_timeout = int(os.getenv("GUNICORN_GRACEFUL_TIMEOUT", "30"))
keepalive = int(os.getenv("GUNICORN_KEEPALIVE", "5"))

max_requests = int(os.getenv("GUNICORN_MAX_REQUESTS", "1000"))
max_requests_jitter = int(os.getenv("GUNICORN_MAX_REQUESTS_JITTER", "100"))
# preload_app=True: master loads Django once, workers fork → shared memory pages.
# Saves ~40MB per worker vs each worker loading independently.
preload_app = os.getenv("GUNICORN_PRELOAD_APP", "true").lower() == "true"

accesslog = os.getenv("GUNICORN_ACCESSLOG", "-")
errorlog = os.getenv("GUNICORN_ERRORLOG", "-")
loglevel = os.getenv("GUNICORN_LOGLEVEL", "info")

# Helps avoid disk issues in some container/VM environments
worker_tmp_dir = "/dev/shm" if os.path.isdir("/dev/shm") else None
