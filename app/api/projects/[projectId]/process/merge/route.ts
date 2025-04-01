import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { ProjectStatus } from '@/app/types/project';
import { findFfmpegPaths, getMediaDuration, parseTimeToSeconds } from '@/lib/utils/ffmpeg';
import { updateProjectProgress, updateProjectStatus } from '@/lib/utils/project';

// Merge video and audio with FFmpeg
async function mergeVideoAndAudio(
	videoPath: string,
	audioPath: string,
	outputPath: string,
	audioDuration: number,
	ffmpegPath: string | null,
	projectId: string,
	processId: string
): Promise<void> {
	if (!ffmpegPath) {
		throw new Error('FFmpeg not found');
	}

	// Verify input files exist
	if (!fs.existsSync(videoPath)) {
		throw new Error(`Video file not found: ${videoPath}`);
	}

	if (!fs.existsSync(audioPath)) {
		throw new Error(`Audio file not found: ${audioPath}`);
	}

	console.log(`Merging video: combining video ${videoPath} with audio ${audioPath} to ${outputPath}`);

	return new Promise<void>((resolve, reject) => {
		let lastProgressUpdate = Date.now();

		const cmd = spawn(ffmpegPath, [
			'-i',
			videoPath,
			'-i',
			audioPath,
			'-map',
			'0:v:0', // Take video from first input
			'-map',
			'1:a:0', // Take audio from second input
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
			'-y',
			outputPath,
		]);

		let errorOutput = '';

		cmd.stderr.on('data', (data) => {
			const output = data.toString();

			// Try to extract progress information
			if (output.includes('frame=') && output.includes('time=')) {
				try {
					// Extract time information - format is typically HH:MM:SS.MS
					const timeMatch = output.match(/time=(\d+:\d+:\d+\.\d+)/);
					if (timeMatch && timeMatch[1]) {
						// Use our utility to parse the time
						const elapsedSeconds = parseTimeToSeconds(timeMatch[1]);

						// Calculate progress percentage based on audio duration
						const operationProgress = Math.min(Math.round((elapsedSeconds / audioDuration) * 100), 100);

						// Only update metadata if significant time has passed
						const now = Date.now();
						if (now - lastProgressUpdate > 2000) {
							lastProgressUpdate = now;
							updateProjectProgress(projectId, processId, operationProgress);
						}
					}
				} catch (err) {
					console.error('Error parsing FFmpeg progress output:', err);
				}
			} else {
				errorOutput += output;
			}
		});

		cmd.on('close', (code) => {
			if (code !== 0) {
				console.error(`FFmpeg error: ${errorOutput}`);
				reject(new Error(`FFmpeg exited with code ${code}`));
				return;
			}
			resolve();
		});
	});
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
	try {
		const { projectId } = await params;

		// Get project directory
		const projectDir = path.join(process.cwd(), 'projects', projectId);
		if (!fs.existsSync(projectDir)) {
			return NextResponse.json({ error: 'Project not found' }, { status: 404 });
		}

		// Check if metadata exists
		const metadataPath = path.join(projectDir, 'metadata.json');
		if (!fs.existsSync(metadataPath)) {
			return NextResponse.json({ error: 'Project metadata not found' }, { status: 404 });
		}

		// Check for source files
		const sourceDir = path.join(projectDir, 'source');
		const videoPath = path.join(sourceDir, 'video.mp4');
		const audioPath = path.join(sourceDir, 'audio.mp3');

		if (!fs.existsSync(videoPath) || !fs.existsSync(audioPath)) {
			return NextResponse.json(
				{ error: 'Source files not found. Please run the download process first.' },
				{ status: 400 }
			);
		}

		// Generate a process ID for tracking
		const processId = uuidv4();

		// Update metadata
		const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
		metadata.status = ProjectStatus.MERGING;
		metadata.mergeProcessId = processId;
		metadata.currentProcess = 'merge';
		fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

		// Initialize progress using the utility function
		updateProjectProgress(projectId, processId, 0);

		// Start background merging process
		mergeMedia(projectId, processId).catch(console.error);

		return NextResponse.json({ projectId, processId });
	} catch (error) {
		console.error('Error starting merge process:', error);
		return NextResponse.json({ error: 'Failed to start merge process' }, { status: 500 });
	}
}

// Merge media
async function mergeMedia(projectId: string, processId: string) {
	try {
		// Check for FFmpeg tools first
		const ffmpegTools = await findFfmpegPaths();
		if (!ffmpegTools.ffmpeg || !ffmpegTools.ffprobe) {
			throw new Error('FFmpeg tools not found. Please install FFmpeg and make sure it is in your PATH.');
		}

		// Get project directories
		const projectDir = path.join(process.cwd(), 'projects', projectId);
		const sourceDir = path.join(projectDir, 'source');
		const mergeDir = path.join(projectDir, 'merge');
		fs.mkdirSync(mergeDir, { recursive: true });

		const videoPath = path.join(sourceDir, 'video.mp4');
		const audioPath = path.join(sourceDir, 'audio.mp3');

		// Update metadata
		const metadataPath = path.join(projectDir, 'metadata.json');
		let metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
		metadata.status = ProjectStatus.MERGING;
		metadata.currentProcess = 'merge';
		fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

		// Reset progress to 0 for the master process
		updateProjectProgress(projectId, processId, 0);
		console.log('Starting media merge process');

		// Initialize progress for duration calculation
		const durationProcessId = `${processId}_duration`;
		updateProjectProgress(projectId, durationProcessId, 0);

		// Get media durations with their own process ID
		console.log('Getting media durations');
		const audioDuration = await getMediaDuration(audioPath, ffmpegTools.ffprobe!, projectId, durationProcessId);

		// Duration calculation complete
		updateProjectProgress(projectId, durationProcessId, 100);
		updateProjectProgress(projectId, processId, 25); // Update master progress

		// Process video and audio
		const processedVideoPath = path.join(mergeDir, 'processed.mp4');
		await mergeVideoAndAudio(
			videoPath,
			audioPath,
			processedVideoPath,
			audioDuration,
			ffmpegTools.ffmpeg,
			projectId,
			processId
		);

		// Update metadata - Final completion
		metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
		metadata.status = ProjectStatus.MERGED;
		metadata.mergeCompletedAt = new Date().toISOString();
		metadata.mergeProcessId = processId;
		metadata.audioDuration = audioDuration;
		metadata.totalDuration = audioDuration;
		metadata.currentProcess = 'split'; // Set next step
		fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

		// Set final progress to 100% using the utility
		updateProjectProgress(projectId, processId, 100);
		console.log('Media merge process complete');
	} catch (error) {
		// Update metadata with error using our utility
		updateProjectStatus(
			projectId,
			ProjectStatus.MERGING_ERROR,
			error instanceof Error ? error.message : String(error)
		);
	}
}
