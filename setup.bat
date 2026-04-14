@echo off
echo.
echo  narrAItor — Python Environment Setup
echo  =====================================
echo.

REM Check if conda is available
where conda >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [1/4] Creating conda environment "qwen3-tts" (Python 3.12)...
    conda create -n qwen3-tts python=3.12 -y

    echo [2/4] Activating environment...
    call conda activate qwen3-tts
) else (
    echo Conda not found. Using current Python environment.
    echo     Tip: Install Miniconda for an isolated environment.
)

echo.
echo [3/4] Installing Python packages...
pip install -r requirements.txt

echo.
echo [4/4] Installing Qwen3-TTS from local reference...
pip install -e ./Reference_Qwen3-TTS

echo.
echo  Done! Now install Electron dependencies:
echo      npm install
echo.
echo  Then launch the app:
echo      npm start
echo.
echo  IMPORTANT: Install PyTorch separately with CUDA if you have a GPU:
echo      https://pytorch.org/get-started/locally/
echo.
pause
