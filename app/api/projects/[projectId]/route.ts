import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
	try {
		const { projectId } = await params;

		// Check if project exists
		const projectDir = path.join(process.cwd(), 'projects', projectId);
		if (!fs.existsSync(projectDir)) {
			return NextResponse.json({ error: 'Project not found' }, { status: 404 });
		}

		// Read project metadata
		const metadataPath = path.join(projectDir, 'metadata.json');
		if (!fs.existsSync(metadataPath)) {
			return NextResponse.json({ error: 'Project metadata not found' }, { status: 404 });
		}

		const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

		// Read segments if available
		const segmentsPath = path.join(projectDir, 'segments.json');
		let segments = [];

		if (fs.existsSync(segmentsPath)) {
			segments = JSON.parse(fs.readFileSync(segmentsPath, 'utf-8'));
		}

		return NextResponse.json({ metadata, segments });
	} catch (error) {
		console.error('Error fetching project data:', error);
		return NextResponse.json({ error: 'Failed to fetch project data' }, { status: 500 });
	}
}

export async function DELETE(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
	try {
		const { projectId } = await params;

		const projectDir = path.join(process.cwd(), 'projects', projectId);

		// Check if project exists
		if (!fs.existsSync(projectDir)) {
			return NextResponse.json({ error: 'Project not found' }, { status: 404 });
		}

		// Delete project directory and all its contents
		fs.rmSync(projectDir, { recursive: true, force: true });

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('Error deleting project:', error);
		return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
	}
}
