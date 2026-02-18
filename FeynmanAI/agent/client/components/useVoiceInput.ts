import { useCallback, useEffect, useRef, useState } from 'react'

function encodeWavFromAudioBuffer(audioBuffer: AudioBuffer): Blob {
    const numChannels = audioBuffer.numberOfChannels
    const sampleRate = audioBuffer.sampleRate
    const bitDepth = 16
    const bytesPerSample = bitDepth / 8
    const numSamples = audioBuffer.length
    const blockAlign = numChannels * bytesPerSample
    const byteRate = sampleRate * blockAlign
    const dataSize = numSamples * blockAlign
    const buffer = new ArrayBuffer(44 + dataSize)
    const view = new DataView(buffer)

    function writeString(offset: number, value: string) {
        for (let i = 0; i < value.length; i++) {
            view.setUint8(offset + i, value.charCodeAt(i))
        }
    }

    writeString(0, 'RIFF')
    view.setUint32(4, 36 + dataSize, true)
    writeString(8, 'WAVE')
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, numChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, byteRate, true)
    view.setUint16(32, blockAlign, true)
    view.setUint16(34, bitDepth, true)
    writeString(36, 'data')
    view.setUint32(40, dataSize, true)

    let offset = 44
    for (let i = 0; i < numSamples; i++) {
        for (let channel = 0; channel < numChannels; channel++) {
            const sample = audioBuffer.getChannelData(channel)[i]
            const s = Math.max(-1, Math.min(1, sample))
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
            offset += bytesPerSample
        }
    }

    return new Blob([buffer], { type: 'audio/wav' })
}

async function normalizeAudioForStt(audioBlob: Blob): Promise<Blob> {
    if (!audioBlob.type.includes('audio/webm')) return audioBlob
    const arrayBuffer = await audioBlob.arrayBuffer()
    const audioContext = new AudioContext()
    try {
        const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0))
        return encodeWavFromAudioBuffer(decoded)
    } finally {
        await audioContext.close()
    }
}

export function useVoiceInput(onTranscript: (text: string) => void) {
    const [isListening, setIsListening] = useState(false)
    const [isSupported, setIsSupported] = useState(false)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const chunksRef = useRef<Blob[]>([])
    const streamRef = useRef<MediaStream | null>(null)
    const onTranscriptRef = useRef(onTranscript)
    const detectedLanguageRef = useRef('unknown')

    // Keep callback ref up to date
    onTranscriptRef.current = onTranscript

    useEffect(() => {
        const supported =
            typeof navigator !== 'undefined' &&
            !!navigator.mediaDevices?.getUserMedia &&
            typeof MediaRecorder !== 'undefined'
        setIsSupported(supported)
    }, [])

    const sendAudioToSarvam = useCallback(async (audioBlob: Blob) => {
        try {
            const normalizedAudioBlob = await normalizeAudioForStt(audioBlob)
            const response = await fetch('/stt', {
                method: 'POST',
                body: normalizedAudioBlob,
                headers: {
                    'Content-Type': normalizedAudioBlob.type || 'audio/wav',
                    'X-Language-Hint': detectedLanguageRef.current,
                },
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                console.error('STT API error:', response.status, errorData)
                return
            }

            const data = (await response.json()) as { transcript?: string; language_code?: string }

            if (data.transcript) {
                if (data.language_code && data.language_code !== 'unknown') {
                    detectedLanguageRef.current = data.language_code
                }
                console.log(
                    `[Sarvam STT] Language: ${data.language_code || 'unknown'}, Transcript: ${data.transcript}`
                )
                onTranscriptRef.current(data.transcript)
            }
        } catch (err) {
            console.error('Failed to send audio to STT:', err)
        }
    }, [])

    const startListening = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            streamRef.current = stream
            chunksRef.current = []

            // Prefer webm/opus, fall back to whatever the browser supports
            const mimeType = MediaRecorder.isTypeSupported('audio/mp4')
                ? 'audio/mp4'
                : MediaRecorder.isTypeSupported('audio/mpeg')
                    ? 'audio/mpeg'
                    : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                        ? 'audio/webm;codecs=opus'
                        : MediaRecorder.isTypeSupported('audio/webm')
                            ? 'audio/webm'
                            : ''

            const mediaRecorder = mimeType
                ? new MediaRecorder(stream, { mimeType })
                : new MediaRecorder(stream)

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunksRef.current.push(event.data)
                }
            }

            mediaRecorder.onstop = async () => {
                // Assemble all chunks into a single blob
                const audioBlob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' })
                chunksRef.current = []

                // Stop all tracks
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach((track) => track.stop())
                    streamRef.current = null
                }

                setIsListening(false)

                // Send to Sarvam API if we have audio
                if (audioBlob.size > 0) {
                    await sendAudioToSarvam(audioBlob)
                }
            }

            mediaRecorder.onerror = () => {
                console.error('MediaRecorder error')
                setIsListening(false)
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach((track) => track.stop())
                    streamRef.current = null
                }
            }

            mediaRecorderRef.current = mediaRecorder
            mediaRecorder.start(250) // collect data every 250ms
            setIsListening(true)
        } catch (err) {
            console.error('Failed to start recording:', err)
            setIsListening(false)
        }
    }, [sendAudioToSarvam])

    const stopListening = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop()
            mediaRecorderRef.current = null
        }
    }, [])

    const toggleListening = useCallback(() => {
        if (isListening) {
            stopListening()
        } else {
            startListening()
        }
    }, [isListening, startListening, stopListening])

    // Clean up on unmount
    useEffect(() => {
        return () => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop()
            }
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => track.stop())
            }
        }
    }, [])

    return {
        isListening,
        isSupported,
        toggleListening,
        startListening,
        stopListening,
    }
}
