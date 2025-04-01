import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
	return (
		<div className='flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]'>
			<h1 className='text-4xl font-bold'>404</h1>
			<p className='mt-2 text-xl'>Page not found</p>
			<p className='mt-4 text-gray-500 max-w-md text-center'>
				The page you are looking for might have been removed or is temporarily unavailable.
			</p>
			<Button asChild className='mt-8'>
				<Link href='/'>Return to Home</Link>
			</Button>
		</div>
	);
}
