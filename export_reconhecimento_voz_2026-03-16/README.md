# Export de reconhecimento de voz

Esta pasta foi montada para voce enviar o codigo de voz para outra IA sem precisar mandar o projeto inteiro.

## Arquivos incluidos

- `client/app_v2.js`
  Arquivo principal do cliente. Aqui estao o parser de fala, o matcher de cartas, a coordenacao entre browser/Whisper/Android, a captura do microfone e o despacho dos comandos reconhecidos.
- `client/cards_db.js`
  Banco de cartas usado pelo matcher de voz (`ALL_CARDS`). Sem ele, a IA externa nao consegue entender o contexto de nomes/custos/cartas validas.
- `client/voice_ui_fragment.html`
  Fragmento do `index.html` com o botao de voz, status da voz e painel de relatorio tecnico.
- `client/voice_ui_fragment.css`
  CSS do botao de voz, status e painel tecnico.
- `server/listen_server.py`
  Servidor WebSocket local que recebe audio, roda o Whisper e devolve eventos `voice_event` com parcial/final.
- `server/start_whisper.sh`
  Script de bootstrap para instalar dependencias e subir o servidor local do Whisper.

## Mapa rapido do `client/app_v2.js`

Trechos mais importantes para pedir melhoria para outra IA:

- `app_v2.js:19` a `app_v2.js:46`
  Constantes do sistema de voz.
- `app_v2.js:80` a `app_v2.js:159`
  Elementos DOM e estado `state.voice`.
- `app_v2.js:2027`
  `normalizeCardName`.
- `app_v2.js:2045`
  `VOICE_CARD_ALIAS_PAIRS` com aliases, mishearings e normalizacao PT-BR.
- `app_v2.js:2656`
  `normalizeVoiceCardText`.
- `app_v2.js:2666`
  `normalizeVoiceText`.
- `app_v2.js:3002`
  `parseVoiceSlotCommand`.
- `app_v2.js:3071`
  `extractVoiceCostAndCard`.
- `app_v2.js:3135`
  `buildResolvedVoiceCommand`.
- `app_v2.js:3233`
  `class VoiceCoordinator`.
- `app_v2.js:4048`
  `levenshteinDistance` e score fonetico.
- `app_v2.js:4089`
  `appendVoiceDebug`.
- `app_v2.js:4157`
  `updateVoiceUI`.
- `app_v2.js:4575`
  `getBestVoiceCardMatch`.
- `app_v2.js:5075`
  `handleVoicePlay`.
- `app_v2.js:5543`
  `dispatchVoiceEvent`.
- `app_v2.js:5609`
  `processVoiceTranscript`.
- `app_v2.js:5671`
  `getSupportedRecorderMimeType` e infra de audio/socket.
- `app_v2.js:5823`
  `startNativeVoiceRecognition`.
- `app_v2.js:5867`
  `initVoiceRecognition`.
- `app_v2.js:5941`
  `connectWhisperSocket`.
- `app_v2.js:6201`
  `stopBrowserRecognition`.
- `app_v2.js:6526`
  `startBrowserRecognition`.
- `app_v2.js:6690`
  `startSpeechRecording` e VAD.
- `app_v2.js:6763`
  `startVADRecording`.
- `app_v2.js:6920`
  `toggleVoiceListening`.

## Observacoes uteis para a IA externa

- O fluxo de voz nao e isolado: ele altera estado do tracker, historico de cartas e elixir.
- O matcher depende de `ALL_CARDS` e de aliases foneticos PT-BR definidos no cliente.
- O servidor Whisper responde por WebSocket com mensagens estruturadas, nao apenas texto cru.
- O projeto tem suporte hibrido: browser speech recognition + Whisper local + gancho para Android nativo.

## Caminho desta pasta

`/home/t4i/.gemini/antigravity/scratch/cr-elixir-tracker/export_reconhecimento_voz_2026-03-16`
