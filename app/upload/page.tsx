'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

const formSchema = z.object({
	videoUrl: z.string().url('Please enter a valid YouTube URL'),
	startTime: z.coerce.number().min(0).default(0),
	endTime: z.coerce.number().min(0).default(0),
	audioUrl: z.string().url('Please enter a valid YouTube URL'),
	audioStartTime: z.coerce.number().min(0).default(0),
	audioEndTime: z.coerce.number().min(0).default(0),
});

// Define the type for the form values
type FormValues = z.infer<typeof formSchema>;

export default function UploadPage() {
	const router = useRouter();
	const [processing, setProcessing] = useState(false);
	const [progress, setProgress] = useState(0);

	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			videoUrl: '',
			startTime: 0,
			endTime: 0,
			audioUrl: '',
			audioStartTime: 0,
			audioEndTime: 0,
		},
	});

	async function onSubmit(values: FormValues) {
		try {
			setProcessing(true);

			// Simulate progress for user feedback
			const interval = setInterval(() => {
				setProgress((prev) => {
					if (prev >= 95) {
						clearInterval(interval);
						return prev;
					}
					return prev + 5;
				});
			}, 500);

			// Generate a project ID
			const projectIdResponse = await fetch('/api/projects/create', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					videoUrl: values.videoUrl,
					startTime: values.startTime,
					endTime: values.endTime,
					audioUrl: values.audioUrl,
					audioStartTime: values.audioStartTime,
					audioEndTime: values.audioEndTime,
				}),
			});

			if (!projectIdResponse.ok) {
				throw new Error('Failed to create project');
			}

			const { projectId } = await projectIdResponse.json();

			clearInterval(interval);
			setProgress(100);

			toast.success('Project created successfully! Download started in the background.');
			router.push(`/projects/${projectId}`);
		} catch (error) {
			toast.error('Failed to process media. Please try again.');
			setProcessing(false);
		}
	}

	return (
		<div className='flex min-h-[calc(100vh-5rem)]'>
			<div className='w-full max-w-xl mx-auto'>
				<Card>
					<CardHeader>
						<CardTitle>Upload Media</CardTitle>
						<CardDescription>
							Provide YouTube links for video and audio to create a new project
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Form {...form}>
							<form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
								<FormField
									control={form.control}
									name='videoUrl'
									render={({ field }) => (
										<FormItem>
											<FormLabel>Video</FormLabel>
											<FormControl>
												<Input
													placeholder='https://www.youtube.com/watch?v=...'
													{...field}
													disabled={processing}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<div className='grid grid-cols-2 gap-4'>
									<FormField
										control={form.control}
										name='startTime'
										render={({ field }) => (
											<FormItem>
												<FormLabel>Start Time (seconds)</FormLabel>
												<FormControl>
													<Input
														type='number'
														step='0.1'
														min='0'
														placeholder='0'
														{...field}
														disabled={processing}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name='endTime'
										render={({ field }) => (
											<FormItem>
												<FormLabel>End Time (seconds)</FormLabel>
												<FormControl>
													<Input
														type='number'
														step='0.1'
														min='0'
														placeholder='0'
														{...field}
														disabled={processing}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
								<FormField
									control={form.control}
									name='audioUrl'
									render={({ field }) => (
										<FormItem>
											<FormLabel>Audio</FormLabel>
											<FormControl>
												<Input
													placeholder='https://www.youtube.com/watch?v=...'
													{...field}
													disabled={processing}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<div className='grid grid-cols-2 gap-4'>
									<FormField
										control={form.control}
										name='audioStartTime'
										render={({ field }) => (
											<FormItem>
												<FormLabel>Audio Start Time (seconds)</FormLabel>
												<FormControl>
													<Input
														type='number'
														step='0.1'
														min='0'
														placeholder='0'
														{...field}
														disabled={processing}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name='audioEndTime'
										render={({ field }) => (
											<FormItem>
												<FormLabel>Audio End Time (seconds)</FormLabel>
												<FormControl>
													<Input
														type='number'
														step='0.1'
														min='0'
														placeholder='0'
														{...field}
														disabled={processing}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>

								{processing && (
									<div className='space-y-2'>
										<Progress value={progress} />
										<p className='text-sm text-center'>Processing media... {progress}%</p>
									</div>
								)}

								<Button type='submit' className='w-full' disabled={processing}>
									{processing ? 'Processing...' : 'Begin Processing'}
								</Button>
							</form>
						</Form>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
