import { IRequest } from 'itty-router'
import { Environment } from '../environment'

type SarvamSttResponse = {
    transcript?: string
    language_code?: string
    language?: string
    data?: {
        transcript?: string
        language_code?: string
        language?: string
    }
}

function getLanguageFromResponse(result: SarvamSttResponse): string {
    return (
        result.language_code ??
        result.language ??
        result.data?.language_code ??
        result.data?.language ??
        'unknown'
    )
}

function getTranscriptFromResponse(result: SarvamSttResponse): string {
    return result.transcript ?? result.data?.transcript ?? ''
}

function getFilenameForMimeType(contentType: string | null): string {
    const type = (contentType ?? '').toLowerCase()
    if (type.includes('audio/mp4') || type.includes('audio/m4a')) return 'audio.m4a'
    if (type.includes('audio/mpeg') || type.includes('audio/mp3')) return 'audio.mp3'
    if (type.includes('audio/wav') || type.includes('audio/x-wav')) return 'audio.wav'
    if (type.includes('audio/webm')) return 'audio.webm'
    return 'audio.webm'
}

export async function stt(request: IRequest, env: Environment) {
    const apiKey = env.SARVAM_API_KEY
    if (!apiKey) {
        return new Response(JSON.stringify({ error: 'SARVAM_API_KEY not configured' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        })
    }

    try {
        const languageHint = request.headers.get('x-language-hint') ?? 'unknown'
        const contentType = request.headers.get('content-type')

        // Get the audio blob from the request
        const audioBlob = await request.blob()

        if (!audioBlob || audioBlob.size === 0) {
            return new Response(JSON.stringify({ error: 'No audio data received' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            })
        }

        // Build the multipart form data for Sarvam API
        const formData = new FormData()
        formData.append('file', audioBlob, getFilenameForMimeType(contentType))
        formData.append('model', 'saarika:v2.5')
        formData.append('language_code', languageHint)
        formData.append('mode', 'transcribe')

        // Call Sarvam AI Speech-to-Text API
        const sarvamResponse = await fetch('https://api.sarvam.ai/speech-to-text', {
            method: 'POST',
            headers: {
                'api-subscription-key': apiKey,
            },
            body: formData,
        })

        if (!sarvamResponse.ok) {
            const errorText = await sarvamResponse.text()
            console.error('Sarvam API error:', sarvamResponse.status, errorText)
            return new Response(
                JSON.stringify({
                    error: 'Sarvam API error',
                    status: sarvamResponse.status,
                    details: errorText,
                }),
                {
                    status: sarvamResponse.status,
                    headers: { 'Content-Type': 'application/json' },
                }
            )
        }

        const result = (await sarvamResponse.json()) as SarvamSttResponse
        const transcript = getTranscriptFromResponse(result)
        const languageCode = getLanguageFromResponse(result)

        return new Response(
            JSON.stringify({
                transcript,
                language_code: languageCode,
            }),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }
        )
    } catch (err) {
        console.error('STT route error:', err)
        return new Response(
            JSON.stringify({ error: 'Internal server error', details: String(err) }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            }
        )
    }
}
