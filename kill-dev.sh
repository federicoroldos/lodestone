#!/usr/bin/env bash
fuser -k 5173/tcp 2>/dev/null && echo "Dev server stopped." || echo "Nothing running on port 5173."
