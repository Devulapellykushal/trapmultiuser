import InfiniteMenu from './InfiniteMenu';

import './landing-visual-sections.css';

const P4AI = 'https://p4ai.in';

const INFINITE_MENU_ITEMS = [
  {
    image: 'https://picsum.photos/seed/studio-a/600/600?grayscale',
    link: '/login?next=%2Fadmin',
    title: 'Admin portal',
    description: 'Sign in to inventory, POS, and reporting.'
  },
  {
    image: 'https://picsum.photos/seed/studio-b/600/600?grayscale',
    link: P4AI,
    title: 'P4AI',
    description: 'Visit p4ai.in for the main experience.'
  },
  {
    image: 'https://picsum.photos/seed/studio-c/600/600?grayscale',
    link: '/',
    title: 'Home',
    description: 'Return to the landing hero.'
  },
  {
    image: 'https://picsum.photos/seed/studio-d/600/600?grayscale',
    link: P4AI,
    title: 'P4AI hub',
    description: 'External site — opens in a new tab.'
  }
];

export default function LandingVisualSections() {
  return (
    <div className='flex flex-col'>
      <section
        className='relative isolate min-h-dvh shrink-0 snap-start snap-always overflow-hidden border-t border-white/5'
        aria-label='Infinite menu background'
      >
        <div className='absolute inset-0 z-0 bg-black'>
          <InfiniteMenu items={INFINITE_MENU_ITEMS} scale={1} />
        </div>
        <p className='landing-visual-hint landing-visual-hint--over-gradient'>
          Hold and drag to explore
        </p>
      </section>
    </div>
  );
}
