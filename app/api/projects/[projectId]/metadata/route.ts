import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
	try {
		const { projectId } = await params;

		// Get project directory
		const projectDir = path.join(process.cwd(), 'projects', projectId);
		if (!fs.existsSync(projectDir)) {
			return NextResponse.json({ error: 'Project not found' }, { status: 404 });
		}

		// Get metadata
		const metadataPath = path.join(projectDir, 'metadata.json');
		if (!fs.existsSync(metadataPath)) {
			return NextResponse.json({ error: 'Project metadata not found' }, { status: 404 });
		}

		const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
		return NextResponse.json({ metadata });
	} catch (error) {
		console.error('Error fetching project metadata:', error);
		return NextResponse.json({ error: 'Failed to fetch project metadata' }, { status: 500 });
	}
}
