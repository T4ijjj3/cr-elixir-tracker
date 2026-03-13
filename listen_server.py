import asyncio
import websockets
import os
import tempfile
import sys

try:
    from faster_whisper import WhisperModel
except ImportError:
    print("Erro: Bibliotecas não encontradas.")
    sys.exit(1)

CLASH_ROYALE_PROMPT = "Clash Royale. Cartas: Valquíria, Megacavaleiro, Corredor, Golem, P.E.K.K.A, Zap, Tronco, Bruxa. Números: um, dois, três, quatro, cinco, seis, sete, oito."

print("=========================================================")
print("🤖 IA do Whisper - MODO TURBO E MULTI-TAREFA (NOVA VERSÃO)")
print("=========================================================")

try:
    import torch
    device = "cuda" if torch.cuda.is_available() else "cpu"
    compute_type = "float16" if device == "cuda" else "int8"
except ImportError:
    device = "cpu"
    compute_type = "int8"

print(f"Acelerador: {device.upper()} | Precisão: {compute_type}")
model = WhisperModel("medium", device=device, compute_type=compute_type)

print("✅ Modelo carregado. Aguardando conexão na porta 8765...")

def processar_audio(caminho_arquivo):
    segments, info = model.transcribe(
        caminho_arquivo, 
        beam_size=2, 
        language="pt",
        initial_prompt=CLASH_ROYALE_PROMPT,
        condition_on_previous_text=False
    )
    return " ".join([segment.text for segment in segments]).strip()

async def recognize_audio(websocket):
    print("🔥 Nova Conexão estabelecida com o Rastreador!")
    try:
        async for message in websocket:
            if isinstance(message, bytes):
                with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as temp_audio:
                    temp_audio.write(message)
                    temp_file_name = temp_audio.name

                try:
                    texto_reconhecido = await asyncio.to_thread(processar_audio, temp_file_name)
                    
                    if texto_reconhecido:
                        print(f"🎤 [IA Entendeu]: {texto_reconhecido}")
                        await websocket.send(texto_reconhecido)
                except Exception as e:
                    print(f"⚠️ Erro ao transcrever: {e}")
                finally:
                    if os.path.exists(temp_file_name):
                        os.remove(temp_file_name)
    except websockets.exceptions.ConnectionClosed:
        print("Conexão fechada pelo navegador.")

async def main():
    async with websockets.serve(recognize_audio, "localhost", 8765, ping_interval=None):
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
