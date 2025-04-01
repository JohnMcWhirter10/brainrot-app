import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { ProjectStatus } from '@/app/types/project';
import { updateProjectProgress } from './project';

export async function findFfmpegPaths() {
	return new Promise<{ ffmpeg: string | null; ffprobe: string | null }>((resolve) => {
		// Check if ffmpeg and ffprobe are in PATH
		exec('which ffmpeg ffprobe || where ffmpeg ffprobe 2> nul', (error, stdout) => {
			const paths = stdout.trim().split('\n');
			const ffmpegPath = paths[0] ? paths[0].trim() : null;
			const ffprobePath = paths[1] ? paths[1].trim() : null;

			if (ffmpegPath && ffprobePath) {
				resolve({ ffmpeg: ffmpegPath, ffprobe: ffprobePath });
				return;
			}

			// Common installation locations
			const commonLocations = [
				// macOS Homebrew
				'/usr/local/bin/ffmpeg',
				'/usr/local/bin/ffprobe',
				// Linux
				'/usr/bin/ffmpeg',
				'/usr/bin/ffprobe',
				// Windows
				'C:\\ffmpeg\\bin\\ffmpeg.exe',
				'C:\\ffmpeg\\bin\\ffprobe.exe',
			];

			const ffmpeg = commonLocations.find((loc, i) => i % 2 === 0 && fs.existsSync(loc)) || null;
			const ffprobe = commonLocations.find((loc, i) => i % 2 === 1 && fs.existsSync(loc)) || null;

			resolve({ ffmpeg, ffprobe });
		});
	});
}

export async function getMediaDuration(
	filePath: string,
	ffprobePath: string,
	projectId?: string,
	processId?: string
): Promise<number> {
	return new Promise<number>((resolve, reject) => {
		const cmd = spawn(ffprobePath, [
			'-v',
			'error',
			'-show_entries',
			'format=duration',
			'-of',
			'default=noprint_wrappers=1:nokey=1',
			filePath,
		]);

		let output = '';
		let errorOutput = '';

		// Only update progress if both projectId and processId are provided
		const shouldTrackProgress = !!(projectId && processId);

		// Initialize progress
		if (shouldTrackProgress) {
			updateProjectProgress(projectId, processId, 0);
		}

		cmd.stdout.on('data', (data) => {
			output += data.toString();
		});

		cmd.stderr.on('data', (data) => {
			errorOutput += data.toString();

			// Update progress when we get stderr data (ffprobe outputs progress here)
			if (shouldTrackProgress) {
				updateProjectProgress(projectId, processId, 50); // Use 50% as an indication it's working
			}
		});

		cmd.on('close', (code) => {
			// Update progress to 100% when complete
			if (shouldTrackProgress) {
				updateProjectProgress(projectId, processId, 100);
			}

			if (code !== 0) {
				console.error(`ffprobe error: ${errorOutput}`);
				reject(new Error(`ffprobe exited with code ${code}: ${errorOutput}`));
				return;
			}

			const duration = parseFloat(output.trim());
			if (isNaN(duration)) {
				reject(new Error(`Unable to parse duration from ffprobe output: ${output}`));
				return;
			}

			resolve(duration);
		});
	});
}

/**
 * Parse an FFmpeg time string (HH:MM:SS.MS) to seconds
 */
export function parseTimeToSeconds(timeString: string): number {
	const parts = timeString.split(':');
	if (parts.length !== 3) return 0;

	const hours = parseInt(parts[0], 10);
	const minutes = parseInt(parts[1], 10);
	const seconds = parseFloat(parts[2]);

	return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Parse ASS time format (h:mm:ss.cc) to seconds
 */
export function parseAssTime(assTime: string): number {
	const [hoursPart, minutesPart, secondsPart] = assTime.split(':');
	const hours = parseInt(hoursPart, 10);
	const minutes = parseInt(minutesPart, 10);

	// Handle seconds and centiseconds
	const secondsAndCentiseconds = secondsPart.split('.');
	const seconds = parseFloat(secondsAndCentiseconds[0]);
	const centiseconds = secondsAndCentiseconds.length > 1 ? parseInt(secondsAndCentiseconds[1], 10) / 100 : 0;

	return hours * 3600 + minutes * 60 + seconds + centiseconds;
}

/**
 * Format seconds to ASS time format (h:mm:ss.cc)
 */
export function formatAssTimestamp(seconds: number): string {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;
	const wholeSecs = Math.floor(secs);
	const centiseconds = Math.round((secs - wholeSecs) * 100);

	return `${hours}:${minutes.toString().padStart(2, '0')}:${wholeSecs.toString().padStart(2, '0')}.${centiseconds
		.toString()
		.padStart(2, '0')}`;
}
