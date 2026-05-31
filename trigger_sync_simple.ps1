$ErrorActionPreference = "Continue"
Invoke-WebRequest -Uri "http://127.0.0.1:8788/api/dev/force-poll" -Method GET
