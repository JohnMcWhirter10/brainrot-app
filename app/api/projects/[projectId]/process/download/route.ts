import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { ProjectStatus } from '@/app/types/project';
import { findFfmpegPaths, getMediaDuration } from '@/lib/utils/ffmpeg';
import { updateProjectProgress, updateProjectStatus } from '@/lib/utils/project';

// Download YouTube video using yt-dlp
function downloadYouTubeVideo(
	videoUrl: string,
	outputPath: string,
	projectId: string,
	processId: string,
	isAudioOnly: boolean = false,
	startTime?: number,
	endTime?: number
) {
	return new Promise<{ success: boolean; path?: string; fileSize?: number; error?: string }>((resolve) => {
		try {
			// Set up format selection based on whether we need audio or video
			const formatSelection = isAudioOnly
				? 'bestaudio[ext=m4a]/bestaudio' // Audio only formats
				: 'bestvideo[ext=mp4]/bestvideo'; // Video only formats

			// Set up yt-dlp arguments
			const ytDlpArgs = [
				'-m',
				'yt_dlp', // Use python module
				videoUrl, // YouTube URL
				'-f',
				formatSelection, // Format selection based on type
				'-o',
				outputPath, // Output path
				'--no-warnings', // Cleaner output
			];

			// Add time range parameters if provided
			// Only apply time range if endTime is specified or startTime > 0
			if ((endTime && endTime > 0) || (startTime && startTime > 0)) {
				let timeRange = `*${startTime || 0}-`;
				if (endTime && endTime > 0) {
					timeRange = `*${startTime || 0}-${endTime}`;
				}
				ytDlpArgs.push('--download-sections', timeRange);
				ytDlpArgs.push('--force-keyframes-at-cuts');
				ytDlpArgs.push('--verbose');
			}

			// Initialize progress at 0%
			updateProjectProgress(projectId, processId, 0);

			// Spawn yt-dlp process
			const ytDlp = spawn('python3', ytDlpArgs);

			let stderrData = '';

			// Handle stdout - parse for progress percentage
			ytDlp.stdout.on('data', (data) => {
				const output = data.toString().trim();

				// Extract download percentage from yt-dlp output
				// More flexible regex that works with both regular downloads and --download-sections
				const percentMatch = output.match(/\[download.*?\]\s+(\d+\.?\d*)%/);
				if (percentMatch && percentMatch[1]) {
					const percentage = parseFloat(percentMatch[1]);
					// Update progress metadata with the extracted percentage
					updateProjectProgress(projectId, processId, percentage);
				}
			});

			// Handle stderr
			ytDlp.stderr.on('data', (data) => {
				const output = data.toString().trim();
				stderrData += output;
			});

			// Handle process completion
			ytDlp.on('close', (code) => {
				if (code === 0) {
					// Verify file exists and has content
					if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
						// Set progress to 100% when download completes successfully
						updateProjectProgress(projectId, processId, 100);
						resolve({
							success: true,
							path: outputPath,
							fileSize: fs.statSync(outputPath).size,
						});
					} else {
						resolve({
							success: false,
							error: 'Download completed but file is missing or empty',
						});
					}
				} else {
					resolve({
						success: false,
						error: `yt-dlp process exited with code ${code}. Error: ${stderrData}`,
					});
				}
			});

			// Handle process errors
			ytDlp.on('error', (err) => {
				resolve({
					success: false,
					error: `Failed to start yt-dlp process: ${err.message}`,
				});
			});
		} catch (error) {
			resolve({
				success: false,
				error: `Error executing yt-dlp: ${error instanceof Error ? error.message : String(error)}`,
			});
		}
	});
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
	try {
		const projectId = (await params).projectId;
		const { video, audio, startTime = 0, endTime = 0, audioStartTime = 0, audioEndTime = 0 } = await request.json();

		if (!video || !audio) {
			return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
		}

		// Create a unique process ID
		const processId = uuidv4();

		// Create project directory if it doesn't exist
		const projectDir = path.join(process.cwd(), 'projects', projectId);
		fs.mkdirSync(projectDir, { recursive: true });

		// Create metadata
		const metadataPath = path.join(projectDir, 'metadata.json');
		fs.writeFileSync(
			metadataPath,
			JSON.stringify({
				id: projectId,
				createdAt: new Date().toISOString(),
				status: ProjectStatus.INITIALIZING,
				videoUrl: video,
				audioUrl: audio,
				startTime: startTime,
				endTime: endTime,
				audioStartTime: audioStartTime,
				audioEndTime: audioEndTime,
				currentProcess: 'download',
				downloadProcessId: processId,
			})
		);

		// Initialize progress using the utility function
		updateProjectProgress(projectId, processId, 0);

		// Start background processing
		downloadMedia(video, audio, projectId, processId).catch(console.error);

		return NextResponse.json({ projectId, processId });
	} catch (error) {
		console.error('Error starting download process:', error);
		return NextResponse.json({ error: 'Failed to start download process' }, { status: 500 });
	}
}

// Download and process media
async function downloadMedia(videoUrl: string, audioUrl: string, projectId: string, processId: string) {
	try {
		// Check for FFmpeg tools first
		const ffmpegTools = await findFfmpegPaths();
		if (!ffmpegTools.ffmpeg || !ffmpegTools.ffprobe) {
			throw new Error('FFmpeg tools not found. Please install FFmpeg and make sure it is in your PATH.');
		}

		// Create project directory and source directory
		const projectDir = path.join(process.cwd(), 'projects', projectId);
		const sourceDir = path.join(projectDir, 'source');
		fs.mkdirSync(sourceDir, { recursive: true });

		// Set file paths
		const videoPath = path.join(sourceDir, 'video.mp4');
		const audioPath = path.join(sourceDir, 'audio.mp3');

		// Update metadata
		const metadataPath = path.join(projectDir, 'metadata.json');
		let metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
		metadata.status = ProjectStatus.DOWNLOADING;
		fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

		// Get time values from metadata
		const { startTime, endTime, audioStartTime, audioEndTime } = metadata;

		// Download video and audio in parallel
		// Create download promises for both video and audio
		const videoPromise = downloadYouTubeVideo(
			videoUrl,
			videoPath,
			projectId,
			`${processId}_video`,
			false,
			startTime,
			audioEndTime != 0 ? audioEndTime - audioStartTime + startTime : endTime
		);
		const audioPromise = downloadYouTubeVideo(
			audioUrl,
			audioPath,
			projectId,
			`${processId}_audio`,
			true,
			audioStartTime,
			audioEndTime
		);

		// Wait for both downloads to complete
		const [videoResult, audioResult] = await Promise.all([videoPromise, audioPromise]);

		// Check if video download was successful
		if (!videoResult.success) {
			throw new Error(`Failed to download video: ${videoResult.error}`);
		}

		// Check if audio download was successful
		if (!audioResult.success) {
			throw new Error(`Failed to download audio: ${audioResult.error}`);
		}

		// Create unique process IDs for duration calculations
		const videoDurationProcessId = uuidv4();
		const audioDurationProcessId = uuidv4();

		// Get media durations
		const [videoDuration, audioDuration] = await Promise.all([
			getMediaDuration(videoPath, ffmpegTools.ffprobe!, projectId, videoDurationProcessId),
			getMediaDuration(audioPath, ffmpegTools.ffprobe!, projectId, audioDurationProcessId),
		]);

		console.log('Media durations:', { video: videoDuration, audio: audioDuration });

		// Update metadata
		metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
		metadata.status = ProjectStatus.DOWNLOADED;
		metadata.videoDuration = videoDuration;
		metadata.audioDuration = audioDuration;
		metadata.totalDuration = audioDuration;
		metadata.downloadCompletedAt = new Date().toISOString();
		metadata.downloadProcessId = processId;
		metadata.currentProcess = 'trim'; // Set next step
		fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

		console.log(`Download processing completed for project: ${projectId}`);
	} catch (error) {
		console.error('Error during download processing:', error);

		// Update metadata with error
		updateProjectStatus(
			projectId,
			ProjectStatus.DOWNLOAD_ERROR,
			error instanceof Error ? error.message : String(error)
		);
	}
}
