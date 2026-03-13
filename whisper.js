let mediaRecorder;
let audioChunks = [];
let voiceSocket;
let audioContext;
let analyser;
let microphone;
let startRecordingWordTimeout;
let silenceTimer;
let isRecordingWord = false;

function initVoiceRecognition() {
    state.voice.supported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    if (!state.voice.supported) {
        if (els.btnVoice) els.btnVoice.disabled = true;
        updateVoiceUI('error', 'Microfone indisponível ou site sem HTTPS/Localhost.');
        return;
    }
    updateVoiceUI('idle', 'IA Whisper pronta. Clique em VOZ.');
}

async function connectWhisperSocket() {
    return new Promise((resolve) => {
        voiceSocket = new WebSocket('ws://localhost:8765');
        
        voiceSocket.onopen = () => {
            console.log('🔗 Conectado ao Servidor Whisper Local');
            resolve(true);
        };
        
        voiceSocket.onmessage = (event) => {
            const transcript = event.data;
            if (transcript.trim()) {
                updateVoiceUI('listening', 'Lendo IA...', transcript);
                processVoiceTranscript(transcript);
                
                // Keep UI updated briefly before switching to listening again if still active
                if (state.voice.listening && !state.voice.manuallyStopped) {
                    setTimeout(() => updateVoiceUI('listening', 'Escutando você...'), 2000);
                }
            }
        };

        voiceSocket.onerror = () => {
            updateVoiceUI('error', 'Sem conexão com Servidor Python.');
            if (state.voice.listening) toggleVoiceListening(); // Stop cleanly
            resolve(false);
        };

        voiceSocket.onclose = () => {
            console.log('Servidor Whisper desconectado.');
        }
    });
}

function stopAllAudio() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    if (microphone) microphone.disconnect();
    if (audioContext) audioContext.close();
    if (mediaRecorder && mediaRecorder.stream) {
        mediaRecorder.stream.getTracks().forEach(t => t.stop());
    }
    clearTimeout(silenceTimer);
    clearTimeout(startRecordingWordTimeout);
    isRecordingWord = false;
    audioChunks = [];
}

async function startVADRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        audioContext = new AudioContext();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);

        analyser.fftSize = 512;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        
        mediaRecorder.ondataavailable = e => {
            if (e.data.size > 0 && voiceSocket && voiceSocket.readyState === WebSocket.OPEN) {
                const blob = new Blob([e.data], { type: 'audio/webm' });
                voiceSocket.send(blob);
            }
        };
        
        function detectSilence() {
            if (state.voice.manuallyStopped) return;
            
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for(let i = 0; i < bufferLength; i++) sum += dataArray[i];
            let average = sum / bufferLength;
            
            // O volume médio do microfone (Threshold)
            if (average > 1.5) { 
                if (!isRecordingWord) {
                    isRecordingWord = true;
                    if (mediaRecorder.state === 'inactive') {
                        audioChunks = [];
                        mediaRecorder.start();
                        updateVoiceUI('listening', '(🔴) Gravando...');
                    }
                }
                
                // Cancela o timer de silêncio já que houve ruído
                clearTimeout(silenceTimer);
                
                // Seta um timer de "fim da fala". 1 segundo sem barulho fecha o chunk e envia.
                silenceTimer = setTimeout(() => {
                    if (isRecordingWord) {
                        isRecordingWord = false;
                        if (mediaRecorder.state === 'recording') {
                            mediaRecorder.stop(); // Stop aciona ondataavailable para enviar via socket
                            updateVoiceUI('processing', 'IA processando...');
                        }
                    }
                }, 1200);
            }
            
            if (!state.voice.manuallyStopped) {
                requestAnimationFrame(detectSilence);
            }
        }
        
        state.voice.listening = true;
        updateVoiceUI('listening', 'Escutando você...');
        detectSilence();
        
    } catch(err) {
        console.error(err);
        updateVoiceUI('error', 'Permissão do Microfone Negada.');
        state.voice.listening = false;
    }
}

async function toggleVoiceListening() {
    if (!state.voice.supported) return;

    if (state.voice.listening) {
        state.voice.manuallyStopped = true;
        state.voice.listening = false;
        
        stopAllAudio();
        
        if (voiceSocket && voiceSocket.readyState === WebSocket.OPEN) {
            voiceSocket.close();
        }
        
        updateVoiceUI('idle', 'Voz inativa');
        return;
    }

    state.voice.manuallyStopped = false;
    updateVoiceUI('processing', 'Iniciando AI Whisper...');
    
    if (!voiceSocket || voiceSocket.readyState !== WebSocket.OPEN) {
        const connected = await connectWhisperSocket();
        if(!connected) return; // Error handled inside connect
    }
    
    await startVADRecording();
}

