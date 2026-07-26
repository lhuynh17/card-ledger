#!/bin/bash
cd "$(dirname "$0")"

if ! python3 -c "import requests" >/dev/null 2>&1; then
  echo "Installing the one required Python package..."
  python3 -m pip install --user requests || {
    echo
    echo "The required package could not be installed."
    read -n 1 -s -r -p "Press any key to close."
    echo
    exit 1
  }
fi

python3 setup_pocketbase.py
echo
read -n 1 -s -r -p "Press any key to close."
echo
