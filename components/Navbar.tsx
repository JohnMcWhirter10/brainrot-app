'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from './ui/button';

export function Navbar() {
	const pathname = usePathname();

	return (
		<nav className='border-b'>
			<div className='flex h-16 items-center px-4'>
				<div className='flex'>
					<Link href='/' className='text-xl font-bold mr-6'>
						BrainRot
					</Link>
					<div className='flex items-center space-x-4'>
						<Button asChild variant={pathname === '/' ? 'default' : 'ghost'}>
							<Link href='/'>Gallery</Link>
						</Button>
						<Button asChild variant={pathname === '/upload' ? 'default' : 'ghost'}>
							<Link href='/upload'>Upload</Link>
						</Button>
					</div>
				</div>
			</div>
		</nav>
	);
}
