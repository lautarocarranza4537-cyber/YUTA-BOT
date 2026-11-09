import youtubedl from 'youtube-dl-exec';
import path from 'path';
import fs from 'fs';
import yts from 'yt-search';

export async function downloadYouTubeAudio(queryOrUrl) {
    let targetUrl = queryOrUrl;
    let videoInfo = null;

    if (!queryOrUrl.includes('http')) {
        const searchRes = await yts(queryOrUrl);
        const video = searchRes.videos?.[0];
        if (!video) throw new Error("No se encontró la canción en YouTube.");
        targetUrl = video.url;
        videoInfo = video;
    } else {
        const searchRes = await yts(queryOrUrl);
        videoInfo = searchRes.videos?.[0] || { title: "Audio de YouTube", thumbnail: "" };
    }

    const outputFileName = `audio_${Date.now()}.mp3`;
    const outputPath = path.resolve('temp', outputFileName);

    await youtubedl(targetUrl, {
        extractAudio: true,
        audioFormat: 'mp3',
        audioQuality: '192K',
        output: outputPath,
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true
    });

    return {
        path: outputPath,
        title: videoInfo.title,
        duration: videoInfo.duration?.toString() || "Desconocida",
        thumbnail: videoInfo.thumbnail || ""
    };
}

export async function downloadMediaGeneric(url) {
    const outputFileName = `media_${Date.now()}.mp4`;
    const outputPath = path.resolve('temp', outputFileName);

    await youtubedl(url, {
        format: 'best[ext=mp4]/best',
        output: outputPath,
        noCheckCertificates: true,
        noWarnings: true
    });

    if (!fs.existsSync(outputPath)) {
        throw new Error("No se pudo descargar el archivo multimedia.");
    }

    return outputPath;
}
