#!/bin/bash
set -euo pipefail

MODEL_ID="${CR_WHISPER_PTBR_SOURCE_MODEL:-freds0/distil-whisper-large-v3-ptbr}"
MODEL_DIR="${CR_WHISPER_PTBR_MODEL_DIR:-models/distil-whisper-large-v3-ptbr-ct2}"
RAW_MODEL_DIR="${CR_WHISPER_PTBR_RAW_DIR:-models/raw/distil-whisper-large-v3-ptbr}"
QUANTIZATION="${CR_WHISPER_PTBR_QUANTIZATION:-int8}"
KEEP_RAW_MODEL="${CR_WHISPER_KEEP_RAW:-0}"

echo "==============================================="
echo " Instalando fine-tuned PT-BR para faster-whisper"
echo "==============================================="
echo "Modelo fonte: $MODEL_ID"
echo "Cache local : $RAW_MODEL_DIR"
echo "Destino CT2 : $MODEL_DIR"
echo "Quantizacao : $QUANTIZATION"

if [ ! -d "venv" ]; then
    echo "Criando ambiente virtual..."
    python3 -m venv venv
fi

source venv/bin/activate

echo "Instalando dependencias de conversao..."
pip install --upgrade pip
pip install faster-whisper websockets torch typing-extensions transformers sentencepiece huggingface_hub

mkdir -p "$(dirname "$MODEL_DIR")"
mkdir -p "$RAW_MODEL_DIR"

if [ -d "$MODEL_DIR" ] && [ -f "$MODEL_DIR/model.bin" ]; then
    echo "Modelo convertido ja existe em $MODEL_DIR"
    exit 0
fi

export HF_HUB_DISABLE_XET=1

echo "Baixando arquivos essenciais do modelo PT-BR..."
venv/bin/hf download "$MODEL_ID" \
    config.json \
    generation_config.json \
    model.safetensors \
    model_1.safetensors \
    added_tokens.json \
    merges.txt \
    normalizer.json \
    preprocessor_config.json \
    special_tokens_map.json \
    tokenizer.json \
    tokenizer_config.json \
    vocab.json \
    --local-dir "$RAW_MODEL_DIR"

echo "Convertendo para CTranslate2..."
venv/bin/ct2-transformers-converter \
    --model "$RAW_MODEL_DIR" \
    --output_dir "$MODEL_DIR" \
    --copy_files tokenizer.json preprocessor_config.json tokenizer_config.json special_tokens_map.json \
    --quantization "$QUANTIZATION"

echo "Modelo PT-BR pronto em $MODEL_DIR"
if [ "$KEEP_RAW_MODEL" != "1" ]; then
    echo "Removendo cache bruto em $RAW_MODEL_DIR para economizar disco..."
    rm -rf "$RAW_MODEL_DIR"
fi
echo "O start_whisper.sh vai detectar esse modelo automaticamente."
