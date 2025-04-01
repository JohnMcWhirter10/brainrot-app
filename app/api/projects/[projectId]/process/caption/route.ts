import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { exec } from 'child_process';
import { ProjectStatus } from '@/app/types/project';
import { findFfmpegPaths } from '@/lib/utils/ffmpeg';

async function extractAudioFromSegment(segmentPath: string, outputPath: string, ffmpegPath: string): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const cmd = spawn(ffmpegPath, [
			'-i',
			segmentPath,
			'-vn',
			'-acodec',
			'pcm_s16le',
			'-ar',
			'16000',
			'-ac',
			'1',
			'-y',
			outputPath,
		]);

		let errorOutput = '';
		cmd.stderr.on('data', (data) => {
			errorOutput += data.toString();
		});

		cmd.on('close', (code) => {
			if (code !== 0) {
				reject(new Error(`FFmpeg extract audio exited with code ${code}`));
				return;
			}
			resolve();
		});
	});
}

async function generateCaptions(
	audioPath: string,
	duration: number,
	updateProgress?: (progress: number) => void
): Promise<Array<{ start: number; end: number; text: string }>> {
	// Path to the Whisper command-line tool
	const whisperPath = `${process.env.HOME}/Library/Python/3.9/bin/whisper`;

	return new Promise<Array<{ start: number; end: number; text: string }>>((resolve, reject) => {
		// Check if whisper exists
		fs.access(whisperPath, fs.constants.X_OK, (err) => {
			if (err) {
				// Try to find whisper in PATH
				exec('which whisper || where whisper 2> nul', (error, stdout) => {
					const whisperInPath = stdout.trim();
					if (whisperInPath) {
						executeWhisper(whisperInPath);
					} else {
						reject(
							new Error(
								'Whisper not found in system. Please install it with `pip install -U openai-whisper`'
							)
						);
					}
				});
			} else {
				executeWhisper(whisperPath);
			}
		});

		function executeWhisper(whisperCmd: string) {
			// Create a temporary directory for whisper output
			const tmpDir = path.dirname(audioPath);

			// Note: Adjust model size based on your needs:
			// tiny, base, small, medium, large
			// Adding .en to the model name makes it English-only, which is faster
			const model = 'base.en'; // Using base.en model for good accuracy and speed balance

			// Word-level timestamps are especially useful for highlighting
			const cmd = spawn(whisperCmd, [
				audioPath,
				'--model',
				model,
				'--output_dir',
				tmpDir,
				'--output_format',
				'json', // We need JSON for the timestamps
				'--verbose',
				'True', // Set to True to get progress updates
				'--word_timestamps',
				'True', // Enable word-level timestamps
			]);

			let stdoutData = '';
			let stderrData = '';
			let progressPercent = 0;
			let lastProgressUpdate = Date.now();

			cmd.stdout.on('data', (data) => {
				stdoutData += data.toString();
			});

			cmd.stderr.on('data', (data) => {
				const output = data.toString();
				stderrData += output;

				// Parse progress updates from Whisper output
				if (updateProgress && output.includes('%')) {
					try {
						// Try to extract progress percentage
						const progressMatch = output.match(/(\d+)%/);
						if (progressMatch && progressMatch[1]) {
							const newProgress = parseInt(progressMatch[1], 10);

							// Only update if progress has changed and some time has passed
							const now = Date.now();
							if (newProgress > progressPercent && now - lastProgressUpdate > 1000) {
								progressPercent = newProgress;
								lastProgressUpdate = now;
								updateProgress(progressPercent);
							}
						}
					} catch (err) {
						// Silent error handling
					}
				}
			});

			cmd.on('close', (code) => {
				if (code !== 0) {
					reject(new Error(`Whisper exited with code ${code}: ${stderrData}`));
					return;
				}

				// Find the JSON output file
				const jsonFilename = path.basename(audioPath, path.extname(audioPath)) + '.json';
				const jsonFilePath = path.join(tmpDir, jsonFilename);

				try {
					// Read and parse the JSON file
					const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));

					// Extract the segments with word-level details
					const captions: Array<{ start: number; end: number; text: string }> = [];

					if (jsonData.segments) {
						// Process each segment
						jsonData.segments.forEach((segment: any) => {
							if (segment.words && Array.isArray(segment.words)) {
								// Process individual words to get precise start/end timestamps
								segment.words.forEach((word: any) => {
									captions.push({
										start: word.start,
										end: word.end,
										text: word.word.trim(),
									});
								});
							} else {
								// Fallback to segment-level if word-level not available
								captions.push({
									start: segment.start,
									end: segment.end,
									text: segment.text.trim(),
								});
							}
						});
					}

					// Final progress update
					if (updateProgress) {
						updateProgress(100);
					}

					resolve(captions);
				} catch (error) {
					reject(error);
				}
			});
		}
	});
}

async function createSubtitleFile(
	captions: Array<{ start: number; end: number; text: string }>,
	outputPath: string
): Promise<void> {
	const formatTime = (seconds: number) => {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const remainingSeconds = seconds % 60;
		const milliseconds = Math.round((remainingSeconds % 1) * 1000);
		return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${Math.floor(
			remainingSeconds
		)
			.toString()
			.padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
	};

	// Group words into lines of max 5 words or 20 characters
	const lines: Array<{ start: number; end: number; text: string }> = [];
	let currentLine = { start: 0, end: 0, text: '', wordCount: 0 };

	captions.forEach((caption) => {
		// If this is the first word in a line, set the start time
		if (currentLine.wordCount === 0) {
			currentLine.start = caption.start;
		}

		// If adding this word would exceed our limits, save the current line and start a new one
		if (currentLine.wordCount >= 5 || currentLine.text.length + caption.text.length >= 20) {
			if (currentLine.wordCount > 0) {
				// Only push if there's content
				currentLine.end = caption.start; // End time of line is start time of next word
				lines.push({
					start: currentLine.start,
					end: currentLine.end,
					text: currentLine.text.trim(),
				});
				// Start a new line
				currentLine = { start: caption.start, end: 0, text: caption.text + ' ', wordCount: 1 };
			}
		} else {
			// Add to current line
			currentLine.text += caption.text + ' ';
			currentLine.wordCount++;
		}

		// Update the end time for the current line
		currentLine.end = caption.end;
	});

	// Don't forget the last line
	if (currentLine.wordCount > 0) {
		lines.push({
			start: currentLine.start,
			end: currentLine.end,
			text: currentLine.text.trim(),
		});
	}

	// Write to SRT file
	const srtContent = lines
		.map((line, index) => {
			return `${index + 1}\n${formatTime(line.start)} --> ${formatTime(line.end)}\n${line.text}\n`;
		})
		.join('\n');

	fs.writeFileSync(outputPath, srtContent);
}

async function addCaptionsToVideo(
	videoPath: string,
	subtitlePath: string,
	outputPath: string,
	ffmpegPath: string,
	projectId: string,
	segmentId: number,
	updateProgress: (progress: number) => void
): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		// Load the SRT file
		const srtContent = fs.readFileSync(subtitlePath, 'utf-8');
		// Parse the SRT content
		const srtParts = srtContent.split('\n\n');

		// Convert SRT to ASS subtitle format with specific styling
		const assHeader = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
Alignment: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Roboto,96,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,3,5,50,50,120,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

		let assContent = assHeader;

		// Convert each SRT entry to ASS
		srtParts.forEach((part) => {
			const lines = part.trim().split('\n');
			if (lines.length >= 3) {
				// Parse the timestamp line (format: 00:00:00,000 --> 00:00:00,000)
				const timestampLine = lines[1];
				const timestamps = timestampLine.split(' --> ');

				if (timestamps.length === 2) {
					const startSRT = timestamps[0];
					const endSRT = timestamps[1];

					// Convert SRT time format to ASS time format
					const formatAssTime = (srtTime: string) => {
						// SRT: 00:00:00,000
						// ASS: 0:00:00.00
						const parts = srtTime.split(',');
						const time = parts[0];
						const ms = parts[1].substring(0, 2); // Only keeping first 2 digits of milliseconds
						return time + '.' + ms;
					};

					const startASS = formatAssTime(startSRT);
					const endASS = formatAssTime(endSRT);

					// Get the text content
					const textContent = lines.slice(2).join('\\N');

					// Add the ASS line with centered styling
					// Using {\an5} for center alignment
					assContent += `Dialogue: 0,${startASS},${endASS},Default,,0,0,0,,{\\an5}${textContent}\n`;
				}
			}
		});

		// Write the ASS file temporarily
		const assPath = subtitlePath.replace('.srt', '.ass');
		fs.writeFileSync(assPath, assContent);

		// Use FFmpeg to burn the subtitles into the video
		const cmd = spawn(ffmpegPath, [
			'-i',
			videoPath,
			'-vf',
			`ass=${assPath}`,
			'-c:v',
			'libx264',
			'-preset',
			'fast',
			'-crf',
			'22',
			'-c:a',
			'copy',
			'-y',
			outputPath,
		]);

		let errorOutput = '';
		let lastProgressUpdate = Date.now();
		let duration = -1;
		let hasFoundDuration = false;

		cmd.stderr.on('data', (data) => {
			const output = data.toString();
			errorOutput += output;

			// First try to extract duration if we don't have it yet
			if (!hasFoundDuration && output.includes('Duration:')) {
				try {
					const durationMatch = output.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
					if (durationMatch) {
						const hours = parseInt(durationMatch[1], 10);
						const minutes = parseInt(durationMatch[2], 10);
						const seconds = parseFloat(durationMatch[3]);
						duration = hours * 3600 + minutes * 60 + seconds;
						hasFoundDuration = true;
					}
				} catch (err) {
					// Silent error
				}
			}

			// Extract progress information from FFmpeg output
			if (output.includes('frame=') && output.includes('time=')) {
				try {
					// Extract time information - format is typically HH:MM:SS.MS
					const timeMatch = output.match(/time=(\d+):(\d+):(\d+\.\d+)/);

					if (timeMatch && timeMatch.length >= 4) {
						// Parse times
						const hours = parseInt(timeMatch[1], 10);
						const minutes = parseInt(timeMatch[2], 10);
						const seconds = parseFloat(timeMatch[3]);
						const currentTime = hours * 3600 + minutes * 60 + seconds;

						// Calculate progress percentage
						let progressPercentage = 0;

						if (duration > 0) {
							// If we have the duration, calculate percentage
							progressPercentage = Math.min(Math.round((currentTime / duration) * 100), 100);
						} else {
							// Fallback when duration not found - use a rough estimate based on frame number
							const frameMatch = output.match(/frame=\s*(\d+)/);
							if (frameMatch && frameMatch[1]) {
								const frameNumber = parseInt(frameMatch[1], 10);
								// Assuming 30fps and average segment length of 60 seconds = 1800 frames
								progressPercentage = Math.min(Math.round((frameNumber / 1800) * 100), 100);
							}
						}

						// Only update progress if significant time has passed or significant change
						const now = Date.now();
						if (now - lastProgressUpdate > 1000) {
							lastProgressUpdate = now;
							updateProgress(progressPercentage);
						}
					}
				} catch (err) {
					// Error handling without console.error
				}
			}
		});

		cmd.on('close', (code) => {
			// Clean up the temporary ASS file
			try {
				fs.unlinkSync(assPath);
			} catch (e) {
				// Silent cleanup error
			}

			if (code !== 0) {
				reject(new Error(`FFmpeg subtitle exited with code ${code}`));
				return;
			}

			// Ensure 100% is reported on completion
			updateProgress(100);
			resolve();
		});
	});
}

function generateRandomColor(): string {
	// Generate random hue (0-360)
	const hue = Math.floor(Math.random() * 360);

	// Use HSL with 100% saturation and 33% lightness
	return hslToHex(hue, 100, 33);
}

// Convert HSL to Hex
function hslToHex(h: number, s: number, l: number): string {
	// Convert HSL to RGB first
	s /= 100;
	l /= 100;

	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;

	let r = 0,
		g = 0,
		b = 0;

	if (0 <= h && h < 60) {
		r = c;
		g = x;
		b = 0;
	} else if (60 <= h && h < 120) {
		r = x;
		g = c;
		b = 0;
	} else if (120 <= h && h < 180) {
		r = 0;
		g = c;
		b = x;
	} else if (180 <= h && h < 240) {
		r = 0;
		g = x;
		b = c;
	} else if (240 <= h && h < 300) {
		r = x;
		g = 0;
		b = c;
	} else if (300 <= h && h < 360) {
		r = c;
		g = 0;
		b = x;
	}

	// Convert RGB to hex
	const rHex = Math.round((r + m) * 255)
		.toString(16)
		.padStart(2, '0');
	const gHex = Math.round((g + m) * 255)
		.toString(16)
		.padStart(2, '0');
	const bHex = Math.round((b + m) * 255)
		.toString(16)
		.padStart(2, '0');

	return `#${rHex}${gHex}${bHex}`;
}

// Function to generate a subtitle using Ollama
async function generateSubtitle(captions: Array<{ start: number; end: number; text: string }>): Promise<string | null> {
	try {
		// Combine all captions into a single text
		const fullText = captions.map((caption) => caption.text).join(' ');

		// Get a more focused sample by taking beginning, middle and end
		let sampleText = fullText;
		if (fullText.length > 1000) {
			const words = fullText.split(' ');
			const beginning = words.slice(0, 100).join(' ');
			const middle = words.slice(Math.floor(words.length / 2) - 50, Math.floor(words.length / 2) + 50).join(' ');
			const end = words.slice(-100).join(' ');
			sampleText = `${beginning} [...] ${middle} [...] ${end}`;
		}

		const response = await fetch('http://localhost:11434/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: 'llama3:latest',
				messages: [
					{
						role: 'system',
						content: `You are an expert video content analyzer. Your task is to create a concise, descriptive 3-5 word title that accurately captures the main theme or topic of the video segment.

CAPTION TEXT:
---
${sampleText}
---

INSTRUCTIONS:
1. Identify the primary theme, topic, or subject matter
2. Create a concise 3-5 word title that is catchy and descriptive
3. Focus on concrete subjects or actions, not generic descriptions
4. DO NOT use phrases like "The story of" or similar generic framings
5. Use active, engaging language
6. ONLY respond with the title itself, nothing else

Example good responses:
- "Skateboarding Through Downtown"
- "Mountain Climbing Adventure"
- "Ocean Pollution Crisis"

Example bad responses:
- "The story of a young" (too generic and incomplete)
- "This interesting video shows" (too generic)
- "Part 3 of the video" (uninformative)`,
					},
				],
				max_tokens: 50,
				temperature: 0.5, // Lower temperature for more focused output
			}),
		});

		if (!response.ok) {
			console.error('Error from Ollama API:', await response.text());
			return null;
		}

		const data = await response.json();

		// Extract the content from the response
		if (data.choices && data.choices.length > 0 && data.choices[0].message) {
			const subtitle = data.choices[0].message.content.trim();

			// Ensure the subtitle is at most 5 words and doesn't have quotes
			const cleanSubtitle = subtitle.replace(/["']/g, '').trim();
			const words = cleanSubtitle.split(/\s+/);
			if (words.length > 5) {
				return words.slice(0, 5).join(' ');
			}
			return cleanSubtitle;
		}

		return null;
	} catch (error) {
		console.error('Error generating subtitle:', error);
		return null;
	}
}

// Function to wrap text based on estimated width
function wrapText(text: string, maxCharsPerLine: number = 20): string[] {
	const words = text.split(' ');
	const lines: string[] = [];
	let currentLine = '';

	for (const word of words) {
		// Check if adding this word would exceed the max width
		if ((currentLine + ' ' + word).length > maxCharsPerLine && currentLine.length > 0) {
			lines.push(currentLine);
			currentLine = word;
		} else {
			// Add word to current line with a space if not the first word
			currentLine = currentLine.length === 0 ? word : `${currentLine} ${word}`;
		}
	}

	// Add the last line if there's anything left
	if (currentLine.length > 0) {
		lines.push(currentLine);
	}

	return lines;
}

// Add subtitle below the title
async function addSubtitleToVideo(
	videoPath: string,
	outputPath: string,
	segmentNumber: number,
	subtitle: string,
	titleColor: string,
	ffmpegPath: string,
	updateProgress?: (progress: number) => void
): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		// Wrap subtitle text if too long
		const lines = wrapText(subtitle);
		let filterComplex = '';

		// Start with the title
		filterComplex = `drawtext=text='Part ${segmentNumber}':fontcolor=white:fontsize=72:x=(w-text_w)/2:y=250:box=1:boxcolor=${titleColor}:boxborderw=20`;

		// Add each subtitle line with increasing y-position
		lines.forEach((line, index) => {
			// Escape single quotes and other special characters in the text
			const escapedLine = line.replace(/'/g, "\\'").replace(/:/g, '\\:').replace(/,/g, '\\,');

			// Calculate y position (150 for first line, increase by 85 for each additional line)
			const yPos = 350 + index * 85;

			// Add this line to the filter
			filterComplex += `,drawtext=text='${escapedLine}':fontcolor=white:fontsize=64:x=(w-text_w)/2:y=${yPos}:box=1:boxcolor=${titleColor}:boxborderw=15`;
		});

		const cmd = spawn(ffmpegPath, [
			'-i',
			videoPath,
			'-vf',
			filterComplex,
			'-c:a',
			'copy',
			'-c:v',
			'libx264',
			'-preset',
			'fast',
			'-crf',
			'22',
			'-y',
			outputPath,
		]);

		let errorOutput = '';
		let lastProgressUpdate = Date.now();
		let duration = -1;
		let hasFoundDuration = false;

		cmd.stderr.on('data', (data) => {
			const output = data.toString();
			errorOutput += output;

			if (updateProgress) {
				// First try to extract duration if we don't have it yet
				if (!hasFoundDuration && output.includes('Duration:')) {
					try {
						const durationMatch = output.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
						if (durationMatch) {
							const hours = parseInt(durationMatch[1], 10);
							const minutes = parseInt(durationMatch[2], 10);
							const seconds = parseFloat(durationMatch[3]);
							duration = hours * 3600 + minutes * 60 + seconds;
							hasFoundDuration = true;
						}
					} catch (err) {
						// Silent error
					}
				}

				// Extract progress information
				if (output.includes('frame=') && output.includes('time=')) {
					try {
						// Extract time information
						const timeMatch = output.match(/time=(\d+):(\d+):(\d+\.\d+)/);

						if (timeMatch && timeMatch.length >= 4) {
							const hours = parseInt(timeMatch[1], 10);
							const minutes = parseInt(timeMatch[2], 10);
							const seconds = parseFloat(timeMatch[3]);
							const currentTime = hours * 3600 + minutes * 60 + seconds;

							// Calculate progress percentage
							let progressPercentage = 0;

							if (duration > 0) {
								// If we have the duration, calculate percentage
								progressPercentage = Math.min(Math.round((currentTime / duration) * 100), 100);
							} else {
								// Fallback when duration not found - use frame number
								const frameMatch = output.match(/frame=\s*(\d+)/);
								if (frameMatch && frameMatch[1]) {
									const frameNumber = parseInt(frameMatch[1], 10);
									// Rough estimation
									progressPercentage = Math.min(Math.round((frameNumber / 1800) * 100), 100);
								}
							}

							// Only update if significant time has passed
							const now = Date.now();
							if (now - lastProgressUpdate > 1000) {
								lastProgressUpdate = now;
								updateProgress(progressPercentage);
							}
						}
					} catch (err) {
						// Silent error
					}
				}
			}
		});

		cmd.on('close', (code) => {
			if (code !== 0) {
				reject(new Error(`FFmpeg subtitle overlay exited with code ${code}: ${errorOutput}`));
				return;
			}

			// Ensure 100% progress is reported on completion
			if (updateProgress) {
				updateProgress(100);
			}
			resolve();
		});
	});
}

// Update existing addTitleToVideo function
async function addTitleToVideo(
	videoPath: string,
	outputPath: string,
	segmentNumber: number,
	titleColor: string,
	ffmpegPath: string,
	updateProgress?: (progress: number) => void
): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		// Use the titleColor hex value directly with alpha component
		const cmd = spawn(ffmpegPath, [
			'-i',
			videoPath,
			'-vf',
			`drawtext=text='Part ${segmentNumber}':fontcolor=white:fontsize=72:x=(w-text_w)/2:y=250:box=1:boxcolor=${titleColor}:boxborderw=20`,
			'-c:a',
			'copy',
			'-c:v',
			'libx264',
			'-preset',
			'fast',
			'-crf',
			'22',
			'-y',
			outputPath,
		]);

		let errorOutput = '';
		let lastProgressUpdate = Date.now();
		let duration = -1;
		let hasFoundDuration = false;

		cmd.stderr.on('data', (data) => {
			const output = data.toString();
			errorOutput += output;

			if (updateProgress) {
				// First try to extract duration if we don't have it yet
				if (!hasFoundDuration && output.includes('Duration:')) {
					try {
						const durationMatch = output.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
						if (durationMatch) {
							const hours = parseInt(durationMatch[1], 10);
							const minutes = parseInt(durationMatch[2], 10);
							const seconds = parseFloat(durationMatch[3]);
							duration = hours * 3600 + minutes * 60 + seconds;
							hasFoundDuration = true;
						}
					} catch (err) {
						// Silent error
					}
				}

				// Extract progress information
				if (output.includes('frame=') && output.includes('time=')) {
					try {
						// Extract time information
						const timeMatch = output.match(/time=(\d+):(\d+):(\d+\.\d+)/);

						if (timeMatch && timeMatch.length >= 4) {
							const hours = parseInt(timeMatch[1], 10);
							const minutes = parseInt(timeMatch[2], 10);
							const seconds = parseFloat(timeMatch[3]);
							const currentTime = hours * 3600 + minutes * 60 + seconds;

							// Calculate progress percentage
							let progressPercentage = 0;

							if (duration > 0) {
								// If we have the duration, calculate percentage
								progressPercentage = Math.min(Math.round((currentTime / duration) * 100), 100);
							} else {
								// Fallback when duration not found - use frame number
								const frameMatch = output.match(/frame=\s*(\d+)/);
								if (frameMatch && frameMatch[1]) {
									const frameNumber = parseInt(frameMatch[1], 10);
									// Rough estimation
									progressPercentage = Math.min(Math.round((frameNumber / 1800) * 100), 100);
								}
							}

							// Only update if significant time has passed
							const now = Date.now();
							if (now - lastProgressUpdate > 1000) {
								lastProgressUpdate = now;
								updateProgress(progressPercentage);
							}
						}
					} catch (err) {
						// Silent error
					}
				}
			}
		});

		cmd.on('close', (code) => {
			if (code !== 0) {
				reject(new Error(`FFmpeg title overlay exited with code ${code}: ${errorOutput}`));
				return;
			}

			// Ensure 100% progress is reported on completion
			if (updateProgress) {
				updateProgress(100);
			}
			resolve();
		});
	});
}

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
	try {
		const { projectId } = await params;
		const projectDir = path.join(process.cwd(), 'projects', projectId);

		// Check if project exists
		if (!fs.existsSync(projectDir)) {
			return NextResponse.json({ error: 'Project not found' }, { status: 404 });
		}

		// Read segments data
		const segmentsPath = path.join(projectDir, 'segments.json');
		if (!fs.existsSync(segmentsPath)) {
			return NextResponse.json({ error: 'Segments information not found' }, { status: 404 });
		}

		const segments: Array<{
			id: number;
			filename: string;
			duration: number;
			captioningStatus?: string;
		}> = JSON.parse(fs.readFileSync(segmentsPath, 'utf-8'));

		// Read metadata for any legacy captioning data
		const metadataPath = path.join(projectDir, 'metadata.json');
		const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

		// Count segments by status
		const captioningStatus = {
			captioningAttempted: false,
			captioningModel: 'whisper:base.en',
			totalSegments: segments.length,
			captionedSegments: [] as number[],
			failedSegments: [] as number[],
			inProgressSegments: [] as number[],
		};

		// Check segments for captioning status
		segments.forEach((segment) => {
			if (segment.captioningStatus === 'completed') {
				captioningStatus.captioningAttempted = true;
				captioningStatus.captionedSegments.push(segment.id);
			} else if (segment.captioningStatus === 'failed') {
				captioningStatus.captioningAttempted = true;
				captioningStatus.failedSegments.push(segment.id);
			} else if (segment.captioningStatus === 'in-progress') {
				captioningStatus.captioningAttempted = true;
				captioningStatus.inProgressSegments.push(segment.id);
			}
		});

		// Also check legacy data in metadata if exists
		if (metadata.captioning) {
			captioningStatus.captioningAttempted =
				metadata.captioning.captioningAttempted || captioningStatus.captioningAttempted;
			captioningStatus.captioningModel = metadata.captioning.captioningModel || captioningStatus.captioningModel;
		}

		return NextResponse.json({
			projectId,
			captioning: captioningStatus,
		});
	} catch (error: any) {
		return NextResponse.json({ error: `Failed to get captioning status: ${error.message}` }, { status: 500 });
	}
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
	try {
		const { projectId } = await params;
		const { segmentNumber } = await request.json();

		if (segmentNumber === undefined) {
			return NextResponse.json({ error: 'Missing segment number' }, { status: 400 });
		}

		// Create project directory if it doesn't exist (should already exist from split process)
		const projectDir = path.join(process.cwd(), 'projects', projectId);

		if (!fs.existsSync(projectDir)) {
			return NextResponse.json({ error: 'Project not found or processing not started' }, { status: 404 });
		}

		// Check if segments.json exists
		const segmentsPath = path.join(projectDir, 'segments.json');
		if (!fs.existsSync(segmentsPath)) {
			return NextResponse.json(
				{ error: 'Segments information not found. Run split process first.' },
				{ status: 400 }
			);
		}

		// Read segments data
		const segments: Array<{
			id: number;
			filename: string;
			duration: number;
			captioningStatus?: string;
			captioningStartedAt?: string;
			captioningProcessId?: string;
			captioningProgress?: number;
			captioningCompletedAt?: string;
			captioningFailedAt?: string;
			captioningError?: string;
			subtitle?: string;
			captionedFilename?: string;
		}> = JSON.parse(fs.readFileSync(segmentsPath, 'utf-8'));

		// Find the requested segment
		const segmentIndex = segments.findIndex((s) => s.id === segmentNumber);
		if (segmentIndex === -1) {
			return NextResponse.json({ error: `Segment ${segmentNumber} not found` }, { status: 404 });
		}
		const segment = segments[segmentIndex];

		// Generate a process ID
		const processId = uuidv4();

		// Update metadata for title color
		const metadataPath = path.join(projectDir, 'metadata.json');
		const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

		// Generate a project color if it doesn't exist
		if (!metadata.segmentTitleColor) {
			metadata.segmentTitleColor = generateRandomColor();
			fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
		}

		// Update segment status in segments.json
		segments[segmentIndex] = {
			...segment,
			captioningStatus: 'in-progress',
			captioningStartedAt: new Date().toISOString(),
			captioningProcessId: processId,
			captioningProgress: 0,
		};

		fs.writeFileSync(segmentsPath, JSON.stringify(segments, null, 2));

		// Start background captioning
		captionSegment(projectId, segment, processId).catch(() => {
			// Silent error handling - errors are logged in segments.json
		});

		return NextResponse.json({ projectId, segmentNumber, processId });
	} catch (error: any) {
		return NextResponse.json({ error: `Failed to start caption process: ${error.message}` }, { status: 500 });
	}
}

async function captionSegment(
	projectId: string,
	segment: {
		id: number;
		filename: string;
		duration: number;
		captioningStatus?: string;
		captioningStartedAt?: string;
		captioningProcessId?: string;
		captioningProgress?: number;
		captioningCompletedAt?: string;
		captioningFailedAt?: string;
		captioningError?: string;
		subtitle?: string;
		captionedFilename?: string;
	},
	processId: string
) {
	try {
		// Find FFmpeg tools first
		const ffmpegTools = await findFfmpegPaths();
		if (!ffmpegTools.ffmpeg || !ffmpegTools.ffprobe) {
			throw new Error('FFmpeg tools not found. Please install FFmpeg and make sure it is in your PATH.');
		}

		// Project paths
		const projectDir = path.join(process.cwd(), 'projects', projectId);
		const segmentPath = path.join(projectDir, 'segments', segment.filename);
		const segmentsPath = path.join(projectDir, 'segments.json');
		const metadataPath = path.join(projectDir, 'metadata.json');

		// Create captions directory if it doesn't exist
		const captionsDir = path.join(projectDir, 'captions');
		fs.mkdirSync(captionsDir, { recursive: true });

		// Read segments to update progress
		let segments: Array<{
			id: number;
			filename: string;
			duration: number;
			captioningStatus?: string;
			captioningStartedAt?: string;
			captioningProcessId?: string;
			captioningProgress?: number;
			captioningCompletedAt?: string;
			captioningFailedAt?: string;
			captioningError?: string;
			subtitle?: string;
			captionedFilename?: string;
		}> = JSON.parse(fs.readFileSync(segmentsPath, 'utf-8'));

		const segmentIndex = segments.findIndex((s) => s.id === segment.id);

		// Update segment progress function
		const updateSegmentProgress = (progress: number) => {
			try {
				if (segmentIndex !== -1) {
					segments = JSON.parse(fs.readFileSync(segmentsPath, 'utf-8'));
					if (segments[segmentIndex].captioningStatus === 'in-progress') {
						segments[segmentIndex].captioningProgress = Math.min(progress, 100);
						fs.writeFileSync(segmentsPath, JSON.stringify(segments, null, 2));
					}
				}
			} catch (e) {
				// Silent error
			}
		};

		// Define progress weights for each stage
		const progressStages = {
			audioExtraction: { weight: 5, start: 0, end: 5 },
			captionGeneration: { weight: 40, start: 5, end: 45 },
			subtitleCreation: { weight: 5, start: 45, end: 50 },
			addingCaptions: { weight: 30, start: 50, end: 80 },
			addingTitleSubtitle: { weight: 15, start: 80, end: 95 },
			cleanup: { weight: 5, start: 95, end: 100 },
		};

		// Update progress at the start of audio extraction
		updateSegmentProgress(progressStages.audioExtraction.start);

		// Extract audio from the segment for captioning
		const audioPath = path.join(captionsDir, `segment_${segment.id}_audio.wav`);
		await extractAudioFromSegment(segmentPath, audioPath, ffmpegTools.ffmpeg);

		// Update progress after audio extraction
		updateSegmentProgress(progressStages.captionGeneration.start);

		// Generate captions using Whisper with progress updates
		// Map the whisper progress (0-100) to our captionGeneration stage (5-45)
		const whisperProgressTransformer = (whisperProgress: number) => {
			const { start, end } = progressStages.captionGeneration;
			return start + (whisperProgress / 100) * (end - start);
		};

		const captions = await generateCaptions(audioPath, segment.duration, (progress) =>
			updateSegmentProgress(whisperProgressTransformer(progress))
		);

		// Update progress after caption generation
		updateSegmentProgress(progressStages.subtitleCreation.start);

		// Create SRT file from captions
		const srtPath = path.join(captionsDir, `segment_${segment.id}.srt`);
		await createSubtitleFile(captions, srtPath);

		// Update progress after subtitle creation
		updateSegmentProgress(progressStages.addingCaptions.start);

		// Create a temporary file for the captioned output
		const captionedPath = path.join(captionsDir, `captioned_${segment.id}.mp4`);

		// Helper function to transform the progress value from addCaptions stage to overall progress
		const transformAddCaptionsProgress = (addCaptionsProgress: number) => {
			const { start, end } = progressStages.addingCaptions;
			return start + (addCaptionsProgress / 100) * (end - start);
		};

		// Add captions to video with progress tracking
		await addCaptionsToVideo(
			segmentPath,
			srtPath,
			captionedPath,
			ffmpegTools.ffmpeg,
			projectId,
			segment.id,
			(progress) => updateSegmentProgress(transformAddCaptionsProgress(progress))
		);

		// Verify the captioned video exists and has size
		if (!fs.existsSync(captionedPath) || fs.statSync(captionedPath).size === 0) {
			throw new Error('Failed to create captioned video or output file is empty');
		}

		// Update progress after adding captions
		updateSegmentProgress(progressStages.addingTitleSubtitle.start);

		// Read metadata to get the project color
		let metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
		const titleColor = metadata.segmentTitleColor || '#FFFFFF';

		// Create a temporary file for the final output with title and subtitle
		const finalPath = path.join(captionsDir, `final_${segment.id}.mp4`);

		// Generate subtitle using Ollama
		const subtitle = await generateSubtitle(captions);

		// Add title and subtitle to the video
		if (subtitle) {
			// If we successfully generated a subtitle, add both title and subtitle
			await addSubtitleToVideo(
				captionedPath,
				finalPath,
				segment.id,
				subtitle,
				titleColor,
				ffmpegTools.ffmpeg,
				(progress) =>
					updateSegmentProgress(
						progressStages.addingTitleSubtitle.start +
							(progress / 100) * (progressStages.cleanup.start - progressStages.addingTitleSubtitle.start)
					)
			);
		} else {
			// If subtitle generation failed, just add the title
			await addTitleToVideo(captionedPath, finalPath, segment.id, titleColor, ffmpegTools.ffmpeg, (progress) =>
				updateSegmentProgress(
					progressStages.addingTitleSubtitle.start +
						(progress / 100) * (progressStages.cleanup.start - progressStages.addingTitleSubtitle.start)
				)
			);
		}

		// Update progress after adding title/subtitle
		updateSegmentProgress(progressStages.cleanup.start);

		// Verify the final video exists and has size
		if (!fs.existsSync(finalPath) || fs.statSync(finalPath).size === 0) {
			throw new Error('Failed to add title to video or output file is empty');
		}

		// Store the final captioned video in the captions directory with the desired naming format
		const finalCaptionedPath = path.join(captionsDir, `captioned_segment_${segment.id}.mp4`);
		fs.copyFileSync(finalPath, finalCaptionedPath);

		// Clean up temporary files
		try {
			fs.unlinkSync(captionedPath);
			fs.unlinkSync(finalPath);
			fs.unlinkSync(audioPath);
			fs.unlinkSync(srtPath);

			// Clean up the audio.json file created by Whisper
			const audioJsonPath = path.join(captionsDir, `segment_${segment.id}_audio.json`);
			if (fs.existsSync(audioJsonPath)) {
				fs.unlinkSync(audioJsonPath);
			}
		} catch (cleanupErr) {
			// Silent cleanup error
		}

		// Update progress to 100%
		updateSegmentProgress(100);

		// Read segments again to update final status
		segments = JSON.parse(fs.readFileSync(segmentsPath, 'utf-8'));

		// Update segment status to completed
		if (segmentIndex !== -1) {
			segments[segmentIndex] = {
				...segments[segmentIndex],
				captioningStatus: 'completed',
				captioningCompletedAt: new Date().toISOString(),
				captioningProgress: 100,
				subtitle: subtitle || undefined,
				captionedFilename: `captioned_segment_${segment.id}.mp4`,
			};

			fs.writeFileSync(segmentsPath, JSON.stringify(segments, null, 2));
		}
	} catch (error: any) {
		console.error(error);

		// Update segment status to failed
		try {
			const projectDir = path.join(process.cwd(), 'projects', projectId);
			const segmentsPath = path.join(projectDir, 'segments.json');
			const segments: Array<{
				id: number;
				captioningStatus?: string;
				captioningFailedAt?: string;
				captioningError?: string;
			}> = JSON.parse(fs.readFileSync(segmentsPath, 'utf-8'));

			const segmentIndex = segments.findIndex((s) => s.id === segment.id);
			if (segmentIndex !== -1) {
				segments[segmentIndex] = {
					...segments[segmentIndex],
					captioningStatus: 'failed',
					captioningFailedAt: new Date().toISOString(),
					captioningError: error.message,
				};

				fs.writeFileSync(segmentsPath, JSON.stringify(segments, null, 2));
			}
		} catch (metadataError) {
			// Silent metadata error
		}
	}
}
