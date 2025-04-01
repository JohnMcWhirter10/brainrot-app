import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string; filename: string }> }) {
	try {
		const { projectId, filename } = await params;

		// Verify project exists
		const projectDir = path.join(process.cwd(), 'projects', projectId);
		if (!fs.existsSync(projectDir)) {
			return NextResponse.json({ error: 'Project not found' }, { status: 404 });
		}

		// Construct path to segment file
		const segmentPath = path.join(projectDir, 'segments', filename);

		// Check if segment file exists
		if (!fs.existsSync(segmentPath)) {
			return NextResponse.json({ error: 'Segment file not found' }, { status: 404 });
		}

		// Get file stats for content-length
		const stat = fs.statSync(segmentPath);

		// Read the file
		const videoFile = fs.readFileSync(segmentPath);

		// Create response with proper MIME type
		const response = new NextResponse(videoFile, {
			status: 200,
			headers: {
				'Content-Type': 'video/mp4',
				'Content-Length': stat.size.toString(),
				'Accept-Ranges': 'bytes',
			},
		});

		return response;
	} catch (error) {
		console.error('Error serving segment file:', error);
		return NextResponse.json({ error: 'Failed to serve segment file' }, { status: 500 });
	}
}
