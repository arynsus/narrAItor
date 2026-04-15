#!/bin/bash

echo ""
echo " narrAItor — Python Environment Setup (macOS/Linux)"
echo " =================================================="
echo ""

# Check if uv is available
if command -v uv &> /dev/null; then
    echo "[1/4] Creating virtual environment with uv (Python 3.12)..."
    uv venv -p 3.12 .venv

    echo "[2/4] Activating environment..."
    source .venv/bin/activate
else
    echo "uv not found. Please install uv first:"
    echo "    curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi

echo ""
echo "[3/4] Installing Python packages..."
uv pip install -r requirements.txt

echo ""
echo "[4/4] Installing Qwen3-TTS from local reference..."
uv pip install -e ./Reference_Qwen3-TTS

echo ""
echo " Done! Now install Electron dependencies:"
echo "     npm install"
echo ""
echo " Then launch the app:"
echo "     npm start"
echo ""
echo " IMPORTANT: For Apple Silicon (M1/M2/M3), PyTorch provides built-in MPS (Metal) support:"
echo "     https://pytorch.org/get-started/locally/"
echo ""
