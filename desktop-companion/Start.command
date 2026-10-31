#!/bin/sh
cd "$(dirname "$0")" || exit 1
python3 -m venv .venv || exit 1
.venv/bin/python -m pip install -r requirements.txt || exit 1
.venv/bin/python companion.py
