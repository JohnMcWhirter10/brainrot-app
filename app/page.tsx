'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PlusCircle, Video, RefreshCw } from 'lucide-react';
import { ProjectStatus } from '@/app/types/project';

interface Project {
	id: string;
	createdAt: string;
	status: string;
	videoUrl?: string;
	audioUrl?: string;
	segments?: number;
	totalDuration?: number;
	captioning?: {
		captionedSegments: number[];
		failedSegments: number[];
	};
}

export default function HomePage() {
	const [projects, setProjects] = useState<Project[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const router = useRouter();

	const fetchProjects = async () => {
		try {
			setLoading(true);
			const response = await fetch('/api/projects');

			if (!response.ok) {
				throw new Error('Failed to fetch projects');
			}

			const data = await response.json();
			setProjects(data);
			setError(null);
		} catch (err) {
			setError('Failed to load projects');
			console.error(err);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchProjects();
	}, []);

	const getStatusBadge = (status: ProjectStatus) => {
		if (status === ProjectStatus.DOWNLOADING || status === ProjectStatus.SEGMENTING) {
			return <Badge className='bg-yellow-500'>Processing</Badge>;
		} else if (status === ProjectStatus.SEGMENTED) {
			return <Badge className='bg-green-500'>Completed</Badge>;
		} else if (
			status === ProjectStatus.DOWNLOAD_ERROR ||
			status === ProjectStatus.SEGMENTING_ERROR ||
			status === ProjectStatus.INITIALIZE_ERROR
		) {
			return <Badge variant='destructive'>Error</Badge>;
		} else if (status === ProjectStatus.INITIALIZED) {
			return <Badge variant='outline'>Initialized</Badge>;
		} else {
			return <Badge variant='secondary'>{status}</Badge>;
		}
	};

	const formatDate = (dateString: string) => {
		const date = new Date(dateString);
		return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
	};

	return (
		<div className='container py-8'>
			<div className='flex items-center justify-between mb-8'>
				<div>
					<h1 className='text-3xl font-bold'>BrainRot Projects</h1>
					<p className='text-muted-foreground'>Manage your video projects</p>
				</div>
				<div className='flex gap-2'>
					<Button variant='outline' onClick={fetchProjects}>
						<RefreshCw className='h-4 w-4 mr-2' />
						Refresh
					</Button>
					<Button onClick={() => router.push('/upload')}>
						<PlusCircle className='h-4 w-4 mr-2' />
						New Project
					</Button>
				</div>
			</div>

			{loading && (
				<div className='flex justify-center py-12'>
					<RefreshCw className='w-10 h-10 animate-spin opacity-50' />
				</div>
			)}

			{error && !loading && (
				<div className='flex flex-col items-center justify-center py-12'>
					<h2 className='text-xl font-semibold text-destructive mb-2'>Error</h2>
					<p className='text-muted-foreground'>{error}</p>
					<Button variant='outline' className='mt-4' onClick={fetchProjects}>
						<RefreshCw className='h-4 w-4 mr-2' />
						Try Again
					</Button>
				</div>
			)}

			{!loading && !error && projects.length === 0 && (
				<div className='flex flex-col items-center justify-center py-12 border border-dashed rounded-lg border-muted-foreground/20'>
					<Video className='w-12 h-12 text-muted-foreground mb-4' />
					<h2 className='text-xl font-semibold mb-2'>No projects yet</h2>
					<p className='text-muted-foreground mb-4'>Create your first video project to get started</p>
					<Button onClick={() => router.push('/upload')}>
						<PlusCircle className='h-4 w-4 mr-2' />
						Create Project
					</Button>
				</div>
			)}

			{!loading && !error && projects.length > 0 && (
				<div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
					{projects.map((project) => (
						<Link href={`/projects/${project.id}`} key={project.id} className='block'>
							<Card className='h-full hover:shadow-md transition-shadow'>
								<CardHeader>
									<div className='flex justify-between items-start'>
										<CardTitle className='truncate'>Project {project.id.slice(0, 8)}</CardTitle>
										{getStatusBadge(project.status as ProjectStatus)}
									</div>
									<CardDescription>{formatDate(project.createdAt)}</CardDescription>
								</CardHeader>
								<CardContent>
									<div className='space-y-2'>
										{project.videoUrl && (
											<div className='truncate'>
												<span className='font-medium'>Video:</span> {project.videoUrl}
											</div>
										)}
										{project.totalDuration !== undefined && (
											<div>
												<span className='font-medium'>Duration:</span>{' '}
												{Math.round(project.totalDuration * 10) / 10}s
											</div>
										)}
										{project.segments !== undefined && (
											<div>
												<span className='font-medium'>Segments:</span> {project.segments}
											</div>
										)}
										{project.captioning && (
											<div>
												<span className='font-medium'>Captioned:</span>{' '}
												{project.captioning.captionedSegments.length} of{' '}
												{project.segments ?? '-'}
											</div>
										)}
									</div>
								</CardContent>
								<CardFooter>
									<Button variant='secondary' className='w-full'>
										View Details
									</Button>
								</CardFooter>
							</Card>
						</Link>
					))}
				</div>
			)}
		</div>
	);
}
