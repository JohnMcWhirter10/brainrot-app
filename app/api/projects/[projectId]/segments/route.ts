import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

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

		const segments = JSON.parse(fs.readFileSync(segmentsPath, 'utf-8'));

		return NextResponse.json({
			projectId,
			segments,
		});
	} catch (error: any) {
		return NextResponse.json({ error: `Failed to get segments: ${error.message}` }, { status: 500 });
	}
}

export async function DELETE(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
	try {
		const { projectId } = await params;

		// Verify project exists
		const projectDir = path.join(process.cwd(), 'projects', projectId);
		if (!fs.existsSync(projectDir)) {
			return NextResponse.json({ error: 'Project not found' }, { status: 404 });
		}

		// Check for segments directory
		const segmentsDir = path.join(projectDir, 'segments');
		const segmentsJsonPath = path.join(projectDir, 'segments.json');

		let deletedItems = [];

		// Delete segments directory if it exists
		if (fs.existsSync(segmentsDir)) {
			console.log(`Deleting segments directory: ${segmentsDir}`);
			await fs.promises.rm(segmentsDir, { recursive: true, force: true });
			deletedItems.push('segments_directory');
		}

		// Delete segments.json if it exists
		if (fs.existsSync(segmentsJsonPath)) {
			console.log(`Deleting segments.json: ${segmentsJsonPath}`);
			await fs.promises.unlink(segmentsJsonPath);
			deletedItems.push('segments_json');
		}

		// Update metadata to reflect the deletion
		const metadataPath = path.join(projectDir, 'metadata.json');
		if (fs.existsSync(metadataPath)) {
			const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
			metadata.status = 'segments_deleted';
			metadata.segments = 0;
			metadata.segmentsDeletedAt = new Date().toISOString();
			fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
		}

		return NextResponse.json({
			success: true,
			message: 'Segments deleted successfully',
			deletedItems,
		});
	} catch (error) {
		console.error('Error deleting project segments:', error);
		return NextResponse.json(
			{
				error: 'Failed to delete project segments',
				message: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 }
		);
	}
}
