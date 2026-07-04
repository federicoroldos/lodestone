#!/usr/bin/env bash
fuser -k 2121/tcp 2>/dev/null && echo "Panel stopped." || echo "Nothing running on port 2121."
