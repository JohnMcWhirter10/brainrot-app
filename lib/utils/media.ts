import { spawn } from 'child_process';
import path from 'path';
import { getMediaDuration, parseTimeToSeconds } from './ffmpeg';
import { updateProjectProgress } from './project';

/**
 * Process video with ffmpeg: remove original audio, cut to audio length, add new audio
 */
export async function processVideoWithFFmpeg(
	videoPath: string,
	audioPath: string,
	outputPath: string,
	audioDuration: number,
	ffmpegPath: string
): Promise<void> {
	return new Promise((resolve, reject) => {
		// Command to remove original audio, cut to audio length, and add new audio
		const ffmpeg = spawn(ffmpegPath, [
			'-i',
			videoPath,
			'-i',
			audioPath,
			'-map',
			'0:v', // Take video from first input
			'-map',
			'1:a', // Take audio from second input
			'-shortest', // Cut to the shortest input (audio)
			'-t',
			audioDuration.toString(), // Explicitly set duration to audio length
			'-c:v',
			'libx264', // Video codec
			'-c:a',
			'aac', // Audio codec
			'-strict',
			'experimental',
			// Mobile device aspect ratio (9:16 for vertical)
			'-vf',
			'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280',
			'-movflags',
			'+faststart', // Optimize for web streaming
			outputPath,
		]);

		let errorOutput = '';
		ffmpeg.stderr.on('data', (data) => {
			const output = data.toString();
			errorOutput += output;
			console.log(output);
		});

		ffmpeg.on('close', (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`ffmpeg failed with code ${code}: ${errorOutput}`));
			}
		});

		ffmpeg.on('error', (err) => {
			reject(err);
		});
	});
}

/**
 * Split video into segments of specified duration
 */
export async function splitVideoIntoSegments(
	videoPath: string,
	outputDir: string,
	segmentDuration: number,
	ffmpegTools: { ffmpeg: string | null; ffprobe: string | null }
): Promise<Array<{ id: number; duration: number; filename: string }>> {
	// Get total duration
	const totalDuration = await getMediaDuration(videoPath, ffmpegTools.ffprobe!);
	const segments = [];

	// Calculate number of segments
	const numSegments = Math.ceil(totalDuration / segmentDuration);

	for (let i = 0; i < numSegments; i++) {
		const startTime = i * segmentDuration;
		let duration = segmentDuration;

		// For the last segment, adjust duration if needed
		if (i === numSegments - 1) {
			duration = totalDuration - startTime;
			if (duration <= 0) duration = 1; // Ensure positive duration
		}

		const segmentId = i + 1;
		const segmentFilename = `segment-${segmentId}.mp4`;
		const segmentPath = path.join(outputDir, segmentFilename);

		await new Promise<void>((resolve, reject) => {
			const ffmpeg = spawn(ffmpegTools.ffmpeg!, [
				'-i',
				videoPath,
				'-ss',
				startTime.toString(),
				'-t',
				duration.toString(),
				'-c:v',
				'libx264', // Re-encode instead of copy to ensure proper keyframes
				'-preset',
				'fast', // Use fast preset for reasonable encoding speed
				'-force_key_frames',
				'0', // Force keyframe at the beginning (0s)
				'-c:a',
				'copy', // Copy audio codec (no re-encoding)
				segmentPath,
			]);

			let errorOutput = '';
			ffmpeg.stderr.on('data', (data) => {
				const output = data.toString();
				errorOutput += output;
				console.log(`Segment ${segmentId} processing:`, output);
			});

			ffmpeg.on('close', (code) => {
				if (code === 0) {
					resolve();
				} else {
					reject(new Error(`ffmpeg segment ${segmentId} failed with code ${code}: ${errorOutput}`));
				}
			});

			ffmpeg.on('error', (err) => {
				reject(err);
			});
		});

		segments.push({
			id: segmentId,
			duration: Math.round(duration),
			filename: segmentFilename,
		});
	}

	return segments;
}

/**
 * Extract audio from video segment for transcription
 */
export async function extractAudioFromSegment(
	segmentPath: string,
	outputPath: string,
	ffmpegPath: string
): Promise<void> {
	return new Promise((resolve, reject) => {
		const ffmpeg = spawn(ffmpegPath, [
			'-i',
			segmentPath,
			'-vn',
			'-acodec',
			'pcm_s16le',
			'-ar',
			'16000',
			'-ac',
			'1',
			outputPath,
		]);

		let errorOutput = '';
		ffmpeg.stderr.on('data', (data) => {
			const output = data.toString();
			errorOutput += output;
		});

		ffmpeg.on('close', (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`ffmpeg audio extraction failed with code ${code}: ${errorOutput}`));
			}
		});

		ffmpeg.on('error', (err) => {
			reject(err);
		});
	});
}
