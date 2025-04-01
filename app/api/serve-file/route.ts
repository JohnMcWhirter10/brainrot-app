import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
	try {
		const url = new URL(request.url);
		const filePath = url.searchParams.get('path');
		const download = url.searchParams.get('download') === 'true';

		if (!filePath) {
			return new Response('Missing path parameter', { status: 400 });
		}

		// Security check - validate path to prevent directory traversal
		if (filePath.includes('..')) {
			return new Response('Invalid file path', { status: 400 });
		}

		const fullPath = path.join(process.cwd(), 'projects', filePath);

		if (!fs.existsSync(fullPath)) {
			return new Response('File not found', { status: 404 });
		}

		// Determine content type based on file extension
		const ext = path.extname(fullPath).toLowerCase();
		let contentType = 'application/octet-stream';

		if (ext === '.mp4') {
			contentType = 'video/mp4';
		} else if (ext === '.webm') {
			contentType = 'video/webm';
		} else if (ext === '.mp3') {
			contentType = 'audio/mpeg';
		} else if (ext === '.json') {
			contentType = 'application/json';
		}

		// Set content disposition for downloads
		const headers: Record<string, string> = {
			'Content-Type': contentType,
			'Accept-Ranges': 'bytes',
		};

		if (download) {
			const filename = path.basename(fullPath);
			headers['Content-Disposition'] = `attachment; filename="${filename}"`;
		}

		// Check if this is a range request for video streaming
		const rangeHeader = request.headers.get('range');
		const fileSize = fs.statSync(fullPath).size;

		if (rangeHeader) {
			// Parse range header
			const parts = rangeHeader.replace(/bytes=/, '').split('-');
			const start = parseInt(parts[0], 10);
			const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
			const chunkSize = end - start + 1;

			// Create readable stream for the requested range
			const fileStream = fs.createReadStream(fullPath, { start, end });

			// Return partial content
			return new Response(fileStream as any, {
				status: 206, // Partial Content
				headers: {
					...headers,
					'Content-Range': `bytes ${start}-${end}/${fileSize}`,
					'Content-Length': String(chunkSize),
				},
			});
		} else {
			// For non-range requests, return the entire file
			const fileBuffer = fs.readFileSync(fullPath);

			return new Response(fileBuffer, {
				headers: {
					...headers,
					'Content-Length': String(fileSize),
				},
			});
		}
	} catch (error) {
		console.error('Error serving file:', error);
		return new Response('Failed to serve file', { status: 500 });
	}
}
